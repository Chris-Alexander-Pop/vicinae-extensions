/**
 * Packages that must never be uninstalled from this extension.
 * Includes the `base` metapackage and its hard dependencies, plus
 * common system essentials for this host.
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

/** Extra essentials beyond `base` (kernels, compositor, GPU, auth). */
export const EXTRA_CRITICAL = [
  "base",
  "base-devel",
  "sudo",
  "linux",
  "linux-zen",
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

const BUILTIN = new Set<string>([...BASE_DEPENDENCIES, ...EXTRA_CRITICAL]);

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
  if (BUILTIN.has(name)) return true;
  return extra.includes(name);
}

export function criticalReason(
  name: string,
  extra: string[] = [],
): string | null {
  if ((BASE_DEPENDENCIES as readonly string[]).includes(name) || name === "base") {
    return "Protected: part of the Arch base system";
  }
  if ((EXTRA_CRITICAL as readonly string[]).includes(name)) {
    return "Protected: critical system package";
  }
  if (extra.includes(name)) {
    return "Protected: listed in Extra critical packages preference";
  }
  return null;
}
