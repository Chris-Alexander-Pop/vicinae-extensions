import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import { authorizeAndRetryFailed } from "./retry-actions";
import {
  authenticateAndStart,
  canRetry,
  readHistoryIndex,
  spawnPasswordPromptDetached,
  startTopgradeService,
  sudoCached,
  waitForPasswordPrompt,
  type HistoryEntry,
  type RunState,
} from "./runner";

type Props = {
  onStarted: () => void;
  onOpenHistory: (id: string) => void;
};

function stateColor(state: RunState): Color {
  switch (state) {
    case "succeeded":
      return Color.Green;
    case "failed":
      return Color.Red;
    case "cancelled":
      return Color.Orange;
    default:
      return Color.SecondaryText;
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])} ${m[4]}:${m[5]}`;
}

export function StartForm({ onStarted, onOpenHistory }: Props) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(readHistoryIndex().slice(0, 5));
  }, []);

  const beginRun = async (mode: "fingerprint" | "password") => {
    setLoading(true);
    try {
      if (mode === "password") {
        await showToast({
          style: Toast.Style.Animated,
          title: "Password…",
          message: "Enter your password in the Authorize Topgrade dialog",
        });

        const promptPid = spawnPasswordPromptDetached();
        const warmed = await waitForPasswordPrompt(promptPid);
        if (!warmed) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Cancelled",
            message: "Password dialog closed without authorizing",
          });
          return;
        }

        if (!(await sudoCached())) {
          throw new Error(
            "Password dialog finished but sudo is not authorized. Try again.",
          );
        }

        await startTopgradeService();
      } else {
        await showToast({
          style: Toast.Style.Animated,
          title: "Waiting for fingerprint…",
          message: "Touch the fingerprint reader — Vicinae stays open",
        });
        await authenticateAndStart("fingerprint");
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Topgrade started",
        message: "Sudo OK — tracking progress",
      });
      onStarted();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const incorrect = /incorrect password/i.test(message);
      await showToast({
        style: Toast.Style.Failure,
        title: incorrect ? "Incorrect password" : "Could not start Topgrade",
        message,
      });
    } finally {
      setLoading(false);
    }
  };

  const beginRetry = async (
    failedSteps: string[],
    mode: "fingerprint" | "password",
  ) => {
    setLoading(true);
    try {
      const ok = await authorizeAndRetryFailed(failedSteps, mode);
      if (ok) onStarted();
    } finally {
      setLoading(false);
    }
  };

  return (
    <List
      isLoading={loading}
      navigationTitle="Run Topgrade"
      searchBarPlaceholder="Choose how to authorize sudo…"
    >
      <List.Section title="Authorize & start">
        <List.Item
          title="Start with Fingerprint"
          subtitle="Press Enter, then touch the reader — launcher stays open"
          icon={{ source: Icon.Fingerprint, tintColor: Color.Blue }}
          actions={
            <ActionPanel>
              <Action
                title="Start with Fingerprint"
                icon={Icon.Fingerprint}
                onAction={() => void beginRun("fingerprint")}
              />
              <Action
                title="Start with Password…"
                icon={Icon.Key}
                shortcut={{ modifiers: ["shift"], key: "return" }}
                onAction={() => void beginRun("password")}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Start with Password…"
          subtitle="Press Enter · dialog opens over Vicinae"
          icon={{ source: Icon.Key, tintColor: Color.Yellow }}
          actions={
            <ActionPanel>
              <Action
                title="Start with Password…"
                icon={Icon.Key}
                onAction={() => void beginRun("password")}
              />
              <Action
                title="Start with Fingerprint"
                icon={Icon.Fingerprint}
                shortcut={{ modifiers: ["shift"], key: "return" }}
                onAction={() => void beginRun("fingerprint")}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      {history.length > 0 && (
        <List.Section title="Recent runs">
          {history.map((entry) => {
            const failed = entry.failedSteps ?? [];
            const when = formatWhen(entry.endedAt || entry.startedAt);
            const retryable = entry.state === "failed" && canRetry(failed);
            const subtitle =
              failed.length > 0
                ? `Failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`
                : entry.state === "succeeded"
                  ? `${entry.okCount}/${entry.stepCount} steps ok`
                  : entry.state;
            return (
              <List.Item
                key={entry.id}
                title={`${when || entry.id} · ${entry.state}`}
                subtitle={subtitle}
                icon={{
                  source:
                    entry.state === "succeeded"
                      ? Icon.Checkmark
                      : entry.state === "cancelled"
                        ? Icon.Stop
                        : Icon.XMarkCircle,
                  tintColor: stateColor(entry.state),
                }}
                accessories={[
                  {
                    tag: {
                      value: entry.state,
                      color: stateColor(entry.state),
                    },
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title="View Run"
                      icon={Icon.Eye}
                      onAction={() => onOpenHistory(entry.id)}
                    />
                    {retryable && (
                      <>
                        <Action
                          title="Retry Failed (Fingerprint)"
                          icon={Icon.ArrowClockwise}
                          shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
                          onAction={() =>
                            void beginRetry(failed, "fingerprint")
                          }
                        />
                        <Action
                          title="Retry Failed (Password)…"
                          icon={Icon.Key}
                          onAction={() => void beginRetry(failed, "password")}
                        />
                      </>
                    )}
                    <Action
                      title="Start Full Run (Fingerprint)"
                      icon={Icon.Fingerprint}
                      onAction={() => void beginRun("fingerprint")}
                    />
                    <Action
                      title="Start Full Run (Password)…"
                      icon={Icon.Key}
                      onAction={() => void beginRun("password")}
                    />
                  </ActionPanel>
                }
              />
            );
          })}
        </List.Section>
      )}
    </List>
  );
}
