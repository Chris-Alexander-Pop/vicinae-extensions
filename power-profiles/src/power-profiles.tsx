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
import { BoostAppView } from "./boost-app";
import {
  getTlpStatus,
  profileDescription,
  profileLabel,
  setTlpProfile,
  TLP_PROFILES,
  type TlpProfile,
  type TlpStatus,
} from "./tlp";

const SHORTCUT_REFRESH = { modifiers: ["ctrl"] as const, key: "r" as const };

function profileIcon(profile: TlpProfile, active: boolean) {
  if (active) {
    return { source: Icon.Checkmark, tintColor: Color.Green };
  }
  switch (profile) {
    case "performance":
      return { source: Icon.Bolt, tintColor: Color.Yellow };
    case "balanced":
      return { source: Icon.Gauge, tintColor: Color.Blue };
    case "power-saver":
      return { source: Icon.Leaf, tintColor: Color.Green };
  }
}

export default function PowerProfilesCommand() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<TlpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getTlpStatus();
      setStatus(next);
      setError(null);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read TLP status";
      setError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "TLP unavailable",
        message:
          "Is tlp installed and running? Store power-profiles-daemon is not used.",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = async (profile: TlpProfile) => {
    setLoading(true);
    try {
      const next = await setTlpProfile(profile);
      setStatus(next);
      await showToast({
        style: Toast.Style.Success,
        title: `TLP → ${profileLabel(next.active)}`,
        message: `Power source: ${next.powerSource}`,
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to set profile",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  if (error && !status) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Can't talk to TLP"
          description={`${error}\n\nInstall tlp. Switching profiles runs \`sudo tlp <profile>\` (polkit/pkexec also works if you wrap it).`}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Select a TLP power profile..."
      navigationTitle={
        status
          ? `Power Profiles · ${profileLabel(status.active)}`
          : "Power Profiles"
      }
    >
      <List.Section title="Apps">
        <List.Item
          title="Boost App Priority"
          subtitle="Raise CPU/IO priority for an open window"
          icon={{ source: Icon.Bolt, tintColor: Color.Yellow }}
          keywords={["boost", "nice", "priority", "app", "performance"]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Boost App Priority"
                icon={Icon.Bolt}
                target={<BoostAppView />}
              />
              <Action
                title="Refresh Profiles"
                icon={Icon.ArrowClockwise}
                shortcut={SHORTCUT_REFRESH}
                onAction={() => void refresh()}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section
        title={
          status
            ? `Profiles · ${status.rawProfile} (${status.powerSource})`
            : "Profiles"
        }
      >
        {TLP_PROFILES.map((profile) => {
          const isActive = status?.active === profile;
          return (
            <List.Item
              key={profile}
              title={profileLabel(profile)}
              subtitle={profileDescription(profile)}
              icon={profileIcon(profile, !!isActive)}
              accessories={
                isActive
                  ? [{ text: "active", icon: Icon.CheckCircle }]
                  : undefined
              }
              keywords={[profile, "tlp", "power", "battery", "ac"]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Switch to ${profileLabel(profile)}`}
                    icon={Icon.Cog}
                    onAction={() => void apply(profile)}
                  />
                  <Action.Push
                    title="Boost App Priority"
                    icon={Icon.Bolt}
                    target={<BoostAppView />}
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
          );
        })}
      </List.Section>
    </List>
  );
}
