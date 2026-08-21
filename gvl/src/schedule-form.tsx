import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@vicinae/api";
import { useState } from "react";
import { gvl } from "./gvl";
import {
  NAMED_COLORS,
  namedColorFor,
  namedTempFor,
  rgbHex,
  TEMP_PRESETS,
} from "./presets";
import { daysPreset, errMessage, type ScheduleEntry } from "./status";

type Values = {
  time: string;
  duration: string;
  days: string;
  daysCustom: string;
  tz: string;
  id: string;
  fromType: string;
  fromColor: string;
  fromTemp: string;
  fromBrightness: string;
  toType: string;
  toColor: string;
  toTemp: string;
  toBrightness: string;
  endOff: boolean;
};

function colorItems(extra?: string) {
  const known = new Set(NAMED_COLORS.map((c) => c.name));
  const extras =
    extra && !known.has(extra)
      ? [<Form.Dropdown.Item key={extra} title={extra} value={extra} />]
      : [];
  return [
    ...extras,
    ...NAMED_COLORS.map((c) => (
      <Form.Dropdown.Item key={c.name} title={c.name} value={c.name} />
    )),
  ];
}

function tempItems(extra?: string) {
  const known = new Set(TEMP_PRESETS.map((t) => t.name));
  const extras =
    extra && !known.has(extra)
      ? [
          <Form.Dropdown.Item
            key={extra}
            title={`${extra}K`}
            value={extra}
          />,
        ]
      : [];
  return [
    ...extras,
    ...TEMP_PRESETS.map((t) => (
      <Form.Dropdown.Item
        key={t.name}
        title={`${t.name} · ${t.kelvin}K`}
        value={t.name}
      />
    )),
  ];
}

function lookType(entry: ScheduleEntry | undefined, which: "from" | "to"): "color" | "temp" {
  const look = entry?.[which];
  if (look?.temp && look.temp > 0) return "temp";
  return "color";
}

function lookColor(entry: ScheduleEntry | undefined, which: "from" | "to"): string {
  const look = entry?.[which];
  if (look?.color) return namedColorFor(look.color) ?? rgbHex(look.color);
  return which === "from" ? "blue" : "red";
}

function lookTemp(entry: ScheduleEntry | undefined, which: "from" | "to"): string {
  const look = entry?.[which];
  if (look?.temp && look.temp > 0) return namedTempFor(look.temp) ?? String(look.temp);
  return which === "from" ? "neutral" : "daylight";
}

export function ScheduleForm({
  kind,
  existing,
  onSaved,
}: {
  kind: "wake" | "sleep";
  existing?: ScheduleEntry;
  onSaved: () => void;
}) {
  const { pop } = useNavigation();
  const editing = Boolean(existing);
  const resolvedKind = (existing?.kind === "sleep" ? "sleep" : kind) as
    | "wake"
    | "sleep";

  const [fromType, setFromType] = useState<"color" | "temp">(
    existing ? lookType(existing, "from") : resolvedKind === "wake" ? "color" : "temp",
  );
  const [toType, setToType] = useState<"color" | "temp">(
    existing ? lookType(existing, "to") : "temp",
  );
  const [daysMode, setDaysMode] = useState(existing ? daysPreset(existing.days) : "weekdays");

  const defaults = existing
    ? {
        time: existing.at,
        duration: String(existing.duration_min || 30),
        days: daysPreset(existing.days),
        daysCustom: existing.days?.join(",") ?? "",
        tz: existing.timezone || "America/New_York",
        id: existing.id,
        fromType: lookType(existing, "from"),
        fromColor: lookColor(existing, "from") || "blue",
        fromTemp: lookTemp(existing, "from"),
        fromBrightness: String(existing.from?.brightness ?? (resolvedKind === "wake" ? 5 : 40)),
        toType: lookType(existing, "to"),
        toColor: lookColor(existing, "to") || "red",
        toTemp: lookTemp(existing, "to"),
        toBrightness: String(existing.to?.brightness ?? (resolvedKind === "wake" ? 55 : 5)),
        endOff: existing.end_off ?? resolvedKind === "sleep",
      }
    : {
        time: resolvedKind === "wake" ? "07:00" : "23:00",
        duration: resolvedKind === "wake" ? "30" : "20",
        days: "weekdays",
        daysCustom: "",
        tz: "America/New_York",
        id: "",
        fromType: resolvedKind === "wake" ? "color" : "temp",
        fromColor: "blue",
        fromTemp: "neutral",
        fromBrightness: resolvedKind === "wake" ? "5" : "40",
        toType: "temp",
        toColor: "red",
        toTemp: resolvedKind === "wake" ? "daylight" : "candle",
        toBrightness: resolvedKind === "wake" ? "55" : "5",
        endOff: true,
      };

  const onSubmit = async (values: Values) => {
    const time = (values.time ?? "").trim();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Time must be HH:MM",
      });
      return;
    }
    const duration = Number(values.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Duration must be minutes > 0",
      });
      return;
    }
    const fromB = Number(values.fromBrightness);
    const toB = Number(values.toBrightness);
    if (
      !Number.isFinite(fromB) ||
      !Number.isFinite(toB) ||
      fromB < 0 ||
      fromB > 100 ||
      toB < 0 ||
      toB > 100
    ) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Brightness must be 0–100",
      });
      return;
    }

    let days = values.days || daysMode || "weekdays";
    if (days === "custom") {
      days = (values.daysCustom || "").trim();
      if (!days) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Custom days required",
          message: "e.g. mon,wed,fri",
        });
        return;
      }
    }

    const cmd = resolvedKind === "sleep" ? "set-sleep" : "set-wake";
    const args = [
      "schedule",
      cmd,
      time,
      "--duration",
      String(Math.round(duration)),
      "--days",
      days,
      "--tz",
      (values.tz || "America/New_York").trim(),
      "--from-brightness",
      String(Math.round(fromB)),
      "--to-brightness",
      String(Math.round(toB)),
    ];
    if ((values.fromType || fromType) === "temp") {
      args.push("--from-temp", values.fromTemp || "neutral");
    } else {
      args.push("--from-color", values.fromColor || "blue");
    }
    if ((values.toType || toType) === "temp") {
      args.push("--to-temp", values.toTemp || "daylight");
    } else {
      args.push("--to-color", values.toColor || "red");
    }
    const id = (values.id || existing?.id || "").trim();
    if (id) args.push("--id", id);
    if (resolvedKind === "sleep") {
      args.push(values.endOff === false ? "--end-off=false" : "--end-off");
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: editing ? `Saving ${id || time}` : `Creating ${resolvedKind}`,
    });
    try {
      const out = await gvl(args, { json: false });
      toast.style = Toast.Style.Success;
      toast.title = out.split("\n")[0] || "Saved schedule";
      onSaved();
      pop();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Save failed";
      toast.message = errMessage(err);
    }
  };

  return (
    <Form
      navigationTitle={
        editing ? `Edit ${existing?.id}` : `New ${resolvedKind} schedule`
      }
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={editing ? "Save Schedule" : "Create Schedule"}
            icon={resolvedKind === "sleep" ? Icon.Moon : Icon.Sunrise}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        text={
          resolvedKind === "wake"
            ? "Ramp from a dim start look to a bright end look at the given time."
            : "Ramp toward a warm/low look. Optionally power off when the ramp finishes."
        }
      />
      <Form.TextField
        id="time"
        title="Time"
        placeholder="HH:MM"
        defaultValue={defaults.time}
        autoFocus
      />
      <Form.TextField
        id="duration"
        title="Duration (min)"
        defaultValue={defaults.duration}
      />
      <Form.Dropdown
        id="days"
        title="Days"
        value={daysMode}
        onChange={(v) => setDaysMode(v as "everyday" | "weekdays" | "weekend" | "custom")}
      >
        <Form.Dropdown.Item title="Weekdays" value="weekdays" />
        <Form.Dropdown.Item title="Weekend" value="weekend" />
        <Form.Dropdown.Item title="Everyday" value="everyday" />
        <Form.Dropdown.Item title="Custom" value="custom" />
      </Form.Dropdown>
      {daysMode === "custom" ? (
        <Form.TextField
          id="daysCustom"
          title="Custom days"
          placeholder="mon,tue,wed"
          defaultValue={defaults.daysCustom}
        />
      ) : null}
      <Form.TextField id="tz" title="Timezone" defaultValue={defaults.tz} />
      <Form.TextField
        id="id"
        title="ID"
        placeholder="auto from kind + time"
        defaultValue={defaults.id}
      />
      <Form.Separator />
      <Form.Dropdown
        id="fromType"
        title="From"
        value={fromType}
        onChange={(v) => setFromType(v === "temp" ? "temp" : "color")}
      >
        <Form.Dropdown.Item title="Color" value="color" />
        <Form.Dropdown.Item title="Temperature" value="temp" />
      </Form.Dropdown>
      {fromType === "color" ? (
        <Form.Dropdown id="fromColor" title="From color" defaultValue={defaults.fromColor}>
          {colorItems(defaults.fromColor)}
        </Form.Dropdown>
      ) : (
        <Form.Dropdown id="fromTemp" title="From temp" defaultValue={defaults.fromTemp}>
          {tempItems(defaults.fromTemp)}
        </Form.Dropdown>
      )}
      <Form.TextField
        id="fromBrightness"
        title="From brightness"
        defaultValue={defaults.fromBrightness}
      />
      <Form.Separator />
      <Form.Dropdown
        id="toType"
        title="To"
        value={toType}
        onChange={(v) => setToType(v === "color" ? "color" : "temp")}
      >
        <Form.Dropdown.Item title="Color" value="color" />
        <Form.Dropdown.Item title="Temperature" value="temp" />
      </Form.Dropdown>
      {toType === "color" ? (
        <Form.Dropdown id="toColor" title="To color" defaultValue={defaults.toColor}>
          {colorItems(defaults.toColor)}
        </Form.Dropdown>
      ) : (
        <Form.Dropdown id="toTemp" title="To temp" defaultValue={defaults.toTemp}>
          {tempItems(defaults.toTemp)}
        </Form.Dropdown>
      )}
      <Form.TextField
        id="toBrightness"
        title="To brightness"
        defaultValue={defaults.toBrightness}
      />
      {resolvedKind === "sleep" ? (
        <Form.Checkbox
          id="endOff"
          title="End"
          label="Turn off when the ramp finishes"
          defaultValue={defaults.endOff}
        />
      ) : null}
    </Form>
  );
}
