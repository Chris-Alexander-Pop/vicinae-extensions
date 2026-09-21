export type DndPrefs = {
  enabled: boolean;
  schedule_enabled: boolean;
  start_time: string;
  end_time: string;
  weekdays_only: boolean;
};

export type NotificationAction = {
  key: string;
  label: string;
};

export type NotificationItem = {
  id: number;
  server_id?: number;
  app_name: string;
  summary: string;
  body: string;
  icon?: string;
  urgency: number;
  timestamp: number;
  actions: NotificationAction[];
  closed?: boolean;
};

export const DEFAULT_DND: DndPrefs = {
  enabled: false,
  schedule_enabled: false,
  start_time: "22:00",
  end_time: "07:00",
  weekdays_only: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function adaptDndPrefs(data: unknown): DndPrefs {
  if (!isRecord(data)) return { ...DEFAULT_DND };
  return {
    enabled: data.enabled === true,
    schedule_enabled: data.schedule_enabled === true,
    start_time: optionalString(data.start_time) ?? DEFAULT_DND.start_time,
    end_time: optionalString(data.end_time) ?? DEFAULT_DND.end_time,
    weekdays_only: data.weekdays_only !== false,
  };
}

function adaptNotificationItem(item: unknown): NotificationItem | null {
  if (!isRecord(item)) return null;
  const id = item.id;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  const actions: NotificationAction[] = [];
  if (Array.isArray(item.actions)) {
    for (const action of item.actions) {
      if (!isRecord(action)) continue;
      const key = optionalString(action.key);
      const label = optionalString(action.label);
      if (key && label) actions.push({ key, label });
    }
  }
  return {
    id,
    server_id:
      typeof item.server_id === "number" && Number.isFinite(item.server_id)
        ? item.server_id
        : undefined,
    app_name: optionalString(item.app_name) ?? "unknown",
    summary: optionalString(item.summary) ?? "",
    body: optionalString(item.body) ?? "",
    icon: optionalString(item.icon),
    urgency: typeof item.urgency === "number" ? item.urgency : 1,
    timestamp: typeof item.timestamp === "number" ? item.timestamp : 0,
    actions,
    closed: item.closed === true,
  };
}

export function adaptNotificationList(data: unknown): NotificationItem[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(adaptNotificationItem)
    .filter((item): item is NotificationItem => item != null);
}

export function adaptMutedApps(data: unknown): string[] {
  if (!isRecord(data) || !Array.isArray(data.muted_apps)) return [];
  return data.muted_apps.filter((name): name is string => typeof name === "string");
}
