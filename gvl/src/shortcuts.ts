import { Icon, type Keyboard } from "@vicinae/api";

export type HubTab =
  | "control"
  | "colors"
  | "temps"
  | "modes"
  | "schedules"
  | "discover";

export const SHORTCUT_REFRESH: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "r",
};
export const SHORTCUT_TOGGLE: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "t",
};
export const SHORTCUT_STOP: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "s",
};
export const SHORTCUT_UP: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "arrowUp",
};
export const SHORTCUT_DOWN: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "arrowDown",
};
export const SHORTCUT_NEW: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "n",
};
export const SHORTCUT_EDIT: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "e",
};
export const SHORTCUT_RUN: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "return",
};
export const SHORTCUT_DELETE: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "backspace",
};
export const SHORTCUT_SKIP: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "k",
};
export const SHORTCUT_NEXT: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "o",
};
export const SHORTCUT_TEST: Keyboard.Shortcut = {
  modifiers: ["ctrl"],
  key: "p",
};

export const TABS: {
  id: HubTab;
  title: string;
  icon: Icon;
  shortcut: Keyboard.Shortcut;
}[] = [
  {
    id: "control",
    title: "Control",
    icon: Icon.LightBulb,
    shortcut: { modifiers: ["ctrl"], key: "1" },
  },
  {
    id: "colors",
    title: "Colors",
    icon: Icon.Swatch,
    shortcut: { modifiers: ["ctrl"], key: "2" },
  },
  {
    id: "temps",
    title: "Temperature",
    icon: Icon.Temperature,
    shortcut: { modifiers: ["ctrl"], key: "3" },
  },
  {
    id: "modes",
    title: "Modes",
    icon: Icon.Stars,
    shortcut: { modifiers: ["ctrl"], key: "4" },
  },
  {
    id: "schedules",
    title: "Schedules",
    icon: Icon.Calendar,
    shortcut: { modifiers: ["ctrl"], key: "5" },
  },
  {
    id: "discover",
    title: "Discover",
    icon: Icon.MagnifyingGlass,
    shortcut: { modifiers: ["ctrl"], key: "6" },
  },
];
