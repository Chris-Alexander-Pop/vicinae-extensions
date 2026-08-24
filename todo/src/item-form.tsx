import {
  Action,
  ActionPanel,
  Form,
  Icon,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { getTodoPrefs } from "./prefs";
import {
  isPriority,
  isReminderMode,
  parseHm,
  PRIORITIES,
  priorityLabel,
  reminderModeLabel,
  REMINDER_MODES,
  type Priority,
  type ReminderMode,
} from "./priority";
import { addItem, updateItem, type TodoItem } from "./store";

type Values = {
  title: string;
  priority: string;
  reminderMode: string;
  reminderTime: string;
};

type Props = {
  item?: TodoItem;
  onSaved: () => void;
};

export function ItemForm({ item, onSaved }: Props) {
  const { pop } = useNavigation();
  const editing = !!item;
  const prefs = getTodoPrefs();

  const onSubmit = async (values: Values) => {
    const title = (values.title ?? "").trim();
    if (!title) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Title required",
      });
      return;
    }

    const priority: Priority = isPriority(values.priority)
      ? values.priority
      : "none";
    const reminderMode: ReminderMode = isReminderMode(values.reminderMode)
      ? values.reminderMode
      : "off";
    const reminderTime = parseHm(values.reminderTime);

    if (reminderMode !== "off" && !reminderTime) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Time required",
        message: "Use HH:MM (24-hour) when a reminder is set",
      });
      return;
    }

    try {
      if (editing) {
        const saved = await updateItem(item.id, {
          title,
          priority,
          reminderMode,
          reminderTime,
        });
        if (!saved) {
          await showToast({
            style: Toast.Style.Failure,
            title: "Task not found",
          });
          return;
        }
        await showToast({
          style: Toast.Style.Success,
          title: "Updated",
          message: saved.title,
        });
      } else {
        const saved = await addItem({
          title,
          priority,
          reminderMode,
          reminderTime,
        });
        await showToast({
          style: Toast.Style.Success,
          title: "Added",
          message: saved.title,
        });
      }
      onSaved();
      pop();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: editing ? "Failed to update" : "Failed to add",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Form
      navigationTitle={editing ? "Edit Task" : "Add Task"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={editing ? "Save" : "Add"}
            icon={Icon.Checkmark}
            onSubmit={(v) => void onSubmit(v as Values)}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="What to do next"
        defaultValue={item?.title ?? ""}
        autoFocus
      />
      <Form.Dropdown
        id="priority"
        title="Priority"
        defaultValue={item?.priority ?? prefs.defaultPriority}
      >
        {PRIORITIES.map((priority) => (
          <Form.Dropdown.Item
            key={priority}
            title={priorityLabel(priority)}
            value={priority}
          />
        ))}
      </Form.Dropdown>
      <Form.Separator />
      <Form.Description text="Reminders ping via desktop notification at this time of day. If Vicinae starts after the time, it waits the boot delay (extension preferences) then fires." />
      <Form.Dropdown
        id="reminderMode"
        title="Reminder"
        defaultValue={item?.reminderMode ?? prefs.defaultReminderMode}
      >
        {REMINDER_MODES.map((mode) => (
          <Form.Dropdown.Item
            key={mode}
            title={reminderModeLabel(mode)}
            value={mode}
          />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="reminderTime"
        title="Time"
        placeholder="HH:MM"
        defaultValue={item?.reminderTime ?? prefs.defaultReminderTime}
        info="24-hour local time. Ignored when Reminder is Off."
      />
    </Form>
  );
}
