import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { mergeSchedule, parseHm } from "./dnd";
import type { DndPrefs } from "./types";

type Values = {
  start_time: string;
  end_time: string;
  weekdays_only: boolean;
  schedule_enabled: boolean;
};

type Props = {
  prefs: DndPrefs;
  onSave: (next: DndPrefs) => Promise<void>;
};

export function ScheduleForm({ prefs, onSave }: Props) {
  const { pop } = useNavigation();

  const onSubmit = async (values: Values) => {
    const start = (values.start_time ?? "").trim();
    const end = (values.end_time ?? "").trim();
    if (!parseHm(start) || !parseHm(end)) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Time required",
        message: "Use HH:MM (24-hour) for start and end",
      });
      return;
    }

    const next = mergeSchedule(prefs, {
      start_time: start,
      end_time: end,
      weekdays_only: values.weekdays_only === true,
      schedule_enabled: values.schedule_enabled === true,
    });

    try {
      await onSave(next);
      await showToast({
        style: Toast.Style.Success,
        title: next.schedule_enabled ? "Quiet hours saved" : "Schedule off",
        message: `${next.start_time} to ${next.end_time}`,
      });
      pop();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to save schedule",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Form
      navigationTitle="Quiet Hours"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save"
            icon={Icon.Checkmark}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Aura stores this on the sidecar. Manual DND still overrides the window." />
      <Form.Checkbox
        id="schedule_enabled"
        title="Schedule"
        label="Enable quiet hours"
        defaultValue={prefs.schedule_enabled}
      />
      <Form.TextField
        id="start_time"
        title="Start"
        placeholder="22:00"
        defaultValue={prefs.start_time}
        info="24-hour local time"
      />
      <Form.TextField
        id="end_time"
        title="End"
        placeholder="07:00"
        defaultValue={prefs.end_time}
        info="May cross midnight"
      />
      <Form.Checkbox
        id="weekdays_only"
        title="Days"
        label="Weekdays only"
        defaultValue={prefs.weekdays_only}
      />
    </Form>
  );
}
