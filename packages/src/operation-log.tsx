import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
  type Keyboard,
} from "@vicinae/api";
import {
  cancelOperation,
  logPath,
  readLogLines,
  readStatus,
  type OpState,
  type OperationStatus,
} from "./operations";

const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const LOG_WINDOW = 100;
const LOG_STEP = 8;

const KEY: Record<string, Keyboard.Shortcut> = {
  scrollUp: { modifiers: ["ctrl"], key: "arrowUp" },
  scrollDown: { modifiers: ["ctrl"], key: "arrowDown" },
  jumpEnd: { modifiers: ["ctrl", "shift"], key: "arrowDown" },
  cancel: { modifiers: ["ctrl"], key: "c" },
};

function stateColor(state: OpState): Color {
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

type Props = {
  onFinished?: () => void;
};

export function OperationLog({ onFinished }: Props) {
  const [status, setStatus] = useState<OperationStatus>(() => readStatus());
  const [lines, setLines] = useState<string[]>(() => readLogLines(800));
  const [busy, setBusy] = useState(false);
  const [scrollFromEnd, setScrollFromEnd] = useState(0);
  const [follow, setFollow] = useState(true);
  const [sawTerminal, setSawTerminal] = useState(false);

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

  useEffect(() => {
    const terminal =
      status.state === "succeeded" ||
      status.state === "failed" ||
      status.state === "cancelled";
    if (!terminal || sawTerminal) return;
    setSawTerminal(true);
    void showToast({
      style:
        status.state === "succeeded"
          ? Toast.Style.Success
          : Toast.Style.Failure,
      title:
        status.state === "succeeded"
          ? `${
              status.kind === "uninstall"
                ? "Uninstalled"
                : status.kind === "install"
                  ? "Installed"
                  : "Updated"
            } ${status.packageName}`
          : status.state === "cancelled"
            ? "Cancelled"
            : "Operation failed",
      message:
        status.state === "succeeded"
          ? status.command ?? undefined
          : status.error ?? `exit ${status.exitCode}`,
    });
    onFinished?.();
  }, [status, sawTerminal, onFinished]);

  const onCancel = async () => {
    setBusy(true);
    try {
      cancelOperation();
      await showToast({
        style: Toast.Style.Success,
        title: "Cancel requested",
      });
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const state = status.state;
  const running = state === "running";
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
    `**Command:** \`${status.command ?? "—"}\``,
    `\n**State:** ${state}${status.packageName ? ` · **Package:** \`${status.packageName}\`` : ""}`,
    `\n**Follow:** ${follow || atEnd ? "on" : "off"} · **Lines ${windowStart + 1}–${windowEnd} / ${lines.length || 0}**`,
    `\n**Keys:** Ctrl+↑/↓ scroll · Ctrl+Shift+↓ end${running ? " · Ctrl+C cancel" : ""}`,
    "\n",
    "```",
    visible.length ? visible.join("\n") : "(waiting for output…)",
    "```",
  ].join("");

  const actions = (
    <ActionPanel>
      {running && (
        <Action
          title="Cancel"
          icon={Icon.Stop}
          style={Action.Style.Destructive}
          shortcut={KEY.cancel}
          onAction={() => void onCancel()}
        />
      )}
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
      <Action
        title="Refresh"
        icon={Icon.ArrowClockwise}
        shortcut={SHORTCUT_REFRESH}
        onAction={refresh}
      />
      <Action.CopyToClipboard
        title="Copy Log Path"
        content={status.logPath || logPath()}
      />
      <Action.Open title="Open Log File" target={status.logPath || logPath()} />
    </ActionPanel>
  );

  return (
    <List
      isLoading={busy || running}
      searchBarPlaceholder="Ctrl+↑/↓ scroll log · Ctrl+C cancel"
      navigationTitle={
        status.packageName
          ? `${status.kind ?? "op"} · ${status.packageName}`
          : `Package op · ${state}`
      }
      isShowingDetail
    >
      <List.Section title="Log">
        <List.Item
          title="Terminal Log"
          subtitle={`${follow || atEnd ? "following" : "browsing"} · ${windowStart + 1}–${windowEnd}/${lines.length}`}
          icon={{
            source: Icon.Terminal,
            tintColor: follow || atEnd ? Color.Green : Color.Yellow,
          }}
          accessories={[
            {
              tag: {
                value: state,
                color: stateColor(state),
              },
            },
          ]}
          detail={<List.Item.Detail markdown={logMarkdown} />}
          actions={actions}
        />
      </List.Section>

      <List.Section title={`Status · ${state}`}>
        <List.Item
          title={status.packageName ?? "No package"}
          subtitle={status.command ?? undefined}
          icon={{
            source: Icon.CircleProgress,
            tintColor: stateColor(state),
          }}
          accessories={
            status.exitCode != null
              ? [
                  {
                    tag: {
                      value: `exit ${status.exitCode}`,
                      color: stateColor(state),
                    },
                  },
                ]
              : running
                ? [{ tag: { value: "live", color: Color.Blue } }]
                : undefined
          }
          detail={<List.Item.Detail markdown={logMarkdown} />}
          actions={actions}
        />
      </List.Section>
    </List>
  );
}
