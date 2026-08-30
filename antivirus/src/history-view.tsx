import { useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { HitsView } from "./hits-view";
import { LogView } from "./log-view";
import {
  canResumeRun,
  kindLabel,
  readHistory,
  type ScanRun,
  visibleHits,
} from "./history";
import { resumeScan } from "./jobs";
import { formatDuration } from "./status";

function stateColor(state: string): Color {
  if (state === "done") return Color.Green;
  if (state === "interrupted") return Color.Orange;
  if (state === "cancelled") return Color.SecondaryText;
  return Color.Blue;
}

function runMarkdown(run: ScanRun): string {
  const hits = run.hits || [];
  const lines: string[] = [
    `## ${kindLabel(run.kind)} · ${run.state}`,
    "",
    `- **Started:** ${run.startedAt ?? "—"}`,
    `- **Ended:** ${run.endedAt ?? "—"}`,
    `- **Elapsed:** ${formatDuration(run.elapsedSec)}`,
    `- **Files:** ${run.done.toLocaleString()}${run.total != null ? ` / ${run.total.toLocaleString()}` : ""}`,
    `- **Progress:** ${run.percent != null ? `${run.percent}%` : "—"}`,
    `- **Infected:** ${run.infected}`,
  ];
  if (run.targets?.length) {
    lines.push("", "**Targets**", "", ...run.targets.map((t) => `- \`${t}\``));
  }
  if (hits.length) {
    lines.push("", "**Hits**", "");
    for (const hit of hits.slice(0, 40)) {
      lines.push(`- \`${hit.path}\` — ${hit.signature}`);
    }
    if (hits.length > 40) lines.push(`- _${hits.length - 40} more_`);
  }
  if (run.log) lines.push("", `_Log:_ \`${run.log}\``);
  return lines.join("\n");
}

export function HistoryView() {
  const { push } = useNavigation();
  const [tick, setTick] = useState(0);
  const runs = useMemo(() => readHistory(), [tick]);

  const resume = async (id: string) => {
    try {
      await resumeScan(id);
      await showToast({ style: Toast.Style.Success, title: "Resuming scan" });
      setTick((n) => n + 1);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Resume failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (!runs.length) {
    return (
      <List navigationTitle="Scan history">
        <List.EmptyView
          icon={Icon.Clock}
          title="No scans yet"
          description="Finished and interrupted scans show up here"
        />
      </List>
    );
  }

  return (
    <List
      navigationTitle="Scan history"
      searchBarPlaceholder="Filter scans…"
      isShowingDetail
    >
      {runs.map((run) => {
        const hits = visibleHits(run.hits || []);
        const resumable = canResumeRun(run);
        return (
          <List.Item
            key={run.id}
            title={`${kindLabel(run.kind)} · ${run.startedAt ?? run.id}`}
            subtitle={runSubtitle(run)}
            icon={{
              source: resumable ? Icon.Play : Icon.Clock,
              tintColor: stateColor(run.state),
            }}
            accessories={[
              {
                tag: {
                  value: run.state,
                  color: stateColor(run.state),
                },
              },
              hits.length
                ? {
                    tag: {
                      value: `${hits.length} hit${hits.length === 1 ? "" : "s"}`,
                      color: Color.Red,
                    },
                  }
                : { text: formatDuration(run.elapsedSec) },
            ]}
            keywords={[run.kind, run.state, ...(run.targets || [])]}
            detail={<List.Item.Detail markdown={runMarkdown(run)} />}
            actions={
              <ActionPanel>
                {resumable ? (
                  <Action
                    title="Resume This Scan"
                    icon={Icon.Play}
                    onAction={() => void resume(run.id)}
                  />
                ) : null}
                {hits.length ? (
                  <Action.Push
                    title="Open Hits"
                    icon={Icon.Warning}
                    target={
                      <HitsView
                        hits={run.hits}
                        title={`Hits · ${run.id}`}
                        onChange={() => setTick((n) => n + 1)}
                      />
                    }
                  />
                ) : null}
                {run.log ? (
                  <Action.Push
                    title="Open Log"
                    icon={Icon.BlankDocument}
                    target={<LogView path={run.log} title={`Log · ${run.id}`} />}
                  />
                ) : null}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

export function runSubtitle(run: ScanRun): string {
  const files = `${run.done.toLocaleString()}${run.total != null ? `/${run.total.toLocaleString()}` : ""} files`;
  const extra = run.infected ? ` · ${run.infected} infected` : "";
  return `${run.state} · ${files}${extra}`;
}
