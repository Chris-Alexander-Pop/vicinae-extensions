import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dndBlocksNow } from "./dnd";
import type { DndPrefs } from "./types";

const execFileAsync = promisify(execFile);
const SWAYNC = "/usr/bin/swaync-client";
const EXEC_OPTS = { timeout: 4_000, maxBuffer: 64 * 1024 } as const;

export function swayncDndArgs(
  block: boolean,
  hideExisting: boolean,
): string[][] {
  const cmds = [[block ? "-dn" : "-df", "-sw"]];
  if (block && hideExisting) {
    cmds.push(["--hide-all", "-sw"]);
  }
  return cmds;
}

export async function applySwayncDnd(
  prefs: DndPrefs,
  opts: { hideExisting?: boolean } = {},
): Promise<void> {
  const block = dndBlocksNow(prefs);
  const hideExisting = opts.hideExisting ?? block;
  for (const args of swayncDndArgs(block, hideExisting)) {
    await execFileAsync(SWAYNC, args, EXEC_OPTS);
  }
}
