import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
  type Keyboard,
} from "@vicinae/api";
import { startHomeScan, startRkhunter, startSignatureUpdate, stopScan } from "./jobs";
import { LogView } from "./log-view";
import {
  formatDuration,
  formatSubtitle,
  getAvStatus,
  latestScanLog,
  progressMarkdown,
  type AvStatus,
} from "./status";

const SHORTCUT_SCAN: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "s" };
const SHORTCUT_STOP: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "c" };
const SHORTCUT_UPDATE: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "u" };
const SHORTCUT_RK: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "k" };
const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const SHORTCUT_LOG: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "l" };

function scanAccessory(status: AvStatus): List.Item.Accessory[] {
  const p = status.progress;
  if (status.scanRunning || p?.state === "counting" || p?.state === "scanning") {
    if (p?.percent != null) {
      return [{ tag: { value: `${p.percent}%`, color: Color.Blue } }];
    }
    return [{ tag: { value: "counting", color: Color.Blue } }];
  }
  const infected = p?.state === "done" ? p.infected : status.lastSummary?.infected;
  if (infected === null || infected === undefined) {
    return [{ text: "no scan yet" }];
  }
  if (infected > 0) {
    return [{ tag: { value: `${infected} infected`, color: Color.Red } }];
  }
  return [{ tag: { value: "clean", color: Color.Green } }];
}

function homeScanSubtitle(status: AvStatus): string {
  const p = status.progress;
  if (p && status.scanRunning) {
    if (p.state === "counting") {
      return p.done
        ? `Counting files… ${p.done.toLocaleString()} so far`
        : "Counting files to scan…";
    }
    const eta = p.etaSec == null ? "ETA calculating…" : `ETA ${formatDuration(p.etaSec)}`;
    const pct = p.percent != null ? `${p.percent}% · ` : "";
    return `${pct}${p.done.toLocaleString()}${p.total != null ? ` / ${p.total.toLocaleString()}` : ""} files · ${eta}`;
  }
  if (p?.state === "done") {
    return `Last: ${p.done.toLocaleString()} files · ${p.infected} infected · ${formatDuration(p.elapsedSec)}`;
  }
  if (status.lastSummary?.time) {
    return `Last: ${status.lastSummary.scannedFiles ?? "?"} files · ${status.lastSummary.time}`;
  }
  return "Not started this session";
}

export default function AntivirusCommand() {
  const { push } = useNavigation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AvStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getAvStatus();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), status?.scanRunning ? 2000 : 8000);
    return () => clearInterval(id);
  }, [refresh, status?.scanRunning]);

  const run = async (
    title: string,
    fn: () => Promise<void | string>,
  ): Promise<boolean> => {
    setBusy(true);
    try {
      await showToast({
        style: Toast.Style.Animated,
        title,
      });
      const logPath = await fn();
      await refresh();
      await showToast({ style: Toast.Style.Success, title });
      if (typeof logPath === "string" && logPath) {
        push(<LogView path={logPath} running title={title} />);
      }
      return true;
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: `${title} failed`,
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openScanLog = (running: boolean) => {
    const path = latestScanLog() ?? status?.lastLog;
    if (!path) {
      void showToast({
        style: Toast.Style.Failure,
        title: "No scan log yet",
      });
      return;
    }
    push(
      <LogView
        path={path}
        running={running}
        title={running ? "Home scan" : "Last scan"}
      />,
    );
  };

  const scanHome = async () => {
    await run("Scan started", async () => {
      await startHomeScan();
      await new Promise((r) => setTimeout(r, 500));
      return latestScanLog() ?? "";
    });
  };

  if (error && !status) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="Antivirus status failed"
          description={error}
        />
      </List>
    );
  }

  const unofficial = status?.unofficialNames.slice(0, 8).join(", ") ?? "";
  const unofficialMore =
    (status?.unofficialCount ?? 0) > 8
      ? ` +${(status?.unofficialCount ?? 0) - 8} more`
      : "";

  return (
    <List
      isLoading={loading || busy}
      isShowingDetail={Boolean(
        status?.progress &&
          (status.scanRunning ||
            status.progress.state === "counting" ||
            status.progress.state === "scanning" ||
            status.progress.state === "done"),
      )}
      searchBarPlaceholder="Scan, update, rkhunter…"
      navigationTitle={status ? `Antivirus · ${formatSubtitle(status)}` : "Antivirus"}
    >
      <List.Section title="Status">
        <List.Item
          title="ClamAV daemon"
          subtitle={
            status?.clamdActive
              ? `${status.signatures?.toLocaleString() ?? "?"} signatures · ${status.unofficialCount} extra DBs`
              : "inactive — scans fall back to clamscan"
          }
          icon={{
            source: Icon.Shield01,
            tintColor: status?.clamdActive ? Color.Green : Color.Orange,
          }}
          accessories={
            status?.clamdActive
              ? [{ tag: { value: "active", color: Color.Green } }]
              : [{ tag: { value: "off", color: Color.Orange } }]
          }
          keywords={["clamd", "daemon", "signatures", "fangfrisch"]}
          actions={
            <ActionPanel>
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={SHORTCUT_REFRESH}
                onAction={() => void refresh()}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Unofficial signatures"
          subtitle={
            unofficial
              ? unofficial + unofficialMore
              : "Fangfrisch not loaded yet — av-update"
          }
          icon={Icon.Heartbeat}
          keywords={["sanesecurity", "urlhaus", "rfxn", "fangfrisch", "twinclams"]}
        />
        <List.Item
          title="Home scan"
          subtitle={status ? homeScanSubtitle(status) : undefined}
          icon={{
            source: status?.scanRunning ? Icon.Stopwatch : Icon.MagnifyingGlass,
            tintColor: status?.scanRunning ? Color.Blue : Color.SecondaryText,
          }}
          accessories={status ? scanAccessory(status) : undefined}
          keywords={["scan", "home", "clamscan", "progress"]}
          detail={
            status?.progress ? (
              <List.Item.Detail markdown={progressMarkdown(status.progress)} />
            ) : undefined
          }
          actions={
            <ActionPanel>
              {status?.scanRunning ? (
                <Action
                  title="Open Live Log"
                  icon={Icon.BlankDocument}
                  shortcut={SHORTCUT_LOG}
                  onAction={() => openScanLog(true)}
                />
              ) : (
                <Action
                  title="Scan Home"
                  icon={Icon.Play}
                  shortcut={SHORTCUT_SCAN}
                  onAction={() => void scanHome()}
                />
              )}
              {status?.scanRunning ? (
                <Action
                  title="Stop Scan"
                  icon={Icon.Stop}
                  shortcut={SHORTCUT_STOP}
                  onAction={() => void run("Stopping scan", () => stopScan())}
                />
              ) : null}
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={SHORTCUT_REFRESH}
                onAction={() => void refresh()}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Actions">
        <List.Item
          title={status?.scanRunning ? "Scan already running" : "Scan Home"}
          subtitle="av-scan — file-count progress + ETA; skips last-scan black holes"
          icon={{ source: Icon.Play, tintColor: Color.Green }}
          keywords={["start", "scan", "home"]}
          actions={
            <ActionPanel>
              <Action
                title="Scan Home"
                icon={Icon.Play}
                shortcut={SHORTCUT_SCAN}
                onAction={() => void scanHome()}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Update signatures"
          subtitle="freshclam + Fangfrisch unofficial DBs"
          icon={Icon.ArrowClockwise}
          keywords={["update", "freshclam", "fangfrisch"]}
          actions={
            <ActionPanel>
              <Action
                title="Update Signatures"
                icon={Icon.ArrowClockwise}
                shortcut={SHORTCUT_UPDATE}
                onAction={() =>
                  void run("Updating signatures", () => startSignatureUpdate())
                }
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Run rkhunter"
          subtitle="Rootkit check (sudo). Quiet egrep wrappers already installed."
          icon={{ source: Icon.Bug, tintColor: Color.Orange }}
          keywords={["rkhunter", "rootkit"]}
          actions={
            <ActionPanel>
              <Action
                title="Run rkhunter"
                icon={Icon.Bug}
                shortcut={SHORTCUT_RK}
                onAction={() => void run("rkhunter", () => startRkhunter())}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Last scan log"
          subtitle={status?.lastLog ?? "none"}
          icon={Icon.BlankDocument}
          keywords={["log", "results", "infected"]}
          actions={
            <ActionPanel>
              <Action
                title="Open Last Scan Log"
                icon={Icon.BlankDocument}
                shortcut={SHORTCUT_LOG}
                onAction={() => openScanLog(Boolean(status?.scanRunning))}
              />
              {status?.rkhunterLog ? (
                <Action
                  title="Open rkhunter Log"
                  icon={Icon.Bug}
                  onAction={() =>
                    push(
                      <LogView
                        path={status.rkhunterLog!}
                        title="rkhunter"
                      />,
                    )
                  }
                />
              ) : null}
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
