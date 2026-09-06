import { showToast, Toast } from "@vicinae/api";
import { installPersistence } from "./settings";

export default async function SetupPersistCommand() {
  try {
    const setup = await installPersistence();
    await showToast({
      style: Toast.Style.Success,
      title: setup.ready
        ? "Persist hook installed"
        : "Persist files written",
      message: setup.subtitle,
    });
  } catch (err) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not install persist hook",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
