import type { ReactNode } from "react";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import type { DragPayload } from "./types";

export function DraggableCard({
  id,
  payload,
  children,
}: {
  id: string;
  payload: DragPayload;
  children: ReactNode;
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
