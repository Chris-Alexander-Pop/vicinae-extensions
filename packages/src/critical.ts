import { execFileSync } from "node:child_process";
import { release as osRelease } from "node:os";

/**
 * Packages that must never be uninstalled from this extension.
 * Includes the `base` metapackage and its hard dependencies, plus
 * common system essentials. The running kernel package is derived at
 * runtime (pacman owns `/usr/lib/modules/$(uname -r)`, else uname flavor).
 */

/** Hard deps of Arch's `base` metapackage (as of 2026). */
export const BASE_DEPENDENCIES = [
  "filesystem",
  "gcc-libs",
  "glibc",
  "bash",
  "coreutils",
  "file",
  "findutils",
  "gawk",
  "grep",
  "procps-ng",
  "sed",
  "tar",
  "gettext",
  "pciutils",
  "psmisc",
  "shadow",
  "util-linux",
  "bzip2",
  "gzip",
  "xz",
  "licenses",
  "pacman",
  "archlinux-keyring",
  "systemd",
  "systemd-sysvcompat",
  "iputils",
  "iproute2",
] as const;

/** Extra essentials beyond `base` (generic kernels, compositor, GPU, auth). */
export const EXTRA_CRITICAL = [
  "base",
  "base-devel",
  "sudo",
  "linux",
  "linux-lts",
  "linux-firmware",
  "mkinitcpio",
  "mesa",
  "hyprland",
  "uwsm",
  "nvidia",
  "nvidia-dkms",
  "nvidia-utils",
] as const;

const KERNEL_FLAVORS = ["zen", "lts", "hardened", "rt", "mainline"] as const;

let cachedKernelPackages: string[] | undefined;
let cachedBuiltin: Set<string> | undefined;

export function kernelPackagesFromUname(rel: string): string[] {
  const lower = rel.toLowerCase();
  const flavor = KERNEL_FLAVORS.find(
    (f) => lower.includes(`-${f}`) || lower.endsWith(f),
  );
  return [flavor ? `linux-${flavor}` : "linux"];
}

/** Running kernel pkg(s): env pin, else `pacman -Qqo`, else uname flavor. */
export function runningKernelPackages(): string[] {
  if (cachedKernelPackages) return cachedKernelPackages;

  const pinned = process.env.VICINAE_KERNEL_PACKAGE?.trim();
  if (pinned) {
    cachedKernelPackages = pinned.split(/[,\s]+/).filter(Boolean);
    return cachedKernelPackages;
  }

  const found: string[] = [];
  try {
    const rel = osRelease();
    const out = execFileSync(
      "/usr/bin/pacman",
      ["-Qqo", `/usr/lib/modules/${rel}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    for (const line of out.split("\n")) {
      const name = line.trim();
      if (name) found.push(name);
    }
  } catch {
    // pacman missing, or this kernel is not an installed package
  }

  cachedKernelPackages =
    found.length > 0 ? found : kernelPackagesFromUname(osRelease());
  return cachedKernelPackages;
}

function builtinCritical(): Set<string> {
  if (cachedBuiltin) return cachedBuiltin;
  cachedBuiltin = new Set<string>([
    ...BASE_DEPENDENCIES,
    ...EXTRA_CRITICAL,
    ...runningKernelPackages(),
  ]);
  return cachedBuiltin;
}

export function parseExtraCritical(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isCriticalPackage(
  name: string,
  extra: string[] = [],
): boolean {
  if (builtinCritical().has(name)) return true;
  return extra.includes(name);
}

export function criticalReason(
  name: string,
  extra: string[] = [],
): string | null {
  if ((BASE_DEPENDENCIES as readonly string[]).includes(name) || name === "base") {
    return "Protected: part of the Arch base system";
  }
  if (runningKernelPackages().includes(name)) {
    return "Protected: running kernel package";
  }
  if ((EXTRA_CRITICAL as readonly string[]).includes(name)) {
    return "Protected: critical system package";
  }
  if (extra.includes(name)) {
    return "Protected: listed in Extra critical packages preference";
  }
  return null;
}
