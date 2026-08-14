import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
} from "@vicinae/api";
import { GlobalActions, HubDropdown } from "./actions";
import { BRIGHTNESS_PRESETS, nearestPreset } from "./presets";
import { formatColor, formatStatusLine, isOn } from "./status";
import type { HubCtx } from "./types";

function StatusDetail({ ctx }: { ctx: HubCtx }) {
  const status = ctx.status;
  if (!status) {
    return (
      <List.Item.Detail
        markdown={ctx.error ? `# Can't reach light\n\n${ctx.error}` : "_Loading…_"}
      />
    );
  }
  const on = isOn(status);
  const color = formatColor(status);
  return (
    <List.Item.Detail
      markdown={`# ${on ? "On" : "Off"}\n\n**${status.brightness}%** · ${color}`}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label
            title="Power"
            text={on ? "On" : "Off"}
          />
          <List.Item.Detail.Metadata.Label
            title="Brightness"
            text={`${status.brightness}%`}
          />
          <List.Item.Detail.Metadata.Label title="Look" text={color} />
          {status.colorTemInKelvin > 0 ? (
            <List.Item.Detail.Metadata.Label
              title="Temperature"
              text={`${status.colorTemInKelvin}K`}
            />
          ) : (
            <List.Item.Detail.Metadata.Label
              title="RGB"
              text={`${status.color.r}, ${status.color.g}, ${status.color.b}`}
            />
          )}
          {ctx.config?.address ? (
            <List.Item.Detail.Metadata.Label
              title="Address"
              text={ctx.config.address}
            />
          ) : null}
          {ctx.config?.url ? (
            <List.Item.Detail.Metadata.Label
              title="Daemon"
              text={ctx.hasDaemon ? ctx.config.url : `${ctx.config.url} (skipped)`}
            />
          ) : (
            <List.Item.Detail.Metadata.Label
              title="Daemon"
              text="not configured"
            />
          )}
        </List.Item.Detail.Metadata>
      }
    />
  );
}

function itemActions(
  ctx: HubCtx,
  primary: { title: string; icon: Icon; onAction: () => void },
) {
  return (
    <ActionPanel>
      <Action title={primary.title} icon={primary.icon} onAction={primary.onAction} />
      <GlobalActions ctx={ctx} />
    </ActionPanel>
  );
}

export function ControlView({ ctx }: { ctx: HubCtx }) {
  const status = ctx.status;
  const on = status ? isOn(status) : false;
  const activePreset = status ? nearestPreset(status.brightness) : null;
  const nav = status ? `Govee Lights · ${formatStatusLine(status)}` : "Govee Lights";
  const detail = <StatusDetail ctx={ctx} />;

  if (ctx.error && !status) {
    return (
      <List
        isLoading={ctx.loading}
        navigationTitle="Govee Lights"
        searchBarPlaceholder="Control lights…"
        searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
      >
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Can't control lights"
          description={ctx.error}
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                onAction={() => void ctx.refresh()}
              />
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={ctx.loading}
      isShowingDetail
      navigationTitle={nav}
      searchBarPlaceholder="Power, brightness…"
      searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
    >
      <List.Section title="Power">
        <List.Item
          title="Turn On"
          subtitle={status ? formatStatusLine(status) : undefined}
          icon={{ source: Icon.LightBulb, tintColor: Color.Yellow }}
          keywords={["on", "power", "enable"]}
          detail={detail}
          actions={itemActions(ctx, {
            title: "Turn On",
            icon: Icon.LightBulb,
            onAction: () => void ctx.apply(["on"], "Turning on"),
          })}
        />
        <List.Item
          title="Turn Off"
          icon={{ source: Icon.LightBulbOff, tintColor: Color.SecondaryText }}
          keywords={["off", "power", "disable"]}
          detail={detail}
          actions={itemActions(ctx, {
            title: "Turn Off",
            icon: Icon.LightBulbOff,
            onAction: () => void ctx.apply(["off"], "Turning off"),
          })}
        />
        <List.Item
          title="Toggle"
          subtitle={on ? "Currently on" : "Currently off"}
          icon={{ source: Icon.Power, tintColor: on ? Color.Green : Color.SecondaryText }}
          keywords={["toggle", "flip"]}
          detail={detail}
          actions={itemActions(ctx, {
            title: "Toggle Power",
            icon: Icon.Power,
            onAction: () => void ctx.toggle(),
          })}
        />
        <List.Item
          title="Stop Mode"
          subtitle="Halt animated mode or ramp"
          icon={Icon.Stop}
          keywords={["stop", "mode", "cancel"]}
          detail={detail}
          actions={itemActions(ctx, {
            title: "Stop Mode",
            icon: Icon.Stop,
            onAction: () => void ctx.stop(),
          })}
        />
      </List.Section>

      <List.Section title="Adjust">
        <List.Item
          title={`Brighter (+${ctx.step}%)`}
          subtitle={status ? `Now ${status.brightness}%` : undefined}
          icon={{ source: Icon.Plus, tintColor: Color.Yellow }}
          keywords={["increase", "up", "brighter"]}
          detail={detail}
          actions={itemActions(ctx, {
            title: `Brighter (+${ctx.step}%)`,
            icon: Icon.Plus,
            onAction: () => void ctx.nudge(ctx.step),
          })}
        />
        <List.Item
          title={`Dimmer (−${ctx.step}%)`}
          subtitle={status ? `Now ${status.brightness}%` : undefined}
          icon={{ source: Icon.Minus, tintColor: Color.Orange }}
          keywords={["decrease", "down", "dimmer"]}
          detail={detail}
          actions={itemActions(ctx, {
            title: `Dimmer (−${ctx.step}%)`,
            icon: Icon.Minus,
            onAction: () => void ctx.nudge(-ctx.step),
          })}
        />
      </List.Section>

      <List.Section
        title={status ? `Brightness · ${status.brightness}%` : "Brightness"}
      >
        {BRIGHTNESS_PRESETS.map((percent) => {
          const isActive = activePreset === percent;
          return (
            <List.Item
              key={percent}
              title={`${percent}%`}
              icon={
                isActive
                  ? { source: Icon.Checkmark, tintColor: Color.Green }
                  : Icon.Sun
              }
              accessories={isActive ? [{ text: "current", icon: Icon.Eye }] : undefined}
              keywords={[String(percent), "brightness"]}
              detail={detail}
              actions={itemActions(ctx, {
                title: `Set to ${percent}%`,
                icon: Icon.Sun,
                onAction: () =>
                  void ctx.apply(
                    ["set", "on", "bright", String(percent)],
                    `Brightness ${percent}%`,
                  ),
              })}
            />
          );
        })}
      </List.Section>
    </List>
  );
}
