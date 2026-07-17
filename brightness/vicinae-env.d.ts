/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Step percent - How much increase/decrease adjusts brightness (percent) */
	"stepPercent": string;

	/** Device - Optional brightnessctl device name (leave empty for default) */
	"device": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Set Brightness */
	export type Brightness = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Set Brightness */
	export type Brightness = {
		
	}
}