"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { CharacterCard } from "@/components/party-builder/character-card";
import { CharacterSearchModal } from "@/components/party-builder/character-search-modal";
import {
  AUTO_SPEC_REFRESH_INTERVAL_MS,
  BUTTON_BLUE_SECONDARY_CLASS,
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  INPUT_CLASS,
  NUM_BLUE_EMPHASIS_CLASS,
  NUM_EMPHASIS_CLASS,
  PANEL_CLASS,
  RUNE_SLOT_NAMES,
  SLOT_COUNT,
  SLOT_MEMO_MAX_LENGTH,
  STORAGE_KEY,
} from "@/components/party-builder/constants";
import { PartyListSection } from "@/components/party-builder/party-list-section";
import type {
  CharacterDetailEquipmentItem,
  CharacterDetailData,
  DragPayload,
  DropPayload,
  EquipmentItemDetailData,
  Party,
  PartyKind,
  SlotMemoMap,
} from "@/components/party-builder/types";
import {
  characterKey,
  clonePartiesFromSnapshot,
  copyParties,
  createDefaultParties,
  createParty,
  formatBreakthroughSummary,
  formatNumber,
  formatRuneSummary,
  generateNextPartyId,
  getEquipmentGradeTone,
  groupEquipmentItems,
  mergeCharacterStats,
  normalizeCharacterId,
  parseCharacterLink,
  parseSlotMemos,
  renderBreakthroughPips,
  sameCharacter,
  slotMemoKey,
} from "@/components/party-builder/utils";
import { WaitingListPanel } from "@/components/party-builder/waiting-list-panel";
import { encodeSnapshotToToken } from "@/lib/share-link";
import { parseShareSnapshot } from "@/lib/share-snapshot";
import type { CharacterSummary, ServerInfo } from "@/types/character";
import type { ShareSnapshot } from "@/types/share";

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
  const [serversError, setServersError] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState("");
  const [modalCharacterLink, setModalCharacterLink] = useState("");
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
  const [sharedCreatedText, setSharedCreatedText] = useState("");

  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const refreshAllSpecsRef = useRef<((options?: { silent?: boolean }) => Promise<void>) | null>(null);

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
  useEffect(() => {
    if (!sharedCreatedAt) {
      setSharedCreatedText("");
      return;
    }

    const parsed = new Date(sharedCreatedAt);
    if (Number.isNaN(parsed.getTime())) {
      setSharedCreatedText("");
      return;
    }

    setSharedCreatedText(parsed.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }));
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

        const payload = (await response.json()) as {
          items?: ServerInfo[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "서버 목록 API 연결에 실패했습니다.");
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        setServers(items);
        setServersError(items.length > 0 ? "" : "서버 목록이 비어 있습니다.");
      } catch {
        setServers([]);
        setServersError("서버 목록을 불러오지 못했습니다.");
      }
    };

    void loadServers();

    return () => controller.abort();
  }, []);

  const addParty = (kind: PartyKind) => {
    setParties((previous) => {
      const nextIndex = previous.filter((party) => party.kind === kind).length + 1;
      const nextId = generateNextPartyId(kind, previous);
      return [...previous, createParty(kind, nextIndex, nextId)];
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

  const importCharacterByLink = async () => {
    const parsed = parseCharacterLink(modalCharacterLink);
    if (!parsed) {
      setModalError("지원하지 않는 링크 형식입니다. PlayNC/A2Tool 캐릭터 링크를 확인해 주세요.");
      return;
    }

    setModalLoading(true);
    setModalError("");
    setModalSource("");

    const searchByName = async (name: string, serverId: number, preferCharacterId?: string) => {
      const params = new URLSearchParams({
        name,
        serverId: String(serverId),
        size: "20",
        t: Date.now().toString(),
      });

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
      if (items.length === 0) {
        return { picked: null as CharacterSummary | null, source: payload.source ?? "" };
      }

      const normalizedPreferCharacterId = preferCharacterId ? normalizeCharacterId(preferCharacterId) : "";
      const picked =
        items.find(
          (item) =>
            item.serverId === serverId &&
            normalizedPreferCharacterId &&
            normalizeCharacterId(item.characterId) === normalizedPreferCharacterId,
        ) ??
        items.find((item) => item.serverId === serverId && item.name === name) ??
        items[0] ??
        null;

      return { picked, source: payload.source ?? "" };
    };

    try {
      if (parsed.name && !parsed.characterId) {
        const { picked, source } = await searchByName(parsed.name, parsed.serverId);
        if (!picked) {
          throw new Error("링크에서 캐릭터를 찾지 못했습니다.");
        }
        setModalResults([picked]);
        setModalSource(source ? `${parsed.source} → ${source}` : parsed.source);
        return;
      }

      if (!parsed.characterId) {
        throw new Error("링크에 characterId 정보가 없습니다.");
      }

      const detailParams = new URLSearchParams({
        characterId: parsed.characterId,
        serverId: String(parsed.serverId),
        t: Date.now().toString(),
      });
      const detailResponse = await fetch(`/api/characters/detail?${detailParams.toString()}`, {
        cache: "no-store",
      });

      const detailPayload = (await detailResponse.json()) as CharacterDetailData & { error?: string };
      if (!detailResponse.ok) {
        throw new Error(detailPayload.error ?? "링크 상세 조회에 실패했습니다.");
      }

      const normalizedCharacterId = normalizeCharacterId(detailPayload.profile.characterId || parsed.characterId);
      const serverId = detailPayload.profile.serverId || parsed.serverId;
      const serverName =
        detailPayload.profile.serverName ||
        servers.find((server) => server.serverId === serverId)?.serverName ||
        String(serverId);

      let base: CharacterSummary = {
        id: `${serverId}:${normalizedCharacterId}`,
        characterId: normalizedCharacterId,
        name: detailPayload.profile.characterName || "",
        serverId,
        serverName,
        level: detailPayload.profile.level || 0,
        className: detailPayload.profile.className || undefined,
        itemLevel: detailPayload.profile.itemLevel || 0,
        combatPower: detailPayload.profile.combatPower || 0,
        profileImageUrl: detailPayload.profile.profileImage || null,
        source: "plaync-api",
      };

      if (!base.name) {
        throw new Error("링크 상세 응답에 캐릭터명이 없어 불러올 수 없습니다.");
      }

      if (base.itemLevel <= 0 || base.combatPower <= 0 || !base.className) {
        try {
          const { picked, source } = await searchByName(base.name, base.serverId, base.characterId);
          if (picked) {
            base = mergeCharacterStats(base, picked);
            setModalSource(source ? `${parsed.source} → detail+${source}` : `${parsed.source} → detail`);
          } else {
            setModalSource(`${parsed.source} → detail`);
          }
        } catch {
          setModalSource(`${parsed.source} → detail`);
        }
      } else {
        setModalSource(`${parsed.source} → detail`);
      }

      setModalResults([base]);
    } catch (error) {
      setModalResults([]);
      setModalSource("");
      setModalError(error instanceof Error ? error.message : "링크 불러오기에 실패했습니다.");
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
        name: character.name,
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

  const refreshAllCharacterSpecs = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
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
      if (!silent) {
        setSpecRefreshError("재조회할 캐릭터가 없습니다.");
        setSpecRefreshMessage("");
      }
      return;
    }

    setSpecRefreshLoading(true);
    if (!silent) {
      setSpecRefreshError("");
      setSpecRefreshMessage("");
    }

    try {
      const refreshedEntries = await Promise.all(
        targets.map(async (target) => {
          try {
            const cacheBust = Date.now().toString();
            const detailParams = new URLSearchParams({
              characterId: target.characterId,
              serverId: String(target.serverId),
              name: target.name,
              t: cacheBust,
            });

            const detailResponse = await fetch(`/api/characters/detail?${detailParams.toString()}`, {
              cache: "no-store",
            });

            if (detailResponse.ok) {
              const detailPayload = (await detailResponse.json()) as {
                profile?: {
                  className?: string;
                  itemLevel?: number;
                  combatPower?: number;
                };
              };

              const profile = detailPayload.profile;
              if (profile) {
                const mergedFromDetail: CharacterSummary = {
                  ...target,
                  className: profile.className || target.className,
                  itemLevel: typeof profile.itemLevel === "number" && profile.itemLevel > 0 ? profile.itemLevel : target.itemLevel,
                  combatPower:
                    typeof profile.combatPower === "number" && profile.combatPower > 0
                      ? profile.combatPower
                      : target.combatPower,
                  source: "plaync-api",
                };

                return {
                  key: characterKey(target),
                  character: mergedFromDetail,
                };
              }
            }

            const searchParams = new URLSearchParams({
              name: target.name,
              serverId: String(target.serverId),
              size: "20",
              t: cacheBust,
            });

            const searchResponse = await fetch(`/api/characters/search?${searchParams.toString()}`, {
              cache: "no-store",
            });
            if (!searchResponse.ok) {
              return null;
            }

            const searchPayload = (await searchResponse.json()) as { items?: CharacterSummary[] };
            const items = Array.isArray(searchPayload.items) ? searchPayload.items : [];
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
        if (!silent) {
          setSpecRefreshError("재조회 결과를 찾지 못했습니다.");
        }
        return;
      }

      setWaitingList((previous) => previous.map((item) => updates.get(characterKey(item)) ?? item));
      setParties((previous) =>
        previous.map((party) => ({
          ...party,
          slots: party.slots.map((slot) => (slot ? updates.get(characterKey(slot)) ?? slot : null)),
        })),
      );

      if (!silent) {
        setSpecRefreshMessage(`${targets.length.toLocaleString("ko-KR")}명 중 ${updates.size.toLocaleString("ko-KR")}명 재조회 완료`);
      }
    } catch {
      if (!silent) {
        setSpecRefreshError("스펙 재조회 중 오류가 발생했습니다.");
      }
    } finally {
      setSpecRefreshLoading(false);
    }
  };

  useEffect(() => {
    refreshAllSpecsRef.current = refreshAllCharacterSpecs;
  }, [refreshAllCharacterSpecs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const runner = refreshAllSpecsRef.current;
      if (!runner) {
        return;
      }
      void runner({ silent: true });
    }, AUTO_SPEC_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

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
      <main className="mx-auto h-full w-full max-w-[1920px] overflow-hidden p-4 md:p-6">
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
                setModalCharacterLink("");
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
            <p className="col-span-2 -mt-1 text-[11px] text-neutral-400">자동 재조회: 1시간마다</p>

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
        <WaitingListPanel
          waitingList={waitingList}
          filteredWaitingList={filteredWaitingList}
          waitingQuery={waitingQuery}
          onWaitingQueryChange={setWaitingQuery}
          getAssignmentStatus={getAssignmentStatus}
          onRemoveFromWaitingList={removeFromWaitingList}
          onOpenDetail={openCharacterDetail}
        />
            </aside>

          <PartyListSection
            parties={parties}
            slotMemos={slotMemos}
            onRenameParty={(partyId, name) => {
              setParties((previous) => previous.map((entry) => (entry.id === partyId ? { ...entry, name } : entry)));
            }}
            onClearParty={clearParty}
            onRemoveParty={removeParty}
            onMemoChange={updateSlotMemo}
            onMoveToWaiting={moveSlotToWaiting}
            onOpenDetail={openCharacterDetail}
          />
          </div>

          <DragOverlay>
            {activeDrag ? <CharacterCard character={activeDrag.character} compact slotLayout dense surface="slot" /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      <CharacterSearchModal
        isOpen={isModalOpen}
        modalQuery={modalQuery}
        modalServerId={modalServerId}
        modalCharacterLink={modalCharacterLink}
        modalResults={modalResults}
        modalSource={modalSource}
        modalLoading={modalLoading}
        modalError={modalError}
        servers={servers}
        serversError={serversError}
        waitingList={waitingList}
        onClose={() => setIsModalOpen(false)}
        onSubmit={runSearchInModal}
        onImportByLink={importCharacterByLink}
        onModalQueryChange={setModalQuery}
        onModalServerChange={setModalServerId}
        onModalCharacterLinkChange={setModalCharacterLink}
        onAddToWaitingList={addToWaitingList}
        getAssignmentStatus={getAssignmentStatus}
        onOpenDetail={openCharacterDetail}
      />

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
              <div className="max-h-[80vh] min-h-0 space-y-3 overflow-y-auto pr-1 scrollbar-neutral">
                <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
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
                                <span className="ml-auto shrink-0 text-[10px] text-neutral-400">
                                  <span className={NUM_EMPHASIS_CLASS}>+{skill.skillLevel}</span>
                                  <span className="mx-1 text-neutral-600">/</span>
                                  목표 <span className="font-semibold text-emerald-300">+{skill.targetLevel}</span>
                                </span>
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
                                <span className="ml-auto shrink-0 text-[10px] text-neutral-400">
                                  <span className={NUM_EMPHASIS_CLASS}>+{skill.skillLevel}</span>
                                  <span className="mx-1 text-neutral-600">/</span>
                                  목표 <span className="font-semibold text-emerald-300">+{skill.targetLevel}</span>
                                </span>
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
                                <span className="ml-auto shrink-0 text-[10px] text-neutral-400">
                                  <span className={NUM_EMPHASIS_CLASS}>+{skill.skillLevel}</span>
                                  <span className="mx-1 text-neutral-600">/</span>
                                  목표 <span className="font-semibold text-emerald-300">+{skill.targetLevel}</span>
                                </span>
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
                    </div>
                  </aside>
                </div>

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
