import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import {
  cancelTopgrade,
  canRetry,
  collectFailedSteps,
  logPath,
  readLogLines,
  readStatus,
  type RunState,
  type TopgradeStatus,
} from "./runner";
import { authorizeAndRetryFailed } from "./retry-actions";

const SHORTCUT_REFRESH = { modifiers: ["ctrl"] as const, key: "r" as const };
const LOG_WINDOW = 100;
const LOG_STEP = 8;

/**
 * Vicinae 0.23.1 only forwards *modified* keys to action shortcuts.
 * Bare ↑↓←→ stay on the list for row navigation — so log controls use Ctrl+.
 */
const KEY = {
  scrollUp: { modifiers: ["ctrl"] as const, key: "arrowUp" as const },
  scrollDown: { modifiers: ["ctrl"] as const, key: "arrowDown" as const },
  jumpEnd: {
    modifiers: ["ctrl", "shift"] as const,
    key: "arrowDown" as const,
  },
  cancel: { modifiers: ["ctrl"] as const, key: "c" as const },
};

function stateColor(state: RunState): Color {
  switch (state) {
    case "running":
      return Color.Blue;
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

function stepIcon(status: string) {
  switch (status) {
    case "running":
      return { source: Icon.Bolt, tintColor: Color.Yellow };
    case "ok":
      return { source: Icon.Checkmark, tintColor: Color.Green };
    case "failed":
      return { source: Icon.XMarkCircle, tintColor: Color.Red };
    default:
      return Icon.Circle;
  }
}

type Props = {
  onIdle?: () => void;
  onRetryStarted?: () => void;
};

export function Tracker({ onIdle, onRetryStarted }: Props) {
  const [status, setStatus] = useState<TopgradeStatus | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** How many lines above the live end the window is shifted (0 = at end). */
  const [scrollFromEnd, setScrollFromEnd] = useState(0);
  const [follow, setFollow] = useState(true);

  const refresh = useCallback(() => {
    setStatus(readStatus());
    setLines(readLogLines(800));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 400);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (follow) setScrollFromEnd(0);
  }, [follow, lines.length]);

  const onCancel = async () => {
    setBusy(true);
    try {
      await cancelTopgrade();
      await showToast({
        style: Toast.Style.Success,
        title: "Cancel requested",
      });
      refresh();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Cancel failed",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const onRetry = async (mode: "fingerprint" | "password") => {
    const failed = collectFailedSteps(status, lines.join("\n"));
    setBusy(true);
    try {
      const ok = await authorizeAndRetryFailed(failed, mode);
      if (ok) {
        onRetryStarted?.();
        refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const state = status?.state ?? "idle";
  const running = state === "running";
  const steps = status?.steps ?? [];
  const activity = status?.activity?.trim();
  const failedSteps = useMemo(
    () => collectFailedSteps(status, lines.join("\n")),
    [status, lines],
  );
  const retryable = !running && state === "failed" && canRetry(failedSteps);

  const maxFromEnd = Math.max(0, lines.length - 1);

  const { visible, windowStart, windowEnd, atEnd } = useMemo(() => {
    const fromEnd = follow ? 0 : Math.min(scrollFromEnd, maxFromEnd);
    const end = Math.max(0, lines.length - fromEnd);
    const start = Math.max(0, end - LOG_WINDOW);
    return {
      visible: lines.slice(start, end),
      windowStart: start,
      windowEnd: end,
      atEnd: fromEnd === 0,
    };
  }, [lines, scrollFromEnd, follow, maxFromEnd]);

  const scrollUp = () => {
    setFollow(false);
    setScrollFromEnd((s) => Math.min(maxFromEnd, s + LOG_STEP));
  };

  const scrollDown = () => {
    setScrollFromEnd((s) => {
      const next = Math.max(0, s - LOG_STEP);
      if (next === 0) setFollow(true);
      return next;
    });
  };

  const jumpToEnd = () => {
    setFollow(true);
    setScrollFromEnd(0);
  };

  const logMarkdown = [
    `**Log keys:** Ctrl+↑/↓ scroll · Ctrl+Shift+↓ end · bare ↑↓ move sidebar`,
    `\n**Follow:** ${follow || atEnd ? "on" : "off"} · **Lines ${windowStart + 1}–${windowEnd} / ${lines.length || 0}**`,
    activity ? `\n**Live:** \`${activity}\`` : "",
    status?.currentStep ? `\n**Step:** ${status.currentStep}` : "",
    "\n",
    "```",
    visible.length ? visible.join("\n") : "(waiting for output…)",
    "```",
  ].join("");

  const makeActions = (primary?: "cancel" | "scroll") => (
    <ActionPanel>
      {primary === "scroll" && (
        <>
          <Action
            title="Scroll Log Up"
            icon={Icon.ArrowUp}
            shortcut={KEY.scrollUp}
            onAction={scrollUp}
          />
          <Action
            title="Scroll Log Down"
            icon={Icon.ArrowDown}
            shortcut={KEY.scrollDown}
            onAction={scrollDown}
          />
        </>
      )}
      {running && (
        <Action
          title="Cancel Topgrade"
          icon={Icon.Stop}
          style={Action.Style.Destructive}
          shortcut={primary === "scroll" ? undefined : KEY.cancel}
          onAction={() => void onCancel()}
        />
      )}
      {primary !== "scroll" && (
        <>
          <Action
            title="Scroll Log Up"
            icon={Icon.ArrowUp}
            shortcut={KEY.scrollUp}
            onAction={scrollUp}
          />
          <Action
            title="Scroll Log Down"
            icon={Icon.ArrowDown}
            shortcut={KEY.scrollDown}
            onAction={scrollDown}
          />
        </>
      )}
      {running && primary === "scroll" && (
        <Action
          title="Cancel Topgrade"
          icon={Icon.Stop}
          style={Action.Style.Destructive}
          shortcut={KEY.cancel}
          onAction={() => void onCancel()}
        />
      )}
      <Action
        title="Jump to Log End"
        icon={Icon.ArrowDownCircle}
        shortcut={KEY.jumpEnd}
        onAction={jumpToEnd}
      />
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={SHORTCUT_REFRESH}
        onAction={refresh}
      />
      <Action.CopyToClipboard
        title="Copy Log Path"
        content={status?.logPath || logPath()}
      />
      <Action.Open
        title="Open Log File"
        target={status?.logPath || logPath()}
      />
      {retryable && (
        <>
          <Action
            title="Retry Failed (Fingerprint)"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
            onAction={() => void onRetry("fingerprint")}
          />
          <Action
            title="Retry Failed (Password)…"
            icon={Icon.Key}
            onAction={() => void onRetry("password")}
          />
        </>
      )}
      {!running && onIdle && (
        <Action title="New Run" icon={Icon.Plus} onAction={onIdle} />
      )}
    </ActionPanel>
  );

  return (
    <List
      isLoading={busy}
      searchBarPlaceholder="Ctrl+↑/↓ scroll log · ↑↓ move steps · Ctrl+C cancel"
      navigationTitle={
        activity
          ? activity.slice(0, 60)
          : status?.currentStep
            ? `Topgrade · ${status.currentStep}`
            : `Topgrade · ${state}`
      }
      isShowingDetail
    >
      <List.Section title="Log">
        <List.Item
          title="Live Log"
          subtitle={`${follow || atEnd ? "following" : "browsing"} · ${windowStart + 1}–${windowEnd}/${lines.length} · Ctrl+↑/↓`}
          icon={{
            source: Icon.Terminal,
            tintColor: follow || atEnd ? Color.Green : Color.Yellow,
          }}
          accessories={[
            {
              tag: {
                value: follow || atEnd ? "follow" : "browse",
                color: follow || atEnd ? Color.Green : Color.Yellow,
              },
            },
          ]}
          detail={<List.Item.Detail markdown={logMarkdown} />}
          actions={makeActions("scroll")}
        />
      </List.Section>

      {running && (
        <List.Section title="Controls">
          <List.Item
            title="Cancel Topgrade"
            subtitle="Stop the background run (Ctrl+C)"
            icon={{ source: Icon.Stop, tintColor: Color.Red }}
            accessories={[{ tag: { value: "stop", color: Color.Red } }]}
            detail={<List.Item.Detail markdown={logMarkdown} />}
            actions={makeActions("cancel")}
          />
        </List.Section>
      )}

      {retryable && (
        <List.Section title="Retry">
          <List.Item
            title="Retry Failed Steps"
            subtitle={failedSteps.join(", ")}
            icon={{ source: Icon.ArrowClockwise, tintColor: Color.Blue }}
            accessories={[{ tag: { value: "retry", color: Color.Blue } }]}
            detail={<List.Item.Detail markdown={logMarkdown} />}
            actions={makeActions()}
          />
        </List.Section>
      )}

      <List.Section title={`Status · ${state}`}>
        <List.Item
          title={activity || (running ? "Running…" : state)}
          subtitle={
            status?.currentStep
              ? `${status.currentStep}${status.startedAt ? ` · since ${status.startedAt}` : ""}`
              : status?.startedAt
                ? `Started ${status.startedAt}`
                : undefined
          }
          icon={{ source: Icon.CircleProgress, tintColor: stateColor(state) }}
          accessories={
            running ? [{ tag: { value: "live", color: Color.Blue } }] : []
          }
          detail={<List.Item.Detail markdown={logMarkdown} />}
          actions={makeActions()}
        />
      </List.Section>

      <List.Section title={`Steps (${steps.length})`}>
        {steps.length === 0 ? (
          <List.Item
            title="Waiting for first step…"
            icon={Icon.Clock}
            detail={<List.Item.Detail markdown={logMarkdown} />}
            actions={makeActions()}
          />
        ) : (
          steps.map((step, index) => (
            <List.Item
              key={`${step.name}-${index}`}
              title={step.name}
              subtitle={
                step.name === status?.currentStep && activity
                  ? activity
                  : step.status
              }
              icon={stepIcon(step.status)}
              accessories={
                step.name === status?.currentStep && running
                  ? [{ tag: { value: "current", color: Color.Yellow } }]
                  : undefined
              }
              detail={<List.Item.Detail markdown={logMarkdown} />}
              actions={makeActions()}
            />
          ))
        )}
      </List.Section>
    </List>
  );
}
