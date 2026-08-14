import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import type { HubCtx } from "./types";
import {
  SHORTCUT_DOWN,
  SHORTCUT_REFRESH,
  SHORTCUT_STOP,
  SHORTCUT_TOGGLE,
  SHORTCUT_UP,
  TABS,
  type HubTab,
} from "./shortcuts";

export function HubDropdown({
  tab,
  onChange,
}: {
  tab: HubTab;
  onChange: (tab: HubTab) => void;
}) {
  return (
    <List.Dropdown
      tooltip="Ctrl+1–6 switch panels"
      value={tab}
      onChange={(value) => onChange(value as HubTab)}
    >
      {TABS.map((t) => (
        <List.Dropdown.Item
          key={t.id}
          title={t.title}
          value={t.id}
          icon={t.icon}
        />
      ))}
    </List.Dropdown>
  );
}

export function PanelSwitchSection({
  setTab,
}: {
  tab: HubTab;
  setTab: (tab: HubTab) => void;
}) {
  return (
    <ActionPanel.Section title="Panel">
      {TABS.map((t) => (
        <Action
          key={t.id}
          title={t.title}
          icon={t.icon}
          shortcut={t.shortcut}
          onAction={() => setTab(t.id)}
        />
      ))}
    </ActionPanel.Section>
  );
}

export function GlobalActions({ ctx }: { ctx: HubCtx }) {
  return (
    <>
      <ActionPanel.Section title="Power">
        <Action
          title="Toggle Power"
          icon={Icon.Power}
          shortcut={SHORTCUT_TOGGLE}
          onAction={() => void ctx.toggle()}
        />
        <Action
          title="Stop Mode"
          icon={Icon.Stop}
          shortcut={SHORTCUT_STOP}
          onAction={() => void ctx.stop()}
        />
        <Action
          title={`Brighter (+${ctx.step}%)`}
          icon={Icon.Plus}
          shortcut={SHORTCUT_UP}
          onAction={() => void ctx.nudge(ctx.step)}
        />
        <Action
          title={`Dimmer (−${ctx.step}%)`}
          icon={Icon.Minus}
          shortcut={SHORTCUT_DOWN}
          onAction={() => void ctx.nudge(-ctx.step)}
        />
        <Action
          title="Refresh"
          icon={Icon.ArrowClockwise}
          shortcut={SHORTCUT_REFRESH}
          onAction={() => void ctx.refresh()}
        />
      </ActionPanel.Section>
      <PanelSwitchSection tab={ctx.tab} setTab={ctx.setTab} />
    </>
  );
}
