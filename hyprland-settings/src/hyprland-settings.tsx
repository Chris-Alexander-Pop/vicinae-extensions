import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  installPersistence,
  readAllSettings,
  readSetupStatus,
  setSettingEnabled,
  statusLabel,
  type SettingState,
  type SetupStatus,
} from "./settings";

const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const SHORTCUT_TOGGLE: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "t" };
const SHORTCUT_SETUP: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "p" };

function settingIcon(setting: SettingState) {
  if (setting.enabled) {
    return { source: Icon.Checkmark, tintColor: Color.Green };
  }
  return { source: Icon.Circle, tintColor: Color.SecondaryText };
}

function setupIcon(setup: SetupStatus) {
  if (setup.ready) {
    return { source: Icon.CheckCircle, tintColor: Color.Green };
  }
  if (setup.entrypoint === "none") {
    return { source: Icon.Exclamationmark, tintColor: Color.Red };
  }
  return { source: Icon.Download, tintColor: Color.Orange };
}

export default function HyprlandSettingsCommand() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingState[]>([]);
  const [setup, setSetup] = useState<SetupStatus>(() => readSetupStatus());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await readAllSettings();
      setSettings(next);
      setSetup(readSetupStatus());
      setError(null);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read Hyprland settings";
      setError(message);
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Failure,
        title: "Hyprland unavailable",
        message: "Is hyprctl on PATH and is a Hyprland session running?",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = async () => {
    if (!setup.ready && setup.entrypoint !== "none") {
      const target =
        setup.entrypoint === "lua" ? "hyprland.lua" : "hyprland.conf";
      const confirmed = await confirmAlert({
        title: "Remember toggles after restart?",
        message: `Appends a short load hook to ~/.config/hypr/${target} so saved settings survive hyprctl reload and login. Existing config is not replaced.`,
        primaryAction: { title: "Install" },
      });
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const next = await installPersistence();
      setSetup(next);
      await showToast({
        style: Toast.Style.Success,
        title: next.ready
          ? "Persist hook installed"
          : "Persist files written",
        message: next.subtitle,
      });
    } catch (err) {
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Failure,
        title: "Could not install persist hook",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (setting: SettingState) => {
    setLoading(true);
    try {
      const next = await setSettingEnabled(setting, !setting.enabled);
      setSettings((prev) =>
        prev.map((item) => (item.id === next.id ? next : item)),
      );
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Success,
        title: `${setting.title} → ${statusLabel(next.enabled)}`,
        message: "Saved — kept after reload and login",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Failed to toggle ${setting.title}`,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const persistAction = (
    <Action
      title={setup.ready ? "Reinstall persist hook" : "Install persist hook"}
      icon={Icon.Download}
      shortcut={SHORTCUT_SETUP}
      onAction={() => void install()}
    />
  );

  const refreshAction = (
    <Action
      title="Refresh"
      icon={Icon.ArrowClockwise}
      shortcut={SHORTCUT_REFRESH}
      onAction={() => void refresh()}
    />
  );

  if (error && settings.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Can't talk to Hyprland"
          description={`${error}\n\nThis extension uses hyprctl getoption / eval (Lua config).`}
          actions={
            <ActionPanel>
              {persistAction}
              {refreshAction}
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const enabledCount = settings.filter((s) => s.enabled).length;

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Filter Hyprland settings..."
      navigationTitle={
        settings.length > 0
          ? `Hyprland Settings · ${enabledCount}/${settings.length} on`
          : "Hyprland Settings"
      }
    >
      <List.Section title="Setup">
        <List.Item
          title={setup.title}
          subtitle={setup.subtitle}
          icon={setupIcon(setup)}
          accessories={[
            {
              text: setup.ready ? "Ready" : "Needed",
              icon: setup.ready ? Icon.CheckCircle : Icon.Exclamationmark,
            },
          ]}
          keywords={[
            "persist",
            "remember",
            "setup",
            "install",
            "hook",
            "restart",
            "reload",
          ]}
          actions={
            <ActionPanel>
              {persistAction}
              {refreshAction}
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Toggles">
        {settings.map((setting) => (
          <List.Item
            key={setting.id}
            title={setting.title}
            subtitle={setting.description}
            icon={settingIcon(setting)}
            accessories={[
              {
                text: statusLabel(setting.enabled),
                icon: setting.enabled ? Icon.CheckCircle : Icon.Circle,
              },
            ]}
            keywords={[
              setting.id,
              ...setting.keywords,
              statusLabel(setting.enabled),
              setting.enabled ? "disable" : "enable",
            ]}
            actions={
              <ActionPanel>
                <Action
                  title={
                    setting.enabled
                      ? `Disable ${setting.title}`
                      : `Enable ${setting.title}`
                  }
                  icon={setting.enabled ? Icon.XMarkCircle : Icon.CheckCircle}
                  shortcut={SHORTCUT_TOGGLE}
                  onAction={() => void toggle(setting)}
                />
                {persistAction}
                {refreshAction}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
