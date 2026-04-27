import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { useDroppable } from "@dnd-kit/core";

import type { DropPayload } from "./types";

export function WaitingDropZone({ children }: { children: ReactNode }) {
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
