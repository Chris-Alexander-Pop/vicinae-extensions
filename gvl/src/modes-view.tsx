import { Action, ActionPanel, Color, Icon, List, showToast, Toast, useNavigation } from "@vicinae/api";
import { GlobalActions, HubDropdown } from "./actions";
import { ModeForm } from "./mode-form";
import { MODES } from "./presets";
import { formatStatusLine } from "./status";
import type { HubCtx } from "./types";

function modeIcon(name: string): Icon {
  switch (name) {
    case "rainbow":
    case "aurora":
      return Icon.Stars;
    case "cycle":
      return Icon.RotateClockwise;
    case "fire":
      return Icon.Torch;
    case "candle":
      return Icon.LightBulb;
    case "fade":
    case "breathe":
      return Icon.Heartbeat;
    case "pulse":
      return Icon.Livestream01;
    case "temp-fade":
    case "temp-cycle":
      return Icon.Temperature;
    case "blend":
      return Icon.Swatch;
    default:
      return Icon.Stars;
  }
}

export function ModesView({ ctx }: { ctx: HubCtx }) {
  const { push } = useNavigation();
  const status = ctx.status;
  const nav = status ? `Modes · ${formatStatusLine(status)}` : "Modes";

  const startMode = async (args: string[], title: string): Promise<boolean> => {
    if (!ctx.hasDaemon) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Modes need gvld",
        message:
          "Animated modes block without a daemon. Set a URL in Discover → Config, or uncheck Direct LAN.",
      });
      return false;
    }
    const ok = await ctx.run(args, title);
    if (ok) await ctx.refresh();
    return ok;
  };

  const openForm = (name: string) => {
    if (!ctx.hasDaemon) {
      void showToast({
        style: Toast.Style.Failure,
        title: "Modes need gvld",
        message: "Configure a daemon URL first.",
      });
      return;
    }
    push(
      <ModeForm
        name={name}
        onStart={(args, title) => startMode(args, title)}
      />,
    );
  };

  return (
    <List
      isLoading={ctx.loading}
      navigationTitle={nav}
      searchBarPlaceholder="Start an animated mode…"
      searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
    >
      {!ctx.hasDaemon ? (
        <List.Section title="Daemon required">
          <List.Item
            title="gvld is not in use"
            subtitle="Set a daemon URL in Discover, or uncheck Direct LAN"
            icon={{ source: Icon.Exclamationmark, tintColor: Color.Orange }}
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
        </List.Section>
      ) : null}
      <List.Section title="Instant">
        {MODES.filter((m) => !m.needsForm).map((m) => (
          <List.Item
            key={m.name}
            title={m.name}
            subtitle={m.help}
            icon={modeIcon(m.name)}
            keywords={[m.name, "mode", m.help]}
            actions={
              <ActionPanel>
                <Action
                  title={`Start ${m.name}`}
                  icon={modeIcon(m.name)}
                  onAction={() => void startMode(["mode", m.name], `Mode ${m.name}`)}
                />
                <Action
                  title="Configure & Start"
                  icon={Icon.Cog}
                  onAction={() => openForm(m.name)}
                />
                <GlobalActions ctx={ctx} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      <List.Section title="Needs colors / temps">
        {MODES.filter((m) => m.needsForm).map((m) => (
          <List.Item
            key={m.name}
            title={m.name}
            subtitle={m.help}
            icon={modeIcon(m.name)}
            keywords={[m.name, "mode", m.help]}
            actions={
              <ActionPanel>
                <Action
                  title={`Configure ${m.name}`}
                  icon={Icon.Cog}
                  onAction={() => openForm(m.name)}
                />
                <GlobalActions ctx={ctx} />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
