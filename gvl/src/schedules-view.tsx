import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { GlobalActions, HubDropdown } from "./actions";
import { listSchedules } from "./gvl";
import { NextOccurrenceForm } from "./next-form";
import { ScheduleForm } from "./schedule-form";
import {
  SHORTCUT_DELETE,
  SHORTCUT_EDIT,
  SHORTCUT_NEW,
  SHORTCUT_NEXT,
  SHORTCUT_RUN,
  SHORTCUT_SKIP,
  SHORTCUT_TEST,
} from "./shortcuts";
import {
  errMessage,
  formatDays,
  formatLook,
  formatPatch,
  formatStatusLine,
  formatUpcoming,
  type ScheduleEntry,
} from "./status";
import type { HubCtx } from "./types";

function kindIcon(kind: string): { source: Icon; tintColor?: Color } {
  if (kind === "wake") return { source: Icon.Sunrise, tintColor: Color.Yellow };
  if (kind === "sleep") return { source: Icon.Moon, tintColor: Color.Purple };
  return { source: Icon.Stars, tintColor: Color.Blue };
}

function scheduleMarkdown(e: ScheduleEntry): string {
  const days = formatDays(e.days);
  const nextFire = formatUpcoming(e.upcoming);
  const patches = e.next?.length
    ? e.next.map((p) => `- ${formatPatch(p)}`).join("\n")
    : "";
  return [
    `# ${e.id}`,
    "",
    `**${e.kind}** · ${e.enabled ? "enabled" : "disabled"} · ${e.at} ${e.timezone}`,
    "",
    nextFire ? `- **Next fire:** ${nextFire}${e.upcoming_note ? ` · ${e.upcoming_note}` : ""}` : "",
    `- **Days:** ${days}`,
    `- **Duration:** ${e.duration_min} min`,
    e.split_pct ? `- **First phase:** ${e.split_pct}%` : "",
    `- **From:** ${formatLook(e.from)}`,
    `- **To:** ${formatLook(e.to)}`,
    e.end_off ? "- **End:** power off" : "",
    e.mode ? `- **Mode:** ${e.mode}` : "",
    e.last_fired ? `- **Last fired:** ${e.last_fired}` : "",
    patches ? `\n### One-shot overrides\n\n${patches}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function SchedulesView({ ctx }: { ctx: HubCtx }) {
  const { push } = useNavigation();
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ctx.hasDaemon) {
      setSchedules([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSchedules(await listSchedules());
      setError(null);
    } catch (err) {
      const message = errMessage(err);
      setError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't list schedules",
        message,
      });
    } finally {
      setLoading(false);
    }
  }, [ctx.hasDaemon]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openForm = (kind: "wake" | "sleep", existing?: ScheduleEntry) => {
    if (!ctx.hasDaemon) {
      void showToast({
        style: Toast.Style.Failure,
        title: "Schedules need gvld",
        message: "Set a daemon URL in Discover → Config.",
      });
      return;
    }
    push(
      <ScheduleForm
        kind={kind}
        existing={existing}
        onSaved={() => void reload()}
      />,
    );
  };

  const openNext = (e: ScheduleEntry) => {
    if (!ctx.hasDaemon) {
      void showToast({
        style: Toast.Style.Failure,
        title: "Schedules need gvld",
        message: "Set a daemon URL in Discover → Config.",
      });
      return;
    }
    push(<NextOccurrenceForm entry={e} onSaved={() => void reload()} />);
  };

  const skipNext = async (e: ScheduleEntry) => {
    const when = formatUpcoming(e.upcoming) || e.at;
    const confirmed = await confirmAlert({
      title: `Skip next ${e.id}?`,
      message: `Recurring ${e.at} stays. The ${when} fire will not run.`,
      primaryAction: { title: "Skip next" },
    });
    if (!confirmed) return;
    const ok = await ctx.run(["schedule", "skip", e.id], `Skip next ${e.id}`);
    if (ok) await reload();
  };

  const clearNext = async (e: ScheduleEntry) => {
    const n = e.next?.length ?? 0;
    const confirmed = await confirmAlert({
      title: `Clear one-shot overrides on ${e.id}?`,
      message: `${n} override${n === 1 ? "" : "s"} will be dropped. Recurring ${e.at} is unchanged.`,
      primaryAction: { title: "Clear" },
    });
    if (!confirmed) return;
    const ok = await ctx.run(
      ["schedule", "next", e.id, "--clear"],
      `Clear next ${e.id}`,
    );
    if (ok) await reload();
  };

  const runNow = async (e: ScheduleEntry) => {
    const ok = await ctx.run(["schedule", "run-now", e.id], `Running ${e.id}`);
    if (ok) await reload();
  };

  const testRamp = async (e: ScheduleEntry) => {
    if (e.kind !== "wake" && e.kind !== "sleep") {
      await showToast({
        style: Toast.Style.Failure,
        title: "Test Ramp is for wake/sleep",
        message: `${e.id} is ${e.kind}`,
      });
      return;
    }
    const ok = await ctx.run(
      ["schedule", "preview", e.id],
      `Test ramp ${e.id}`,
    );
    if (ok) {
      await showToast({
        style: Toast.Style.Success,
        title: `Test ramp ${e.id}`,
        message: "Playing as fast as the bulb confirms. Stop to cancel.",
      });
    }
  };

  const setEnabled = async (e: ScheduleEntry, enabled: boolean) => {
    const cmd = enabled ? "enable" : "disable";
    const ok = await ctx.run(
      ["schedule", cmd, e.id],
      enabled ? `Enable ${e.id}` : `Disable ${e.id}`,
    );
    if (ok) await reload();
  };

  const remove = async (e: ScheduleEntry) => {
    const confirmed = await confirmAlert({
      title: `Delete ${e.id}?`,
      message: "This cannot be undone.",
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });
    if (!confirmed) return;
    const ok = await ctx.run(["schedule", "delete", e.id], `Delete ${e.id}`);
    if (ok) await reload();
  };

  const nav = ctx.status
    ? `Schedules · ${formatStatusLine(ctx.status)}`
    : "Schedules";

  const newActions = (
    <>
      <Action
        title="New Wake Schedule"
        icon={Icon.Sunrise}
        shortcut={SHORTCUT_NEW}
        onAction={() => openForm("wake")}
      />
      <Action
        title="New Sleep Schedule"
        icon={Icon.Moon}
        onAction={() => openForm("sleep")}
      />
    </>
  );

  if (!ctx.hasDaemon) {
    return (
      <List
        navigationTitle="Schedules"
        searchBarPlaceholder="Schedules…"
        searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
      >
        <List.EmptyView
          icon={Icon.Calendar}
          title="Schedules need gvld"
          description="Set a daemon URL in Discover → Config, or uncheck Direct LAN."
          actions={
            <ActionPanel>
              <Action
                title="Open Discover"
                icon={Icon.MagnifyingGlass}
                onAction={() => ctx.setTab("discover")}
              />
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (error && schedules.length === 0) {
    return (
      <List
        isLoading={loading || ctx.loading}
        navigationTitle="Schedules"
        searchBarPlaceholder="Schedules…"
        searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
      >
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Couldn't load schedules"
          description={error}
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                onAction={() => void reload()}
              />
              {newActions}
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading || ctx.loading}
      isShowingDetail
      navigationTitle={nav}
      searchBarPlaceholder="Find a schedule…"
      searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
      actions={
        <ActionPanel>
          {newActions}
          <GlobalActions ctx={ctx} />
        </ActionPanel>
      }
    >
      {schedules.length === 0 ? (
        <List.EmptyView
          icon={Icon.Calendar}
          title="No schedules"
          description="Create a wake or sleep ramp on gvld."
          actions={
            <ActionPanel>
              {newActions}
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
      ) : (
        <List.Section title={`${schedules.length} schedule${schedules.length === 1 ? "" : "s"}`}>
          {schedules.map((e) => (
            <List.Item
              key={e.id}
              title={e.id}
              subtitle={`${e.kind} · ${e.at} · ${formatDays(e.days)}`}
              icon={kindIcon(e.kind)}
              keywords={[
                e.id,
                e.kind,
                e.at,
                formatDays(e.days),
                e.timezone,
                formatUpcoming(e.upcoming),
                "skip",
                "next",
                "test",
                "preview",
              ]}
              accessories={[
                {
                  tag: {
                    value: e.enabled ? "on" : "off",
                    color: e.enabled ? Color.Green : Color.SecondaryText,
                  },
                },
                {
                  text:
                    formatUpcoming(e.upcoming) ||
                    (e.enabled ? `${e.duration_min}m` : "off"),
                },
                ...(e.next?.length
                  ? [
                      {
                        tag: {
                          value: e.next.some((p) => p.skip) ? "skip" : "moved",
                          color: e.next.some((p) => p.skip)
                            ? Color.Orange
                            : Color.Blue,
                        },
                      },
                    ]
                  : []),
              ]}
              detail={
                <List.Item.Detail
                  markdown={scheduleMarkdown(e)}
                  metadata={
                    <List.Item.Detail.Metadata>
                      <List.Item.Detail.Metadata.Label title="Kind" text={e.kind} />
                      <List.Item.Detail.Metadata.Label
                        title="Enabled"
                        text={e.enabled ? "yes" : "no"}
                      />
                      <List.Item.Detail.Metadata.Label title="At" text={`${e.at} ${e.timezone}`} />
                      {e.upcoming ? (
                        <List.Item.Detail.Metadata.Label
                          title="Next fire"
                          text={`${formatUpcoming(e.upcoming)}${e.upcoming_note ? ` · ${e.upcoming_note}` : ""}`}
                        />
                      ) : null}
                      <List.Item.Detail.Metadata.Label title="Days" text={formatDays(e.days)} />
                      <List.Item.Detail.Metadata.Label
                        title="Duration"
                        text={`${e.duration_min} min`}
                      />
                      {e.split_pct ? (
                        <List.Item.Detail.Metadata.Label
                          title="First phase"
                          text={`${e.split_pct}%`}
                        />
                      ) : null}
                      <List.Item.Detail.Metadata.Separator />
                      <List.Item.Detail.Metadata.Label title="From" text={formatLook(e.from)} />
                      <List.Item.Detail.Metadata.Label title="To" text={formatLook(e.to)} />
                      {e.end_off ? (
                        <List.Item.Detail.Metadata.Label title="End" text="power off" />
                      ) : null}
                      {e.last_fired ? (
                        <List.Item.Detail.Metadata.Label
                          title="Last fired"
                          text={e.last_fired}
                        />
                      ) : null}
                    </List.Item.Detail.Metadata>
                  }
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Run Now"
                    icon={Icon.Play}
                    shortcut={SHORTCUT_RUN}
                    onAction={() => void runNow(e)}
                  />
                  <Action
                    title="Test Ramp"
                    icon={Icon.Gauge}
                    shortcut={SHORTCUT_TEST}
                    onAction={() => void testRamp(e)}
                  />
                  <Action
                    title="Skip Next"
                    icon={Icon.Forward}
                    shortcut={SHORTCUT_SKIP}
                    onAction={() => void skipNext(e)}
                  />
                  <Action
                    title="Edit Next Occurrence"
                    icon={Icon.Clock}
                    shortcut={SHORTCUT_NEXT}
                    onAction={() => openNext(e)}
                  />
                  {(e.next?.length ?? 0) > 0 ? (
                    <Action
                      title="Clear Next Overrides"
                      icon={Icon.Undo}
                      onAction={() => void clearNext(e)}
                    />
                  ) : null}
                  <Action
                    title={e.enabled ? "Disable" : "Enable"}
                    icon={e.enabled ? Icon.EyeDisabled : Icon.Eye}
                    onAction={() => void setEnabled(e, !e.enabled)}
                  />
                  <Action
                    title="Edit"
                    icon={Icon.Pencil}
                    shortcut={SHORTCUT_EDIT}
                    onAction={() =>
                      openForm(e.kind === "sleep" ? "sleep" : "wake", e)
                    }
                  />
                  <Action
                    title="Delete"
                    icon={Icon.Trash}
                    style="destructive"
                    shortcut={SHORTCUT_DELETE}
                    onAction={() => void remove(e)}
                  />
                  {newActions}
                  <GlobalActions ctx={ctx} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
