import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { boostApp, listOpenApps, resetApp, type OpenApp } from "./apps";

const SHORTCUT_REFRESH = { modifiers: ["ctrl"] as const, key: "r" as const };

export function BoostAppView() {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState<OpenApp[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await listOpenApps();
      setApps(next);
      setError(null);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to list open apps";
      setError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "Can't list apps",
        message: "Is Hyprland running? (needs hyprctl clients)",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runBoost = async (app: OpenApp) => {
    setLoading(true);
    try {
      await boostApp(app);
      await showToast({
        style: Toast.Style.Success,
        title: `Boosted ${app.className}`,
        message: `nice -10 on ${app.treePids.length} process(es)`,
      });
      await refresh();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Boost failed",
        message: err instanceof Error ? err.message : String(err),
      });
      setLoading(false);
    }
  };

  const runReset = async (app: OpenApp) => {
    setLoading(true);
    try {
      await resetApp(app);
      await showToast({
        style: Toast.Style.Success,
        title: `Reset ${app.className}`,
        message: "Priority restored to defaults",
      });
      await refresh();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Reset failed",
        message: err instanceof Error ? err.message : String(err),
      });
      setLoading(false);
    }
  };

  if (error && apps.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="No open apps found"
          description={error}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Search open apps to boost..."
      navigationTitle="Boost App Priority"
    >
      <List.Section title="Open apps (Hyprland)">
        {apps.map((app) => (
          <List.Item
            key={app.key}
            title={app.className}
            subtitle={app.title}
            icon={
              app.boosted
                ? { source: Icon.Bolt, tintColor: Color.Yellow }
                : Icon.AppWindow
            }
            accessories={[
              ...(app.boosted
                ? [{ tag: { value: "boosted", color: Color.Yellow } }]
                : []),
              { text: `nice ${app.nice}` },
              { text: `pid ${app.pid}` },
              ...(app.windowCount > 1
                ? [{ text: `${app.windowCount} wins` }]
                : []),
            ]}
            keywords={[app.className, app.title, String(app.pid), "boost"]}
            actions={
              <ActionPanel>
                <Action
                  title="Boost Priority"
                  icon={Icon.Bolt}
                  shortcut={{ modifiers: ["ctrl"], key: "b" }}
                  onAction={() => void runBoost(app)}
                />
                <Action
                  title="Reset Priority"
                  icon={Icon.ArrowCounterClockwise}
                  shortcut={{ modifiers: ["ctrl"], key: "u" }}
                  onAction={() => void runReset(app)}
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
    </List>
  );
}

export default function BoostAppCommand() {
  return <BoostAppView />;
}
