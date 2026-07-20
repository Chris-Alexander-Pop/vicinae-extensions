import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PACMAN = "/usr/bin/pacman";
const YAY = "/usr/bin/yay";
const CHECKUPDATES = "/usr/bin/checkupdates";

export type InstallReason = "explicit" | "dependency";

export type InstalledPackage = {
  name: string;
  version: string;
  description: string;
  repo: string;
  reason: InstallReason;
  installedSize: string;
  depends: string[];
  requiredBy: string[];
  orphan: boolean;
  availableVersion?: string;
  critical: boolean;
};

/** Status filters, or `repo:<name>` to show a single repository. */
export type PackageFilter =
  | "all"
  | "explicit"
  | "dependency"
  | "orphans"
  | "updatable"
  | `repo:${string}`;

export function isRepoFilter(filter: PackageFilter): filter is `repo:${string}` {
  return filter.startsWith("repo:");
}

export function repoFromFilter(filter: PackageFilter): string | null {
  return isRepoFilter(filter) ? filter.slice("repo:".length) : null;
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.SUDO_ASKPASS;
  delete env.SSH_ASKPASS;
  delete env.CURSOR_ASKPASS_SOCKET;
  delete env.CURSOR_ASKPASS_SECRET;
  delete env.VICINAE_SUDO_PASS;
  return env;
}

async function runQuiet(
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      env: cleanEnv(),
      maxBuffer: 32 * 1024 * 1024,
    });
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      message?: string;
    };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

function parseQiBlocks(text: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  const blocks = text.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const fields: Record<string, string> = {};
    let currentKey = "";
    for (const line of block.split("\n")) {
      const m = /^([A-Za-z][A-Za-z0-9 ]*?)\s*:\s*(.*)$/.exec(line);
      if (m) {
        currentKey = m[1].trim();
        fields[currentKey] = m[2].trim();
      } else if (currentKey && line.startsWith(" ")) {
        fields[currentKey] = `${fields[currentKey]} ${line.trim()}`.trim();
      }
    }
    const name = fields["Name"];
    if (name) map.set(name, fields);
  }
  return map;
}

function parseList(value: string | undefined): string[] {
  if (!value || value === "None") return [];
  return value
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "None");
}

function parseNameVersions(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("::")) continue;
    // "name old -> new" (checkupdates) or "name ver -> new" / "name ver"
    const arrow = trimmed.indexOf("->");
    if (arrow !== -1) {
      const left = trimmed.slice(0, arrow).trim();
      const right = trimmed.slice(arrow + 2).trim();
      const name = left.split(/\s+/)[0];
      if (name) map.set(name, right.split(/\s+/)[0] ?? right);
      continue;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) map.set(parts[0], parts[1]);
  }
  return map;
}

async function loadRepoMap(): Promise<Map<string, string>> {
  const { stdout } = await runQuiet(PACMAN, ["-Sl"]);
  const map = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) map.set(parts[1], parts[0]);
  }
  return map;
}

async function loadNameSet(args: string[]): Promise<Set<string>> {
  const { stdout, code } = await runQuiet(PACMAN, args);
  if (code !== 0 && !stdout.trim()) return new Set();
  return new Set(
    stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

async function loadUpdates(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const official = await runQuiet(CHECKUPDATES, []);
  for (const [name, ver] of parseNameVersions(official.stdout)) {
    map.set(name, ver);
  }

  // Foreign / AUR only — avoid duplicating sync DB work.
  const aur = await runQuiet(YAY, ["-Qu", "--aur"]);
  for (const [name, ver] of parseNameVersions(aur.stdout)) {
    map.set(name, ver);
  }

  return map;
}

export async function listInstalledNames(): Promise<Set<string>> {
  return loadNameSet(["-Qq"]);
}

export async function listInstalledPackages(
  isCritical: (name: string) => boolean,
): Promise<InstalledPackage[]> {
  const [qi, repoMap, foreign, orphans, updates] = await Promise.all([
    runQuiet(PACMAN, ["-Qi"]),
    loadRepoMap(),
    loadNameSet(["-Qmq"]),
    loadNameSet(["-Qdtq"]),
    loadUpdates(),
  ]);

  if (qi.code !== 0 && !qi.stdout.trim()) {
    throw new Error(qi.stderr.trim() || "pacman -Qi failed");
  }

  const fieldsByName = parseQiBlocks(qi.stdout);
  const packages: InstalledPackage[] = [];

  for (const [name, fields] of fieldsByName) {
    const reasonRaw = fields["Install Reason"] ?? "";
    const reason: InstallReason = /explicit/i.test(reasonRaw)
      ? "explicit"
      : "dependency";
    const repo = foreign.has(name) ? "AUR" : (repoMap.get(name) ?? "local");
    packages.push({
      name,
      version: fields["Version"] ?? "",
      description: fields["Description"] ?? "",
      repo,
      reason,
      installedSize: fields["Installed Size"] ?? "",
      depends: parseList(fields["Depends On"]),
      requiredBy: parseList(fields["Required By"]),
      orphan: orphans.has(name),
      availableVersion: updates.get(name),
      critical: isCritical(name),
    });
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));
  return packages;
}

export function filterPackages(
  packages: InstalledPackage[],
  filter: PackageFilter,
): InstalledPackage[] {
  const repo = repoFromFilter(filter);
  if (repo) {
    return packages.filter((p) => p.repo === repo);
  }

  switch (filter) {
    case "explicit":
      return packages.filter((p) => p.reason === "explicit");
    case "dependency":
      return packages.filter((p) => p.reason === "dependency");
    case "orphans":
      return packages.filter((p) => p.orphan);
    case "updatable":
      return packages.filter((p) => !!p.availableVersion);
    case "all":
    default:
      return packages;
  }
}

const REPO_ORDER = ["core", "extra", "multilib", "AUR"];

export function sortRepos(repos: string[]): string[] {
  return [...repos].sort((a, b) => {
    const ia = REPO_ORDER.indexOf(a);
    const ib = REPO_ORDER.indexOf(b);
    const ra = ia === -1 ? 100 : ia;
    const rb = ib === -1 ? 100 : ib;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

export function groupByRepo(
  packages: InstalledPackage[],
): Map<string, InstalledPackage[]> {
  const groups = new Map<string, InstalledPackage[]>();
  for (const pkg of packages) {
    const list = groups.get(pkg.repo) ?? [];
    list.push(pkg);
    groups.set(pkg.repo, list);
  }
  return groups;
}
