import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { BoostAppView } from "./boost-app";
import { TargetForm } from "./target-form";
import {
  getHardwareStatus,
  getThermalTarget,
  setFan,
  setTarget,
  setThermald,
  setTurbo,
  TARGET_DEFAULT_C,
  type FanMode,
  type HardwareStatus,
  type ThermalTarget,
  type TurboState,
} from "./thermal";
import {
  getTlpStatus,
  profileDescription,
  profileLabel,
  setTlpProfile,
  TLP_PROFILES,
  type TlpProfile,
  type TlpStatus,
} from "./tlp";

const SHORTCUT_REFRESH = { modifiers: ["ctrl"] as const, key: "r" as const };

function profileIcon(profile: TlpProfile, active: boolean) {
  if (active) {
    return { source: Icon.Checkmark, tintColor: Color.Green };
  }
  switch (profile) {
    case "performance":
      return { source: Icon.Bolt, tintColor: Color.Yellow };
    case "balanced":
      return { source: Icon.Gauge, tintColor: Color.Blue };
    case "power-saver":
      return { source: Icon.Leaf, tintColor: Color.Green };
  }
}

function turboLabel(turbo: HardwareStatus["turbo"]): string {
  if (turbo === "on") return "On";
  if (turbo === "off") return "Off";
  return "Unavailable";
}

function fanLabel(fan: FanMode | "unavailable", level: string | null): string {
  if (fan === "max") return "Max";
  if (fan === "auto") return "Auto";
  if (fan === "other") return level ? `Level ${level}` : "Manual";
  return "Unavailable";
}

const QUICK_TARGETS = [65, 70, 75, 80] as const;

function targetSubtitle(thermal: ThermalTarget | null): string {
  if (!thermal) return "Reading...";
  const packageText =
    thermal.packageC === null ? "Package temp unavailable" : `Package ${thermal.packageC}°C`;
  if (thermal.service === "missing") {
    return `${packageText}. thermald is not installed.`;
  }
  if (thermal.targetC === null) {
    return `${packageText}. No target yet. Default is ${TARGET_DEFAULT_C}°C.`;
  }
  if (thermal.service !== "active") {
    return `${packageText}. Off. Firmware power limits, so clocks can run higher. Target ${thermal.targetC}°C is saved.`;
  }
  return `${packageText}. On. thermald steps CPU power down near ${thermal.targetC}°C, which costs clock speed.`;
}

export default function PowerCommand() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<TlpStatus | null>(null);
  const [hardware, setHardware] = useState<HardwareStatus | null>(null);
  const [thermal, setThermal] = useState<ThermalTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const hardwarePromise = getHardwareStatus()
      .then((next) => {
        setHardware(next);
        return next;
      })
      .catch(() => {
        setHardware(null);
        return null;
      });
    const thermalPromise = getThermalTarget()
      .then((next) => {
        setThermal(next);
        return next;
      })
      .catch(() => {
        setThermal(null);
        return null;
      });
    try {
      const next = await getTlpStatus();
      setStatus(next);
      setError(null);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read TLP status";
      setError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "TLP unavailable",
        message:
          "Is tlp installed and running? Store power-profiles-daemon is not used.",
      });
      return null;
    } finally {
      await Promise.all([hardwarePromise, thermalPromise]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = async (profile: TlpProfile) => {
    setLoading(true);
    try {
      const next = await setTlpProfile(profile);
      setStatus(next);
      setHardware(await getHardwareStatus());
      await showToast({
        style: Toast.Style.Success,
        title: `TLP → ${profileLabel(next.active)}`,
        message: `Power source: ${next.powerSource}`,
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to set profile",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleTurbo = async () => {
    if (!hardware || hardware.turbo === "unavailable") return;
    const next: TurboState = hardware.turbo === "on" ? "off" : "on";
    setLoading(true);
    try {
      await setTurbo(next);
      setHardware(await getHardwareStatus());
      await showToast({
        style: Toast.Style.Success,
        title: next === "on" ? "Turbo on" : "Turbo off",
        message:
          next === "on"
            ? "intel_pstate no_turbo=0"
            : "intel_pstate no_turbo=1. A TLP profile change can turn turbo back on.",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't change turbo",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const applyThermald = async (enabled: boolean) => {
    setLoading(true);
    try {
      await setThermald(enabled);
      setThermal(await getThermalTarget());
      await showToast({
        style: Toast.Style.Success,
        title: enabled ? "thermald on" : "thermald off",
        message: enabled
          ? "Package target is active again, including after reboot."
          : "Stopped and disabled. RAPL limits go back to what the firmware set.",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't change thermald",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const applyTarget = async (celsius: number) => {
    setLoading(true);
    try {
      await setTarget(celsius);
      setThermal(await getThermalTarget());
      await showToast({
        style: Toast.Style.Success,
        title: `Target ${celsius}°C`,
        message: "thermald limits CPU power as the package approaches it, including after a cold boot.",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't set target",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFan = async (next: "auto" | "max") => {
    if (!hardware || hardware.fan === "unavailable") return;
    setLoading(true);
    try {
      await setFan(next);
      setHardware(await getHardwareStatus());
      await showToast({
        style: Toast.Style.Success,
        title: next === "max" ? "Fan at max" : "Fan on auto",
        message:
          next === "max"
            ? "ThinkPad fan level full-speed"
            : "ThinkPad fan level auto",
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't change fan",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  if (error && !status) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="Can't talk to TLP"
          description={`${error}\n\nInstall tlp. Switching profiles runs \`sudo tlp <profile>\` (polkit/pkexec also works if you wrap it).`}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Power, fan, temperature..."
      navigationTitle={
        status ? `Power · ${profileLabel(status.active)}` : "Power"
      }
    >
      <List.Section title="Temperature">
        <List.Item
          title="Package target"
          subtitle={targetSubtitle(thermal)}
          icon={{ source: Icon.Temperature, tintColor: Color.Orange }}
          accessories={
            thermal
              ? [
                  {
                    text:
                      thermal.service === "active"
                        ? "On"
                        : thermal.service === "missing"
                          ? "Missing"
                          : "Off",
                  },
                  ...(thermal.targetC != null
                    ? [{ text: `${thermal.targetC}°C` }]
                    : []),
                ]
              : undefined
          }
          keywords={["thermald", "temp", "temperature", "target", "hot", "cool", "disable", "enable"]}
          actions={
            <ActionPanel>
              <Action
                title={
                  thermal?.service === "active"
                    ? "Turn thermald off"
                    : "Turn thermald on"
                }
                icon={thermal?.service === "active" ? Icon.XMarkCircle : Icon.CheckCircle}
                onAction={() =>
                  void applyThermald(thermal?.service !== "active")
                }
              />
              <Action.Push
                title="Set target temperature"
                icon={Icon.Temperature}
                target={
                  <TargetForm
                    current={thermal?.targetC ?? TARGET_DEFAULT_C}
                    onSave={async (celsius) => {
                      await applyTarget(celsius);
                    }}
                  />
                }
              />
              {QUICK_TARGETS.map((celsius) => (
                <Action
                  key={celsius}
                  title={`Set target to ${celsius}°C`}
                  icon={Icon.Temperature}
                  onAction={() => void applyTarget(celsius)}
                />
              ))}
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={SHORTCUT_REFRESH}
                onAction={() => void refresh()}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Apps">
        <List.Item
          title="Boost App Priority"
          subtitle="Raise CPU/IO priority for an open window"
          icon={{ source: Icon.Bolt, tintColor: Color.Yellow }}
          keywords={["boost", "nice", "priority", "app", "performance"]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Boost App Priority"
                icon={Icon.Bolt}
                target={<BoostAppView />}
              />
              <Action
                title="Refresh Profiles"
                icon={Icon.ArrowClockwise}
                shortcut={SHORTCUT_REFRESH}
                onAction={() => void refresh()}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Hardware">
        <List.Item
          title="CPU turbo"
          subtitle={
            hardware
              ? hardware.turbo === "off"
                ? "Off. A TLP profile change can turn it back on."
                : hardware.turbo === "on"
                  ? "On. Cores can boost above the base clock."
                  : "intel_pstate no_turbo is not available"
              : "Reading..."
          }
          icon={
            hardware?.turbo === "off"
              ? { source: Icon.Gauge, tintColor: Color.Blue }
              : { source: Icon.Bolt, tintColor: Color.Yellow }
          }
          accessories={
            hardware
              ? [{ text: turboLabel(hardware.turbo) }]
              : undefined
          }
          keywords={["turbo", "no_turbo", "boost", "cpu", "cool", "hot"]}
          actions={
            <ActionPanel>
              <Action
                title={
                  hardware?.turbo === "on" ? "Turn turbo off" : "Turn turbo on"
                }
                icon={Icon.Bolt}
                onAction={() => void toggleTurbo()}
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
        <List.Item
          title="Fan speed"
          subtitle={
            !hardware
              ? "Reading..."
              : hardware.fan === "unavailable"
                ? "No ThinkPad fan interface"
                : !hardware.fanControl
                  ? `${fanLabel(hardware.fan, hardware.fanLevel)}. Override is off until fan_control=1.`
                  : hardware.fan === "max"
                    ? "Max. EC fan control is disengaged."
                    : hardware.fan === "auto"
                      ? "Auto. The EC picks the speed."
                      : `Level ${hardware.fanLevel}. Toggle sets max or auto.`
          }
          icon={
            hardware?.fan === "max"
              ? { source: Icon.Temperature, tintColor: Color.Red }
              : { source: Icon.Wind, tintColor: Color.Blue }
          }
          accessories={
            hardware
              ? [
                  {
                    text: fanLabel(hardware.fan, hardware.fanLevel),
                  },
                ]
              : undefined
          }
          keywords={["fan", "max", "auto", "cool", "thinkpad", "full-speed"]}
          actions={
            <ActionPanel>
              <Action
                title={
                  hardware?.fan === "max" ? "Set fan to auto" : "Set fan to max"
                }
                icon={hardware?.fan === "max" ? Icon.Wind : Icon.Temperature}
                onAction={() =>
                  void applyFan(hardware?.fan === "max" ? "auto" : "max")
                }
              />
              <Action
                title={
                  hardware?.fan === "max" ? "Set fan to max" : "Set fan to auto"
                }
                icon={hardware?.fan === "max" ? Icon.Temperature : Icon.Wind}
                onAction={() =>
                  void applyFan(hardware?.fan === "max" ? "max" : "auto")
                }
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
      </List.Section>

      <List.Section
        title={
          status
            ? `Profiles · ${status.rawProfile} (${status.powerSource})`
            : "Profiles"
        }
      >
        {TLP_PROFILES.map((profile) => {
          const isActive = status?.active === profile;
          return (
            <List.Item
              key={profile}
              title={profileLabel(profile)}
              subtitle={profileDescription(profile)}
              icon={profileIcon(profile, !!isActive)}
              accessories={
                isActive
                  ? [{ text: "active", icon: Icon.CheckCircle }]
                  : undefined
              }
              keywords={[profile, "tlp", "power", "battery", "ac"]}
              actions={
                <ActionPanel>
                  <Action
                    title={`Switch to ${profileLabel(profile)}`}
                    icon={Icon.Cog}
                    onAction={() => void apply(profile)}
                  />
                  <Action.Push
                    title="Boost App Priority"
                    icon={Icon.Bolt}
                    target={<BoostAppView />}
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
          );
        })}
      </List.Section>
    </List>
  );
}
