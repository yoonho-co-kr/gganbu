export type CharacterSource = "plaync-api" | "plaync-scrape";

export type CharacterSummary = {
  id: string;
  characterId: string;
  name: string;
  serverId: number;
  serverName: string;
  level: number;
  race?: number;
  classId?: number;
  className?: string;
  classKey?: string;
  classIconUrl?: string | null;
  itemLevel: number;
  combatPower: number;
  profileImageUrl: string | null;
  source: CharacterSource;
};

export type ServerInfo = {
  serverId: number;
  serverName: string;
  raceId?: number;
};
