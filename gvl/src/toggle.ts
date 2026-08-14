import {
  environment,
  LaunchType,
  showToast,
  Toast,
  updateCommandMetadata,
} from "@vicinae/api";
import { getStatus } from "./gvl";
import { applyPower } from "./quick";
import { errMessage, formatStatusLine, isOn, type LightStatus } from "./status";

function isBackgroundLaunch(): boolean {
  const launchType = environment.launchType as string | undefined;
  return launchType === LaunchType.Background || launchType === "background";
}

async function publishStatus(status: LightStatus) {
  await updateCommandMetadata({ subtitle: formatStatusLine(status) });
}

let inFlight: Promise<void> | null = null;

export default async function ToggleLightsCommand() {
  if (inFlight) {
    await inFlight;
    if (isBackgroundLaunch()) return;
  }

  const run = (async () => {
    try {
      const status = await getStatus(8_000);
      await publishStatus(status);

      if (isBackgroundLaunch()) {
        return;
      }

      const after = isOn(status)
        ? await applyPower(["off"], "Lights Off failed")
        : await applyPower(["on"], "Lights On failed");
      if (after) await publishStatus(after);
    } catch (err) {
      try {
        await updateCommandMetadata({ subtitle: "Lights Error" });
      } catch {
        // ignore
      }
      if (!isBackgroundLaunch()) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Toggle lights failed",
          message: errMessage(err),
        });
      }
    }
  })();

  inFlight = run.finally(() => {
    if (inFlight === run) inFlight = null;
  });
  await inFlight;
}
