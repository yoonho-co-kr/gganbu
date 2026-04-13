import type { CharacterSummary } from "@/types/character";

export type PartySnapshot = {
  id: string;
  name: string;
  kind: "rudra" | "erosion";
  slots: Array<CharacterSummary | null>;
};

export type ShareSnapshot = {
  parties: PartySnapshot[];
  waitingList: CharacterSummary[];
};

export type StoredShare = {
  id: string;
  createdAt: string;
  snapshot: ShareSnapshot;
};
