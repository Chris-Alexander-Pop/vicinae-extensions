import {
  environment,
  LaunchType,
  showToast,
  Toast,
  updateCommandMetadata,
} from "@vicinae/api";
import {
  formatStatus,
  getBluetoothStatus,
  toggleBluetooth,
  type BluetoothStatus,
} from "./bluetoothctl";

function isBackgroundLaunch(): boolean {
  const launchType = environment.launchType as string | undefined;
  return launchType === LaunchType.Background || launchType === "background";
}

async function publishStatus(status: BluetoothStatus) {
  // Subtitle replaces the extension name in root search ("Bluetooth Power")
  await updateCommandMetadata({ subtitle: formatStatus(status) });
}

// Serialize background polls — Vicinae's interval can overlap when BlueZ/DBus
// stalls, which used to leave thousands of zombie bluetoothctl processes and
// blow dbus-broker's per-UID FD quota (taking hyprlock with it).
let inFlight: Promise<void> | null = null;

export default async function ToggleBluetoothCommand() {
  if (inFlight) {
    await inFlight;
    if (isBackgroundLaunch()) return;
  }

  const run = (async () => {
    try {
      const status = await getBluetoothStatus();
      await publishStatus(status);

      if (isBackgroundLaunch()) {
        return;
      }

      const { before, after } = await toggleBluetooth();
      await publishStatus(after);

      const changed = before.powered !== after.powered;
      await showToast({
        style: changed ? Toast.Style.Success : Toast.Style.Failure,
        title: formatStatus(after),
        message: changed
          ? `Was ${formatStatus(before)}`
          : after.hardBlocked
            ? "Hardware/BIOS block — can't toggle"
            : "Power state did not change",
      });
    } catch (err) {
      try {
        await updateCommandMetadata({ subtitle: "Bluetooth Error" });
      } catch {
        // ignore
      }
      if (!isBackgroundLaunch()) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Bluetooth toggle failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })();

  inFlight = run.finally(() => {
    if (inFlight === run) inFlight = null;
  });
  await inFlight;
}
