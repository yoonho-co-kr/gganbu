import type { ReactNode } from "react";

import type { CharacterSummary } from "@/types/character";

import { NUM_BLUE_EMPHASIS_CLASS, NUM_EMPHASIS_CLASS } from "./constants";
import { formatNumber, getClassBadgeToneClass } from "./utils";

export function CharacterCard({
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
  actionButton?: ReactNode;
  onOpenDetail?: (character: CharacterSummary) => void;
}) {
  const normalizedServerName = character.serverName.replace(/\s+/g, "");
  const shortServerName = normalizedServerName.slice(0, 2) || character.serverName.slice(0, 2);
  const copyText = `${character.name}[${shortServerName}]`;

  const handleCopyNameServer = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
        return;
      }
    } catch {
      // fallback below
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = copyText;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    } catch {
      // noop
    }
  };

  const copyButton = (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        void handleCopyNameServer();
      }}
      aria-label={`${copyText} 복사`}
      title={`${copyText} 복사`}
      className="ml-1 inline-flex h-5 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-semibold text-neutral-200 transition hover:bg-neutral-800 cursor-pointer"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x="9" y="9" width="10" height="10" rx="2" strokeWidth="1.8" />
        <path
          d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );

  const profileButton = onOpenDetail ? (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpenDetail(character);
      }}
      aria-label={`${character.name} 상세정보`}
      title="상세정보"
      className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-neutral-600 bg-neutral-900/90 px-1.5 text-[10px] font-semibold text-neutral-200 transition hover:bg-neutral-800"
    >
      상세
    </button>
  ) : null;

  return (
    <div
      className={`group/card ${dense ? "min-h-18 p-2" : "min-h-20 p-3"} w-full rounded-lg ${
        surface === "slot" ? "border border-transparent bg-neutral-800/85" : "border border-neutral-800 bg-neutral-900/95"
      } ${compact ? "" : "hover:shadow"} transition-shadow`}
    >
      {slotLayout ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
          <div className="min-w-0 flex items-center">
            <p className={`truncate font-bold text-neutral-100 ${dense ? "text-sm" : "text-md"}`}>
              <span className="max-w-[8ch] truncate align-middle inline-block">{character.name}</span>
              <span
                className={`ml-1 align-middle ${
                  serverEmphasis ? "font-medium text-neutral-200" : "font-normal text-neutral-400"
                } ${serverEmphasis ? (dense ? "text-sm" : "text-md") : dense ? "text-[10px]" : "text-xs"}`}
              >
                [{character.serverName}]
              </span>
            </p>
            {copyButton}
          </div>
          <div
            className={`justify-self-end ${
              actionRevealOnHover
                ? "opacity-0 pointer-events-none group-hover/card:opacity-100 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:pointer-events-auto"
                : ""
            } transition`}
          >
            {actionButton}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex flex-col leading-tight">
              <p className={`${dense ? "text-[10px]" : "text-[11px]"} text-sky-300`}>
                전투력 <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatNumber(character.combatPower)}</span>
              </p>
              <p className={`${dense ? "text-[10px]" : "text-[11px]"} text-neutral-300`}>
                아이템레벨 <span className={NUM_EMPHASIS_CLASS}>{formatNumber(character.itemLevel)}</span>
              </p>
            </div>
            {profileButton}
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
                {copyButton}
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

          <div className="mt-2 flex items-center gap-2">
            <div className="grid flex-1 grid-cols-2 gap-2 text-[11px] text-neutral-400">
              <div className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1">
                IL <span className={NUM_EMPHASIS_CLASS}>{formatNumber(character.itemLevel)}</span>
              </div>
              <div className="rounded-md border border-sky-700/50 bg-sky-900/20 px-2 py-1 text-sky-300">
                CP <span className={NUM_BLUE_EMPHASIS_CLASS}>{formatNumber(character.combatPower)}</span>
              </div>
            </div>
            {profileButton}
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
