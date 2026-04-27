import { useDroppable } from "@dnd-kit/core";

import type { CharacterSummary } from "@/types/character";

import { SLOT_MEMO_MAX_LENGTH } from "./constants";
import { CharacterCard } from "./character-card";
import { DraggableCard } from "./draggable-card";
import type { DropPayload } from "./types";

export function PartySlot({
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
