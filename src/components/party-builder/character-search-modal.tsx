import type { FormEvent } from "react";

import type { CharacterSummary, ServerInfo } from "@/types/character";

import { BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS, INPUT_CLASS } from "./constants";
import { CharacterCard } from "./character-card";

export function CharacterSearchModal({
  isOpen,
  modalQuery,
  modalServerId,
  modalCharacterLink,
  modalResults,
  modalSource,
  modalLoading,
  modalError,
  servers,
  serversError,
  waitingList,
  onClose,
  onSubmit,
  onImportByLink,
  onModalQueryChange,
  onModalServerChange,
  onModalCharacterLinkChange,
  onAddToWaitingList,
  getAssignmentStatus,
  onOpenDetail,
}: {
  isOpen: boolean;
  modalQuery: string;
  modalServerId: string;
  modalCharacterLink: string;
  modalResults: CharacterSummary[];
  modalSource: string;
  modalLoading: boolean;
  modalError: string;
  servers: ServerInfo[];
  serversError: string;
  waitingList: CharacterSummary[];
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onImportByLink: () => void | Promise<void>;
  onModalQueryChange: (value: string) => void;
  onModalServerChange: (value: string) => void;
  onModalCharacterLinkChange: (value: string) => void;
  onAddToWaitingList: (character: CharacterSummary) => void;
  getAssignmentStatus: (character: CharacterSummary) => { rudra: boolean; erosion: boolean };
  onOpenDetail: (character: CharacterSummary) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-4xl rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-100">캐릭터 검색</h2>
          <button
            type="button"
            onClick={onClose}
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
            <form onSubmit={onSubmit} className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
              <input
                value={modalQuery}
                onChange={(event) => onModalQueryChange(event.target.value)}
                placeholder="캐릭터명"
                className={INPUT_CLASS}
              />

              <select
                value={modalServerId}
                onChange={(event) => onModalServerChange(event.target.value)}
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

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">캐릭터 링크 불러오기</p>
              <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
                <input
                  value={modalCharacterLink}
                  onChange={(event) => onModalCharacterLinkChange(event.target.value)}
                  placeholder="PlayNC/A2Tool 캐릭터 링크"
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => void onImportByLink()}
                  disabled={modalLoading}
                  className={`${BUTTON_SECONDARY_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {modalLoading ? "불러오는중..." : "링크 불러오기"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-xs text-neutral-400">
              {modalSource ? <p>검색 소스: {modalSource}</p> : <p>검색 소스: 대기</p>}
              <p className="mt-1">결과에서 선택한 캐릭터만 대기 목록에 추가됩니다.</p>
            </div>

            {modalError ? <p className="text-sm text-rose-500">{modalError}</p> : null}
            {serversError ? <p className="text-xs text-rose-400">{serversError}</p> : null}
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
                    const inWaiting = waitingList.some(
                      (entry) => entry.characterId === character.characterId && entry.serverId === character.serverId,
                    );
                    const status = getAssignmentStatus(character);
                    const fullyAssigned = status.rudra && status.erosion;
                    const addButton = (
                      <button
                        type="button"
                        disabled={inWaiting}
                        onClick={() => onAddToWaitingList(character)}
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
                          onOpenDetail={onOpenDetail}
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
  );
}
