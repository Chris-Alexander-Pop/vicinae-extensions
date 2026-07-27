import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  Keyboard,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  readAllSettings,
  setSettingEnabled,
  statusLabel,
  type SettingState,
} from "./settings";

const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const SHORTCUT_TOGGLE: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "t" };

function settingIcon(setting: SettingState) {
  if (setting.enabled) {
    return { source: Icon.Checkmark, tintColor: Color.Green };
  }
  return { source: Icon.Circle, tintColor: Color.SecondaryText };
}

export default function HyprlandSettingsCommand() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SettingState[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await readAllSettings();
      setSettings(next);
      setError(null);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read Hyprland settings";
      setError(message);
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

  const toggle = async (setting: SettingState) => {
    setLoading(true);
    try {
      const next = await setSettingEnabled(setting, !setting.enabled);
      setSettings((prev) =>
        prev.map((item) => (item.id === next.id ? next : item)),
      );
      await showToast({
        style: Toast.Style.Success,
        title: `${setting.title} → ${statusLabel(next.enabled)}`,
        message: "Runtime only — resets on hyprctl reload / logout",
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

  if (error && settings.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Can't talk to Hyprland"
          description={`${error}\n\nThis extension uses hyprctl getoption / eval (Lua config).`}
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
