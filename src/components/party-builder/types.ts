import type { CharacterSummary } from "@/types/character";

export type PartyKind = "rudra" | "erosion";

export type Party = {
  id: string;
  name: string;
  kind: PartyKind;
  slots: Array<CharacterSummary | null>;
};

export type SlotMemoMap = Record<string, string>;

export type CharacterDetailEquipmentItem = {
  id: number;
  name: string;
  grade: string;
  enchantLevel: number;
  exceedLevel: number;
  slotPos: number;
  slotPosName: string;
  icon: string | null;
};

export type CharacterDetailData = {
  source: string;
  profile: {
    characterId: string;
    characterName: string;
    serverId: number;
    serverName: string;
    className: string;
    raceName: string;
    regionName: string;
    level: number;
    profileImage: string | null;
    itemLevel: number;
    combatPower: number;
  };
  skills: {
    activeSkills: Array<{
      id: number;
      name: string;
      needLevel: number;
      category: string;
      skillLevel: number;
      targetLevel: number;
      acquired: number;
      equip: number;
      icon: string | null;
    }>;
    passiveSkills: Array<{
      id: number;
      name: string;
      needLevel: number;
      category: string;
      skillLevel: number;
      targetLevel: number;
      acquired: number;
      equip: number;
      icon: string | null;
    }>;
    stigmaSkills: Array<{
      id: number;
      name: string;
      needLevel: number;
      category: string;
      skillLevel: number;
      targetLevel: number;
      acquired: number;
      equip: number;
      icon: string | null;
    }>;
  };
  statList: Array<{
    type: string;
    name: string;
    value: number;
  }>;
  equipment: {
    equipmentList: CharacterDetailEquipmentItem[];
    skinList: CharacterDetailEquipmentItem[];
  };
  links: {
    plaync: string;
  };
};

export type EquipmentItemDetailData = {
  source: string;
  characterContextApplied?: boolean;
  item: Record<string, unknown>;
  warnings?: string[];
};

export type DragPayload =
  | {
      origin: "waiting";
      character: CharacterSummary;
    }
  | {
      origin: "slot";
      partyId: string;
      slotIndex: number;
      character: CharacterSummary;
    };

export type DropPayload =
  | {
      type: "slot";
      partyId: string;
      slotIndex: number;
    }
  | {
      type: "waiting-drop";
    };

export type EquipmentCategoryKey = "weapon" | "armor" | "accessory" | "rune" | "arcana" | "other";

export type ParsedCharacterLink = {
  source: "plaync-link" | "a2tool-link";
  serverId: number;
  characterId?: string;
  name?: string;
};
