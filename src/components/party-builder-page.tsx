"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useRef, useState } from "react";

import { encodeSnapshotToToken } from "@/lib/share-link";
import { parseShareSnapshot } from "@/lib/share-snapshot";
import type { CharacterSummary, ServerInfo } from "@/types/character";
import type { ShareSnapshot } from "@/types/share";

type PartyKind = "rudra" | "erosion";

type Party = {
  id: string;
  name: string;
  kind: PartyKind;
  slots: Array<CharacterSummary | null>;
};

type SlotMemoMap = Record<string, string>;

type CharacterDetailEquipmentItem = {
  id: number;
  name: string;
  grade: string;
  enchantLevel: number;
  exceedLevel: number;
  slotPos: number;
  slotPosName: string;
  icon: string | null;
};

type CharacterDetailData = {
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
    aon2: string;
  };
};

type EquipmentItemDetailData = {
  source: string;
  characterContextApplied?: boolean;
  item: Record<string, unknown>;
  warnings?: string[];
};

type DragPayload =
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

type DropPayload =
  | {
      type: "slot";
      partyId: string;
      slotIndex: number;
    }
  | {
      type: "waiting-drop";
    };

const SLOT_COUNT = 8;
const STORAGE_KEY = "aion2-party-builder:v2";
const SLOT_MEMO_MAX_LENGTH = 80;
const PANEL_CLASS = "";
const INPUT_CLASS =
  "h-8 rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-800 select-text";
const BUTTON_PRIMARY_CLASS =
  "h-8 rounded-md bg-neutral-100 px-4 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200";
const BUTTON_SECONDARY_CLASS =
  "h-8 rounded-md border border-neutral-700 bg-neutral-900 px-4 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800";
const BUTTON_BLUE_SECONDARY_CLASS =
  "h-8 rounded-md border border-blue-500 bg-neutral-900 px-4 text-sm font-semibold text-blue-500 transition hover:bg-blue-500/10";
const NUM_EMPHASIS_CLASS = "font-bold text-neutral-50";
const NUM_BLUE_EMPHASIS_CLASS = "font-bold text-sky-100";

type EquipmentCategoryKey = "weapon" | "armor" | "accessory" | "rune" | "arcana" | "other";

const EQUIPMENT_CATEGORY_ORDER: EquipmentCategoryKey[] = ["weapon", "armor", "accessory", "rune", "arcana", "other"];
const EQUIPMENT_BREAKTHROUGH_MAX = 5;
const RUNE_SLOT_NAMES = ["Rune1", "Rune2"];

function getEquipmentCategory(slotPosName: string): EquipmentCategoryKey {
  if (slotPosName.startsWith("Rune")) {
    return "rune";
  }

  if (slotPosName.startsWith("Arcana")) {
    return "arcana";
  }

  if (
    [
      "MainHand",
      "SubHand",
      "OneHand",
      "TwoHand",
      "Greatsword",
      "Sword",
      "Dagger",
      "Bow",
      "Mace",
      "Staff",
      "Polearm",
      "Orb",
      "Spellbook",
      "Gun",
      "Harp",
      "Shield",
    ].includes(slotPosName)
  ) {
    return "weapon";
  }

  if (["Helmet", "Shoulder", "Torso", "Pants", "Gloves", "Boots", "Cape"].includes(slotPosName)) {
    return "armor";
  }

  if (
    [
      "Necklace",
      "Earring1",
      "Earring2",
      "EarringL",
      "EarringR",
      "Ring1",
      "Ring2",
      "Bracelet1",
      "Bracelet2",
      "Belt",
      "Amulet",
    ].includes(slotPosName)
  ) {
    return "accessory";
  }

  return "other";
}

function getEquipmentCategoryLabel(category: EquipmentCategoryKey) {
  if (category === "weapon") return "무기";
  if (category === "armor") return "방어구";
  if (category === "accessory") return "악세";
  if (category === "rune") return "룬";
  if (category === "arcana") return "아르카나";
  return "기타";
}

function groupEquipmentItems(items: CharacterDetailEquipmentItem[], options?: { includeEmptyRuneGroup?: boolean }) {
  const sorted = [...items].sort((a, b) => {
    const categoryDelta =
      EQUIPMENT_CATEGORY_ORDER.indexOf(getEquipmentCategory(a.slotPosName)) -
      EQUIPMENT_CATEGORY_ORDER.indexOf(getEquipmentCategory(b.slotPosName));

    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    if (a.slotPos !== b.slotPos) {
      return a.slotPos - b.slotPos;
    }

    return a.name.localeCompare(b.name, "ko");
  });

  const map = new Map<EquipmentCategoryKey, CharacterDetailEquipmentItem[]>();
  for (const item of sorted) {
    const category = getEquipmentCategory(item.slotPosName);
    const list = map.get(category) ?? [];
    list.push(item);
    map.set(category, list);
  }

  return EQUIPMENT_CATEGORY_ORDER.map((category) => ({
    category,
    label: getEquipmentCategoryLabel(category),
    items: map.get(category) ?? [],
  })).filter((entry) => entry.items.length > 0 || (options?.includeEmptyRuneGroup && entry.category === "rune"));
}

function getEquipmentGradeTone(grade: string) {
  const normalized = grade.toLowerCase();
  if (normalized === "legend") {
    return {
      row: "border-amber-600/60 bg-amber-900/20",
      badge: "border-amber-400/70 bg-amber-900/40 text-amber-200",
      name: "text-amber-200",
    };
  }
  if (normalized === "epic") {
    return {
      row: "border-orange-600/60 bg-orange-900/20",
      badge: "border-orange-400/70 bg-orange-900/40 text-orange-200",
      name: "text-orange-200",
    };
  }
  if (normalized === "unique") {
    return {
      row: "border-yellow-600/60 bg-yellow-900/20",
      badge: "border-yellow-400/70 bg-yellow-900/40 text-yellow-200",
      name: "text-yellow-200",
    };
  }
  if (normalized === "rare") {
    return {
      row: "border-sky-600/60 bg-sky-900/20",
      badge: "border-sky-400/70 bg-sky-900/40 text-sky-200",
      name: "text-sky-200",
    };
  }
  if (normalized === "special") {
    return {
      row: "border-teal-600/60 bg-teal-900/20",
      badge: "border-teal-400/70 bg-teal-900/40 text-teal-200",
      name: "text-teal-200",
    };
  }
  return {
    row: "border-neutral-700 bg-neutral-900/70",
    badge: "border-neutral-600 bg-neutral-800 text-neutral-300",
    name: "text-neutral-100",
  };
}

function formatBreakthroughSummary(items: CharacterDetailEquipmentItem[]) {
  if (items.length === 0) {
    return "돌파 없음";
  }

  const broken = items.filter((item) => item.exceedLevel > 0);
  if (broken.length === 0) {
    return "돌파 없음";
  }

  const maxLevel = broken.reduce((max, item) => Math.max(max, item.exceedLevel), 0);
  return `돌파 ${broken.length}/${items.length} · 최대 ${maxLevel}돌`;
}

function formatRuneSummary(items: CharacterDetailEquipmentItem[]) {
  const occupied = items.length;
  return `장착 ${occupied}/${RUNE_SLOT_NAMES.length}`;
}

function clampBreakthroughLevel(exceedLevel: number) {
  return Math.max(0, Math.min(exceedLevel, EQUIPMENT_BREAKTHROUGH_MAX));
}

function renderBreakthroughPips(exceedLevel: number): React.ReactNode {
  const filled = clampBreakthroughLevel(exceedLevel);
  return (
    <div className="mt-1 flex items-center gap-1">
      {Array.from({ length: EQUIPMENT_BREAKTHROUGH_MAX }, (_, index) => (
        <span
          key={`breakthrough-pip-${index}`}
          className={`h-1.5 w-4 rounded-sm border ${
            index < filled ? "border-teal-300 bg-teal-300/90" : "border-neutral-600 bg-neutral-800"
          }`}
        />
      ))}
    </div>
  );
}

function createParty(kind: PartyKind, index: number): Party {
  const kindName = kind === "rudra" ? "루드라" : "침식";
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `party-${Date.now()}-${Math.random()}`,
    name: `${kindName} 파티 ${index}`,
    kind,
    slots: Array.from({ length: SLOT_COUNT }, () => null),
  };
}

function formatNumber(value: number) {
  if (!value) {
    return "-";
  }
  return value.toLocaleString("ko-KR");
}

function formatAverage(value: number | null) {
  if (value === null) {
    return "-";
  }
  return Math.round(value).toLocaleString("ko-KR");
}

function calculatePartyAverage(slots: Array<CharacterSummary | null>) {
  const members = slots.filter((slot): slot is CharacterSummary => slot !== null);
  const itemLevelValues = members.map((character) => character.itemLevel).filter((value) => value > 0);
  const combatPowerValues = members.map((character) => character.combatPower).filter((value) => value > 0);

  const itemLevelAverage =
    itemLevelValues.length > 0 ? itemLevelValues.reduce((sum, value) => sum + value, 0) / itemLevelValues.length : null;
  const combatPowerAverage =
    combatPowerValues.length > 0 ? combatPowerValues.reduce((sum, value) => sum + value, 0) / combatPowerValues.length : null;

  return {
    memberCount: members.length,
    itemLevelAverage,
    combatPowerAverage,
  };
}

function getClassBadgeToneClass(className?: string) {
  const normalized = className?.trim() ?? "";
  if (normalized.includes("수호성")) return "border-blue-300 bg-blue-900/30 text-blue-300";
  if (normalized.includes("검성")) return "border-sky-300 bg-sky-900/30 text-sky-300";
  if (normalized.includes("살성")) return "border-green-300 bg-green-900/30 text-green-300";
  if (normalized.includes("궁성")) return "border-lime-300 bg-lime-900/30 text-lime-300";
  if (normalized.includes("호법")) return "border-orange-300 bg-orange-900/30 text-orange-300";
  if (normalized.includes("치유")) return "border-yellow-300 bg-yellow-900/30 text-yellow-300";
  if (normalized.includes("정령")) return "border-pink-300 bg-pink-900/30 text-pink-300";
  if (normalized.includes("마도")) return "border-violet-300 bg-violet-900/30 text-violet-300";
  return "border-neutral-700 bg-neutral-800 text-neutral-300";
}

function sameCharacter(a: CharacterSummary, b: CharacterSummary) {
  return a.characterId === b.characterId && a.serverId === b.serverId;
}

function characterKey(character: CharacterSummary) {
  return `${character.serverId}:${character.characterId}`;
}

function normalizeCharacterId(characterId: string) {
  try {
    return decodeURIComponent(characterId);
  } catch {
    return characterId;
  }
}

function slotMemoKey(partyId: string, slotIndex: number) {
  return `${partyId}:${slotIndex}`;
}

function parseSlotMemos(input: unknown): SlotMemoMap {
  if (!input || typeof input !== "object") {
    return {};
  }

  const next: SlotMemoMap = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.slice(0, SLOT_MEMO_MAX_LENGTH);
    if (normalized.length === 0) {
      continue;
    }
    next[key] = normalized;
  }
  return next;
}

function copyParties(parties: Party[]): Party[] {
  return parties.map((party) => ({
    ...party,
    slots: [...party.slots],
  }));
}

function createDefaultParties() {
  return [createParty("rudra", 1), createParty("erosion", 1)];
}

function clonePartiesFromSnapshot(parties: ShareSnapshot["parties"]): Party[] {
  return parties.map((party) => ({
    ...party,
    slots: party.slots
      .slice(0, SLOT_COUNT)
      .concat(Array.from({ length: SLOT_COUNT }, () => null))
      .slice(0, SLOT_COUNT),
  }));
}

function mergeCharacterStats(base: CharacterSummary, fresh: CharacterSummary): CharacterSummary {
  return {
    ...base,
    serverName: fresh.serverName || base.serverName,
    classId: fresh.classId ?? base.classId,
    className: fresh.className ?? base.className,
    classKey: fresh.classKey ?? base.classKey,
    classIconUrl: fresh.classIconUrl ?? base.classIconUrl,
    itemLevel: fresh.itemLevel > 0 ? fresh.itemLevel : base.itemLevel,
    combatPower: fresh.combatPower > 0 ? fresh.combatPower : base.combatPower,
    source: fresh.source ?? base.source,
  };
}

function CharacterCard({
  character,
  compact = false,
  slotLayout = false,
  dense = false,
  actionRevealOnHover = false,
  serverEmphasis = false,
  surface = "default",
  assignmentStatus,
  disabled = false,
  actionButton,
  onOpenDetail,
}: {
  character: CharacterSummary;
  compact?: boolean;
  slotLayout?: boolean;
  dense?: boolean;
  actionRevealOnHover?: boolean;
  serverEmphasis?: boolean;
  surface?: "default" | "slot";
  assignmentStatus?: { rudra: boolean; erosion: boolean };
  disabled?: boolean;
  actionButton?: React.ReactNode;
  onOpenDetail?: (character: CharacterSummary) => void;
}) {
  const profileButton = onOpenDetail ? (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => onOpenDetail(character)}
      aria-label={`${character.name} 상세정보`}
      title="상세정보"
      className="ml-1 inline-flex h-5 shrink-0 items-center justify-center rounded border border-neutral-600 bg-neutral-900/90 px-1.5 text-[10px] font-semibold text-neutral-200 transition hover:bg-neutral-800"
    >
      {"상세"}
    </button>
  ) : null;

  return (
    <div
      className={`group/card ${dense ? "min-h-18 p-2" : "min-h-20 p-3"} w-full rounded-lg ${
        surface === "slot" ? "border border-transparent bg-neutral-800/85" : "border border-neutral-800 bg-neutral-900/95"
      } ${
        compact ? "" : "hover:shadow"
      } transition-shadow`}
    >
      {slotLayout ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
          <div className="min-w-0 flex items-center">
            <p className={`truncate font-bold text-neutral-100 ${dense ? "text-sm" : "text-md"}`}>
              <span className="max-w-[8ch] truncate align-middle inline-block">{character.name}</span>
              <span
                className={`ml-1 align-middle ${
                  serverEmphasis ? "font-medium text-neutral-200" : "font-normal text-neutral-400"
                } ${
                  serverEmphasis ? (dense ? "text-sm" : "text-md") : dense ? "text-[10px]" : "text-xs"
                }`}
              >
                [{character.serverName}]
              </span>
            </p>
            {profileButton}
          </div>
          <div
            className={`justify-self-end ${
              actionRevealOnHover ? "opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:pointer-events-auto" : ""
            } transition`}
          >
            {actionButton}
          </div>
          <div className="flex flex-col leading-tight">
            <p className={`${dense ? "text-[10px]" : "text-[11px]"} text-sky-300`}>
              전투력 <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatNumber(character.combatPower)}</span>
            </p>
            <p className={`${dense ? "text-[10px]" : "text-[11px]"} text-neutral-300`}>
              아이템레벨 <span className={NUM_EMPHASIS_CLASS}>{formatNumber(character.itemLevel)}</span>
            </p>
          </div>
          <div
            className={`${dense ? "w-12 h-5 text-[10px]" : "w-12 h-6 text-[11px]"} justify-center inline-flex shrink-0 items-center rounded-lg border px-2 font-semibold ${getClassBadgeToneClass(
              character.className,
            )}`}
          >
            {character.className ?? "직업 미확인"}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center">
                <p className="max-w-[8ch] truncate text-md font-bold text-neutral-100">{character.name}</p>
                {profileButton}
              </div>
              <p className="truncate text-xs text-neutral-400">[{character.serverName}]</p>
            </div>
            <div
              className={`w-12 justify-center inline-flex h-9 shrink-0 items-center rounded-lg border px-2 text-[11px] font-semibold ${getClassBadgeToneClass(
                character.className,
              )}`}
            >
              {character.className ?? "직업 미확인"}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-neutral-400">
            <div className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1">
              IL <span className={NUM_EMPHASIS_CLASS}>{formatNumber(character.itemLevel)}</span>
            </div>
            <div className="rounded-md border border-sky-700/50 bg-sky-900/20 px-2 py-1 text-sky-300">
              CP <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatNumber(character.combatPower)}</span>
            </div>
          </div>
        </div>
      )}

      {assignmentStatus ? (
        <div className={`mt-2 flex items-center gap-1.5 ${dense ? "text-[10px]" : "text-[11px]"}`}>
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${
              assignmentStatus.rudra
                ? "bg-neutral-800 text-neutral-500 line-through"
                : "border border-amber-700/60 bg-amber-900/40 text-amber-200"
            }`}
          >
            루드라
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${
              assignmentStatus.erosion
                ? "bg-neutral-800 text-neutral-500 line-through"
                : "border border-indigo-700/60 bg-indigo-900/40 text-indigo-200"
            }`}
          >
            침식
          </span>
          {disabled ? <span className="ml-auto text-[10px] font-semibold text-rose-400">배치완료</span> : null}
        </div>
      ) : null}

      {!slotLayout && actionButton ? <div className="mt-2 flex justify-end">{actionButton}</div> : null}
    </div>
  );
}

function DraggableCard({
  id,
  payload,
  children,
}: {
  id: string;
  payload: DragPayload;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: payload,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="select-none touch-manipulation cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

function PartySlot({
  partyId,
  slotIndex,
  character,
  memoValue = "",
  onMemoChange,
  onMoveToWaiting,
  onOpenDetail,
}: {
  partyId: string;
  slotIndex: number;
  character: CharacterSummary | null;
  memoValue?: string;
  onMemoChange?: (partyId: string, slotIndex: number, memo: string) => void;
  onMoveToWaiting?: (partyId: string, slotIndex: number, character: CharacterSummary) => void;
  onOpenDetail?: (character: CharacterSummary) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${partyId}-${slotIndex}`,
    data: {
      type: "slot",
      partyId,
      slotIndex,
    } satisfies DropPayload,
  });

  return (
    <div
      ref={setNodeRef}
      className={`group/slot rounded-xl ${isOver ? "bg-neutral-800 ring-1 ring-neutral-600" : "bg-neutral-900/60"}`}
    >
      {character ? (
        <div>
          <DraggableCard
            id={`slot-card-${partyId}-${slotIndex}`}
            payload={{
              origin: "slot",
              partyId,
              slotIndex,
              character,
            }}
          >
            <CharacterCard
              character={character}
              compact
              slotLayout
              dense
              surface="slot"
              actionRevealOnHover
              onOpenDetail={onOpenDetail}
              actionButton={
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onMoveToWaiting?.(partyId, slotIndex, character)}
                  aria-label="대기로 이동"
                  title="대기로 이동"
                  className="inline-flex rounded-md border border-neutral-600 bg-neutral-900 p-1 text-neutral-300 transition hover:bg-neutral-800"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                      d="M9 14l-4-4m0 0l4-4m-4 4h11a4 4 0 014 4v4"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              }
            />
          </DraggableCard>
        </div>
      ) : (
        <div className="h-18 rounded-lg border border-dashed border-neutral-600/70 bg-neutral-800/10 p-1.5">
          <textarea
            value={memoValue}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => onMemoChange?.(partyId, slotIndex, event.target.value)}
            maxLength={SLOT_MEMO_MAX_LENGTH}
            placeholder="검색이 어려우면 메모"
            className="h-full w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[11px] text-neutral-300 outline-none placeholder:text-neutral-500 focus:border-neutral-600 focus:bg-neutral-900/30 select-text"
          />
        </div>
      )}
    </div>
  );
}

export default function PartyBuilderPage({
  initialSnapshot,
  sharedId,
  sharedCreatedAt,
}: {
  initialSnapshot?: ShareSnapshot;
  sharedId?: string;
  sharedCreatedAt?: string;
}) {
  const hasInitialSnapshot = Boolean(initialSnapshot);
  const parsedInitialSnapshot = hasInitialSnapshot ? parseShareSnapshot(initialSnapshot) : null;

  const [parties, setParties] = useState<Party[]>(() =>
    parsedInitialSnapshot ? clonePartiesFromSnapshot(parsedInitialSnapshot.parties) : createDefaultParties(),
  );
  const [waitingList, setWaitingList] = useState<CharacterSummary[]>(() => parsedInitialSnapshot?.waitingList ?? []);
  const [slotMemos, setSlotMemos] = useState<SlotMemoMap>({});
  const [servers, setServers] = useState<ServerInfo[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState("");
  const [modalServerId, setModalServerId] = useState<string>("");
  const [modalResults, setModalResults] = useState<CharacterSummary[]>([]);
  const [modalSource, setModalSource] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [waitingQuery, setWaitingQuery] = useState("");
  const [detailTarget, setDetailTarget] = useState<CharacterSummary | null>(null);
  const [detailData, setDetailData] = useState<CharacterDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [skinEquipmentCollapsed, setSkinEquipmentCollapsed] = useState(true);
  const [selectedEquipmentItem, setSelectedEquipmentItem] = useState<CharacterDetailEquipmentItem | null>(null);
  const [equipmentItemDetail, setEquipmentItemDetail] = useState<EquipmentItemDetailData | null>(null);
  const [equipmentItemLoading, setEquipmentItemLoading] = useState(false);
  const [equipmentItemError, setEquipmentItemError] = useState("");

  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareNotice, setShareNotice] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [specRefreshLoading, setSpecRefreshLoading] = useState(false);
  const [specRefreshMessage, setSpecRefreshMessage] = useState("");
  const [specRefreshError, setSpecRefreshError] = useState("");

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const assignedCount = useMemo(
    () => parties.reduce((total, party) => total + party.slots.filter(Boolean).length, 0),
    [parties],
  );
  const rudraPartyCount = useMemo(() => parties.filter((party) => party.kind === "rudra").length, [parties]);
  const erosionPartyCount = useMemo(() => parties.filter((party) => party.kind === "erosion").length, [parties]);
  const sharedCreatedText = useMemo(() => {
    if (!sharedCreatedAt) {
      return "";
    }

    const parsed = new Date(sharedCreatedAt);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toLocaleString("ko-KR");
  }, [sharedCreatedAt]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, { rudra: boolean; erosion: boolean }>();

    for (const party of parties) {
      for (const character of party.slots) {
        if (!character) {
          continue;
        }

        const key = characterKey(character);
        const status = map.get(key) ?? { rudra: false, erosion: false };
        if (party.kind === "rudra") {
          status.rudra = true;
        } else {
          status.erosion = true;
        }
        map.set(key, status);
      }
    }

    return map;
  }, [parties]);

  useEffect(() => {
    if (hasInitialSnapshot) {
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsedRaw = JSON.parse(raw);
      const parsed = parseShareSnapshot(parsedRaw);
      if (!parsed) {
        return;
      }

      setParties(clonePartiesFromSnapshot(parsed.parties));
      setWaitingList(parsed.waitingList);
      setSlotMemos(parseSlotMemos((parsedRaw as { slotMemos?: unknown }).slotMemos));
    } catch {
      // Ignore malformed local storage.
    }
  }, [hasInitialSnapshot]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ parties, waitingList, slotMemos }));
  }, [parties, waitingList, slotMemos]);

  useEffect(() => {
    const controller = new AbortController();

    const loadServers = async () => {
      try {
        const response = await fetch("/api/characters/servers", {
          signal: controller.signal,
          cache: "no-store",
        });

        const payload = (await response.json()) as { items?: ServerInfo[] };
        setServers(Array.isArray(payload.items) ? payload.items : []);
      } catch {
        setServers([]);
      }
    };

    void loadServers();

    return () => controller.abort();
  }, []);

  const addParty = (kind: PartyKind) => {
    setParties((previous) => {
      const nextIndex = previous.filter((party) => party.kind === kind).length + 1;
      return [...previous, createParty(kind, nextIndex)];
    });
  };

  const removeParty = (partyId: string) => {
    setParties((previous) => {
      if (previous.length <= 1) {
        return previous;
      }
      return previous.filter((party) => party.id !== partyId);
    });
    setSlotMemos((previous) => {
      const nextEntries = Object.entries(previous).filter(([key]) => !key.startsWith(`${partyId}:`));
      return Object.fromEntries(nextEntries);
    });
  };

  const clearParty = (partyId: string) => {
    setParties((previous) =>
      previous.map((party) =>
        party.id === partyId
          ? {
              ...party,
              slots: Array.from({ length: SLOT_COUNT }, () => null),
            }
          : party,
        ),
    );
    setSlotMemos((previous) => {
      const nextEntries = Object.entries(previous).filter(([key]) => !key.startsWith(`${partyId}:`));
      return Object.fromEntries(nextEntries);
    });
  };

  const runSearchInModal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = modalQuery.trim();
    if (!name) {
      setModalError("캐릭터명을 입력하세요.");
      return;
    }

    setModalLoading(true);
    setModalError("");

    try {
      const params = new URLSearchParams({ name });
      if (modalServerId) {
        params.set("serverId", modalServerId);
      }

      const response = await fetch(`/api/characters/search?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        items?: CharacterSummary[];
        source?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "검색에 실패했습니다.");
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      setModalResults(items);
      setModalSource(payload.source ?? "");

      if (items.length === 0) {
        setModalError("검색 결과가 없습니다.");
      }
    } catch (searchError) {
      setModalResults([]);
      setModalSource("");
      setModalError(searchError instanceof Error ? searchError.message : "검색에 실패했습니다.");
    } finally {
      setModalLoading(false);
    }
  };

  const openCharacterDetail = async (character: CharacterSummary) => {
    setDetailTarget(character);
    setDetailData(null);
    setDetailError("");
    setSkinEquipmentCollapsed(true);
    setSelectedEquipmentItem(null);
    setEquipmentItemDetail(null);
    setEquipmentItemError("");
    setDetailLoading(true);

    try {
      const params = new URLSearchParams({
        characterId: character.characterId,
        serverId: String(character.serverId),
      });

      const response = await fetch(`/api/characters/detail?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as CharacterDetailData & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "상세 정보를 불러오지 못했습니다.");
      }

      setDetailData(payload);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "상세 정보를 불러오지 못했습니다.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeEquipmentItemDetail = () => {
    setSelectedEquipmentItem(null);
    setEquipmentItemDetail(null);
    setEquipmentItemError("");
    setEquipmentItemLoading(false);
  };

  const openEquipmentItemDetail = async (item: CharacterDetailEquipmentItem) => {
    if (!detailTarget) {
      return;
    }

    const contextCharacterId = detailData?.profile.characterId ?? detailTarget.characterId;
    const contextServerId = detailData?.profile.serverId ?? detailTarget.serverId;

    setSelectedEquipmentItem(item);
    setEquipmentItemDetail(null);
    setEquipmentItemError("");
    setEquipmentItemLoading(true);

    try {
      const params = new URLSearchParams({
        id: String(item.id),
        enchantLevel: String(item.enchantLevel ?? 0),
        characterId: contextCharacterId,
        serverId: String(contextServerId),
        slotPos: String(item.slotPos ?? 0),
      });

      const response = await fetch(`/api/characters/equipment-item?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as EquipmentItemDetailData & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "장비 상세 조회에 실패했습니다.");
      }
      setEquipmentItemDetail(payload);
    } catch (error) {
      setEquipmentItemError(error instanceof Error ? error.message : "장비 상세 조회에 실패했습니다.");
    } finally {
      setEquipmentItemLoading(false);
    }
  };

  const createShareLink = async () => {
    setShareLoading(true);
    setShareError("");
    setShareNotice("");
    setShareCopied(false);

    const tryCopy = async (link: string) => {
      if (!navigator.clipboard?.writeText) {
        return false;
      }
      try {
        await navigator.clipboard.writeText(link);
        setShareCopied(true);
        return true;
      } catch {
        return false;
      }
    };

    try {
      const response = await fetch("/api/share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          snapshot: {
            parties,
            waitingList,
          } satisfies ShareSnapshot,
        }),
      });

      const payload = (await response.json()) as {
        id?: string;
        url?: string;
        mode?: "stored" | "snapshot";
        warning?: string;
        error?: string;
      };
      if (!response.ok || (!payload.url && !payload.id)) {
        throw new Error(payload.error ?? "공유 링크 생성에 실패했습니다.");
      }

      const link = payload.url ?? `${window.location.origin}/s/${payload.id}`;
      setShareLink(link);
      setShareNotice(payload.mode === "snapshot" ? payload.warning ?? "URL 스냅샷 링크로 생성되었습니다." : "");
      const copied = await tryCopy(link);
      if (!copied) {
        setShareNotice((previous) =>
          previous
            ? `${previous} 자동 복사에 실패해 직접 복사해 주세요.`
            : "공유 링크는 생성되었습니다. 자동 복사에 실패해 직접 복사해 주세요.",
        );
      }
    } catch (shareCreateError) {
      try {
        const token = encodeSnapshotToToken({
          parties,
          waitingList,
        });
        const fallbackLink = `${window.location.origin}/?snapshot=${encodeURIComponent(token)}`;
        setShareLink(fallbackLink);
        const copied = await tryCopy(fallbackLink);

        setShareError("");
        setShareNotice(
          copied
            ? "서버 공유 저장 실패로 URL 스냅샷 링크로 생성했습니다."
            : "서버 공유 저장 실패로 URL 스냅샷 링크를 생성했습니다. 자동 복사에 실패해 직접 복사해 주세요.",
        );
      } catch {
        setShareError(shareCreateError instanceof Error ? shareCreateError.message : "공유 링크 생성에 실패했습니다.");
      }
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("브라우저 복사 API를 사용할 수 없습니다.");
      }
      await navigator.clipboard.writeText(shareLink);
      setShareCopied(true);
      setShareError("");
    } catch {
      setShareError("클립보드 복사에 실패했습니다. 링크를 직접 복사해 주세요.");
    }
  };

  const refreshAllCharacterSpecs = async () => {
    if (specRefreshLoading) {
      return;
    }

    const uniqueMap = new Map<string, CharacterSummary>();

    for (const character of waitingList) {
      uniqueMap.set(characterKey(character), character);
    }
    for (const party of parties) {
      for (const character of party.slots) {
        if (!character) {
          continue;
        }
        uniqueMap.set(characterKey(character), character);
      }
    }

    const targets = Array.from(uniqueMap.values());
    if (targets.length === 0) {
      setSpecRefreshError("재조회할 캐릭터가 없습니다.");
      setSpecRefreshMessage("");
      return;
    }

    setSpecRefreshLoading(true);
    setSpecRefreshError("");
    setSpecRefreshMessage("");

    try {
      const refreshedEntries = await Promise.all(
        targets.map(async (target) => {
          const params = new URLSearchParams({
            name: target.name,
            serverId: String(target.serverId),
            size: "20",
          });

          try {
            const response = await fetch(`/api/characters/search?${params.toString()}`, {
              cache: "no-store",
            });
            if (!response.ok) {
              return null;
            }

            const payload = (await response.json()) as { items?: CharacterSummary[] };
            const items = Array.isArray(payload.items) ? payload.items : [];
            if (items.length === 0) {
              return null;
            }

            const targetCharacterId = normalizeCharacterId(target.characterId);
            const exact =
              items.find(
                (item) =>
                  item.serverId === target.serverId &&
                  normalizeCharacterId(item.characterId) === targetCharacterId,
              ) ??
              items.find((item) => item.serverId === target.serverId && item.name === target.name);

            if (!exact) {
              return null;
            }

            return {
              key: characterKey(target),
              character: mergeCharacterStats(target, exact),
            };
          } catch {
            return null;
          }
        }),
      );

      const updates = new Map<string, CharacterSummary>();
      for (const entry of refreshedEntries) {
        if (!entry) {
          continue;
        }
        updates.set(entry.key, entry.character);
      }

      if (updates.size === 0) {
        setSpecRefreshError("재조회 결과를 찾지 못했습니다.");
        return;
      }

      setWaitingList((previous) => previous.map((item) => updates.get(characterKey(item)) ?? item));
      setParties((previous) =>
        previous.map((party) => ({
          ...party,
          slots: party.slots.map((slot) => (slot ? updates.get(characterKey(slot)) ?? slot : null)),
        })),
      );

      setSpecRefreshMessage(`${targets.length.toLocaleString("ko-KR")}명 중 ${updates.size.toLocaleString("ko-KR")}명 재조회 완료`);
    } catch {
      setSpecRefreshError("스펙 재조회 중 오류가 발생했습니다.");
    } finally {
      setSpecRefreshLoading(false);
    }
  };

  const removeFromWaitingList = (character: CharacterSummary) => {
    setWaitingList((previous) => previous.filter((entry) => !sameCharacter(entry, character)));
  };

  const addToWaitingList = (character: CharacterSummary) => {
    setWaitingList((previous) => {
      if (previous.some((entry) => sameCharacter(entry, character))) {
        return previous;
      }
      return [character, ...previous];
    });
  };

  const getAssignmentStatus = (character: CharacterSummary) =>
    assignmentMap.get(characterKey(character)) ?? { rudra: false, erosion: false };

  const orderedWaitingList = useMemo(() => {
    const pending: CharacterSummary[] = [];
    const completed: CharacterSummary[] = [];

    for (const character of waitingList) {
      const status = assignmentMap.get(characterKey(character));
      if (status?.rudra && status?.erosion) {
        completed.push(character);
      } else {
        pending.push(character);
      }
    }

    return [...pending, ...completed];
  }, [waitingList, assignmentMap]);

  const filteredWaitingList = useMemo(() => {
    const keyword = waitingQuery.trim().toLowerCase();
    if (!keyword) {
      return orderedWaitingList;
    }

    return orderedWaitingList.filter((character) => {
      const className = character.className ?? "";
      return (
        character.name.toLowerCase().includes(keyword) ||
        character.serverName.toLowerCase().includes(keyword) ||
        className.toLowerCase().includes(keyword)
      );
    });
  }, [orderedWaitingList, waitingQuery]);

  const removeCharacterFromKindSlots = (
    mutableParties: Party[],
    target: CharacterSummary,
    kind: PartyKind,
    exclude?: { partyId: string; slotIndex: number },
  ) => {
    for (const party of mutableParties) {
      if (party.kind !== kind) {
        continue;
      }

      for (let index = 0; index < party.slots.length; index += 1) {
        if (exclude && exclude.partyId === party.id && exclude.slotIndex === index) {
          continue;
        }

        const entry = party.slots[index];
        if (entry && sameCharacter(entry, target)) {
          party.slots[index] = null;
        }
      }
    }
  };

  const clearSlotMemo = (partyId: string, slotIndex: number) => {
    const key = slotMemoKey(partyId, slotIndex);
    setSlotMemos((previous) => {
      if (!(key in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const updateSlotMemo = (partyId: string, slotIndex: number, memo: string) => {
    const key = slotMemoKey(partyId, slotIndex);
    const normalized = memo.slice(0, SLOT_MEMO_MAX_LENGTH);

    setSlotMemos((previous) => {
      if (normalized.length === 0) {
        if (!(key in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[key];
        return next;
      }

      if (previous[key] === normalized) {
        return previous;
      }

      return {
        ...previous,
        [key]: normalized,
      };
    });
  };

  const placeCharacterInSlot = (targetPartyId: string, targetSlotIndex: number, character: CharacterSummary) => {
    setParties((previous) => {
      const next = copyParties(previous);
      const party = next.find((entry) => entry.id === targetPartyId);
      if (!party || targetSlotIndex < 0 || targetSlotIndex >= SLOT_COUNT) {
        return previous;
      }

      removeCharacterFromKindSlots(next, character, party.kind);
      party.slots[targetSlotIndex] = character;
      return next;
    });
    clearSlotMemo(targetPartyId, targetSlotIndex);
  };

  const moveSlotCharacter = (
    sourcePartyId: string,
    sourceSlotIndex: number,
    targetPartyId: string,
    targetSlotIndex: number,
  ) => {
    if (sourcePartyId === targetPartyId && sourceSlotIndex === targetSlotIndex) {
      return;
    }

    setParties((previous) => {
      const next = copyParties(previous);
      const sourceParty = next.find((entry) => entry.id === sourcePartyId);
      const targetParty = next.find((entry) => entry.id === targetPartyId);

      if (!sourceParty || !targetParty) {
        return previous;
      }

      const sourceCharacter = sourceParty.slots[sourceSlotIndex];
      const targetCharacter = targetParty.slots[targetSlotIndex];

      if (!sourceCharacter) {
        return previous;
      }

      if (sourceParty.kind === targetParty.kind) {
        sourceParty.slots[sourceSlotIndex] = targetCharacter ?? null;
        targetParty.slots[targetSlotIndex] = sourceCharacter;
        return next;
      }

      removeCharacterFromKindSlots(next, sourceCharacter, targetParty.kind, {
        partyId: targetParty.id,
        slotIndex: targetSlotIndex,
      });

      sourceParty.slots[sourceSlotIndex] = null;
      targetParty.slots[targetSlotIndex] = sourceCharacter;

      return next;
    });
    clearSlotMemo(targetPartyId, targetSlotIndex);
  };

  const clearSlot = (partyId: string, slotIndex: number) => {
    setParties((previous) => {
      const next = copyParties(previous);
      const party = next.find((entry) => entry.id === partyId);
      if (!party) {
        return previous;
      }

      party.slots[slotIndex] = null;
      return next;
    });
  };

  const moveSlotToWaiting = (partyId: string, slotIndex: number, character: CharacterSummary) => {
    setWaitingList((previous) => {
      if (previous.some((entry) => sameCharacter(entry, character))) {
        return previous;
      }
      return [character, ...previous];
    });
    clearSlot(partyId, slotIndex);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const payload = event.active.data.current as DragPayload | undefined;
    if (payload) {
      setActiveDrag(payload);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activePayload = event.active.data.current as DragPayload | undefined;
    const dropPayload = event.over?.data.current as DropPayload | undefined;

    setActiveDrag(null);

    if (!activePayload || !dropPayload) {
      return;
    }

    if (activePayload.origin === "waiting" && dropPayload.type === "slot") {
      const targetParty = parties.find((party) => party.id === dropPayload.partyId);
      if (!targetParty) {
        return;
      }

      const status = getAssignmentStatus(activePayload.character);
      if ((targetParty.kind === "rudra" && status.rudra) || (targetParty.kind === "erosion" && status.erosion)) {
        return;
      }

      placeCharacterInSlot(dropPayload.partyId, dropPayload.slotIndex, activePayload.character);
      return;
    }

    if (activePayload.origin === "slot" && dropPayload.type === "slot") {
      moveSlotCharacter(
        activePayload.partyId,
        activePayload.slotIndex,
        dropPayload.partyId,
        dropPayload.slotIndex,
      );
      return;
    }

    if (activePayload.origin === "slot" && dropPayload.type === "waiting-drop") {
      clearSlot(activePayload.partyId, activePayload.slotIndex);
    }
  };

  return (
    <div className="md:h-screen overflow-hidden bg-neutral-950 tabular-nums select-none">
      <main className="mx-auto h-full w-full max-w-[1440px] overflow-hidden p-4 md:p-6">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDrag(null)}
        >
          <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="flex h-full min-h-0 flex-col gap-4">
        <section className={`${PANEL_CLASS}`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">AION2 PARTY BUILDER</p>
              <h1 className="mt-1 text-2xl font-semibold text-neutral-100 md:text-3xl">깐부 8인 파티 편성</h1>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                검색은 모달에서 수행하고, 선택한 캐릭터를 대기 목록에 추가한 뒤 드래그앤드랍으로 파티에 배치하세요.
              </p>
              {sharedId ? (
                <p className="mt-2 text-xs text-sky-300">
                  공유 링크로 불러온 상태입니다. ID: {sharedId}
                  {sharedCreatedText ? <span className="ml-2 text-neutral-400">생성: {sharedCreatedText}</span> : null}
                </p>
              ) : null}
            </div>

            <div className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300">
              루드라: <strong className={NUM_EMPHASIS_CLASS}>{rudraPartyCount}</strong>
              <span className="mx-2 text-neutral-500">|</span>
              침식: <strong className={NUM_EMPHASIS_CLASS}>{erosionPartyCount}</strong>
              <span className="mx-2 text-neutral-500">|</span>
              배치 인원: <strong className={NUM_EMPHASIS_CLASS}>{assignedCount}</strong>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(true);
                setModalError("");
              }}
              className={BUTTON_PRIMARY_CLASS}
            >
              캐릭터 검색 모달
            </button>

            <button
              type="button"
              onClick={() => void createShareLink()}
              disabled={shareLoading}
              className={`${BUTTON_SECONDARY_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {shareLoading ? "링크 생성중..." : "공유 링크 생성"}
            </button>

            <button
              type="button"
              onClick={() => void refreshAllCharacterSpecs()}
              disabled={specRefreshLoading}
              className={`${BUTTON_BLUE_SECONDARY_CLASS} col-span-2 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {specRefreshLoading ? "스펙 재조회중..." : "스펙 전체 재조회"}
            </button>

            <button
              type="button"
              onClick={() => addParty("rudra")}
              className={BUTTON_SECONDARY_CLASS}
            >
              + 루드라 파티
            </button>

            <button
              type="button"
              onClick={() => addParty("erosion")}
              className={BUTTON_SECONDARY_CLASS}
            >
              + 침식 파티
            </button>

            <div className="col-span-2 flex items-center rounded-md border border-neutral-700 bg-neutral-800 px-3 text-xs text-neutral-300">
              대기 목록: <strong className={`ml-1 ${NUM_EMPHASIS_CLASS}`}>{waitingList.length}</strong>
            </div>
          </div>

          {shareLink ? (
            <div className="mt-2 flex gap-2">
              <input readOnly value={shareLink} className={INPUT_CLASS} />
              <button
                type="button"
                onClick={() => void copyShareLink()}
                className={`${BUTTON_SECONDARY_CLASS} ${shareCopied ? "border-emerald-700/60 bg-emerald-900/40 text-emerald-200" : ""}`}
              >
                {shareCopied ? "복사됨" : "링크 복사"}
              </button>
            </div>
          ) : null}
          {shareError ? <p className="mt-2 text-sm text-rose-400">{shareError}</p> : null}
          {shareNotice ? <p className="mt-2 text-xs text-amber-300">{shareNotice}</p> : null}
          {specRefreshMessage ? <p className="mt-2 text-xs text-emerald-300">{specRefreshMessage}</p> : null}
          {specRefreshError ? <p className="mt-2 text-xs text-rose-400">{specRefreshError}</p> : null}
        </section>
          <section className={`${PANEL_CLASS} min-h-0 flex flex-1 flex-col`}>
            <div className="mb-3 flex flex-col">
              <h2 className="text-base font-medium text-neutral-100">대기 목록</h2>
              <p className="text-xs text-neutral-400">칩은 구분별 배치 상태를 표시하며, 둘 다 배치되면 카드가 비활성화됩니다.</p>
            </div>
            <div className="mb-2">
              <input
                value={waitingQuery}
                onChange={(event) => setWaitingQuery(event.target.value)}
                placeholder="대기목록 검색 (이름/서버/직업)"
                className={`${INPUT_CLASS} w-full`}
              />
            </div>

            <WaitingDropZone>
              {waitingList.length > 0 ? (
                filteredWaitingList.length > 0 ? (
                <div className="min-w-0 grid grid-cols-2 gap-2 md:grid-cols-1">
                  {filteredWaitingList.map((character) => (
                    <div key={character.id}>
                      {(() => {
                        const status = getAssignmentStatus(character);
                        const fullyAssigned = status.rudra && status.erosion;
                        const removeButton = (
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => removeFromWaitingList(character)}
                            aria-label="대기목록 제거"
                            title="대기목록 제거"
                            className="inline-flex rounded-md border border-neutral-600 bg-neutral-900 p-1.5 text-neutral-300 transition hover:bg-neutral-800"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <path
                                d="M6 7h12M9 7v12m6-12v12M8 7l1-2h6l1 2m-9 0l1 12h8l1-12"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        );

                        if (fullyAssigned) {
                          return (
                            <div className="cursor-not-allowed opacity-55">
                              <CharacterCard
                                character={character}
                                slotLayout
                                dense
                                assignmentStatus={status}
                                disabled
                                onOpenDetail={openCharacterDetail}
                                actionButton={removeButton}
                              />
                            </div>
                          );
                        }

                        return (
                          <DraggableCard
                            id={`waiting-${character.id}`}
                            payload={{ origin: "waiting", character }}
                          >
                            <CharacterCard
                              character={character}
                              slotLayout
                              dense
                              assignmentStatus={status}
                              onOpenDetail={openCharacterDetail}
                              actionButton={removeButton}
                            />
                          </DraggableCard>
                        );
                      })()}
                    </div>
                  ))}
                </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-neutral-600 bg-neutral-800 px-4 py-8 text-center text-sm text-neutral-400">
                    대기목록 검색 결과가 없습니다.
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-dashed border-neutral-600 bg-neutral-800 px-4 py-8 text-center text-sm text-neutral-400">
                  모달에서 캐릭터를 검색 후 대기 목록에 추가하세요.
                </div>
              )}
            </WaitingDropZone>
          </section>
            </aside>

          <section className="min-h-0 overflow-y-auto pr-1 space-y-3 scrollbar-neutral">
            <h2 className="text-base font-medium text-neutral-100">파티</h2>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {parties.map((party) => {
              const teamOneSlots = party.slots.slice(0, 4);
              const teamTwoSlots = party.slots.slice(4);
              const teamOneAverage = calculatePartyAverage(teamOneSlots);
              const teamTwoAverage = calculatePartyAverage(teamTwoSlots);
              const fullAverage = calculatePartyAverage(party.slots);

              return (
                <article key={party.id} className="rounded-xl border border-neutral-800 bg-neutral-900/90 shadow-sm p-4">
                  <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                    <input
                      value={party.name}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setParties((previous) =>
                          previous.map((entry) => (entry.id === party.id ? { ...entry, name: nextName } : entry)),
                        );
                      }}
                      className={`${INPUT_CLASS} w-24 shrink-0`}
                    />
                    <span
                      className={`h-8 inline-flex items-center rounded-md px-2 text-xs font-semibold ${
                        party.kind === "rudra" ? "bg-amber-900/40 text-amber-200" : "bg-indigo-900/40 text-indigo-200"
                      } shrink-0 whitespace-nowrap`}
                    >
                      {party.kind === "rudra" ? "루드라" : "침식"}
                    </span>
                    <div className="h-8 shrink-0 whitespace-nowrap inline-flex items-center rounded-md border border-neutral-700 bg-neutral-800 px-2 text-[11px] font-medium text-neutral-300">
                      전체 8인 평균 (<span className={NUM_EMPHASIS_CLASS}>{fullAverage.memberCount}</span>/8)
                      <span className="mx-1 text-neutral-400">|</span>
                      IL <span className={NUM_EMPHASIS_CLASS}>{formatAverage(fullAverage.itemLevelAverage)}</span>
                      <span className="mx-1 text-neutral-400">|</span>
                      <span className="text-sky-300">
                        CP <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatAverage(fullAverage.combatPowerAverage)}</span>
                      </span>
                    </div>

                    <div className="ml-auto flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => clearParty(party.id)}
                        className="h-8 inline-flex items-center rounded-md border border-neutral-600 px-2 text-[11px] font-medium text-neutral-300 transition hover:bg-neutral-800"
                      >
                        비우기
                      </button>
                      <button
                        type="button"
                        onClick={() => removeParty(party.id)}
                        disabled={parties.length <= 1}
                        className="h-8 inline-flex items-center rounded-md border border-neutral-600 px-2 text-[11px] font-medium text-neutral-300 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold tracking-wider text-neutral-400">
                          1팀 평균 (<span className={NUM_EMPHASIS_CLASS}>{teamOneAverage.memberCount}</span>/4)
                        </p>
                        <p className="text-[11px] text-neutral-300">
                          IL <span className={NUM_EMPHASIS_CLASS}>{formatAverage(teamOneAverage.itemLevelAverage)}</span>
                          <span className="mx-1 text-neutral-400">|</span>
                          <span className="text-sky-300">
                            CP <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatAverage(teamOneAverage.combatPowerAverage)}</span>
                          </span>
                        </p>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-1">
                        {teamOneSlots.map((character, index) => (
                          <PartySlot
                            key={`${party.id}-slot-${index}`}
                            partyId={party.id}
                            slotIndex={index}
                            character={character}
                            memoValue={slotMemos[slotMemoKey(party.id, index)] ?? ""}
                            onMemoChange={updateSlotMemo}
                            onMoveToWaiting={moveSlotToWaiting}
                            onOpenDetail={openCharacterDetail}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-neutral-700/80 bg-neutral-900/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold tracking-wider text-neutral-400">
                          2팀 평균 (<span className={NUM_EMPHASIS_CLASS}>{teamTwoAverage.memberCount}</span>/4)
                        </p>
                        <p className="text-[11px] text-neutral-300">
                          IL <span className={NUM_EMPHASIS_CLASS}>{formatAverage(teamTwoAverage.itemLevelAverage)}</span>
                          <span className="mx-1 text-neutral-400">|</span>
                          <span className="text-sky-300">
                            CP <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatAverage(teamTwoAverage.combatPowerAverage)}</span>
                          </span>
                        </p>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-1">
                        {teamTwoSlots.map((character, index) => (
                          <PartySlot
                            key={`${party.id}-slot-${index + 4}`}
                            partyId={party.id}
                            slotIndex={index + 4}
                            character={character}
                            memoValue={slotMemos[slotMemoKey(party.id, index + 4)] ?? ""}
                            onMemoChange={updateSlotMemo}
                            onMoveToWaiting={moveSlotToWaiting}
                            onOpenDetail={openCharacterDetail}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            </div>
          </section>
          </div>

          <DragOverlay>
            {activeDrag ? <CharacterCard character={activeDrag.character} compact slotLayout dense surface="slot" /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-4xl rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-100">캐릭터 검색</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800"
              >
                닫기
              </button>
            </div>

            <div className="grid h-[78vh] min-h-0 grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="min-h-0 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">검색 조건</p>
                </div>
                <form onSubmit={runSearchInModal} className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
                  <input
                    value={modalQuery}
                    onChange={(event) => setModalQuery(event.target.value)}
                    placeholder="캐릭터명"
                    className={INPUT_CLASS}
                  />

                  <select
                    value={modalServerId}
                    onChange={(event) => setModalServerId(event.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">전체 서버</option>
                    {servers.map((server) => (
                      <option key={server.serverId} value={server.serverId}>
                        {server.serverName}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    disabled={modalLoading}
                    className={`${BUTTON_PRIMARY_CLASS} col-span-2 w-full disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400`}
                  >
                    {modalLoading ? "검색중..." : "검색"}
                  </button>
                </form>

                <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400">
                  {modalSource ? <p>검색 소스: {modalSource}</p> : <p>검색 소스: 대기</p>}
                  <p className="mt-1">결과에서 선택한 캐릭터만 대기 목록에 추가됩니다.</p>
                </div>

                {modalError ? <p className="text-sm text-rose-500">{modalError}</p> : null}
              </aside>

              <section className="min-h-0 flex flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-200">검색 결과</h3>
                  <p className="text-xs text-neutral-400">{modalResults.length.toLocaleString("ko-KR")}건</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-neutral-700 scrollbar-neutral">
                  {modalResults.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-2">
                      {modalResults.map((character) => {
                        const inWaiting = waitingList.some((entry) => sameCharacter(entry, character));
                        const status = getAssignmentStatus(character);
                        const fullyAssigned = status.rudra && status.erosion;
                        const addButton = (
                          <button
                            type="button"
                            disabled={inWaiting}
                            onClick={() => addToWaitingList(character)}
                            className={`w-17 shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                              inWaiting
                                ? "cursor-not-allowed border border-emerald-700/60 bg-emerald-900/40 text-emerald-200"
                                : "bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
                            }`}
                          >
                            {inWaiting ? "대기중" : "대기 추가"}
                          </button>
                        );

                        return (
                          <div key={`result-${character.id}`} className="rounded-lg border border-neutral-700 bg-neutral-800/70 p-2">
                            <CharacterCard
                              character={character}
                              compact
                              slotLayout
                              dense
                              serverEmphasis
                              assignmentStatus={status}
                              disabled={fullyAssigned}
                              onOpenDetail={openCharacterDetail}
                            />
                            <div className="mt-2 flex justify-end">{addButton}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-10 text-center text-sm text-neutral-400">검색 결과가 없습니다.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {detailTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-5xl rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded-full border border-neutral-700 bg-neutral-800">
                  {detailData?.profile.profileImage ?? detailTarget.profileImageUrl ? (
                    <img
                      src={detailData?.profile.profileImage ?? detailTarget.profileImageUrl ?? ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">N/A</div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-neutral-100">
                    {detailTarget.name}[{detailTarget.serverName}]
                  </h2>
                  <p className="truncate text-xs text-neutral-400">
                    {detailData?.profile.className || detailTarget.className || "직업 미확인"}
                    {detailData?.profile.raceName ? ` · ${detailData.profile.raceName}` : ""}
                    {detailData?.profile.level ? ` · Lv.${detailData.profile.level}` : ""}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDetailTarget(null);
                  setDetailData(null);
                  setDetailError("");
                  closeEquipmentItemDetail();
                }}
                className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800"
              >
                닫기
              </button>
            </div>

            {detailLoading ? (
              <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 px-4 py-16 text-center text-sm text-neutral-300">
                상세 정보를 불러오는 중...
              </div>
            ) : detailError ? (
              <div className="rounded-lg border border-rose-700/60 bg-rose-900/30 px-4 py-10 text-sm text-rose-200">
                {detailError}
              </div>
            ) : detailData ? (
              <div className="grid max-h-[80vh] min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
                <section className="h-full min-h-0 flex flex-col rounded-lg border border-neutral-700 bg-neutral-800/40 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-neutral-100">착용 장비</h3>
                  <div className="relative h-full flex-1 overflow-y-auto pr-1 scrollbar-neutral">
                  <div className="absolute h-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1 scrollbar-neutral">
                  {detailData.equipment.equipmentList.length > 0 ? (
                    <div className="space-y-3">
                      {groupEquipmentItems(detailData.equipment.equipmentList, { includeEmptyRuneGroup: true }).map((group) => (
                        <div key={`equip-group-${group.category}`}>
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-neutral-300">{group.label}</p>
                            <p className="text-[10px] text-neutral-400">
                              {group.category === "rune" ? formatRuneSummary(group.items) : formatBreakthroughSummary(group.items)}
                            </p>
                          </div>
                          {group.category === "rune" ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {RUNE_SLOT_NAMES.map((slotName) => {
                                const item = group.items.find((entry) => entry.slotPosName === slotName) ?? null;
                                const tone = item ? getEquipmentGradeTone(item.grade) : null;
                                const slotToneClass = item
                                  ? tone?.row ?? "border-neutral-700 bg-neutral-900/70"
                                  : "border-dashed border-neutral-700 bg-neutral-900/30";

                                return (
                                  <div
                                    key={`rune-slot-${slotName}`}
                                    className={`rounded-md border p-2 ${slotToneClass} ${item ? "cursor-pointer transition hover:bg-neutral-800/60" : ""}`}
                                    onClick={item ? () => void openEquipmentItemDetail(item) : undefined}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="h-9 w-9 overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                                        {item?.icon ? (
                                          <img src={item.icon} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-500">
                                            빈칸
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p
                                          className={`truncate text-xs font-semibold ${item ? tone?.name ?? "text-neutral-100" : "text-neutral-400"}`}
                                        >
                                          {item?.name ?? `${slotName} 비어있음`}
                                          {item && item.enchantLevel > 0 ? (
                                            <span className="ml-1 text-[11px] text-neutral-300">+{item.enchantLevel}</span>
                                          ) : null}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {group.items.map((item) => {
                                const tone = getEquipmentGradeTone(item.grade);
                              return (
                                <div
                                  key={`eq-${item.slotPosName}-${item.id}-${item.slotPos}`}
                                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 transition hover:bg-neutral-800/60 ${tone.row}`}
                                  onClick={() => void openEquipmentItemDetail(item)}
                                >
                                  <div className="h-9 w-9 overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                                    {item.icon ? <img src={item.icon} alt="" className="h-full w-full object-cover" /> : null}
                                  </div>
                                    <div className="min-w-0 flex-1">
                                      <p className={`truncate text-xs font-semibold ${tone.name}`}>
                                        {item.name}
                                        {item.enchantLevel > 0 ? (
                                          <span className="ml-1 text-[11px] text-neutral-300">+{item.enchantLevel}</span>
                                        ) : null}
                                      </p>
                                      {(group.category === "weapon" || group.category === "armor" || group.category === "accessory") &&
                                      item.exceedLevel >= 0
                                        ? renderBreakthroughPips(item.exceedLevel)
                                        : null}
                                  </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-neutral-400">장비 정보가 없습니다.</p>
                  )}

                  <div className="mt-4 rounded-md border border-neutral-700 bg-neutral-900/60 p-2.5">
                    <div className="grid grid-cols-1 gap-3 text-xs text-neutral-300 sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] font-semibold text-neutral-200">액티브 스킬</p>
                        <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1 scrollbar-neutral">
                          {detailData.skills.activeSkills.length > 0 ? (
                            detailData.skills.activeSkills.map((skill, index) => (
                              <p
                                key={`active-skill-${skill.id}-${skill.name}-${index}`}
                                className="flex items-center gap-1.5 truncate"
                              >
                                <span className="h-4 w-4 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                                  {skill.icon ? <img src={skill.icon} alt="" className="h-full w-full object-cover" /> : null}
                                </span>
                                <span className="truncate">{skill.name}</span>
                                <span className={`ml-auto shrink-0 ${NUM_EMPHASIS_CLASS}`}>+{skill.skillLevel}</span>
                              </p>
                            ))
                          ) : (
                            <p className="text-neutral-500">표시할 액티브 스킬이 없습니다.</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-neutral-200">패시브 스킬</p>
                        <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1 scrollbar-neutral">
                          {detailData.skills.passiveSkills.length > 0 ? (
                            detailData.skills.passiveSkills.map((skill, index) => (
                              <p
                                key={`passive-skill-${skill.id}-${skill.name}-${index}`}
                                className="flex items-center gap-1.5 truncate"
                              >
                                <span className="h-4 w-4 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                                  {skill.icon ? <img src={skill.icon} alt="" className="h-full w-full object-cover" /> : null}
                                </span>
                                <span className="truncate">{skill.name}</span>
                                <span className={`ml-auto shrink-0 ${NUM_EMPHASIS_CLASS}`}>+{skill.skillLevel}</span>
                              </p>
                            ))
                          ) : (
                            <p className="text-neutral-500">표시할 패시브 스킬이 없습니다.</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-neutral-200">스티그마</p>
                        <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1 scrollbar-neutral">
                          {detailData.skills.stigmaSkills.length > 0 ? (
                            detailData.skills.stigmaSkills.map((skill, index) => (
                              <p
                                key={`stigma-skill-${skill.id}-${skill.name}-${index}`}
                                className="flex items-center gap-1.5 truncate"
                              >
                                <span className="h-4 w-4 shrink-0 overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                                  {skill.icon ? <img src={skill.icon} alt="" className="h-full w-full object-cover" /> : null}
                                </span>
                                <span className="truncate">{skill.name}</span>
                                <span className={`ml-auto shrink-0 ${NUM_EMPHASIS_CLASS}`}>+{skill.skillLevel}</span>
                              </p>
                            ))
                          ) : (
                            <p className="text-neutral-500">표시할 스티그마가 없습니다.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {detailData.equipment.skinList.length > 0 ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setSkinEquipmentCollapsed((previous) => !previous)}
                        className="flex w-full items-center justify-between rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-left text-sm font-semibold text-neutral-100 transition hover:bg-neutral-800/80"
                      >
                        <span>스킨 장비</span>
                        <span className="text-xs text-neutral-300">{skinEquipmentCollapsed ? "펼치기" : "접기"}</span>
                      </button>

                      {!skinEquipmentCollapsed ? (
                        <div className="mt-2 space-y-3">
                          {groupEquipmentItems(detailData.equipment.skinList).map((group) => (
                            <div key={`skin-group-${group.category}`}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="text-[11px] font-semibold text-neutral-300">{group.label}</p>
                                <p className="text-[10px] text-neutral-400">
                                  {group.category === "rune"
                                    ? formatRuneSummary(group.items)
                                    : formatBreakthroughSummary(group.items)}
                                </p>
                              </div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {group.items.map((item) => {
                                  const tone = getEquipmentGradeTone(item.grade);
                                  return (
                                    <div
                                      key={`skin-${item.slotPosName}-${item.id}-${item.slotPos}`}
                                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 transition hover:bg-neutral-800/60 ${tone.row}`}
                                      onClick={() => void openEquipmentItemDetail(item)}
                                    >
                                      <div className="h-9 w-9 overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                                        {item.icon ? <img src={item.icon} alt="" className="h-full w-full object-cover" /> : null}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className={`truncate text-xs font-semibold ${tone.name}`}>
                                          {item.name}
                                          {item.enchantLevel > 0 ? (
                                            <span className="ml-1 text-[11px] text-neutral-300">+{item.enchantLevel}</span>
                                          ) : null}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                  </div>
                </section>

                <aside className="min-h-0 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 scrollbar-neutral">
                  <h3 className="text-sm font-semibold text-neutral-100">캐릭터 정보</h3>
                  <div className="mt-2 space-y-1 text-xs text-neutral-300">
                    <p>IL <span className={NUM_EMPHASIS_CLASS}>{formatNumber(detailData.profile.itemLevel)}</span></p>
                    <p className="text-sky-300">CP <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatNumber(detailData.profile.combatPower)}</span></p>
                    {detailData.profile.regionName ? <p>지역: {detailData.profile.regionName}</p> : null}
                    <p>소스: {detailData.source}</p>
                  </div>

                  <h3 className="mt-4 text-sm font-semibold text-neutral-100">주요 스탯</h3>
                  <div className="mt-2 space-y-1 text-xs text-neutral-300">
                    {detailData.statList.slice(0, 12).map((stat) => (
                      <p key={`${stat.type}-${stat.name}`} className="truncate">
                        {stat.name || stat.type}: <span className={NUM_EMPHASIS_CLASS}>{formatNumber(stat.value)}</span>
                      </p>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <a
                      href={detailData.links.plaync}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center rounded-md border border-neutral-600 px-2 text-xs font-medium text-neutral-200 transition hover:bg-neutral-800"
                    >
                      PlayNC
                    </a>
                    <a
                      href={detailData.links.aon2}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center rounded-md border border-neutral-600 px-2 text-xs font-medium text-neutral-200 transition hover:bg-neutral-800"
                    >
                      AON2
                    </a>
                  </div>
                </aside>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectedEquipmentItem ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-80 rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <div className="h-10 w-10 overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                  {selectedEquipmentItem.icon ? (
                    <img src={selectedEquipmentItem.icon} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-neutral-100">{selectedEquipmentItem.name}</h3>
                  <p className="text-xs text-neutral-400">
                    {selectedEquipmentItem.slotPosName}
                    {selectedEquipmentItem.enchantLevel > 0 ? ` · +${selectedEquipmentItem.enchantLevel}` : ""}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeEquipmentItemDetail}
                className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-neutral-800"
              >
                닫기
              </button>
            </div>

            {equipmentItemLoading ? (
              <div className="rounded-lg border border-neutral-700 bg-neutral-800/40 px-4 py-14 text-center text-sm text-neutral-300">
                장비 상세를 불러오는 중...
              </div>
            ) : equipmentItemError ? (
              <div className="rounded-lg border border-rose-700/60 bg-rose-900/30 px-4 py-10 text-sm text-rose-200">
                {equipmentItemError}
              </div>
            ) : equipmentItemDetail ? (
              <div className="max-h-[72vh] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 scrollbar-neutral">
                {(() => {
                  const item = equipmentItemDetail.item as Record<string, unknown>;
                  const subStats = Array.isArray(item.subStats) ? (item.subStats as Record<string, unknown>[]) : [];
                  const subSkills = Array.isArray(item.subSkills) ? (item.subSkills as Record<string, unknown>[]) : [];
                  const magicStoneStats = Array.isArray(item.magicStoneStat)
                    ? (item.magicStoneStat as Record<string, unknown>[])
                    : [];
                  const soulBindRate = String(item.soulBindRate ?? "").trim();
                  const soulBindRateNumeric = Number.parseFloat(soulBindRate.replace(/[^\d.]/g, ""));
                  const soulBindRatePercent =
                    Number.isFinite(soulBindRateNumeric) && soulBindRateNumeric >= 0
                      ? Math.max(0, Math.min(100, soulBindRateNumeric))
                      : null;

                  return (
                    <>
                      <div className="rounded-md border border-neutral-700 bg-neutral-900/70 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-[10px] text-neutral-400">영혼각인 수치</p>
                          <p className="text-sm font-semibold text-teal-200">{soulBindRate || "-"}</p>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full border border-neutral-700 bg-neutral-800">
                          <div
                            className="h-full rounded-full bg-teal-400/90 transition-all"
                            style={{ width: `${soulBindRatePercent ?? 0}%` }}
                          />
                        </div>
                      </div>

                      <h4 className="mt-4 text-sm font-semibold text-neutral-100">영혼각인/조율 옵션</h4>
                      <div className="mt-1 space-y-1 text-xs text-neutral-300">
                        {subStats.map((stat, index) => (
                          <p key={`sub-${index}`} className="truncate">
                            {String(stat.name ?? "-")}: <span className={NUM_EMPHASIS_CLASS}>{String(stat.value ?? "-")}</span>
                          </p>
                        ))}
                        {subSkills.map((skill, index) => {
                          const level = skill.level ?? skill.skillLevel ?? skill.value;
                          return (
                            <p key={`sub-skill-${index}`} className="truncate">
                              {String(skill.name ?? "-")}:{" "}
                              <span className={NUM_EMPHASIS_CLASS}>
                                {level !== undefined && level !== null && String(level).trim().length > 0
                                  ? `+${String(level)}`
                                  : "-"}
                              </span>
                            </p>
                          );
                        })}
                        {subStats.length === 0 && subSkills.length === 0 ? (
                          <p className="text-neutral-500">표시 가능한 조율 옵션이 없습니다.</p>
                        ) : null}
                      </div>

                      {magicStoneStats.length > 0 ? (
                        <>
                          <h4 className="mt-4 text-sm font-semibold text-neutral-100">마석</h4>
                          <div className="mt-1 space-y-1 text-xs text-neutral-300">
                            {magicStoneStats.map((stat, index) => (
                              <p key={`magic-${index}`} className="truncate">
                                {String(stat.name ?? "-")} {String(stat.value ?? "")}
                              </p>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WaitingDropZone({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({
    id: "waiting-dropzone",
    data: {
      type: "waiting-drop",
    } satisfies DropPayload,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showTopFade, setShowTopFade] = useState(false);
  const [showBottomFade, setShowBottomFade] = useState(false);

  const updateBottomFade = () => {
    const element = scrollRef.current;
    if (!element) {
      setShowBottomFade(false);
      return;
    }

    const hasOverflow = element.scrollHeight > element.clientHeight + 1;
    const hasMoreAbove = element.scrollTop > 1;
    const hasMoreBelow = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    setShowTopFade(hasOverflow && hasMoreAbove);
    setShowBottomFade(hasOverflow && hasMoreBelow);
  };

  useEffect(() => {
    const frame = requestAnimationFrame(updateBottomFade);
    const onResize = () => updateBottomFade();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [children]);

  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-0 flex-1 overflow-hidden rounded-xl transition ${isOver ? "bg-neutral-800 ring-1 ring-neutral-600" : "bg-transparent"}`}
    >
      <div
        ref={scrollRef}
        onScroll={updateBottomFade}
        className="h-full overflow-y-auto overflow-x-hidden scrollbar-neutral"
      >
        {children}
      </div>
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-neutral-950/95 to-transparent transition-opacity duration-200 ${
          showTopFade ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-neutral-950/95 to-transparent transition-opacity duration-200 ${
          showBottomFade ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
