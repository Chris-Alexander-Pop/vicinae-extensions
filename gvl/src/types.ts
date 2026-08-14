import type { GvlConfig, LightStatus } from "./status";
import type { HubTab } from "./shortcuts";

export type HubCtx = {
  tab: HubTab;
  setTab: (tab: HubTab) => void;
  loading: boolean;
  status: LightStatus | null;
  error: string | null;
  config: GvlConfig | null;
  hasDaemon: boolean;
  step: number;
  refresh: () => Promise<LightStatus | null>;
  apply: (args: string[], toastTitle: string) => Promise<LightStatus | null>;
  run: (args: string[], toastTitle: string) => Promise<boolean>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
  nudge: (delta: number) => Promise<void>;
};
