import type { CharacterSummary } from "@/types/character";

import { INPUT_CLASS, NUM_BLUE_EMPHASIS_CLASS, NUM_EMPHASIS_CLASS } from "./constants";
import { PartySlot } from "./party-slot";
import type { Party, SlotMemoMap } from "./types";
import { calculatePartyAverage, formatAverage, slotMemoKey } from "./utils";

export function PartyListSection({
  parties,
  slotMemos,
  onRenameParty,
  onClearParty,
  onRemoveParty,
  onMemoChange,
  onMoveToWaiting,
  onOpenDetail,
}: {
  parties: Party[];
  slotMemos: SlotMemoMap;
  onRenameParty: (partyId: string, name: string) => void;
  onClearParty: (partyId: string) => void;
  onRemoveParty: (partyId: string) => void;
  onMemoChange: (partyId: string, slotIndex: number, memo: string) => void;
  onMoveToWaiting: (partyId: string, slotIndex: number, character: CharacterSummary) => void;
  onOpenDetail: (character: CharacterSummary) => void;
}) {
  return (
    <section className="min-h-0 overflow-y-auto space-y-3 scrollbar-neutral">
      <h2 className="text-base font-medium text-neutral-100">파티</h2>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {parties.map((party) => {
          const teamOneSlots = party.slots.slice(0, 4);
          const teamTwoSlots = party.slots.slice(4);
          const teamOneAverage = calculatePartyAverage(teamOneSlots);
          const teamTwoAverage = calculatePartyAverage(teamTwoSlots);
          const fullAverage = calculatePartyAverage(party.slots);

          return (
            <article key={party.id} className="rounded-xl border border-neutral-800 bg-neutral-900/90 p-4 shadow-sm">
              <div className="mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
                <input
                  value={party.name}
                  onChange={(event) => onRenameParty(party.id, event.target.value)}
                  className={`${INPUT_CLASS} w-24 shrink-0`}
                />
                <span
                  className={`h-8 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-semibold ${
                    party.kind === "rudra" ? "bg-amber-900/40 text-amber-200" : "bg-indigo-900/40 text-indigo-200"
                  } inline-flex items-center`}
                >
                  {party.kind === "rudra" ? "루드라" : "침식"}
                </span>
                <div className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-800 px-2 text-[11px] font-medium text-neutral-300">
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
                    onClick={() => onClearParty(party.id)}
                    className="h-8 inline-flex items-center rounded-md border border-neutral-600 px-2 text-[11px] font-medium text-neutral-300 transition hover:bg-neutral-800"
                  >
                    비우기
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveParty(party.id)}
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
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {teamOneSlots.map((character, index) => (
                      <PartySlot
                        key={`${party.id}-slot-${index}`}
                        partyId={party.id}
                        slotIndex={index}
                        character={character}
                        memoValue={slotMemos[slotMemoKey(party.id, index)] ?? ""}
                        onMemoChange={onMemoChange}
                        onMoveToWaiting={onMoveToWaiting}
                        onOpenDetail={onOpenDetail}
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
                  <div className="mt-2 grid grid-cols-1 gap-2">
                    {teamTwoSlots.map((character, index) => (
                      <PartySlot
                        key={`${party.id}-slot-${index + 4}`}
                        partyId={party.id}
                        slotIndex={index + 4}
                        character={character}
                        memoValue={slotMemos[slotMemoKey(party.id, index + 4)] ?? ""}
                        onMemoChange={onMemoChange}
                        onMoveToWaiting={onMoveToWaiting}
                        onOpenDetail={onOpenDetail}
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
  );
}
