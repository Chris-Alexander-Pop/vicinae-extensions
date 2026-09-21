import {
  adaptDndPrefs,
  adaptMutedApps,
  adaptNotificationList,
  type DndPrefs,
  type NotificationItem,
} from "./types";
import { sidecarCall, type SidecarDeps } from "./sidecar";

export type AuraClient = {
  getDnd(): Promise<DndPrefs>;
  setDnd(dnd: DndPrefs): Promise<void>;
  listNotifications(limit?: number): Promise<NotificationItem[]>;
  dismissNotification(id: number): Promise<void>;
  clearAllNotifications(): Promise<void>;
  invokeAction(id: number, action_key: string): Promise<void>;
  getMutedApps(): Promise<string[]>;
  setMutedApps(muted_apps: string[]): Promise<void>;
};

export function createAuraClient(
  baseUrl?: string,
  deps?: SidecarDeps,
): AuraClient {
  const call = (method: string, params?: Record<string, unknown>) =>
    sidecarCall(method, params, { baseUrl, deps });

  return {
    async getDnd() {
      return adaptDndPrefs(await call("Notifications.GetDnd"));
    },
    async setDnd(dnd) {
      await call("Notifications.SetDnd", { dnd });
    },
    async listNotifications(limit = 80) {
      return adaptNotificationList(await call("Notifications.List", { limit }));
    },
    async dismissNotification(id) {
      await call("Notifications.Dismiss", { id });
    },
    async clearAllNotifications() {
      await call("Notifications.ClearAll");
    },
    async invokeAction(id, action_key) {
      await call("Notifications.InvokeAction", { id, action_key });
    },
    async getMutedApps() {
      return adaptMutedApps(await call("Notifications.GetRules"));
    },
    async setMutedApps(muted_apps) {
      await call("Notifications.SetRules", { rules: { muted_apps } });
    },
  };
}
