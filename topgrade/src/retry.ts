import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Built-in Topgrade step ids (17.x). */
export const BUILTIN_STEPS = [
  "am",
  "android_studio",
  "antigravity",
  "app_man",
  "aqua",
  "asdf",
  "atom",
  "atuin",
  "audit",
  "auto_cpufreq",
  "bin",
  "bob",
  "brew_cask",
  "brew_formula",
  "bun",
  "bun_packages",
  "cargo",
  "certbot",
  "chezmoi",
  "chocolatey",
  "choosenim",
  "cinnamon_spices",
  "clam_av_db",
  "claude_code",
  "claude_code_plugins",
  "codex",
  "colima",
  "composer",
  "conda",
  "config_update",
  "containers",
  "cursor",
  "cursor_agent",
  "custom_commands",
  "deb_get",
  "deno",
  "distrobox",
  "dkp_pacman",
  "dotnet",
  "elan",
  "emacs",
  "falconf",
  "firmware",
  "flatpak",
  "flutter",
  "fossil",
  "gcloud",
  "gearlever",
  "gem",
  "getnf",
  "ghcup",
  "git_repos",
  "github_cli_extensions",
  "gnome_shell_extensions",
  "go",
  "guix",
  "haxelib",
  "helix",
  "helix_db",
  "helm",
  "home_manager",
  "hyprpm",
  "install_release",
  "jetbrains_aqua",
  "jetbrains_clion",
  "jetbrains_datagrip",
  "jetbrains_dataspell",
  "jetbrains_gateway",
  "jetbrains_goland",
  "jetbrains_idea",
  "jetbrains_mps",
  "jetbrains_phpstorm",
  "jetbrains_pycharm",
  "jetbrains_rider",
  "jetbrains_rubymine",
  "jetbrains_rustrover",
  "jetbrains_toolbox",
  "jetbrains_webstorm",
  "jetpack",
  "julia",
  "juliaup",
  "kakoune",
  "krew",
  "lensfun",
  "lure",
  "macports",
  "mamba",
  "mandb",
  "mas",
  "maza",
  "micro",
  "microsoft_office",
  "microsoft_store",
  "miktex",
  "mise",
  "myrepos",
  "nix",
  "nix_helper",
  "node",
  "ollama",
  "opam",
  "opencode",
  "pacdef",
  "pacstall",
  "pearl",
  "pi",
  "pip3",
  "pip_review",
  "pip_review_local",
  "pipupgrade",
  "pipx",
  "pipxu",
  "pixi",
  "pkg",
  "pkgfile",
  "pkgin",
  "pkgit",
  "platformio_core",
  "pnpm",
  "poetry",
  "powershell",
  "protonplus",
  "protonup",
  "pyenv",
  "raco",
  "rcm",
  "remotes",
  "restarts",
  "rtcl",
  "ruby_gems",
  "rustup",
  "rye",
  "scoop",
  "sdkman",
  "self_update",
  "sera",
  "sheldon",
  "shell",
  "skills",
  "snap",
  "soar",
  "sparkle",
  "spicetify",
  "stack",
  "stew",
  "system",
  "tldr",
  "tlmgr",
  "tmux",
  "toolbx",
  "tpack",
  "typst",
  "uv",
  "vagrant",
  "vcpkg",
  "vim",
  "vite_plus",
  "volta_packages",
  "vscode",
  "vscode_insiders",
  "vscodium",
  "vscodium_insiders",
  "waydroid",
  "windsurf",
  "winget",
  "wsl",
  "wsl_update",
  "xcodes",
  "yadm",
  "yarn",
  "yazi",
  "zerobrew",
  "zigup",
  "zvm",
] as const;

export type BuiltinStep = (typeof BUILTIN_STEPS)[number];

/** Display-label aliases → step id (Topgrade summary / banner text). */
const LABEL_ALIASES: Record<string, BuiltinStep> = {
  "system update": "system",
  system: "system",
  firmware: "firmware",
  "firmware upgrades": "firmware",
  "cursor agent": "cursor_agent",
  "cursor extensions": "cursor",
  containers: "containers",
  cargo: "cargo",
  rustup: "rustup",
  helm: "helm",
  uv: "uv",
  vim: "vim",
  waydroid: "waydroid",
  "node package manager": "node",
  node: "node",
  "github cli extensions": "github_cli_extensions",
  "platformio core": "platformio_core",
  "visual studio code extensions": "vscode",
  vscode: "vscode",
  "vscode extensions": "vscode",
  mise: "mise",
  pipx: "pipx",
  "bun packages": "bun_packages",
  bun: "bun",
  "oh-my-zsh": "shell",
  "oh my zsh": "shell",
  shell: "shell",
  hyprpm: "hyprpm",
  flatpak: "flatpak",
  snap: "snap",
  yarn: "yarn",
  pnpm: "pnpm",
  poetry: "poetry",
  conda: "conda",
  nix: "nix",
  "home manager": "home_manager",
  "home-manager": "home_manager",
  "git repositories": "git_repos",
  "git repos": "git_repos",
  "config update": "config_update",
  "configuration update": "config_update",
};

export type ShellRetry = {
  name: string;
  command: string;
  kind: "pre_commands" | "post_commands" | "commands";
};

export type RetryPlan = {
  /** Built-in Topgrade --only steps */
  only: string[];
  /** Failed custom/pre/post commands to run directly */
  shell: ShellRetry[];
  /** Labels we could not map */
  unmatched: string[];
  /** Human summary for toasts */
  summary: string;
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(s: string): string {
  return norm(s).replace(/\s+/g, "");
}

type TomlTables = {
  pre_commands?: Record<string, string>;
  post_commands?: Record<string, string>;
  commands?: Record<string, string>;
};

function loadCommandTables(): TomlTables {
  const path = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "topgrade.toml",
  );
  if (!existsSync(path)) return {};
  try {
    // Avoid a toml dependency: extract simple "key" = "value" tables.
    const text = readFileSync(path, "utf8");
    const out: TomlTables = {
      pre_commands: {},
      post_commands: {},
      commands: {},
    };
    let section: keyof TomlTables | null = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const sec = line.match(/^\[(pre_commands|post_commands|commands)\]$/);
      if (sec) {
        section = sec[1] as keyof TomlTables;
        continue;
      }
      if (line.startsWith("[")) {
        section = null;
        continue;
      }
      if (!section) continue;
      const m = line.match(/^"([^"]+)"\s*=\s*"(.*)"\s*$/);
      const m2 = line.match(/^([A-Za-z0-9 _.-]+)\s*=\s*"(.*)"\s*$/);
      if (m) out[section]![m[1]] = m[2].replace(/\\"/g, '"');
      else if (m2) out[section]![m2[1].trim()] = m2[2].replace(/\\"/g, '"');
    }
    return out;
  } catch {
    return {};
  }
}

function findShellCommand(
  label: string,
  tables: TomlTables,
): ShellRetry | null {
  const n = norm(label);
  const c = compact(label);
  for (const kind of ["post_commands", "pre_commands", "commands"] as const) {
    const table = tables[kind] || {};
    for (const [name, command] of Object.entries(table)) {
      if (norm(name) === n || compact(name) === c) {
        return { name, command, kind };
      }
    }
  }
  return null;
}

function resolveBuiltin(label: string): BuiltinStep | null {
  const n = norm(label);
  const c = compact(label);
  if (LABEL_ALIASES[n]) return LABEL_ALIASES[n];

  // Exact step id
  if ((BUILTIN_STEPS as readonly string[]).includes(label)) {
    return label as BuiltinStep;
  }
  if ((BUILTIN_STEPS as readonly string[]).includes(n.replace(/ /g, "_"))) {
    return n.replace(/ /g, "_") as BuiltinStep;
  }

  // Fuzzy: step id with underscores vs spaces
  for (const step of BUILTIN_STEPS) {
    if (compact(step) === c) return step;
    // "Github Cli Extensions" vs github_cli_extensions
    if (norm(step.replace(/_/g, " ")) === n) return step;
  }

  // Containment for longer labels ("Visual Studio Code extensions")
  let best: BuiltinStep | null = null;
  let bestLen = 0;
  for (const [alias, step] of Object.entries(LABEL_ALIASES)) {
    if (n.includes(alias) && alias.length > bestLen) {
      best = step;
      bestLen = alias.length;
    }
  }
  return best;
}

function loadDisabledSteps(): Set<string> {
  const path = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "topgrade.toml",
  );
  if (!existsSync(path)) return new Set();
  try {
    const text = readFileSync(path, "utf8");
    const m = text.match(/^\s*disable\s*=\s*\[([^\]]*)\]/m);
    if (!m) return new Set();
    const ids = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    return new Set(ids);
  } catch {
    return new Set();
  }
}

/**
 * Build a retry plan from Topgrade failure labels (summary or step names).
 */
export function buildRetryPlan(failedSteps: string[]): RetryPlan {
  const tables = loadCommandTables();
  const disabled = loadDisabledSteps();
  const only: string[] = [];
  const shell: ShellRetry[] = [];
  const unmatched: string[] = [];
  const skippedDisabled: string[] = [];
  const seenOnly = new Set<string>();
  const seenShell = new Set<string>();

  for (const raw of failedSteps) {
    const label = raw.trim();
    if (!label) continue;

    const sh = findShellCommand(label, tables);
    if (sh) {
      if (!seenShell.has(sh.name)) {
        seenShell.add(sh.name);
        shell.push(sh);
      }
      continue;
    }

    const step = resolveBuiltin(label);
    if (step) {
      if (disabled.has(step)) {
        skippedDisabled.push(label);
        continue;
      }
      if (!seenOnly.has(step)) {
        seenOnly.add(step);
        only.push(step);
      }
      continue;
    }

    unmatched.push(label);
  }

  const parts: string[] = [];
  if (only.length) parts.push(only.join(", "));
  if (shell.length) parts.push(shell.map((s) => s.name).join(", "));
  const summary =
    parts.length > 0
      ? parts.join(" · ")
      : unmatched.length || skippedDisabled.length
        ? [
            unmatched.length ? `unmapped: ${unmatched.join(", ")}` : "",
            skippedDisabled.length
              ? `disabled in config: ${skippedDisabled.join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join("; ")
        : "nothing to retry";

  return { only, shell, unmatched, summary };
}

export function canRetry(failedSteps: string[]): boolean {
  const plan = buildRetryPlan(failedSteps);
  return plan.only.length > 0 || plan.shell.length > 0;
}

/** Collect failure labels from a finished status + optional log text. */
export function collectFailedSteps(
  status: {
    steps?: { name: string; status: string }[];
    error?: string | null;
  } | null,
  logText?: string,
): string[] {
  const failed: string[] = [];
  for (const s of status?.steps ?? []) {
    if (s.status === "failed" && s.name && !failed.includes(s.name)) {
      failed.push(s.name);
    }
  }
  if (logText) {
    for (const match of logText.matchAll(/^(.+?): FAILED\s*$/gm)) {
      const name = match[1]?.trim();
      if (name && !failed.includes(name)) failed.push(name);
    }
  }
  const err = status?.error || "";
  const m = err.match(/^Failed:\s*(.+)$/i);
  if (m) {
    for (const part of m[1].split(",")) {
      const name = part.trim();
      if (name && !failed.includes(name)) failed.push(name);
    }
  }
  return failed;
}
