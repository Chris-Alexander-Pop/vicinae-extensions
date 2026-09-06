import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";

const execFileAsync = promisify(execFile);

// Absolute paths — extension workers may not inherit a full login PATH
const BLUETOOTHCTL = "/usr/bin/bluetoothctl";
const RFKILL = "/usr/bin/rfkill";
const BUSCTL = "/usr/bin/busctl";

const EXEC_OPTS = { timeout: 4_000, maxBuffer: 256 * 1024 } as const;

export type BluetoothStatus = {
  powered: boolean;
  softBlocked: boolean;
  hardBlocked: boolean;
  name?: string;
};

export function parseRfkill(stdout: string): {
  softBlocked: boolean;
  hardBlocked: boolean;
} {
  return {
    softBlocked: /Soft blocked:\s*yes/i.test(stdout),
    hardBlocked: /Hard blocked:\s*yes/i.test(stdout),
  };
}

async function listAdapters(): Promise<string[]> {
  try {
    const entries = await readdir("/sys/class/bluetooth");
    return entries.filter((e) => e.startsWith("hci"));
  } catch {
    return [];
  }
}

/** Prefer BlueZ D-Bus — never spawn bluetoothctl on the background poll path. */
async function readAdapterPowered(
  adapter: string,
): Promise<{ powered: boolean; name?: string } | null> {
  const path = `/org/bluez/${adapter}`;
  try {
    const { stdout: poweredOut } = await execFileAsync(
      BUSCTL,
      ["--system", "get-property", "org.bluez", path, "org.bluez.Adapter1", "Powered"],
      EXEC_OPTS,
    );
    const powered = /\btrue\b/i.test(poweredOut);
    let name: string | undefined;
    try {
      const { stdout: nameOut } = await execFileAsync(
        BUSCTL,
        ["--system", "get-property", "org.bluez", path, "org.bluez.Adapter1", "Name"],
        EXEC_OPTS,
      );
      // busctl prints: s "Name"
      const m = nameOut.match(/"(.*)"/);
      name = m?.[1];
    } catch {
      // name optional
    }
    return { powered, name };
  } catch {
    return null;
  }
}

async function setAdapterPowered(adapter: string, on: boolean): Promise<void> {
  const path = `/org/bluez/${adapter}`;
  await execFileAsync(
    BUSCTL,
    [
      "--system",
      "set-property",
      "org.bluez",
      path,
      "org.bluez.Adapter1",
      "Powered",
      "b",
      on ? "true" : "false",
    ],
    EXEC_OPTS,
  );
}

export async function getBluetoothStatus(): Promise<BluetoothStatus> {
  let softBlocked = false;
  let hardBlocked = false;

  try {
    const { stdout } = await execFileAsync(
      RFKILL,
      ["list", "bluetooth"],
      EXEC_OPTS,
    );
    ({ softBlocked, hardBlocked } = parseRfkill(stdout));
  } catch {
    // rfkill missing — fall through
  }

  let powered = false;
  let name: string | undefined;

  const adapters = await listAdapters();
  for (const adapter of adapters.length ? adapters : ["hci0"]) {
    const info = await readAdapterPowered(adapter);
    if (info) {
      powered = info.powered;
      name = info.name;
      break;
    }
  }

  // Last resort only (interactive toggle fallback) — still hard-timeout'd.
  if (!powered && adapters.length === 0) {
    try {
      const { stdout } = await execFileAsync(BLUETOOTHCTL, ["show"], EXEC_OPTS);
      powered = /^\s*Powered:\s*yes\s*$/im.test(stdout);
      const nameMatch = stdout.match(/^\s*Name:\s*(.+)$/m);
      name = nameMatch?.[1]?.trim();
    } catch {
      powered = false;
    }
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
      await execFileAsync(RFKILL, ["unblock", "bluetooth"], EXEC_OPTS);
    } catch (err) {
      throw new Error(
        `Failed to unblock Bluetooth via rfkill: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  const adapters = await listAdapters();
  let set = false;
  for (const adapter of adapters.length ? adapters : ["hci0"]) {
    try {
      await setAdapterPowered(adapter, on);
      set = true;
      break;
    } catch {
      // try next / fall through to bluetoothctl
    }
  }

  if (!set) {
    await execFileAsync(
      BLUETOOTHCTL,
      ["power", on ? "on" : "off"],
      EXEC_OPTS,
    );
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
