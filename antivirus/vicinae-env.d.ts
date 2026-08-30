/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Notifications - Uses Vicinae notifications in addition to notify-send from av-scan */
	"notificationsEnabled": boolean;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Antivirus */
	export type Antivirus = ExtensionPreferences & {
		
	}

	/** Command: Antivirus Status */
	export type Subtitle = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Antivirus */
	export type Antivirus = {
		
	}

	/** Command: Antivirus Status */
	export type Subtitle = {
		
	}
}