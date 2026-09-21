/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Sidecar URL - Aura sidecar base URL (loopback only). Leave empty for http://127.0.0.1:9080 */
	"sidecarUrl": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Toggle DND */
	export type ToggleDnd = ExtensionPreferences & {
		
	}

	/** Command: Notifications */
	export type Inbox = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Toggle DND */
	export type ToggleDnd = {
		
	}

	/** Command: Notifications */
	export type Inbox = {
		
	}
}