import { useCallback, useEffect, useState } from "react";
import { Detail } from "@vicinae/api";
import { isRunInProgress, runnerInstalled } from "./runner";
import { StartForm } from "./start-form";
import { Tracker } from "./tracker";

type Mode = "loading" | "missing-runner" | "form" | "tracker";

export default function TopgradeCommand() {
  const [mode, setMode] = useState<Mode>("loading");

  const resolve = useCallback(async () => {
    if (!runnerInstalled()) {
      setMode("missing-runner");
      return;
    }
    if (await isRunInProgress()) {
      setMode("tracker");
      return;
    }
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
bash ~/Engineering/Productivity/vicinae/topgrade/scripts/install-runner.sh
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
      />
    );
  }

  return (
    <StartForm
      onStarted={() => {
        setMode("tracker");
      }}
    />
  );
}
