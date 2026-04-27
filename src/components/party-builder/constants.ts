import type { EquipmentCategoryKey } from "./types";

export const SLOT_COUNT = 8;
export const STORAGE_KEY = "aion2-party-builder:v2";
export const SLOT_MEMO_MAX_LENGTH = 80;
export const AUTO_SPEC_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const PANEL_CLASS = "";
export const INPUT_CLASS =
  "h-8 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-800 select-text";
export const BUTTON_PRIMARY_CLASS =
  "h-8 rounded-md bg-neutral-100 px-4 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200";
export const BUTTON_SECONDARY_CLASS =
  "h-8 rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800";
export const BUTTON_BLUE_SECONDARY_CLASS =
  "h-8 rounded-md border border-blue-500 bg-neutral-900 px-4 text-sm font-semibold text-blue-500 transition hover:bg-blue-500/10";
export const NUM_EMPHASIS_CLASS = "font-bold text-neutral-50";
export const NUM_BLUE_EMPHASIS_CLASS = "font-bold text-sky-100";

export const EQUIPMENT_CATEGORY_ORDER: EquipmentCategoryKey[] = [
  "weapon",
  "armor",
  "accessory",
  "rune",
  "arcana",
  "other",
];
export const EQUIPMENT_BREAKTHROUGH_MAX = 5;
export const RUNE_SLOT_NAMES = ["Rune1", "Rune2"];
