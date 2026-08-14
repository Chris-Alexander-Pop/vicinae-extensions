import { Action, ActionPanel, Icon, List, useNavigation } from "@vicinae/api";
import { GlobalActions, HubDropdown } from "./actions";
import { ColorForm } from "./color-form";
import {
  colorsEqual,
  NAMED_COLORS,
  rgbHex,
} from "./presets";
import { SHORTCUT_NEW } from "./shortcuts";
import { formatStatusLine } from "./status";
import type { HubCtx } from "./types";

export function ColorsView({ ctx }: { ctx: HubCtx }) {
  const { push } = useNavigation();
  const status = ctx.status;
  const nav = status ? `Colors · ${formatStatusLine(status)}` : "Colors";
  const currentRgb =
    status && status.colorTemInKelvin === 0 ? status.color : null;

  const openCustom = () => {
    push(
      <ColorForm
        currentBrightness={status?.brightness}
        apply={(args, title) => ctx.apply(args, title)}
      />,
    );
  };

  return (
    <List
      isLoading={ctx.loading}
      navigationTitle={nav}
      searchBarPlaceholder="Set a color…"
      searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
      actions={
        <ActionPanel>
          <Action
            title="Custom Color"
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
          title="Custom hex color"
          subtitle="#RRGGBB"
          icon={Icon.Pencil}
          keywords={["hex", "custom", "rgb"]}
          actions={
            <ActionPanel>
              <Action
                title="Custom Color"
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
        {NAMED_COLORS.map((c) => {
          const hex = rgbHex(c.rgb);
          const isActive = currentRgb ? colorsEqual(currentRgb, c.rgb) : false;
          return (
            <List.Item
              key={c.name}
              title={c.name}
              subtitle={hex}
              icon={{
                source: isActive ? Icon.Checkmark : Icon.CircleFilled,
                tintColor: hex,
              }}
              accessories={isActive ? [{ text: "current" }] : undefined}
              keywords={[c.name, hex, "color", "colour"]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Set ${c.name}`}
                    icon={{ source: Icon.CircleFilled, tintColor: hex }}
                    onAction={() =>
                      void ctx.apply(
                        ["set", "on", "colour", c.name],
                        `Color ${c.name}`,
                      )
                    }
                  />
                  <Action.CopyToClipboard title="Copy hex" content={hex} />
                  <Action
                    title="Custom Color"
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
