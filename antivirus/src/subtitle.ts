import {
  environment,
  LaunchType,
  showToast,
  Toast,
  updateCommandMetadata,
} from "@vicinae/api";
import { formatSubtitle, getAvStatus } from "./status";

function isBackgroundLaunch(): boolean {
  const launchType = environment.launchType as string | undefined;
  return launchType === LaunchType.Background || launchType === "background";
}

export default async function AntivirusStatusCommand() {
  try {
    const status = await getAvStatus();
    await updateCommandMetadata({ subtitle: formatSubtitle(status) });
    if (isBackgroundLaunch()) return;
    await showToast({
      style: Toast.Style.Success,
      title: formatSubtitle(status),
      message: status.clamdActive
        ? `${status.signatures?.toLocaleString() ?? "?"} signatures · ${status.unofficialCount} extra DBs`
        : "clamd is not running",
    });
  } catch (err) {
    try {
      await updateCommandMetadata({ subtitle: "Error" });
    } catch {
      // ignore
    }
    if (!isBackgroundLaunch()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Antivirus status failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
