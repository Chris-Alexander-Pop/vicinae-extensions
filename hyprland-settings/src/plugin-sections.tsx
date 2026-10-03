import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
} from "@vicinae/api";
import type { ReactNode } from "react";
import type { PluginPersistValue } from "./persist";
import { PluginFieldForm } from "./plugin-form";
import {
  PLUGIN_CATALOG,
  formatPluginValue,
  stepped,
  type PluginCatalog,
  type PluginField,
} from "./plugins";
import { DarkWindowRows, type ShadeHandlers } from "./darkwindow-ui";
import type {
  KnownPluginPanel,
  PluginFieldRow,
  PluginSwitch,
  PluginView,
} from "./plugin-runtime";

type Props = {
  view: PluginView;
  extraActions: ReactNode;
  onSet: (field: PluginField, value: PluginPersistValue) => Promise<boolean>;
  onRemember: (catalog: PluginCatalog) => void;
  onForget: (catalog: PluginCatalog) => void;
  onToggle: (sw: PluginSwitch, enabled: boolean) => void;
  shades: ShadeHandlers;
};

function boolIcon(on: boolean) {
  if (on) return { source: Icon.Checkmark, tintColor: Color.Green };
  return { source: Icon.Circle, tintColor: Color.SecondaryText };
}

function rowIcon(row: PluginFieldRow) {
  if (row.current.kind === "bool") return boolIcon(row.current.value);
  return Icon.Cog;
}

function keywordsFor(catalog: PluginCatalog, field: PluginField): string[] {
  return [
    catalog.title,
    catalog.id,
    catalog.luaName,
    ...catalog.keywords,
    field.option,
    ...field.option.split(":"),
    ...(field.keywords ?? []),
  ];
}

function FieldActions({
  catalog,
  row,
  extraActions,
  onSet,
  onRemember,
  onForget,
}: {
  catalog: PluginCatalog;
  row: PluginFieldRow;
  extraActions: ReactNode;
  onSet: Props["onSet"];
  onRemember: Props["onRemember"];
  onForget: Props["onForget"];
}) {
  const { field, current } = row;
  const numeric = current.kind === "int" || current.kind === "float";
  const choices = field.choices ?? [];

  return (
    <ActionPanel>
      {current.kind === "bool" ? (
        <Action
          title={current.value ? `Disable ${field.title}` : `Enable ${field.title}`}
          icon={current.value ? Icon.XMarkCircle : Icon.CheckCircle}
          onAction={() =>
            onSet(field, { kind: "bool", value: !current.value })
          }
        />
      ) : null}
      {numeric ? (
        <Action
          title="Increase"
          icon={Icon.Plus}
          onAction={() => onSet(field, stepped(field, current, 1))}
        />
      ) : null}
      {numeric ? (
        <Action
          title="Decrease"
          icon={Icon.Minus}
          onAction={() => onSet(field, stepped(field, current, -1))}
        />
      ) : null}
      {current.kind !== "bool" ? (
        <Action.Push
          title={`Set ${field.title}`}
          icon={Icon.Pencil}
          target={
            <PluginFieldForm
              field={field}
              current={current}
              onSubmit={(value) => onSet(field, value)}
            />
          }
        />
      ) : null}
      {choices.map((choice) => (
        <Action
          key={choice.value || "none"}
          title={choice.label}
          icon={
            String(current.kind === "bool" ? "" : current.value) === choice.value
              ? Icon.Checkmark
              : Icon.Circle
          }
          onAction={() => onSet(field, parseChoice(field, choice.value))}
        />
      ))}
      <Action
        title="Use plugin default"
        icon={Icon.RotateAntiClockwise}
        onAction={() => onSet(field, field.fallback)}
      />
      <Action
        title="Save current values"
        icon={Icon.Download}
        onAction={() => onRemember(catalog)}
      />
      <Action
        title="Forget saved overrides"
        icon={Icon.Trash}
        onAction={() => onForget(catalog)}
      />
      {extraActions}
    </ActionPanel>
  );
}

function parseChoice(field: PluginField, value: string): PluginPersistValue {
  if (field.kind === "int") {
    return { kind: "int", value: Number(value) };
  }
  if (field.kind === "string") {
    return { kind: "string", value };
  }
  throw new Error(`${field.title} choices are not selectable`);
}

function loadedSubtitle(sw: PluginSwitch, pathNote: string | null): string {
  if (!sw.enabled) {
    const file = sw.path?.split("/").pop();
    return file
      ? `Off · ${file}. Enable loads it again`
      : "Off. Enable loads it again";
  }
  if (!sw.path) {
    return (
      pathNote ??
      "On. The plugin file wasn't found, so it can't be turned off from here"
    );
  }
  return "On. Disable unloads it and keeps it off after reload";
}

function LoadedRow({
  sw,
  pathNote,
  extraActions,
  onToggle,
}: {
  sw: PluginSwitch;
  pathNote: string | null;
  extraActions: ReactNode;
  onToggle: Props["onToggle"];
}) {
  return (
    <List.Item
      title="Loaded"
      subtitle={loadedSubtitle(sw, pathNote)}
      icon={boolIcon(sw.enabled)}
      accessories={[{ text: sw.enabled ? "On" : "Off" }]}
      keywords={[
        sw.title,
        sw.name,
        "loaded",
        "enable",
        "disable",
        "plugin",
        sw.enabled ? "on" : "off",
      ]}
      actions={
        <ActionPanel>
          {sw.path ? (
            <Action
              title={sw.enabled ? `Disable ${sw.title}` : `Enable ${sw.title}`}
              icon={sw.enabled ? Icon.XMarkCircle : Icon.CheckCircle}
              onAction={() => onToggle(sw, !sw.enabled)}
            />
          ) : null}
          {extraActions}
        </ActionPanel>
      }
    />
  );
}

function PluginPanelSection({
  panel,
  pathNote,
  extraActions,
  onSet,
  onRemember,
  onForget,
  onToggle,
  shades,
}: {
  panel: KnownPluginPanel;
  pathNote: string | null;
  extraActions: ReactNode;
  onSet: Props["onSet"];
  onRemember: Props["onRemember"];
  onForget: Props["onForget"];
  onToggle: Props["onToggle"];
  shades: ShadeHandlers;
}) {
  const { catalog, loaded } = panel;
  const savedCount = panel.rows.filter((row) => row.saved).length;
  const version = loaded.version ? ` · ${loaded.version}` : "";

  return (
    <List.Section
      title={catalog.title}
      subtitle={`${catalog.summary}${version}${savedCount > 0 ? ` · ${savedCount} saved` : ""}`}
    >
      <LoadedRow
        sw={panel.pluginSwitch}
        pathNote={pathNote}
        extraActions={extraActions}
        onToggle={onToggle}
      />
      {catalog.id === "darkwindow" ? (
        <DarkWindowRows handlers={shades} extraActions={extraActions} />
      ) : null}
      <List.Item
        title="Save current values"
        subtitle="Writes the live options into the persist snippet"
        icon={Icon.Download}
        keywords={[catalog.title, "save", "remember", "persist", ...catalog.keywords]}
        actions={
          <ActionPanel>
            <Action
              title="Save current values"
              icon={Icon.Download}
              onAction={() => onRemember(catalog)}
            />
            <Action
              title="Forget saved overrides"
              icon={Icon.Trash}
              onAction={() => onForget(catalog)}
            />
            {extraActions}
          </ActionPanel>
        }
      />
      {panel.rows.map((row) => (
        <List.Item
          key={row.field.option}
          title={row.field.title}
          subtitle={
            row.saved
              ? `${row.field.description} · saved`
              : row.field.description
          }
          icon={rowIcon(row)}
          accessories={[
            { text: formatPluginValue(row.field, row.current) },
          ]}
          keywords={keywordsFor(catalog, row.field)}
          actions={
            <FieldActions
              catalog={catalog}
              row={row}
              extraActions={extraActions}
              onSet={onSet}
              onRemember={onRemember}
              onForget={onForget}
            />
          }
        />
      ))}
      {panel.unreadable.length > 0 ? (
        <List.Item
          title="Some options did not read"
          subtitle={panel.unreadable.join(", ")}
          icon={{ source: Icon.Exclamationmark, tintColor: Color.Orange }}
        />
      ) : null}
    </List.Section>
  );
}

export function PluginSections({
  view,
  extraActions,
  onSet,
  onRemember,
  onForget,
  onToggle,
  shades,
}: Props) {
  const noneLoaded =
    view.known.length === 0 &&
    view.unknown.length === 0 &&
    view.disabled.length === 0;
  const otherOff = view.disabled.filter((sw) => sw.catalogId === null);
  const darkListed =
    view.known.some((panel) => panel.catalog.id === "darkwindow") ||
    view.disabled.some((sw) => sw.catalogId === "darkwindow");

  return (
    <>
      {PLUGIN_CATALOG.map((catalog) => {
        const panel = view.known.find((item) => item.catalog.id === catalog.id);
        if (panel) {
          return (
            <PluginPanelSection
              key={catalog.id}
              panel={panel}
              pathNote={view.pathNote}
              extraActions={extraActions}
              onSet={onSet}
              onRemember={onRemember}
              onForget={onForget}
              onToggle={onToggle}
              shades={shades}
            />
          );
        }
        const offs = view.disabled.filter((sw) => sw.catalogId === catalog.id);
        if (offs.length === 0) return null;
        return (
          <List.Section
            key={catalog.id}
            title={catalog.title}
            subtitle={catalog.summary}
          >
            {offs.map((sw) => (
              <LoadedRow
                key={sw.id}
                sw={sw}
                pathNote={view.pathNote}
                extraActions={extraActions}
                onToggle={onToggle}
              />
            ))}
            {catalog.id === "darkwindow" ? (
              <DarkWindowRows handlers={shades} extraActions={extraActions} />
            ) : null}
          </List.Section>
        );
      })}
      {view.unknown.length > 0 ? (
        <List.Section
          title="Other loaded plugins"
          subtitle="Loaded, but this extension has no options for them yet"
        >
          {view.unknown.map((plugin) => (
            <List.Item
              key={plugin.name}
              title={plugin.name}
              subtitle={
                plugin.pluginSwitch.path
                  ? plugin.description || plugin.author || "Loaded"
                  : loadedSubtitle(plugin.pluginSwitch, view.pathNote)
              }
              icon={Icon.Plug}
              accessories={[
                { text: "On" },
                ...(plugin.version ? [{ text: plugin.version }] : []),
              ]}
              keywords={[plugin.name, plugin.author, "plugin", "disable"]}
              actions={
                <ActionPanel>
                  {plugin.pluginSwitch.path ? (
                    <Action
                      title={`Disable ${plugin.name}`}
                      icon={Icon.XMarkCircle}
                      onAction={() => onToggle(plugin.pluginSwitch, false)}
                    />
                  ) : null}
                  {extraActions}
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
      {otherOff.length > 0 ? (
        <List.Section
          title="Turned off"
          subtitle="These plugins stay unloaded until you enable them"
        >
          {otherOff.map((sw) => (
            <LoadedRow
              key={sw.id}
              sw={sw}
              pathNote={view.pathNote}
              extraActions={extraActions}
              onToggle={onToggle}
            />
          ))}
        </List.Section>
      ) : null}
      {view.error ? (
        <List.Section title="Plugins">
          <List.Item
            title="Couldn't list plugins"
            subtitle={view.error}
            icon={{ source: Icon.Exclamationmark, tintColor: Color.Red }}
            actions={<ActionPanel>{extraActions}</ActionPanel>}
          />
        </List.Section>
      ) : null}
      {!darkListed && shades.configs.length > 0 ? (
        <List.Section
          title="Dark Window"
          subtitle="Saved shades. Load the plugin to apply them"
        >
          <DarkWindowRows handlers={shades} extraActions={extraActions} />
        </List.Section>
      ) : null}
      {noneLoaded && !view.error ? (
        <List.Section title="Plugins" subtitle="hyprctl plugin list was empty">
          <List.Item
            title="No plugins loaded"
            subtitle="Load one, then refresh. Plugins you turn off here stay in this list."
            icon={Icon.Plug}
            actions={<ActionPanel>{extraActions}</ActionPanel>}
          />
        </List.Section>
      ) : null}
    </>
  );
}
