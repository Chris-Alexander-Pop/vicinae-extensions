import { Action, ActionPanel, Color, Icon, List, useNavigation } from "@vicinae/api";
import { GlobalActions, HubDropdown } from "./actions";
import { namedTempFor, TEMP_PRESETS } from "./presets";
import { SHORTCUT_NEW } from "./shortcuts";
import { formatStatusLine } from "./status";
import { TempForm } from "./temp-form";
import type { HubCtx } from "./types";

export function TempsView({ ctx }: { ctx: HubCtx }) {
  const { push } = useNavigation();
  const status = ctx.status;
  const nav = status ? `Temperature · ${formatStatusLine(status)}` : "Temperature";
  const currentK = status && status.colorTemInKelvin > 0 ? status.colorTemInKelvin : null;

  const openCustom = () => {
    push(
      <TempForm
        apply={(args, title) => ctx.apply(args, title)}
        currentKelvin={currentK ?? undefined}
      />,
    );
  };

  return (
    <List
      isLoading={ctx.loading}
      navigationTitle={nav}
      searchBarPlaceholder="Set a color temperature…"
      searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
      actions={
        <ActionPanel>
          <Action
            title="Custom Kelvin"
            icon={Icon.Pencil}
            shortcut={SHORTCUT_NEW}
            onAction={openCustom}
          />
          <GlobalActions ctx={ctx} />
        </ActionPanel>
      }
    >
      <List.Section title="Custom">
        <List.Item
          title="Custom Kelvin"
          subtitle="1800–9000K"
          icon={Icon.Pencil}
          keywords={["kelvin", "custom", "temp"]}
          actions={
            <ActionPanel>
              <Action
                title="Custom Kelvin"
                icon={Icon.Pencil}
                shortcut={SHORTCUT_NEW}
                onAction={openCustom}
              />
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Presets">
        {TEMP_PRESETS.map((t) => {
          const isActive = currentK === t.kelvin;
          const label = namedTempFor(t.kelvin) ?? t.name;
          return (
            <List.Item
              key={t.name}
              title={label}
              subtitle={`${t.kelvin}K`}
              icon={
                isActive
                  ? { source: Icon.Checkmark, tintColor: Color.Green }
                  : Icon.Temperature
              }
              accessories={[{ text: `${t.kelvin}K` }]}
              keywords={[t.name, String(t.kelvin), "temp", "kelvin", "white"]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Set ${t.name}`}
                    icon={Icon.Temperature}
                    onAction={() =>
                      void ctx.apply(
                        ["set", "on", "temp", t.name],
                        `Temperature ${t.name}`,
                      )
                    }
                  />
                  <Action
                    title="Custom Kelvin"
                    icon={Icon.Pencil}
                    shortcut={SHORTCUT_NEW}
                    onAction={openCustom}
                  />
                  <GlobalActions ctx={ctx} />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}
