import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  type Keyboard,
} from "@vicinae/api";
import { ItemForm } from "./item-form";
import { reminderSubtitle } from "./notify";
import { priorityLabel, type Priority } from "./priority";
import {
  clearDone,
  doneItems,
  moveItem,
  queueItems,
  readStore,
  removeItem,
  toggleDone,
  type TodoItem,
} from "./store";

const SHORTCUT_NEW: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "n" };
const SHORTCUT_TOGGLE: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "t" };
const SHORTCUT_EDIT: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "e" };
const SHORTCUT_UP: Keyboard.Shortcut = { modifiers: ["ctrl"], key: "arrowUp" };
const SHORTCUT_DOWN: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "arrowDown",
};
const SHORTCUT_DELETE: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "backspace",
};

function priorityColor(priority: Priority): Color {
  switch (priority) {
    case "urgent":
      return Color.Red;
    case "high":
      return Color.Orange;
    case "medium":
      return Color.Blue;
    case "low":
      return Color.Yellow;
    case "none":
      return Color.SecondaryText;
  }
}

function itemIcon(item: TodoItem) {
  if (item.done) {
    return { source: Icon.CheckCircle, tintColor: Color.Green };
  }
  switch (item.priority) {
    case "urgent":
      return { source: Icon.Exclamationmark, tintColor: Color.Red };
    case "high":
    case "medium":
    case "low":
      return { source: Icon.Flag, tintColor: priorityColor(item.priority) };
    case "none":
      return { source: Icon.Circle, tintColor: Color.SecondaryText };
  }
}

function itemAccessories(
  item: TodoItem,
  now: Date,
  queueIndex?: number,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];
  if (queueIndex !== undefined) {
    accessories.push({ text: String(queueIndex + 1) });
  }
  if (item.priority !== "none") {
    accessories.push({
      tag: {
        value: priorityLabel(item.priority),
        color: priorityColor(item.priority),
      },
    });
  }
  const reminder = reminderSubtitle(item, now);
  if (reminder) {
    accessories.push({
      text: reminder,
      icon: Icon.Alarm,
    });
  }
  return accessories;
}

export default function TodoCommand() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TodoItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const store = await readStore();
      setItems(store.items);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load todos",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const queue = queueItems(items);
  const done = doneItems(items);
  const now = new Date();

  const onToggle = async (item: TodoItem) => {
    try {
      await toggleDone(item.id);
      await refresh();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to toggle",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onMove = async (item: TodoItem, delta: -1 | 1) => {
    try {
      const moved = await moveItem(item.id, delta);
      if (moved) await refresh();
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to move",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onDelete = async (item: TodoItem) => {
    const confirmed = await confirmAlert({
      title: `Delete “${item.title}”?`,
      message: "This cannot be undone.",
      primaryAction: { title: "Delete" },
    });
    if (!confirmed) return;
    try {
      await removeItem(item.id);
      await refresh();
      await showToast({
        style: Toast.Style.Success,
        title: "Deleted",
        message: item.title,
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to delete",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const onClearDone = async () => {
    if (done.length === 0) return;
    const confirmed = await confirmAlert({
      title: `Clear ${done.length} done task${done.length === 1 ? "" : "s"}?`,
      message: "Completed items will be removed.",
      primaryAction: { title: "Clear done" },
    });
    if (!confirmed) return;
    try {
      const removed = await clearDone();
      await refresh();
      await showToast({
        style: Toast.Style.Success,
        title: "Cleared done",
        message: `${removed} removed`,
      });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to clear done",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const addAction = () => (
    <Action.Push
      title="Add Task"
      icon={Icon.Plus}
      shortcut={SHORTCUT_NEW}
      target={<ItemForm onSaved={() => void refresh()} />}
    />
  );

  const clearDoneAction = () =>
    done.length > 0 ? (
      <Action
        title="Clear Done"
        icon={Icon.Trash}
        style={Action.Style.Destructive}
        onAction={() => void onClearDone()}
      />
    ) : null;

  const prefsAction = () => (
    <Action
      title="Notification Settings"
      icon={Icon.Cog}
      onAction={() => void openExtensionPreferences()}
    />
  );

  const listActions = () => (
    <ActionPanel>
      {addAction()}
      {prefsAction()}
      {clearDoneAction()}
    </ActionPanel>
  );

  const itemActions = (item: TodoItem) => (
    <ActionPanel>
      <ActionPanel.Section title="Task">
        <Action
          title={item.done ? "Mark Incomplete" : "Mark Done"}
          icon={item.done ? Icon.Circle : Icon.CheckCircle}
          shortcut={SHORTCUT_TOGGLE}
          onAction={() => void onToggle(item)}
        />
        <Action.Push
          title="Edit"
          icon={Icon.Pencil}
          shortcut={SHORTCUT_EDIT}
          target={<ItemForm item={item} onSaved={() => void refresh()} />}
        />
        <Action
          title="Move Up"
          icon={Icon.ArrowUp}
          shortcut={SHORTCUT_UP}
          onAction={() => void onMove(item, -1)}
        />
        <Action
          title="Move Down"
          icon={Icon.ArrowDown}
          shortcut={SHORTCUT_DOWN}
          onAction={() => void onMove(item, 1)}
        />
      </ActionPanel.Section>
      <ActionPanel.Section title="Queue">
        {addAction()}
        {prefsAction()}
        {clearDoneAction()}
      </ActionPanel.Section>
      <ActionPanel.Section title="Danger">
        <Action
          title="Delete"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={SHORTCUT_DELETE}
          onAction={() => void onDelete(item)}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );

  const remaining = queue.length;
  const navTitle =
    remaining > 0 ? `Todo · ${remaining} remaining` : "Todo";

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder="Filter tasks…"
      navigationTitle={navTitle}
      actions={listActions()}
    >
      {items.length === 0 && !loading && (
        <List.EmptyView
          icon={Icon.CheckCircle}
          title="No tasks"
          description="Ctrl+N to add a task. Set a priority and reminder time if you want a ping."
          actions={listActions()}
        />
      )}
      {queue.length > 0 && (
        <List.Section title="Queue">
          {queue.map((item, index) => (
            <List.Item
              key={item.id}
              title={item.title}
              icon={itemIcon(item)}
              accessories={itemAccessories(item, now, index)}
              keywords={[
                "queue",
                "todo",
                "open",
                item.priority,
                priorityLabel(item.priority),
                item.reminderTime ?? "",
              ]}
              actions={itemActions(item)}
            />
          ))}
        </List.Section>
      )}
      {done.length > 0 && (
        <List.Section title="Done">
          {done.map((item) => (
            <List.Item
              key={item.id}
              title={item.title}
              icon={itemIcon(item)}
              accessories={itemAccessories(item, now)}
              keywords={["done", "complete", item.priority]}
              actions={itemActions(item)}
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
