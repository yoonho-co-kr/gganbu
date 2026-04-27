import type { CharacterSummary } from "@/types/character";

import { INPUT_CLASS, NUM_EMPHASIS_CLASS, PANEL_CLASS } from "./constants";
import { CharacterCard } from "./character-card";
import { DraggableCard } from "./draggable-card";
import { WaitingDropZone } from "./waiting-drop-zone";

export function WaitingListPanel({
  waitingList,
  filteredWaitingList,
  waitingQuery,
  onWaitingQueryChange,
  getAssignmentStatus,
  onRemoveFromWaitingList,
  onOpenDetail,
}: {
  waitingList: CharacterSummary[];
  filteredWaitingList: CharacterSummary[];
  waitingQuery: string;
  onWaitingQueryChange: (value: string) => void;
  getAssignmentStatus: (character: CharacterSummary) => { rudra: boolean; erosion: boolean };
  onRemoveFromWaitingList: (character: CharacterSummary) => void;
  onOpenDetail: (character: CharacterSummary) => void;
}) {
  return (
    <section className={`${PANEL_CLASS} min-h-0 flex flex-1 flex-col`}>
      <div className="mb-3 flex flex-col">
        <h2 className="text-base font-medium text-neutral-100">대기 목록</h2>
        <p className="text-xs text-neutral-400">칩은 구분별 배치 상태를 표시하며, 둘 다 배치되면 카드가 비활성화됩니다.</p>
      </div>
      <div className="mb-2">
        <input
          value={waitingQuery}
          onChange={(event) => onWaitingQueryChange(event.target.value)}
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
                        onClick={() => onRemoveFromWaitingList(character)}
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
                            onOpenDetail={onOpenDetail}
                            actionButton={removeButton}
                          />
                        </div>
                      );
                    }

                    return (
                      <DraggableCard id={`waiting-${character.id}`} payload={{ origin: "waiting", character }}>
                        <CharacterCard
                          character={character}
                          slotLayout
                          dense
                          assignmentStatus={status}
                          onOpenDetail={onOpenDetail}
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
  );
}
