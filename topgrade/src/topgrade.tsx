import { useCallback, useEffect, useState } from "react";
import { Detail } from "@vicinae/api";
import { HistoryDetail } from "./history-detail";
import {
  isRunInProgress,
  reconcileStaleStatus,
  runnerInstalled,
} from "./runner";
import { StartForm } from "./start-form";
import { Tracker } from "./tracker";

type Mode = "loading" | "missing-runner" | "form" | "tracker" | "history";

export default function TopgradeCommand() {
  const [mode, setMode] = useState<Mode>("loading");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    if (!runnerInstalled()) {
      setMode("missing-runner");
      return;
    }
    if (await isRunInProgress()) {
      setMode("tracker");
      return;
    }
    await reconcileStaleStatus();
    setMode("form");
  }, []);

  useEffect(() => {
    void resolve();
  }, [resolve]);

  if (mode === "loading") {
    return <Detail isLoading markdown="Checking Topgrade runner…" />;
  }

  if (mode === "missing-runner") {
    return (
      <Detail
        markdown={`# Runner not installed

Install once:

\`\`\`bash
bash scripts/install-runner.sh
\`\`\`

Then reopen **Topgrade**.`}
        navigationTitle="Topgrade"
      />
    );
  }

  if (mode === "tracker") {
    return (
      <Tracker
        onIdle={() => {
          setMode("form");
        }}
        onRetryStarted={() => {
          setMode("tracker");
        }}
      />
    );
  }

  if (mode === "history" && historyId) {
    return (
      <HistoryDetail
        runId={historyId}
        onBack={() => {
          setHistoryId(null);
          setMode("form");
        }}
        onRetryStarted={() => {
          setHistoryId(null);
          setMode("tracker");
        }}
      />
    );
  }

  return (
    <StartForm
      onStarted={() => {
        setMode("tracker");
      }}
      onOpenHistory={(id) => {
        setHistoryId(id);
        setMode("history");
      }}
    />
  );
}
