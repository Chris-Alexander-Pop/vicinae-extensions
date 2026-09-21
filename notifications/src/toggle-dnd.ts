import {
  environment,
  getPreferenceValues,
  LaunchType,
  showToast,
  Toast,
  updateCommandMetadata,
} from "@vicinae/api";
import { createAuraClient } from "./api";
import { formatDndStatus, withToggledManual } from "./dnd";
import type { DndPrefs } from "./types";

type Preferences = {
  sidecarUrl?: string;
};

function isBackgroundLaunch(): boolean {
  const launchType = environment.launchType as string | undefined;
  return launchType === LaunchType.Background || launchType === "background";
}

async function publishStatus(prefs: DndPrefs) {
  await updateCommandMetadata({ subtitle: formatDndStatus(prefs) });
}

let inFlight: Promise<void> | null = null;

export default async function ToggleDndCommand() {
  if (inFlight) {
    await inFlight;
    if (isBackgroundLaunch()) return;
  }

  const prefs = getPreferenceValues<Preferences>();
  const client = createAuraClient(prefs.sidecarUrl);

  const run = (async () => {
    try {
      const before = await client.getDnd();
      await publishStatus(before);

      if (isBackgroundLaunch()) {
        return;
      }

      const after = withToggledManual(before);
      await client.setDnd(after);
      await publishStatus(after);

      await showToast({
        style: Toast.Style.Success,
        title: formatDndStatus(after),
        message: `Was ${formatDndStatus(before)}`,
      });
    } catch (err) {
      try {
        await updateCommandMetadata({ subtitle: "DND Error" });
      } catch {
        // ignore
      }
      if (!isBackgroundLaunch()) {
        await showToast({
          style: Toast.Style.Failure,
          title: "DND toggle failed",
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
