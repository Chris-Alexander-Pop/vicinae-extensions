import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  adjustBrightnessPercent,
  getBrightness,
  parseStepPercent,
  setBrightnessPercent,
  type BrightnessInfo,
} from "./brightnessctl";

type Preferences = {
  stepPercent?: string;
  device?: string;
};

const PRESETS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1];

const SHORTCUT_UP = { modifiers: ["ctrl"] as const, key: "arrowUp" as const };
const SHORTCUT_DOWN = {
  modifiers: ["ctrl"] as const,
  key: "arrowDown" as const,
};
const SHORTCUT_REFRESH = { modifiers: ["ctrl"] as const, key: "r" as const };

function nearestPreset(percent: number): number {
  return PRESETS.reduce((best, p) =>
    Math.abs(p - percent) < Math.abs(best - percent) ? p : best,
  );
}

export default function BrightnessCommand() {
  const prefs = getPreferenceValues<Preferences>();
  const device = prefs.device?.trim() || undefined;
  const step = parseStepPercent(prefs.stepPercent);

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<BrightnessInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getBrightness(device);
      setInfo(next);
      setError(null);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read brightness";
      setError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "brightnessctl failed",
        message: "Is brightnessctl installed? Try: pacman -S brightnessctl",
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [device]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyPercent = async (percent: number) => {
    setLoading(true);
    try {
      const next = await setBrightnessPercent(percent, device);
      setInfo(next);
      await showToast({
        style: Toast.Style.Success,
        title: `Brightness ${next.percent}%`,
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to set brightness",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const nudge = async (delta: number) => {
    setLoading(true);
    try {
      const next = await adjustBrightnessPercent(delta, device);
      setInfo(next);
      await showToast({
        style: Toast.Style.Success,
        title: `Brightness ${next.percent}%`,
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to adjust brightness",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  if (error && !info) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Can't control brightness"
          description={error}
        />
      </List>
    );
  }

  const current = info?.percent ?? 0;
  const activePreset = info ? nearestPreset(current) : null;
  const onIncrease = () => void nudge(step);
  const onDecrease = () => void nudge(-step);
  const onRefresh = () => void refresh();

  const adjustActions = (primary: "increase" | "decrease") => (
    <ActionPanel>
      {primary === "increase" ? (
        <>
          <Action
            title={`Increase Brightness (+${step}%)`}
            icon={Icon.Plus}
            shortcut={SHORTCUT_UP}
            onAction={onIncrease}
          />
          <Action
            title={`Decrease Brightness (−${step}%)`}
            icon={Icon.Minus}
            shortcut={SHORTCUT_DOWN}
            onAction={onDecrease}
          />
        </>
      ) : (
        <>
          <Action
            title={`Decrease Brightness (−${step}%)`}
            icon={Icon.Minus}
            shortcut={SHORTCUT_DOWN}
            onAction={onDecrease}
          />
          <Action
            title={`Increase Brightness (+${step}%)`}
            icon={Icon.Plus}
            shortcut={SHORTCUT_UP}
            onAction={onIncrease}
          />
        </>
      )}
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={SHORTCUT_REFRESH}
        onAction={onRefresh}
      />
    </ActionPanel>
  );

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Set brightness..."
      navigationTitle={
        info ? `Brightness · ${info.percent}%` : "Brightness"
      }
    >
      <List.Section title="Adjust">
        <List.Item
          title={`Increase Brightness (+${step}%)`}
          subtitle={info ? `Now ${info.percent}%` : undefined}
          icon={{ source: Icon.Plus, tintColor: Color.Yellow }}
          keywords={["increase", "up", "brighter", "brightness"]}
          actions={adjustActions("increase")}
        />
        <List.Item
          title={`Decrease Brightness (−${step}%)`}
          subtitle={info ? `Now ${info.percent}%` : undefined}
          icon={{ source: Icon.Minus, tintColor: Color.Orange }}
          keywords={["decrease", "down", "dimmer", "brightness"]}
          actions={adjustActions("decrease")}
        />
      </List.Section>

      <List.Section
        title={
          info
            ? `Presets · ${info.device} (${info.percent}%)`
            : "Presets"
        }
      >
        {PRESETS.map((percent) => {
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
              accessories={
                isActive ? [{ text: "current", icon: Icon.Eye }] : undefined
              }
              keywords={[String(percent), "brightness", "display"]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Set to ${percent}%`}
                    icon={Icon.Sun}
                    onAction={() => void applyPercent(percent)}
                  />
                  <Action
                    title={`Increase Brightness (+${step}%)`}
                    icon={Icon.Plus}
                    shortcut={SHORTCUT_UP}
                    onAction={onIncrease}
                  />
                  <Action
                    title={`Decrease Brightness (−${step}%)`}
                    icon={Icon.Minus}
                    shortcut={SHORTCUT_DOWN}
                    onAction={onDecrease}
                  />
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={SHORTCUT_REFRESH}
                    onAction={onRefresh}
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
