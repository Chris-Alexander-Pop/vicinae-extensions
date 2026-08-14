import { showToast, Toast } from "@vicinae/api";
import { gvlStatus } from "./gvl";
import { errMessage, formatStatusLine, type LightStatus } from "./status";

export async function applyPower(
  args: string[],
  failTitle: string,
): Promise<LightStatus | null> {
  try {
    const status = await gvlStatus(args);
    await showToast({
      style: Toast.Style.Success,
      title: formatStatusLine(status),
    });
    return status;
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: failTitle,
      message: errMessage(err),
    });
    return null;
  }
}
