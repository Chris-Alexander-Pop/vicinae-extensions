/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Notifications - When off, reminders are stored but never ping */
	"notificationsEnabled": boolean;

	/** Boot delay (seconds) - After Vicinae starts (or a long gap), wait this long before firing reminders that were already due */
	"bootGraceSeconds": string;

	/** New session after (minutes) - If the reminder poller was quiet this long, treat the next poll as a new boot/session */
	"sessionGapMinutes": string;

	/** Re-notify every (minutes) - 0 = once per day (or once ever, for Once reminders). Otherwise ping again while still overdue */
	"nagMinutes": string;

	/** Minimum priority to notify - Skip reminders below this priority */
	"minPriority": "none" | "low" | "medium" | "high" | "urgent";

	/** Default priority - Pre-selected when adding a task */
	"defaultPriority": "none" | "low" | "medium" | "high" | "urgent";

	/** Default reminder - Pre-selected when adding a task */
	"defaultReminderMode": "off" | "once" | "daily";

	/** Default reminder time - HH:MM (24-hour local) pre-filled on the add form */
	"defaultReminderTime": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Todo */
	export type Todo = ExtensionPreferences & {
		
	}

	/** Command: Todo Reminders */
	export type Remind = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Todo */
	export type Todo = {
		
	}

	/** Command: Todo Reminders */
	export type Remind = {
		
	}
}