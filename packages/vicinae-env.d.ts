/// <reference types="@vicinae/api">

/*
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 */

type ExtensionPreferences = {
  /** Extra critical packages - Comma-separated package names that cannot be uninstalled (in addition to the built-in protect list) */
	"extraCriticalPackages": string;
}

declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Command: Packages */
	export type Packages = ExtensionPreferences & {
		
	}
}

declare namespace Arguments {
  /** Command: Packages */
	export type Packages = {
		
	}
}