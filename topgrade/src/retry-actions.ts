import { showToast, Toast } from "@vicinae/api";
import {
  authenticateAndStart,
  buildRetryPlan,
  canRetry,
  spawnPasswordPromptDetached,
  startTopgradeService,
  sudoCached,
  waitForPasswordPrompt,
} from "./runner";

/**
 * Authorize sudo, then start a retry-only Topgrade run for the given failures.
 * Returns true if the run was started.
 */
export async function authorizeAndRetryFailed(
  failedSteps: string[],
  mode: "fingerprint" | "password",
): Promise<boolean> {
  if (!canRetry(failedSteps)) {
    const plan = buildRetryPlan(failedSteps);
    await showToast({
      style: Toast.Style.Failure,
      title: "Nothing to retry",
      message: plan.unmatched.length
        ? `Unmapped: ${plan.unmatched.join(", ")}`
        : "No failed steps",
    });
    return false;
  }

  const plan = buildRetryPlan(failedSteps);
  try {
    if (mode === "password") {
      await showToast({
        style: Toast.Style.Animated,
        title: "Password…",
        message: `Retry: ${plan.summary}`,
      });
      const promptPid = spawnPasswordPromptDetached();
      const warmed = await waitForPasswordPrompt(promptPid);
      if (!warmed) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Cancelled",
          message: "Password dialog closed without authorizing",
        });
        return false;
      }
      if (!(await sudoCached())) {
        throw new Error(
          "Password dialog finished but sudo is not authorized. Try again.",
        );
      }
      await startTopgradeService({ retryFailed: failedSteps });
    } else {
      await showToast({
        style: Toast.Style.Animated,
        title: "Waiting for fingerprint…",
        message: `Retry: ${plan.summary}`,
      });
      await authenticateAndStart("fingerprint", undefined, {
        retryFailed: failedSteps,
      });
    }

    await showToast({
      style: Toast.Style.Success,
      title: "Retry started",
      message: plan.summary,
    });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not retry",
      message,
    });
    return false;
  }
}
