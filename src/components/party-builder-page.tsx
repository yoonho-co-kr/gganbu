"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState } from "react";

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
const PANEL_CLASS = "rounded-xl border border-slate-800 bg-slate-900/90 shadow-sm";
const INPUT_CLASS =
  "h-10 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-800";
const BUTTON_PRIMARY_CLASS =
  "h-10 rounded-md bg-slate-100 px-4 text-sm font-medium text-slate-900 transition hover:bg-slate-200";
const BUTTON_SECONDARY_CLASS =
  "h-10 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-200 transition hover:bg-slate-800";

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

function classInitial(className?: string) {
  if (!className || className.trim().length === 0) {
    return "?";
  }
  return className.trim().charAt(0);
}

function sameCharacter(a: CharacterSummary, b: CharacterSummary) {
  return a.characterId === b.characterId && a.serverId === b.serverId;
}

function characterKey(character: CharacterSummary) {
  return `${character.serverId}:${character.characterId}`;
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

function CharacterCard({
  character,
  compact = false,
  assignmentStatus,
  disabled = false,
  actionButton,
}: {
  character: CharacterSummary;
  compact?: boolean;
  assignmentStatus?: { rudra: boolean; erosion: boolean };
  disabled?: boolean;
  actionButton?: React.ReactNode;
}) {
  return (
    <div
      className={`min-h-40 w-full rounded-lg border border-slate-800 bg-slate-900/95 p-3 shadow-sm ${
        compact ? "" : "hover:shadow"
      } transition-shadow`}
    >
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 overflow-hidden rounded-lg bg-slate-800">
          {character.profileImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.profileImageUrl}
              alt={character.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">NO IMG</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-100">{character.name}</p>
          <p className="truncate text-xs text-slate-400">{character.serverName}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px]">
            <span className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-medium text-slate-300">
              {character.className ?? "직업 미확인"}
            </span>
            <span className="text-slate-400">Lv.{character.level || 0}</span>
          </div>
        </div>

        <div className="h-9 w-9 overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
          {character.classIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.classIconUrl}
              alt={character.className ?? "class icon"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-300">
              {classInitial(character.className)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
        <div className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1">
          IL <span className="font-medium text-slate-100">{formatNumber(character.itemLevel)}</span>
        </div>
        <div className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1">
          CP <span className="font-medium text-slate-100">{formatNumber(character.combatPower)}</span>
        </div>
      </div>

      {assignmentStatus ? (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]">
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${
              assignmentStatus.rudra
                ? "bg-slate-800 text-slate-500 line-through"
                : "border border-amber-700/60 bg-amber-900/40 text-amber-200"
            }`}
          >
            루드라
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${
              assignmentStatus.erosion
                ? "bg-slate-800 text-slate-500 line-through"
                : "border border-indigo-700/60 bg-indigo-900/40 text-indigo-200"
            }`}
          >
            침식
          </span>
          {disabled ? <span className="ml-auto text-[10px] font-semibold text-rose-400">배치완료</span> : null}
        </div>
      ) : null}

      {actionButton ? <div className="mt-2 flex justify-end">{actionButton}</div> : null}
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
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
      {children}
    </div>
  );
}

function PartySlot({
  partyId,
  slotIndex,
  character,
  onMoveToWaiting,
}: {
  partyId: string;
  slotIndex: number;
  character: CharacterSummary | null;
  onMoveToWaiting?: (partyId: string, slotIndex: number, character: CharacterSummary) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${partyId}-${slotIndex}`,
    data: {
      type: "slot",
      partyId,
      slotIndex,
    } satisfies DropPayload,
  });

  const slotLabel = slotIndex < 4 ? `1팀-${slotIndex + 1}` : `2팀-${slotIndex - 3}`;

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-2 ${
        isOver ? "border-slate-500 bg-slate-800" : "border-slate-700 bg-slate-900/60"
      }`}
    >
      <p className="mb-1 text-[11px] font-semibold text-slate-400">{slotLabel}</p>

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
              actionButton={
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onMoveToWaiting?.(partyId, slotIndex, character)}
                  aria-label="대기로 이동"
                  title="대기로 이동"
                  className="inline-flex rounded-md border border-slate-600 bg-slate-900/95 p-1.5 text-slate-300 transition hover:bg-slate-800"
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
        <div className="h-40 flex items-center justify-center rounded-lg border border-dashed border-slate-600 text-xs text-slate-400">
          드롭
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
  const [servers, setServers] = useState<ServerInfo[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState("");
  const [modalServerId, setModalServerId] = useState<string>("");
  const [modalResults, setModalResults] = useState<CharacterSummary[]>([]);
  const [modalSource, setModalSource] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  const [shareLoading, setShareLoading] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [shareError, setShareError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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

      const parsed = parseShareSnapshot(JSON.parse(raw));
      if (!parsed) {
        return;
      }

      setParties(clonePartiesFromSnapshot(parsed.parties));
      setWaitingList(parsed.waitingList);
    } catch {
      // Ignore malformed local storage.
    }
  }, [hasInitialSnapshot]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ parties, waitingList }));
  }, [parties, waitingList]);

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

  const createShareLink = async () => {
    setShareLoading(true);
    setShareError("");
    setShareCopied(false);

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

      const payload = (await response.json()) as { id?: string; url?: string; error?: string };
      if (!response.ok || !payload.id) {
        throw new Error(payload.error ?? "공유 링크 생성에 실패했습니다.");
      }

      const link = payload.url ?? `${window.location.origin}/s/${payload.id}`;
      setShareLink(link);

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setShareCopied(true);
      }
    } catch (shareCreateError) {
      setShareError(shareCreateError instanceof Error ? shareCreateError.message : "공유 링크 생성에 실패했습니다.");
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
    <div className="min-h-screen bg-slate-950">
      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 p-4 pb-10 md:p-8">
        <section className={`${PANEL_CLASS} p-5`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">AION2 PARTY BUILDER</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-100 md:text-3xl">깐부 8인 파티 편성</h1>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                검색은 모달에서 수행하고, 선택한 캐릭터를 대기 목록에 추가한 뒤 드래그앤드랍으로 파티에 배치하세요.
              </p>
              {sharedId ? (
                <p className="mt-2 text-xs text-sky-300">
                  공유 링크로 불러온 상태입니다. ID: {sharedId}
                  {sharedCreatedText ? <span className="ml-2 text-slate-400">생성: {sharedCreatedText}</span> : null}
                </p>
              ) : null}
            </div>

            <div className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300">
              루드라: <strong className="text-slate-100">{rudraPartyCount}</strong>
              <span className="mx-2 text-slate-500">|</span>
              침식: <strong className="text-slate-100">{erosionPartyCount}</strong>
              <span className="mx-2 text-slate-500">|</span>
              배치 인원: <strong className="text-slate-100">{assignedCount}</strong>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-[180px_180px_180px_180px_1fr]">
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

            <div className="flex items-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-300">
              대기 목록: <strong className="ml-1 text-slate-100">{waitingList.length}</strong>
            </div>
          </div>

          {shareLink ? (
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px]">
              <input readOnly value={shareLink} className={INPUT_CLASS} />
              <button
                type="button"
                onClick={() => void copyShareLink()}
                className={`${BUTTON_SECONDARY_CLASS} ${shareCopied ? "border-emerald-700 text-emerald-300" : ""}`}
              >
                {shareCopied ? "복사됨" : "링크 복사"}
              </button>
            </div>
          ) : null}
          {shareError ? <p className="mt-2 text-sm text-rose-400">{shareError}</p> : null}
        </section>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveDrag(null)}
        >
          <section className={`${PANEL_CLASS} p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-medium text-slate-100">대기 목록</h2>
              <p className="text-xs text-slate-400">칩은 구분별 배치 상태를 표시하며, 둘 다 배치되면 카드가 비활성화됩니다.</p>
            </div>

            <WaitingDropZone>
              {waitingList.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {waitingList.map((character) => (
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
                            className="inline-flex rounded-md border border-slate-600 bg-slate-900/95 p-1.5 text-slate-300 transition hover:bg-slate-800"
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
                                assignmentStatus={status}
                                disabled
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
                            <CharacterCard character={character} assignmentStatus={status} actionButton={removeButton} />
                          </DraggableCard>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-600 bg-slate-800 px-4 py-8 text-center text-sm text-slate-400">
                  모달에서 캐릭터를 검색 후 대기 목록에 추가하세요.
                </div>
              )}
            </WaitingDropZone>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {parties.map((party) => (
              <article key={party.id} className={`${PANEL_CLASS} p-4`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <input
                    value={party.name}
                    onChange={(event) => {
                      const nextName = event.target.value;
                      setParties((previous) =>
                        previous.map((entry) => (entry.id === party.id ? { ...entry, name: nextName } : entry)),
                      );
                    }}
                    className={INPUT_CLASS}
                  />
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      party.kind === "rudra" ? "bg-amber-900/40 text-amber-200" : "bg-indigo-900/40 text-indigo-200"
                    }`}
                  >
                    {party.kind === "rudra" ? "루드라" : "침식"}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => clearParty(party.id)}
                      className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
                    >
                      비우기
                    </button>
                    <button
                      type="button"
                      onClick={() => removeParty(party.id)}
                      disabled={parties.length <= 1}
                      className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      삭제
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">1팀</p>
                    {party.slots.slice(0, 4).map((character, index) => (
                      <PartySlot
                        key={`${party.id}-slot-${index}`}
                        partyId={party.id}
                        slotIndex={index}
                        character={character}
                        onMoveToWaiting={moveSlotToWaiting}
                      />
                    ))}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">2팀</p>
                    {party.slots.slice(4).map((character, index) => (
                      <PartySlot
                        key={`${party.id}-slot-${index + 4}`}
                        partyId={party.id}
                        slotIndex={index + 4}
                        character={character}
                        onMoveToWaiting={moveSlotToWaiting}
                      />
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </section>

          <DragOverlay>
            {activeDrag ? <CharacterCard character={activeDrag.character} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-4xl rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">캐릭터 검색</h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
              >
                닫기
              </button>
            </div>

            <form onSubmit={runSearchInModal} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_120px]">
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
                className={`${BUTTON_PRIMARY_CLASS} disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400`}
              >
                {modalLoading ? "검색중..." : "검색"}
              </button>
            </form>

            {modalSource ? <p className="mt-2 text-xs text-slate-400">검색 소스: {modalSource}</p> : null}
            <p className="mt-1 text-xs text-slate-400">검색 결과에서 선택한 캐릭터만 대기 목록에 추가됩니다.</p>
            {modalError ? <p className="mt-2 text-sm text-rose-600">{modalError}</p> : null}

            <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-lg border border-slate-700">
              {modalResults.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-2">
                  {modalResults.map((character) => {
                    const inWaiting = waitingList.some((entry) => sameCharacter(entry, character));
                    const status = getAssignmentStatus(character);
                    const fullyAssigned = status.rudra && status.erosion;

                    return (
                      <div key={`result-${character.id}`} className="rounded-lg border border-slate-700 bg-slate-800/70 p-2">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <CharacterCard character={character} compact assignmentStatus={status} disabled={fullyAssigned} />
                          </div>

                          <button
                            type="button"
                            disabled={inWaiting}
                            onClick={() => addToWaitingList(character)}
                            className={`w-17 shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                              inWaiting
                                ? "cursor-not-allowed bg-emerald-900/40 text-emerald-200"
                                : "bg-slate-100 text-slate-900 hover:bg-slate-200"
                            }`}
                          >
                            {inWaiting ? "대기중" : "대기 추가"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다.</div>
              )}
            </div>
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

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl p-2 transition ${isOver ? "bg-slate-800 ring-1 ring-slate-600" : "bg-transparent"}`}
    >
      {children}
    </div>
  );
}
