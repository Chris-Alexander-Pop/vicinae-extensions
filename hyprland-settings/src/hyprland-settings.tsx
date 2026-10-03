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
import type { DarkWindowConfig } from "./darkwindow";
import {
  deleteDarkWindow,
  saveDarkWindow,
  type ShadeApply,
} from "./darkwindow-runtime";
import { readPersistState } from "./persist";
import {
  installPersistence,
  readAllSettings,
  readSetupStatus,
  setSettingEnabled,
  statusLabel,
  type SettingState,
  type SetupStatus,
} from "./settings";
import { PluginSections } from "./plugin-sections";
import {
  forgetPlugin,
  readPluginView,
  rememberPlugin,
  setPluginEnabled,
  setPluginField,
  type PluginSwitch,
  type PluginView,
} from "./plugin-runtime";
import type { PluginCatalog, PluginField } from "./plugins";
import type { PluginPersistValue } from "./persist";

function shadeApplyMessage(apply: ShadeApply, removed: boolean): string {
  if (apply === "reloaded") {
    return removed
      ? "Hyprland reloaded. That shade is gone"
      : "Hyprland reloaded so matching windows use it";
  }
  if (apply === "live") {
    return removed
      ? "Matching windows lost that shade"
      : "Applied to matching windows";
  }
  return removed
    ? "Removed. It stays gone when Dark Window is loaded"
    : "Saved. It applies when Dark Window is loaded";
}

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
  const [plugins, setPlugins] = useState<PluginView | null>(null);
  const [shades, setShades] = useState<DarkWindowConfig[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await readAllSettings();
      const view = await readPluginView();
      setSettings(next);
      setPlugins(view);
      setShades(Object.values(readPersistState().darkWindows));
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

  const markPlugin = (
    catalog: PluginCatalog,
    patch: (row: PluginView["known"][number]["rows"][number]) => PluginView["known"][number]["rows"][number],
  ) => {
    setPlugins((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        known: prev.known.map((panel) =>
          panel.catalog.id === catalog.id
            ? { ...panel, rows: panel.rows.map(patch) }
            : panel,
        ),
      };
    });
  };

  const setPlugin = async (
    field: PluginField,
    value: PluginPersistValue,
  ): Promise<boolean> => {
    setLoading(true);
    try {
      await setPluginField(field, value);
      setPlugins((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          known: prev.known.map((panel) => ({
            ...panel,
            rows: panel.rows.map((row) =>
              row.field.option === field.option
                ? { ...row, current: value, saved: true }
                : row,
            ),
          })),
        };
      });
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Success,
        title: field.needsReload ? `${field.title} applied` : `${field.title} saved`,
        message: field.needsReload
          ? "Hyprland reloaded so the plugin is using it"
          : "Applied, and kept after reload and login",
      });
      return true;
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Couldn't set ${field.title}`,
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const remember = async (catalog: PluginCatalog) => {
    setLoading(true);
    try {
      const saved = new Set(await rememberPlugin(catalog));
      markPlugin(catalog, (row) =>
        saved.has(row.field.option) ? { ...row, saved: true } : row,
      );
      setSetup(readSetupStatus());
      const reloaded = catalog.fields.some(
        (field) => field.needsReload && saved.has(field.option),
      );
      await showToast({
        style: Toast.Style.Success,
        title: `${catalog.title} saved`,
        message: reloaded
          ? `${saved.size} options applied. Hyprland reloaded`
          : `${saved.size} options applied, and kept after reload and login`,
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Couldn't save ${catalog.title}`,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const forget = async (catalog: PluginCatalog) => {
    const confirmed = await confirmAlert({
      title: `Forget saved ${catalog.title} overrides?`,
      message:
        "Hyprland reloads after this. Your own config applies again.",
      primaryAction: { title: "Forget" },
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      await forgetPlugin(catalog);
      markPlugin(catalog, (row) => ({ ...row, saved: false }));
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Success,
        title: `${catalog.title} overrides cleared`,
        message: catalog.fields.some((field) => field.needsReload)
          ? "Hyprland reloaded. Your own config applies again"
          : "Cleared from the persist snippet",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Couldn't forget ${catalog.title}`,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePlugin = async (sw: PluginSwitch, enabled: boolean) => {
    if (!sw.path) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Can't toggle ${sw.title}`,
        message: "The plugin file path is unknown",
      });
      return;
    }
    if (!enabled) {
      const confirmed = await confirmAlert({
        title: `Disable ${sw.title}?`,
        message:
          "Unloads it and reloads Hyprland. It stays off until you enable it here.",
        primaryAction: { title: "Disable" },
      });
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      await setPluginEnabled({
        name: sw.name,
        path: sw.path,
        enabled,
        description: sw.description,
        author: sw.author,
        version: sw.version,
      });
      setPlugins(await readPluginView());
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Success,
        title: enabled ? `${sw.title} loaded` : `${sw.title} unloaded`,
        message: enabled
          ? "Hyprland reloaded with the plugin on"
          : "It stays off after reload and login",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: enabled
          ? `Couldn't enable ${sw.title}`
          : `Couldn't disable ${sw.title}`,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const rememberShades = () => {
    setShades(Object.values(readPersistState().darkWindows));
  };

  const saveShade = async (config: DarkWindowConfig): Promise<boolean> => {
    setLoading(true);
    try {
      const saved = await saveDarkWindow(config);
      rememberShades();
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Success,
        title: `${saved.config.name} saved`,
        message: shadeApplyMessage(saved.apply, false),
      });
      return true;
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't save shade",
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const removeShade = async (config: DarkWindowConfig): Promise<boolean> => {
    setLoading(true);
    try {
      const apply = await deleteDarkWindow(config.id);
      rememberShades();
      setSetup(readSetupStatus());
      await showToast({
        style: Toast.Style.Success,
        title: `${config.name} removed`,
        message: shadeApplyMessage(apply, true),
      });
      return true;
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't remove shade",
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
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
  const loadedPlugins = plugins
    ? plugins.known.length + plugins.unknown.length + plugins.disabled.length
    : 0;

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Filter Hyprland settings and plugins..."
      navigationTitle={
        settings.length > 0
          ? `Hyprland Settings · ${enabledCount}/${settings.length} on · ${loadedPlugins} plugins`
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
      {plugins ? (
        <PluginSections
          view={plugins}
          extraActions={
            <>
              {persistAction}
              {refreshAction}
            </>
          }
          onSet={(field, value) => setPlugin(field, value)}
          onRemember={(catalog) => {
            void remember(catalog);
          }}
          onForget={(catalog) => {
            void forget(catalog);
          }}
          onToggle={(sw, enabled) => {
            void togglePlugin(sw, enabled);
          }}
          shades={{
            configs: shades,
            onSave: saveShade,
            onDelete: removeShade,
          }}
        />
      ) : null}
    </List>
  );
}
