/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Hyprland Settings */
	export type HyprlandSettings = ExtensionPreferences & {
		
	}

	/** Command: Install Persist Hook */
	export type SetupPersist = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Hyprland Settings */
	export type HyprlandSettings = {
		
	}

	/** Command: Install Persist Hook */
	export type SetupPersist = {
		
	}
}