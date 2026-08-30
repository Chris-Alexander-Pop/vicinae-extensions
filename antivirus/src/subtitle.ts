import {
  environment,
  getPreferenceValues,
  LaunchType,
  sendDesktopNotification,
  showToast,
  Toast,
  updateCommandMetadata,
} from "@vicinae/api";
import { formatSubtitle, getAvStatus } from "./status";
import { notifiedKey, setNotifiedKey } from "./history";

function isBackgroundLaunch(): boolean {
  const launchType = environment.launchType as string | undefined;
  return launchType === LaunchType.Background || launchType === "background";
}

type Prefs = {
  notificationsEnabled?: boolean;
};

export default async function AntivirusStatusCommand() {
  try {
    const status = await getAvStatus();
    await updateCommandMetadata({ subtitle: formatSubtitle(status) });

    const prefs = getPreferenceValues<Prefs>();
    const notifyOn = prefs.notificationsEnabled !== false;
    const p = status.progress;
    const terminal =
      p &&
      (p.state === "done" || p.state === "interrupted") &&
      p.id
        ? `${p.id}:${p.state}:${p.infected}`
        : null;
    if (notifyOn && terminal && notifiedKey() !== terminal) {
      setNotifiedKey(terminal);
      const infected = p?.infected ?? 0;
      await sendDesktopNotification({
        title:
          p?.state === "interrupted"
            ? "Scan interrupted"
            : infected
              ? `Scan finished · ${infected} infected`
              : "Scan finished",
        body:
          p?.state === "interrupted"
            ? "Resume from Antivirus (Ctrl+G)"
            : `${(p?.done ?? 0).toLocaleString()} files · ${infected} infected`,
        urgency: infected ? "High" : "Normal",
      });
    }

    if (isBackgroundLaunch()) return;
    await showToast({
      style: Toast.Style.Success,
      title: formatSubtitle(status),
      message: status.clamdActive
        ? `${status.signatures?.toLocaleString() ?? "?"} signatures · extra DBs ${status.sigAge.unofficialLabel}`
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
