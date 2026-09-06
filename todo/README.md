# Todo

Ordered local task queue with priorities and HH:MM reminders.

## What it does

- Add, reorder, complete, and delete tasks
- Priority sort (urgent → none) plus manual order within a priority
- Once or daily reminders; background command **Todo Reminders** polls and sends desktop notifications

Items are stored in `$XDG_CONFIG_HOME/vicinae/todo/todos.json` (mode `0600`).

## External tools

None beyond Vicinae. Notifications use `@vicinae/api` `sendDesktopNotification`.

## Privilege

No root. No sudo.

## Tests

```bash
cd todo && npm test
```
