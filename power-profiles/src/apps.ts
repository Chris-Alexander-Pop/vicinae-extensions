import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HELPER = "/usr/local/bin/vicinae-boost-app";
const BOOST_NICE = -10;

export type OpenApp = {
  key: string;
  pid: number;
  className: string;
  title: string;
  windowCount: number;
  nice: number;
  boosted: boolean;
  treePids: number[];
};

type HyprClient = {
  pid?: number;
  class?: string;
  title?: string;
  mapped?: boolean;
};

function collectDescendants(pid: number): number[] {
  const out: number[] = [];
  const queue = [pid];
  const seen = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    out.push(current);
    try {
      const raw = readFileSync(
        `/proc/${current}/task/${current}/children`,
        "utf8",
      );
      for (const part of raw.trim().split(/\s+/)) {
        if (!part) continue;
        const child = Number(part);
        if (Number.isFinite(child)) queue.push(child);
      }
    } catch {
      // process may have exited
    }
  }

  return out;
}

function readNice(pid: number): number {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    const fields = stat.slice(close + 2).split(/\s+/);
    return Number(fields[16] ?? 0);
  } catch {
    return 0;
  }
}

export async function listOpenApps(): Promise<OpenApp[]> {
  const { stdout } = await execFileAsync("hyprctl", ["clients", "-j"]);
  const clients = JSON.parse(stdout) as HyprClient[];
  const byPid = new Map<number, OpenApp>();

  for (const client of clients) {
    const pid = client.pid;
    if (!pid || client.mapped === false) continue;

    const existing = byPid.get(pid);
    if (existing) {
      existing.windowCount += 1;
      if (client.title && client.title.length > existing.title.length) {
        existing.title = client.title;
      }
      continue;
    }

    const nice = readNice(pid);
    byPid.set(pid, {
      key: String(pid),
      pid,
      className: client.class || "unknown",
      title: client.title || client.class || `pid ${pid}`,
      windowCount: 1,
      nice,
      boosted: nice <= BOOST_NICE + 2,
      treePids: collectDescendants(pid),
    });
  }

  return Array.from(byPid.values()).sort((a, b) =>
    a.className.localeCompare(b.className),
  );
}

function helperMissingMessage(): string {
  return (
    "Boost needs pkexec (polkit) or sudo for /usr/local/bin/vicinae-boost-app. " +
    "Optional private drop-in (not for the store): sudo bash power-profiles/private/install-boost-permissions.sh"
  );
}

async function runHelper(
  action: "boost" | "reset",
  pids: number[],
): Promise<void> {
  const unique = Array.from(new Set(pids.filter((p) => p > 1)));
  if (unique.length === 0) {
    throw new Error("No processes to adjust");
  }

  try {
    await execFileAsync("sudo", [HELPER, action, ...unique.map(String)]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("password is required") ||
      message.includes("ENOENT") ||
      message.includes("No such file")
    ) {
      throw new Error(helperMissingMessage());
    }
    throw new Error(`Boost failed: ${message}`);
  }
}

export async function boostApp(app: OpenApp): Promise<void> {
  await runHelper("boost", app.treePids);
}

export async function resetApp(app: OpenApp): Promise<void> {
  await runHelper("reset", app.treePids);
}
