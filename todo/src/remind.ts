import {
  environment,
  LaunchType,
  sendDesktopNotification,
  showToast,
  Toast,
  updateCommandMetadata,
} from "@vicinae/api";
import { dueItems, nextReminder, reminderUrgency } from "./notify";
import { getTodoPrefs } from "./prefs";
import { priorityLabel, priorityRank } from "./priority";
import { markNotified, readStore, touchPollSession, type TodoItem } from "./store";

function highestPriority(items: TodoItem[]): TodoItem["priority"] {
  let best: TodoItem["priority"] = "none";
  for (const item of items) {
    if (priorityRank(item.priority) > priorityRank(best)) best = item.priority;
  }
  return best;
}

function isBackgroundLaunch(): boolean {
  const launchType = environment.launchType as string | undefined;
  return launchType === LaunchType.Background || launchType === "background";
}

function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function publishSubtitle(text: string) {
  await updateCommandMetadata({ subtitle: text });
}

let inFlight: Promise<void> | null = null;

export default async function RemindCommand() {
  if (inFlight) {
    await inFlight;
    if (isBackgroundLaunch()) return;
  }

  const run = (async () => {
    const background = isBackgroundLaunch();
    try {
      const prefs = getTodoPrefs();
      const store = await readStore();
      const now = new Date();

      if (!prefs.notificationsEnabled) {
        await publishSubtitle("Off");
        if (!background) {
          await showToast({
            style: Toast.Style.Success,
            title: "Todo reminders off",
            message: "Enable them in extension preferences",
          });
        }
        return;
      }

      const session = await touchPollSession(
        prefs.sessionGapMinutes,
        prefs.bootGraceSeconds,
      );
      const ignoreBootGrace = !background;
      const due = dueItems(store.items, now, prefs, {
        inBootGrace: ignoreBootGrace ? false : session.inBootGrace,
        sessionStartedAt: session.sessionStartedAt,
      });

      if (due.length > 0) {
        const urgency = reminderUrgency(highestPriority(due));
        const title =
          due.length === 1
            ? `Todo · ${priorityLabel(due[0].priority)}`
            : `Todo · ${due.length} due`;
        const body =
          due.length === 1
            ? `${due[0].title}${due[0].reminderTime ? ` · ${due[0].reminderTime}` : ""}`
            : due
                .slice(0, 5)
                .map((item) => item.title)
                .join("\n") + (due.length > 5 ? `\n+${due.length - 5} more` : "");
        await sendDesktopNotification({ title, body, urgency });
        await markNotified(
          due.map((item) => item.id),
          now,
        );
      }

      const remaining = store.items.filter((item) => !item.done).length;
      const upcoming = nextReminder(store.items, now);
      const subtitle =
        due.length > 0
          ? `${due.length} pinged`
          : upcoming
            ? `Next ${formatClock(upcoming.at)}`
            : remaining > 0
              ? `${remaining} open`
              : "Quiet";
      await publishSubtitle(subtitle);

      if (!background) {
        await showToast({
          style: Toast.Style.Success,
          title:
            due.length > 0
              ? `Notified ${due.length} task${due.length === 1 ? "" : "s"}`
              : "No tasks due",
          message: upcoming
            ? `Next at ${formatClock(upcoming.at)} · ${upcoming.item.title}`
            : remaining > 0
              ? `${remaining} open, none due`
              : "Queue empty",
        });
      }
    } catch (err) {
      try {
        await publishSubtitle("Error");
      } catch {
        // ignore
      }
      if (!background) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Todo reminder failed",
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
