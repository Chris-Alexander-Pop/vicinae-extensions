import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Absolute paths — extension workers may not inherit a full login PATH
const BLUETOOTHCTL = "/usr/bin/bluetoothctl";
const RFKILL = "/usr/bin/rfkill";

export type BluetoothStatus = {
  powered: boolean;
  softBlocked: boolean;
  hardBlocked: boolean;
  name?: string;
};

function parseRfkill(stdout: string): {
  softBlocked: boolean;
  hardBlocked: boolean;
} {
  return {
    softBlocked: /Soft blocked:\s*yes/i.test(stdout),
    hardBlocked: /Hard blocked:\s*yes/i.test(stdout),
  };
}

export async function getBluetoothStatus(): Promise<BluetoothStatus> {
  let softBlocked = false;
  let hardBlocked = false;

  try {
    const { stdout } = await execFileAsync(RFKILL, ["list", "bluetooth"]);
    ({ softBlocked, hardBlocked } = parseRfkill(stdout));
  } catch {
    // rfkill missing — fall through to bluetoothctl
  }

  let powered = false;
  let name: string | undefined;

  try {
    const { stdout } = await execFileAsync(BLUETOOTHCTL, ["show"]);
    powered = /^\s*Powered:\s*yes\s*$/im.test(stdout);
    const nameMatch = stdout.match(/^\s*Name:\s*(.+)$/m);
    name = nameMatch?.[1]?.trim();
  } catch {
    powered = false;
  }

  return {
    powered: powered && !softBlocked,
    softBlocked,
    hardBlocked,
    name,
  };
}

export function formatStatus(status: BluetoothStatus): string {
  if (status.hardBlocked) return "Bluetooth Hard-blocked";
  if (status.softBlocked && !status.powered) return "Bluetooth Soft-blocked";
  return status.powered ? "Bluetooth On" : "Bluetooth Off";
}

export async function setBluetoothPowered(
  on: boolean,
): Promise<BluetoothStatus> {
  const before = await getBluetoothStatus();
  if (before.hardBlocked) {
    throw new Error("Bluetooth is hard-blocked (hardware switch or BIOS)");
  }

  if (on) {
    try {
      await execFileAsync(RFKILL, ["unblock", "bluetooth"]);
    } catch (err) {
      throw new Error(
        `Failed to unblock Bluetooth via rfkill: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    await execFileAsync(BLUETOOTHCTL, ["power", "on"]);
  } else {
    await execFileAsync(BLUETOOTHCTL, ["power", "off"]);
  }

  for (let i = 0; i < 8; i++) {
    const next = await getBluetoothStatus();
    if (next.powered === on && (!on || !next.softBlocked)) return next;
    await new Promise((r) => setTimeout(r, 75));
  }

  return getBluetoothStatus();
}

export async function toggleBluetooth(): Promise<{
  before: BluetoothStatus;
  after: BluetoothStatus;
}> {
  const before = await getBluetoothStatus();
  const after = await setBluetoothPowered(!before.powered);
  return { before, after };
}
