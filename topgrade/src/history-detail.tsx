import { useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
} from "@vicinae/api";
import { authorizeAndRetryFailed } from "./retry-actions";
import {
  canRetry,
  readHistoryLogLines,
  readHistoryRun,
  type RunState,
} from "./runner";

const LOG_WINDOW = 100;
const LOG_STEP = 8;

const KEY = {
  scrollUp: { modifiers: ["ctrl"] as const, key: "arrowUp" as const },
  scrollDown: { modifiers: ["ctrl"] as const, key: "arrowDown" as const },
  jumpEnd: {
    modifiers: ["ctrl", "shift"] as const,
    key: "arrowDown" as const,
  },
};

function stateColor(state: RunState): Color {
  switch (state) {
    case "succeeded":
      return Color.Green;
    case "failed":
      return Color.Red;
    case "cancelled":
      return Color.Orange;
    case "running":
      return Color.Blue;
    default:
      return Color.SecondaryText;
  }
}

function stepIcon(status: string) {
  switch (status) {
    case "ok":
      return { source: Icon.Checkmark, tintColor: Color.Green };
    case "failed":
      return { source: Icon.XMarkCircle, tintColor: Color.Red };
    case "running":
      return { source: Icon.Bolt, tintColor: Color.Yellow };
    default:
      return Icon.Circle;
  }
}

type Props = {
  runId: string;
  onBack: () => void;
  onRetryStarted: () => void;
};

export function HistoryDetail({ runId, onBack, onRetryStarted }: Props) {
  const run = useMemo(() => readHistoryRun(runId), [runId]);
  const lines = useMemo(() => readHistoryLogLines(runId, 800), [runId]);
  const [scrollFromEnd, setScrollFromEnd] = useState(0);
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState(false);

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

  if (!run) {
    return (
      <List navigationTitle="Run missing">
        <List.Item
          title="History entry not found"
          icon={Icon.Warning}
          actions={
            <ActionPanel>
              <Action title="Back" icon={Icon.ArrowLeft} onAction={onBack} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

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

  const failed = run.failedSteps ?? [];
  const retryable = run.state === "failed" && canRetry(failed);

  const beginRetry = async (mode: "fingerprint" | "password") => {
    setBusy(true);
    try {
      const ok = await authorizeAndRetryFailed(failed, mode);
      if (ok) onRetryStarted();
    } finally {
      setBusy(false);
    }
  };

  const summaryMd = [
    `# ${run.state}`,
    "",
    `- **Started:** ${run.startedAt ?? "—"}`,
    `- **Ended:** ${run.endedAt ?? "—"}`,
    `- **Exit:** ${run.exitCode ?? "—"}`,
    `- **Steps:** ${run.okCount} ok · ${run.failedCount} failed · ${run.stepCount} total`,
    failed.length ? `- **Failed:** ${failed.join(", ")}` : "",
    retryable ? `- **Retry:** only the failed steps above` : "",
    "",
    "```",
    visible.length ? visible.join("\n") : "(empty log)",
    "```",
  ]
    .filter(Boolean)
    .join("\n");

  const actions = (
    <ActionPanel>
      {retryable && (
        <>
          <Action
            title="Retry Failed (Fingerprint)"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["ctrl", "shift"], key: "r" }}
            onAction={() => void beginRetry("fingerprint")}
          />
          <Action
            title="Retry Failed (Password)…"
            icon={Icon.Key}
            onAction={() => void beginRetry("password")}
          />
        </>
      )}
      <Action title="Back" icon={Icon.ArrowLeft} onAction={onBack} />
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
      <Action
        title="Jump to Log End"
        icon={Icon.ArrowDownCircle}
        shortcut={KEY.jumpEnd}
        onAction={jumpToEnd}
      />
      <Action.CopyToClipboard title="Copy Log Path" content={run.logPath} />
      <Action.Open title="Open Log File" target={run.logPath} />
    </ActionPanel>
  );

  return (
    <List
      isLoading={busy}
      navigationTitle={`Topgrade · ${run.state}`}
      searchBarPlaceholder="Ctrl+↑/↓ scroll log · ↑↓ move rows"
      isShowingDetail
    >
      {retryable && (
        <List.Section title="Retry">
          <List.Item
            title="Retry Failed Steps"
            subtitle={failed.join(", ")}
            icon={{ source: Icon.ArrowClockwise, tintColor: Color.Blue }}
            accessories={[{ tag: { value: "retry", color: Color.Blue } }]}
            detail={<List.Item.Detail markdown={summaryMd} />}
            actions={actions}
          />
        </List.Section>
      )}

      <List.Section title="Summary">
        <List.Item
          title={run.state}
          subtitle={
            failed.length
              ? failed.join(", ")
              : `${run.okCount}/${run.stepCount} steps ok`
          }
          icon={{
            source:
              run.state === "succeeded"
                ? Icon.Checkmark
                : run.state === "cancelled"
                  ? Icon.Stop
                  : Icon.XMarkCircle,
            tintColor: stateColor(run.state),
          }}
          accessories={[
            {
              tag: {
                value: run.state,
                color: stateColor(run.state),
              },
            },
          ]}
          detail={<List.Item.Detail markdown={summaryMd} />}
          actions={actions}
        />
      </List.Section>

      <List.Section title="Log">
        <List.Item
          title="Saved Log"
          subtitle={`${windowStart + 1}–${windowEnd}/${lines.length} · Ctrl+↑/↓`}
          icon={{
            source: Icon.Terminal,
            tintColor: follow || atEnd ? Color.Green : Color.Yellow,
          }}
          detail={<List.Item.Detail markdown={summaryMd} />}
          actions={actions}
        />
      </List.Section>

      <List.Section title={`Steps (${run.steps.length})`}>
        {run.steps.length === 0 ? (
          <List.Item
            title="No steps recorded"
            icon={Icon.Circle}
            detail={<List.Item.Detail markdown={summaryMd} />}
            actions={actions}
          />
        ) : (
          run.steps.map((step, index) => (
            <List.Item
              key={`${step.name}-${index}`}
              title={step.name}
              subtitle={step.status}
              icon={stepIcon(step.status)}
              detail={<List.Item.Detail markdown={summaryMd} />}
              actions={actions}
            />
          ))
        )}
      </List.Section>
    </List>
  );
}
