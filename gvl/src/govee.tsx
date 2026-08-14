import { useCallback, useEffect, useRef, useState } from "react";
import { showToast, Toast } from "@vicinae/api";
import { ColorsView } from "./colors-view";
import { ControlView } from "./control-view";
import { DiscoverView } from "./discover-view";
import {
  getConfig,
  getPrefs,
  getStatus,
  gvl,
  gvlStatus,
  hasDaemon,
} from "./gvl";
import { ModesView } from "./modes-view";
import { clamp, parseStepPercent } from "./presets";
import { SchedulesView } from "./schedules-view";
import type { HubTab } from "./shortcuts";
import {
  errMessage,
  formatStatusLine,
  isOn,
  type LightStatus,
} from "./status";
import { TempsView } from "./temps-view";
import type { HubCtx } from "./types";

function maybeSkipOn(args: string[], st: LightStatus | null): string[] {
  if (st && isOn(st) && args[0] === "set" && args[1] === "on" && args.length > 2) {
    return args.slice(2);
  }
  return args;
}

type ApplyJob = {
  args: string[];
  title: string;
  resolve: (status: LightStatus | null) => void;
};

export default function GoveeCommand() {
  const prefs = getPrefs();
  const step = parseStepPercent(prefs.stepPercent);

  const [tab, setTab] = useState<HubTab>("control");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LightStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<HubCtx["config"]>(null);
  const statusRef = useRef<LightStatus | null>(null);
  const applyQ = useRef<{ running: boolean; queued: ApplyJob | null }>({
    running: false,
    queued: null,
  });
  statusRef.current = status;

  const refresh = useCallback(async (): Promise<LightStatus | null> => {
    try {
      const [next, cfg] = await Promise.all([getStatus(), getConfig()]);
      statusRef.current = next;
      setStatus(next);
      setConfig(cfg);
      setError(null);
      return next;
    } catch (err) {
      const message = errMessage(err);
      setError(message);
      await showToast({
        style: Toast.Style.Failure,
        title: "gvl status failed",
        message,
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runApplyJob = useCallback(async (job: ApplyJob) => {
    setLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: job.title,
    });
    try {
      const args = maybeSkipOn(job.args, statusRef.current);
      const next = await gvlStatus(args);
      statusRef.current = next;
      setStatus(next);
      setError(null);
      toast.style = Toast.Style.Success;
      toast.title = formatStatusLine(next);
      job.resolve(next);
    } catch (err) {
      const message = errMessage(err);
      toast.style = Toast.Style.Failure;
      toast.title = `${job.title} failed`;
      toast.message = message;
      job.resolve(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const drainApply = useCallback(async () => {
    const q = applyQ.current;
    if (q.running) return;
    q.running = true;
    try {
      while (q.queued) {
        const job = q.queued;
        q.queued = null;
        await runApplyJob(job);
      }
    } finally {
      q.running = false;
      if (q.queued) void drainApply();
    }
  }, [runApplyJob]);

  const apply = useCallback(
    (args: string[], toastTitle: string): Promise<LightStatus | null> => {
      return new Promise((resolve) => {
        const q = applyQ.current;
        if (q.queued) q.queued.resolve(null);
        q.queued = { args, title: toastTitle, resolve };
        void drainApply();
      });
    },
    [drainApply],
  );

  const run = useCallback(
    async (args: string[], toastTitle: string): Promise<boolean> => {
      setLoading(true);
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: toastTitle,
      });
      try {
        const out = await gvl(args, { json: false });
        toast.style = Toast.Style.Success;
        toast.title = toastTitle;
        if (out) toast.message = out.split("\n")[0];
        return true;
      } catch (err) {
        toast.style = Toast.Style.Failure;
        toast.title = `${toastTitle} failed`;
        toast.message = errMessage(err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const toggle = useCallback(async () => {
    const current = status ?? (await refresh());
    if (!current) return;
    if (isOn(current)) {
      await apply(["off"], "Turning off");
    } else {
      await apply(["on"], "Turning on");
    }
  }, [apply, refresh, status]);

  const stop = useCallback(async () => {
    const ok = await run(["stop"], "Stopping mode");
    if (ok) await refresh();
  }, [refresh, run]);

  const nudge = useCallback(
    async (delta: number) => {
      const current = status ?? (await refresh());
      if (!current) return;
      const next = clamp(current.brightness + delta, 0, 100);
      await apply(["set", "on", "bright", String(next)], `Brightness ${next}%`);
    },
    [apply, refresh, status],
  );

  const ctx: HubCtx = {
    tab,
    setTab,
    loading,
    status,
    error,
    config,
    hasDaemon: hasDaemon(config),
    step,
    refresh,
    apply,
    run,
    toggle,
    stop,
    nudge,
  };

  switch (tab) {
    case "colors":
      return <ColorsView ctx={ctx} />;
    case "temps":
      return <TempsView ctx={ctx} />;
    case "modes":
      return <ModesView ctx={ctx} />;
    case "schedules":
      return <SchedulesView ctx={ctx} />;
    case "discover":
      return <DiscoverView ctx={ctx} />;
    default:
      return <ControlView ctx={ctx} />;
  }
}
