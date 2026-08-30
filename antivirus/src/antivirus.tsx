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
import { resumeScan, startRkhunter, startScan, startSignatureUpdate, stopScan } from "./jobs";
import { LogView } from "./log-view";
import { HitsView } from "./hits-view";
import { HistoryView } from "./history-view";
import { PathScanForm } from "./path-form";
import { kindLabel, visibleHits } from "./history";
import {
  formatDuration,
  formatSubtitle,
  getAvStatus,
  latestScanLog,
  progressMarkdown,
  type AvStatus,
} from "./status";

const SHORTCUT_SCAN: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "s" };
const SHORTCUT_QUICK: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "q" };
const SHORTCUT_PATH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "p" };
const SHORTCUT_RESUME: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "g" };
const SHORTCUT_STOP: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "c" };
const SHORTCUT_UPDATE: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "u" };
const SHORTCUT_RK: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "k" };
const SHORTCUT_REFRESH: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "r" };
const SHORTCUT_LOG: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "l" };
const SHORTCUT_HITS: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "i" };
const SHORTCUT_HISTORY: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "h" };

function scanAccessory(status: AvStatus): List.Item.Accessory[] {
  const p = status.progress;
  if (status.scanRunning) {
    if (p?.percent != null) {
      return [{ tag: { value: `${p.percent}%`, color: Color.Blue } }];
    }
    return [{ tag: { value: "counting", color: Color.Blue } }];
  }
  if (status.resumable) {
    return [{ tag: { value: "resume", color: Color.Orange } }];
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
  if (status.resumable && p) {
    return `Interrupted ${kindLabel(p.kind)} · ${p.done.toLocaleString()}${p.total != null ? ` / ${p.total.toLocaleString()}` : ""} — Ctrl+G resume`;
  }
  if (p?.state === "done") {
    return `Last ${kindLabel(p.kind)}: ${p.done.toLocaleString()} files · ${p.infected} infected · ${formatDuration(p.elapsedSec)}`;
  }
  if (status.lastSummary?.time) {
    return `Last: ${status.lastSummary.scannedFiles ?? "?"} files · ${status.lastSummary.time}`;
  }
  return "Not started this session";
}

function rkSubtitle(status: AvStatus): string {
  const rk = status.rkhunter;
  if (!rk) return "Rootkit check (sudo)";
  const bits = [
    rk.rootkits != null ? `${rk.rootkits} rootkits` : null,
    rk.suspectFiles != null ? `${rk.suspectFiles} suspect files` : null,
    rk.warnings === false ? "no warnings" : rk.warnings ? "warnings" : null,
    rk.took ? rk.took : null,
  ].filter(Boolean);
  return bits.join(" · ") || "Rootkit check (sudo)";
}

function staleColor(hours: number | null): Color {
  if (hours == null) return Color.SecondaryText;
  if (hours > 168) return Color.Red;
  if (hours > 48) return Color.Orange;
  return Color.Green;
}

export default function AntivirusCommand() {
  const { push } = useNavigation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AvStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hitsTick, setHitsTick] = useState(0);

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
      await showToast({ style: Toast.Style.Animated, title });
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

  const begin = async (title: string, fn: () => Promise<void>) => {
    await run(title, async () => {
      await fn();
      await new Promise((r) => setTimeout(r, 400));
      return latestScanLog() ?? "";
    });
  };

  const openScanLog = (running: boolean) => {
    const path = status?.progress?.log || latestScanLog() || status?.lastLog;
    if (!path) {
      void showToast({ style: Toast.Style.Failure, title: "No scan log yet" });
      return;
    }
    push(
      <LogView path={path} running={running} title={running ? "Live scan" : "Last scan"} />,
    );
  };

  const hits = visibleHits(status?.progress?.hits ?? []);

  if (error && !status) {
    return (
      <List>
        <List.EmptyView icon={Icon.Warning} title="Antivirus status failed" description={error} />
      </List>
    );
  }

  const unofficial = status?.unofficialNames.slice(0, 6).join(", ") ?? "";
  const unofficialMore =
    (status?.unofficialCount ?? 0) > 6
      ? ` +${(status?.unofficialCount ?? 0) - 6} more`
      : "";

  return (
    <List
      isLoading={loading || busy}
      isShowingDetail={Boolean(
        status?.progress &&
          (status.scanRunning || status.resumable || status.progress.state === "done"),
      )}
      searchBarPlaceholder="Scan, resume, history…"
      navigationTitle={status ? `Antivirus · ${formatSubtitle(status)}` : "Antivirus"}
    >
      <List.Section title="Status">
        <List.Item
          title="ClamAV daemon"
          subtitle={
            status?.clamdActive
              ? `${status.signatures?.toLocaleString() ?? "?"} signatures · official ${status.sigAge.officialLabel} · extra DBs ${status.sigAge.unofficialLabel}`
              : "inactive — scans fall back to clamscan"
          }
          icon={{
            source: Icon.Shield01,
            tintColor: status?.clamdActive
              ? staleColor(status.sigAge.officialHours)
              : Color.Orange,
          }}
          accessories={
            status?.clamdActive
              ? [{ tag: { value: "active", color: Color.Green } }]
              : [{ tag: { value: "off", color: Color.Orange } }]
          }
          keywords={["clamd", "daemon", "signatures", "freshclam"]}
        />
        <List.Item
          title="Unofficial signatures"
          subtitle={unofficial ? unofficial + unofficialMore : "Fangfrisch not loaded yet — update signatures"}
          icon={Icon.Heartbeat}
          accessories={
            status
              ? [{ text: status.sigAge.unofficialLabel, icon: Icon.Clock }]
              : undefined
          }
          keywords={["sanesecurity", "urlhaus", "rfxn", "fangfrisch"]}
        />
        <List.Item
          title="Current scan"
          subtitle={status ? homeScanSubtitle(status) : undefined}
          icon={{
            source: status?.scanRunning
              ? Icon.Stopwatch
              : status?.resumable
                ? Icon.Play
                : Icon.MagnifyingGlass,
            tintColor: status?.scanRunning
              ? Color.Blue
              : status?.resumable
                ? Color.Orange
                : Color.SecondaryText,
          }}
          accessories={status ? scanAccessory(status) : undefined}
          keywords={["scan", "home", "progress", "resume"]}
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
              ) : status?.resumable ? (
                <Action
                  title="Resume Scan"
                  icon={Icon.Play}
                  shortcut={SHORTCUT_RESUME}
                  onAction={() => void begin("Resuming", () => resumeScan())}
                />
              ) : (
                <Action
                  title="Scan Home (full)"
                  icon={Icon.Play}
                  shortcut={SHORTCUT_SCAN}
                  onAction={() => void begin("Full scan started", () => startScan("full"))}
                />
              )}
              {status?.scanRunning ? (
                <Action
                  title="Stop (interrupt, resumable)"
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

      <List.Section title="Scan">
        <List.Item
          title="Scan Home (full)"
          subtitle="Entire home with black-hole excludes"
          icon={{ source: Icon.Play, tintColor: Color.Green }}
          keywords={["full", "home"]}
          actions={
            <ActionPanel>
              <Action
                title="Scan Home (full)"
                icon={Icon.Play}
                shortcut={SHORTCUT_SCAN}
                onAction={() => void begin("Full scan started", () => startScan("full"))}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Quick scan"
          subtitle="Downloads, Desktop, /tmp"
          icon={Icon.Bolt}
          keywords={["quick", "downloads"]}
          actions={
            <ActionPanel>
              <Action
                title="Quick Scan"
                icon={Icon.Bolt}
                shortcut={SHORTCUT_QUICK}
                onAction={() => void begin("Quick scan started", () => startScan("quick"))}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Scan a path"
          subtitle="Pick a file or folder"
          icon={Icon.Folder}
          keywords={["path", "folder", "file", "apk"]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Pick Path"
                icon={Icon.Folder}
                shortcut={SHORTCUT_PATH}
                target={<PathScanForm onStarted={() => void refresh()} />}
              />
            </ActionPanel>
          }
        />
        {status?.resumable ? (
          <List.Item
            title="Resume interrupted scan"
            subtitle={homeScanSubtitle(status)}
            icon={{ source: Icon.Play, tintColor: Color.Orange }}
            keywords={["resume", "continue"]}
            actions={
              <ActionPanel>
                <Action
                  title="Resume Scan"
                  icon={Icon.Play}
                  shortcut={SHORTCUT_RESUME}
                  onAction={() => void begin("Resuming", () => resumeScan())}
                />
              </ActionPanel>
            }
          />
        ) : null}
      </List.Section>

      <List.Section title="Results">
        <List.Item
          title={hits.length ? `${hits.length} infected hit${hits.length === 1 ? "" : "s"}` : "Hits"}
          subtitle={hits.length ? hits[0].path : "No current hits"}
          icon={{
            source: Icon.Warning,
            tintColor: hits.length ? Color.Red : Color.SecondaryText,
          }}
          keywords={["infected", "found", "quarantine"]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Open Hits"
                icon={Icon.Warning}
                shortcut={SHORTCUT_HITS}
                target={
                  <HitsView
                    key={hitsTick}
                    hits={status?.progress?.hits ?? []}
                    onChange={() => setHitsTick((n) => n + 1)}
                  />
                }
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Scan history"
          subtitle="Past full / quick / path runs — resume interrupted from here"
          icon={Icon.Clock}
          keywords={["history", "past", "log"]}
          actions={
            <ActionPanel>
              <Action.Push
                title="Open History"
                icon={Icon.Clock}
                shortcut={SHORTCUT_HISTORY}
                target={<HistoryView />}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Last scan log"
          subtitle={status?.lastLog ?? "none"}
          icon={Icon.BlankDocument}
          actions={
            <ActionPanel>
              <Action
                title="Open Last Scan Log"
                icon={Icon.BlankDocument}
                shortcut={SHORTCUT_LOG}
                onAction={() => openScanLog(Boolean(status?.scanRunning))}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Maintenance">
        <List.Item
          title="Update signatures"
          subtitle={`Official ${status?.sigAge.officialLabel ?? "?"} · extra ${status?.sigAge.unofficialLabel ?? "?"}`}
          icon={Icon.ArrowClockwise}
          keywords={["update", "freshclam", "fangfrisch"]}
          actions={
            <ActionPanel>
              <Action
                title="Update Signatures"
                icon={Icon.ArrowClockwise}
                shortcut={SHORTCUT_UPDATE}
                onAction={() => void run("Updating signatures", () => startSignatureUpdate())}
              />
            </ActionPanel>
          }
        />
        <List.Item
          title="Run rkhunter"
          subtitle={status ? rkSubtitle(status) : "Rootkit check (sudo)"}
          icon={{
            source: Icon.Bug,
            tintColor:
              status?.rkhunter?.rootkits
                ? Color.Red
                : status?.rkhunter?.warnings
                  ? Color.Orange
                  : Color.Green,
          }}
          keywords={["rkhunter", "rootkit"]}
          actions={
            <ActionPanel>
              <Action
                title="Run rkhunter"
                icon={Icon.Bug}
                shortcut={SHORTCUT_RK}
                onAction={() => void run("rkhunter", () => startRkhunter())}
              />
              {status?.rkhunterLog ? (
                <Action.Push
                  title="Open rkhunter Log"
                  icon={Icon.BlankDocument}
                  target={<LogView path={status.rkhunterLog} title="rkhunter" />}
                />
              ) : null}
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
