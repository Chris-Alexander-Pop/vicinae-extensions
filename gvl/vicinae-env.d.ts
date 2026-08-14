/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** gvl path - Optional path to the gvl binary (leave empty to use PATH, ~/go/bin/gvl, or ~/.local/bin/gvl) */
	"gvlPath": string;

	/** Brightness step - How much Ctrl+↑ / Ctrl+↓ adjusts brightness (percent) */
	"stepPercent": string;

	/** Direct LAN - Passes --url local. Animated modes and schedules need gvld and will be disabled. */
	"directLan": boolean;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Govee Lights */
	export type Govee = ExtensionPreferences & {
		
	}

	/** Command: Toggle Lights */
	export type Toggle = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Govee Lights */
	export type Govee = {
		
	}

	/** Command: Toggle Lights */
	export type Toggle = {
		
	}
}