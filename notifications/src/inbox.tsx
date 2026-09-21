import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
  updateCommandMetadata,
  type Keyboard,
} from "@vicinae/api";
import { createAuraClient } from "./api";
import {
  addMutedApp,
  formatDndDetail,
  formatDndStatus,
  formatNotificationTime,
  removeMutedApp,
  urgencyLabel,
  withToggledManual,
  withToggledSchedule,
} from "./dnd";
import { ScheduleForm } from "./schedule-form";
import { DEFAULT_DND, type DndPrefs, type NotificationItem } from "./types";

type Preferences = {
  sidecarUrl?: string;
};

const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const SHORTCUT_DND: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "d" };
const SHORTCUT_CLEAR: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "backspace",
};

function dndIcon(prefs: DndPrefs) {
  if (prefs.enabled) {
    return { source: Icon.BellDisabled, tintColor: Color.Red };
  }
  return { source: Icon.Moon, tintColor: Color.Purple };
}

function itemIcon(item: NotificationItem) {
  if (item.urgency >= 2) {
    return { source: Icon.Exclamationmark, tintColor: Color.Red };
  }
  if (item.urgency <= 0) {
    return { source: Icon.Bell, tintColor: Color.SecondaryText };
  }
  return { source: Icon.Bell, tintColor: Color.Blue };
}

function failToast(title: string, err: unknown) {
  return showToast({
    style: Toast.Style.Failure,
    title,
    message: err instanceof Error ? err.message : String(err),
  });
}

export default function InboxCommand() {
  const prefs = getPreferenceValues<Preferences>();
  const client = useMemo(
    () => createAuraClient(prefs.sidecarUrl),
    [prefs.sidecarUrl],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dnd, setDnd] = useState<DndPrefs>(DEFAULT_DND);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [muted, setMuted] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [nextDnd, nextItems, nextMuted] = await Promise.all([
        client.getDnd(),
        client.listNotifications(80),
        client.getMutedApps(),
      ]);
      setDnd(nextDnd);
      setItems(nextItems);
      setMuted(nextMuted);
      setError(null);
      try {
        await updateCommandMetadata({
          subtitle: `${formatDndStatus(nextDnd)} · ${nextItems.length}`,
        });
      } catch {
        // root search metadata is best-effort from a view
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to talk to sidecar";
      setError(message);
      await failToast("Aura sidecar failed", err);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveDnd = async (next: DndPrefs, toastTitle: string) => {
    setLoading(true);
    try {
      await client.setDnd(next);
      setDnd(next);
      await showToast({ style: Toast.Style.Success, title: toastTitle });
      try {
        await updateCommandMetadata({
          subtitle: `${formatDndStatus(next)} · ${items.length}`,
        });
      } catch {
        // ignore
      }
    } catch (err) {
      await failToast("Failed to update DND", err);
    } finally {
      setLoading(false);
    }
  };

  const onToggleDnd = () =>
    void saveDnd(
      withToggledManual(dnd),
      dnd.enabled ? "DND Off" : "DND On",
    );

  const onToggleSchedule = () =>
    void saveDnd(
      withToggledSchedule(dnd),
      dnd.schedule_enabled ? "Schedule off" : "Schedule on",
    );

  const onDismiss = async (id: number) => {
    setLoading(true);
    try {
      await client.dismissNotification(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      await failToast("Failed to dismiss", err);
    } finally {
      setLoading(false);
    }
  };

  const onClearAll = async () => {
    if (items.length === 0) return;
    const ok = await confirmAlert({
      title: "Clear all notifications?",
      message: `${items.length} item${items.length === 1 ? "" : "s"} will be removed from the Aura inbox.`,
      primaryAction: { title: "Clear all" },
    });
    if (!ok) return;
    setLoading(true);
    try {
      await client.clearAllNotifications();
      setItems([]);
      await showToast({ style: Toast.Style.Success, title: "Inbox cleared" });
    } catch (err) {
      await failToast("Failed to clear inbox", err);
    } finally {
      setLoading(false);
    }
  };

  const onInvoke = async (id: number, key: string, label: string) => {
    setLoading(true);
    try {
      await client.invokeAction(id, key);
      await showToast({ style: Toast.Style.Success, title: label });
      await refresh();
    } catch (err) {
      await failToast("Action failed", err);
    } finally {
      setLoading(false);
    }
  };

  const onMute = async (app: string) => {
    const next = addMutedApp(muted, app);
    if (next === muted) return;
    setLoading(true);
    try {
      await client.setMutedApps(next);
      setMuted(next);
      await showToast({
        style: Toast.Style.Success,
        title: `Muted ${app}`,
      });
    } catch (err) {
      await failToast("Failed to mute app", err);
    } finally {
      setLoading(false);
    }
  };

  const onUnmute = async (app: string) => {
    const next = removeMutedApp(muted, app);
    setLoading(true);
    try {
      await client.setMutedApps(next);
      setMuted(next);
      await showToast({
        style: Toast.Style.Success,
        title: `Unmuted ${app}`,
      });
    } catch (err) {
      await failToast("Failed to unmute app", err);
    } finally {
      setLoading(false);
    }
  };

  if (error && items.length === 0 && dnd === DEFAULT_DND) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Can't reach Aura sidecar"
          description={error}
        />
      </List>
    );
  }

  const status = formatDndStatus(dnd);
  const dndActions = (
    <ActionPanel>
      <Action
        title={dnd.enabled ? "Turn DND Off" : "Turn DND On"}
        icon={dnd.enabled ? Icon.Bell : Icon.BellDisabled}
        shortcut={SHORTCUT_DND}
        onAction={onToggleDnd}
      />
      <Action
        title={dnd.schedule_enabled ? "Disable Schedule" : "Enable Schedule"}
        icon={Icon.Clock}
        onAction={onToggleSchedule}
      />
      <Action.Push
        title="Edit Quiet Hours"
        icon={Icon.Pencil}
        target={
          <ScheduleForm
            prefs={dnd}
            onSave={async (next) => {
              await client.setDnd(next);
              setDnd(next);
            }}
          />
        }
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={SHORTCUT_REFRESH}
        onAction={() => void refresh()}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Filter notifications..."
      navigationTitle={`Notifications · ${status}`}
    >
      <List.Section title="Do not disturb">
        <List.Item
          title={status}
          subtitle={formatDndDetail(dnd)}
          icon={dndIcon(dnd)}
          keywords={["dnd", "quiet", "silence", "do not disturb"]}
          accessories={
            dnd.schedule_enabled
              ? [{ text: `${dnd.start_time} to ${dnd.end_time}` }]
              : undefined
          }
          actions={dndActions}
        />
      </List.Section>

      <List.Section
        title={items.length ? `Inbox · ${items.length}` : "Inbox"}
      >
        {items.length === 0 ? (
          <List.Item
            title="No notifications"
            subtitle="Aura inbox is empty"
            icon={Icon.Bell}
            actions={
              <ActionPanel>
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={SHORTCUT_REFRESH}
                  onAction={() => void refresh()}
                />
              </ActionPanel>
            }
          />
        ) : (
          items.map((item) => {
            const time = formatNotificationTime(item.timestamp);
            const urgency = urgencyLabel(item.urgency);
            const accessories: List.Item.Accessory[] = [];
            if (urgency) accessories.push({ text: urgency });
            if (time) accessories.push({ text: time });
            return (
              <List.Item
                key={item.id}
                title={item.summary || "(no title)"}
                subtitle={
                  item.body
                    ? `${item.app_name} · ${item.body}`
                    : item.app_name
                }
                icon={itemIcon(item)}
                keywords={[item.app_name, item.summary, item.body]}
                accessories={accessories}
                actions={
                  <InboxItemActions
                    item={item}
                    muted={muted}
                    dnd={dnd}
                    onDismiss={onDismiss}
                    onClearAll={onClearAll}
                    onInvoke={onInvoke}
                    onMute={onMute}
                    onToggleDnd={onToggleDnd}
                    onRefresh={() => void refresh()}
                    onSaveDnd={async (next) => {
                      await client.setDnd(next);
                      setDnd(next);
                    }}
                  />
                }
              />
            );
          })
        )}
      </List.Section>

      {muted.length > 0 ? (
        <List.Section title="Muted apps">
          {muted.map((app) => (
            <List.Item
              key={app}
              title={app}
              subtitle="Muted in Aura inbox"
              icon={{ source: Icon.SpeakerOff, tintColor: Color.Orange }}
              keywords={["mute", "unmute", app]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Unmute ${app}`}
                    icon={Icon.SpeakerOn}
                    onAction={() => void onUnmute(app)}
                  />
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={SHORTCUT_REFRESH}
                    onAction={() => void refresh()}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

function InboxItemActions({
  item,
  muted,
  dnd,
  onDismiss,
  onClearAll,
  onInvoke,
  onMute,
  onToggleDnd,
  onRefresh,
  onSaveDnd,
}: {
  item: NotificationItem;
  muted: string[];
  dnd: DndPrefs;
  onDismiss: (id: number) => Promise<void>;
  onClearAll: () => Promise<void>;
  onInvoke: (id: number, key: string, label: string) => Promise<void>;
  onMute: (app: string) => Promise<void>;
  onToggleDnd: () => void;
  onRefresh: () => void;
  onSaveDnd: (next: DndPrefs) => Promise<void>;
}) {
  const alreadyMuted = muted.some(
    (app) => app.toLowerCase() === item.app_name.toLowerCase(),
  );

  return (
    <ActionPanel>
      <Action
        title="Dismiss"
        icon={Icon.XMarkCircle}
        onAction={() => void onDismiss(item.id)}
      />
      {item.actions.map((action) => (
        <Action
          key={action.key}
          title={action.label}
          icon={Icon.ArrowRight}
          onAction={() => void onInvoke(item.id, action.key, action.label)}
        />
      ))}
      {!alreadyMuted && item.app_name ? (
        <Action
          title={`Mute ${item.app_name}`}
          icon={Icon.SpeakerOff}
          onAction={() => void onMute(item.app_name)}
        />
      ) : null}
      <Action
        title="Clear All"
        icon={Icon.Trash}
        shortcut={SHORTCUT_CLEAR}
        onAction={() => void onClearAll()}
      />
      <Action
        title={dnd.enabled ? "Turn DND Off" : "Turn DND On"}
        icon={dnd.enabled ? Icon.Bell : Icon.BellDisabled}
        shortcut={SHORTCUT_DND}
        onAction={onToggleDnd}
      />
      <Action.Push
        title="Edit Quiet Hours"
        icon={Icon.Pencil}
        target={<ScheduleForm prefs={dnd} onSave={onSaveDnd} />}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={SHORTCUT_REFRESH}
        onAction={onRefresh}
      />
    </ActionPanel>
  );
}
