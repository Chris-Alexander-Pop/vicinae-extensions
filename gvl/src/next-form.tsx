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
import {
  errMessage,
  formatUpcoming,
  type ScheduleEntry,
} from "./status";

type Values = {
  action: string;
  count: string;
  date: string;
  time: string;
  nextDay: boolean;
  duration: string;
  fromType: string;
  fromColor: string;
  fromTemp: string;
  fromBrightness: string;
  toType: string;
  toColor: string;
  toTemp: string;
  toBrightness: string;
  endOff: string;
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

function clockFromIso(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function lookColor(entry: ScheduleEntry, which: "from" | "to"): string {
  const look = entry[which];
  if (look?.color) return namedColorFor(look.color) ?? rgbHex(look.color);
  return which === "from" ? "blue" : "red";
}

function lookTemp(entry: ScheduleEntry, which: "from" | "to"): string {
  const look = entry[which];
  if (look?.temp && look.temp > 0) return namedTempFor(look.temp) ?? String(look.temp);
  return which === "from" ? "neutral" : "daylight";
}

export function NextOccurrenceForm({
  entry,
  onSaved,
}: {
  entry: ScheduleEntry;
  onSaved: () => void;
}) {
  const { pop } = useNavigation();
  const first = entry.next?.find((p) => !p.skip) ?? entry.next?.[0];
  const defaultTime = first?.at || clockFromIso(entry.upcoming) || entry.at;
  const defaultNextDay =
    first?.next_day ?? (entry.kind === "sleep" && defaultTime < entry.at);
  const [action, setAction] = useState("move");
  const [fromType, setFromType] = useState("keep");
  const [toType, setToType] = useState("keep");

  const onSubmit = async (values: Values) => {
    const count = Math.round(Number(values.count));
    if (!Number.isFinite(count) || count < 1 || count > 14) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Count must be 1–14",
      });
      return;
    }
    const date = (values.date ?? "").trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Date must be YYYY-MM-DD",
      });
      return;
    }

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `Updating next ${entry.id}`,
    });

    try {
      if (values.action === "skip") {
        const args = ["schedule", "skip", entry.id, "--count", String(count)];
        if (date) args.push("--date", date);
        const out = await gvl(args, { json: false });
        toast.style = Toast.Style.Success;
        toast.title = out.split("\n")[0] || `Skipped ${entry.id}`;
        onSaved();
        pop();
        return;
      }

      const time = (values.time ?? "").trim();
      if (!/^\d{2}:\d{2}$/.test(time)) {
        toast.style = Toast.Style.Failure;
        toast.title = "Time must be HH:MM";
        return;
      }

      const timeChanged = time !== entry.at || values.nextDay === true;
      const durRaw = (values.duration ?? "").trim();
      let duration: number | undefined;
      if (durRaw) {
        duration = Math.round(Number(durRaw));
        if (!Number.isFinite(duration) || duration <= 0) {
          toast.style = Toast.Style.Failure;
          toast.title = "Duration must be minutes > 0, or empty to keep";
          return;
        }
      }
      const fromKeep = (values.fromType || fromType || "keep") === "keep";
      const toKeep = (values.toType || toType || "keep") === "keep";
      const endKeep = (values.endOff || "keep") === "keep";
      if (!timeChanged && duration == null && fromKeep && toKeep && endKeep) {
        toast.style = Toast.Style.Failure;
        toast.title = "Change time, duration, or a look";
        toast.message = "Or pick Skip. Recurring schedule is unchanged either way.";
        return;
      }

      const args = ["schedule", "next", entry.id, "--count", String(count)];
      if (date) args.push("--date", date);
      if (timeChanged) {
        args.push("--at", time);
        if (values.nextDay) args.push("--next-day");
      }
      if (duration != null) args.push("--duration", String(duration));
      if (!fromKeep) {
        const fromB = Number(values.fromBrightness);
        if (!Number.isFinite(fromB) || fromB < 0 || fromB > 100) {
          toast.style = Toast.Style.Failure;
          toast.title = "From brightness must be 0–100";
          return;
        }
        args.push("--from-brightness", String(Math.round(fromB)));
        if ((values.fromType || fromType) === "temp") {
          args.push("--from-temp", values.fromTemp || "neutral");
        } else {
          args.push("--from-color", values.fromColor || "blue");
        }
      }
      if (!toKeep) {
        const toB = Number(values.toBrightness);
        if (!Number.isFinite(toB) || toB < 0 || toB > 100) {
          toast.style = Toast.Style.Failure;
          toast.title = "To brightness must be 0–100";
          return;
        }
        args.push("--to-brightness", String(Math.round(toB)));
        if ((values.toType || toType) === "temp") {
          args.push("--to-temp", values.toTemp || "daylight");
        } else {
          args.push("--to-color", values.toColor || "red");
        }
      }
      if (!endKeep) {
        args.push(values.endOff === "no" ? "--end-off=false" : "--end-off");
      }

      const out = await gvl(args, { json: false });
      toast.style = Toast.Style.Success;
      toast.title = out.split("\n")[0] || `Patched ${entry.id}`;
      onSaved();
      pop();
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "Next occurrence failed";
      toast.message = errMessage(err);
    }
  };

  const nextLabel = formatUpcoming(entry.upcoming) || entry.at;

  return (
    <Form
      navigationTitle={`Next ${entry.id}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Apply to Next Occurrence"
            icon={Icon.Clock}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        text={`Recurring ${entry.kind} stays ${entry.at} ${entry.timezone}. This only changes the next fire${entry.upcoming ? ` (currently ${nextLabel})` : ""}.`}
      />
      <Form.Dropdown
        id="action"
        title="Action"
        value={action}
        onChange={setAction}
      >
        <Form.Dropdown.Item title="Change time / look" value="move" />
        <Form.Dropdown.Item title="Skip (do not fire)" value="skip" />
      </Form.Dropdown>
      <Form.TextField
        id="count"
        title="Occurrences"
        placeholder="1"
        defaultValue="1"
        info="How many upcoming fires to skip or move (1–14)"
      />
      <Form.TextField
        id="date"
        title="First date"
        placeholder="next occurrence"
        info="Optional YYYY-MM-DD. Empty = the next matching day."
      />
      <Form.Separator />
      <Form.TextField
        id="time"
        title="Time"
        placeholder="HH:MM"
        defaultValue={defaultTime}
        autoFocus
        info="Ignored when Action is Skip"
      />
      <Form.Checkbox
        id="nextDay"
        title="Next calendar day"
        label="Fire this time on the day after the occurrence"
        defaultValue={defaultNextDay}
        info="Sleep at 01:00 after a 23:00 slot"
      />
      <Form.TextField
        id="duration"
        title="Duration (min)"
        placeholder="keep"
        defaultValue={first?.duration_min ? String(first.duration_min) : ""}
        info="Empty keeps the recurring ramp length"
      />
      <Form.Separator />
      <Form.Dropdown
        id="fromType"
        title="From look"
        value={fromType}
        onChange={setFromType}
      >
        <Form.Dropdown.Item title="Keep recurring" value="keep" />
        <Form.Dropdown.Item title="Color" value="color" />
        <Form.Dropdown.Item title="Temperature" value="temp" />
      </Form.Dropdown>
      {fromType === "color" ? (
        <Form.Dropdown id="fromColor" title="From color" defaultValue={lookColor(entry, "from")}>
          {colorItems(lookColor(entry, "from"))}
        </Form.Dropdown>
      ) : null}
      {fromType === "temp" ? (
        <Form.Dropdown id="fromTemp" title="From temp" defaultValue={lookTemp(entry, "from")}>
          {tempItems(lookTemp(entry, "from"))}
        </Form.Dropdown>
      ) : null}
      {fromType === "keep" ? null : (
        <Form.TextField
          id="fromBrightness"
          title="From brightness"
          defaultValue={String(entry.from?.brightness ?? 5)}
        />
      )}
      <Form.Separator />
      <Form.Dropdown
        id="toType"
        title="To look"
        value={toType}
        onChange={setToType}
      >
        <Form.Dropdown.Item title="Keep recurring" value="keep" />
        <Form.Dropdown.Item title="Color" value="color" />
        <Form.Dropdown.Item title="Temperature" value="temp" />
      </Form.Dropdown>
      {toType === "color" ? (
        <Form.Dropdown id="toColor" title="To color" defaultValue={lookColor(entry, "to")}>
          {colorItems(lookColor(entry, "to"))}
        </Form.Dropdown>
      ) : null}
      {toType === "temp" ? (
        <Form.Dropdown id="toTemp" title="To temp" defaultValue={lookTemp(entry, "to")}>
          {tempItems(lookTemp(entry, "to"))}
        </Form.Dropdown>
      ) : null}
      {toType === "keep" ? null : (
        <Form.TextField
          id="toBrightness"
          title="To brightness"
          defaultValue={String(entry.to?.brightness ?? 55)}
        />
      )}
      {entry.kind === "sleep" ? (
        <Form.Dropdown id="endOff" title="End off" defaultValue="keep">
          <Form.Dropdown.Item title="Keep recurring" value="keep" />
          <Form.Dropdown.Item title="Turn off when ramp ends" value="yes" />
          <Form.Dropdown.Item title="Leave on" value="no" />
        </Form.Dropdown>
      ) : (
        <Form.Dropdown id="endOff" title="End off" defaultValue="keep">
          <Form.Dropdown.Item title="Keep recurring" value="keep" />
        </Form.Dropdown>
      )}
    </Form>
  );
}
