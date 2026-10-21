export const CLIP_PROVIDERS = ["youtube", "twitch", "kick"] as const;
export const CLIP_SOURCES = ["native", "nightbot"] as const;

export type ClipProvider = (typeof CLIP_PROVIDERS)[number];
export type ClipSource = (typeof CLIP_SOURCES)[number];

export function parseLimitOffset(
  query: { limit?: unknown; offset?: unknown },
  fallbackLimit = 20
) {
  const limit = Math.min(Math.max(Number(query.limit) || fallbackLimit, 1), 100);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}

export function parseProvider(value: unknown): ClipProvider | undefined {
  const v = String(value || "").trim().toLowerCase();
  return (CLIP_PROVIDERS as readonly string[]).includes(v) ? (v as ClipProvider) : undefined;
}

export function parseSource(value: unknown): ClipSource | undefined {
  const v = String(value || "").trim().toLowerCase();
  return (CLIP_SOURCES as readonly string[]).includes(v) ? (v as ClipSource) : undefined;
}

export const CHANNEL_SORTS = ["latestClip", "firstClip", "clipCount", "alphabetical", "subCount"] as const;
export type ChannelSort = (typeof CHANNEL_SORTS)[number];

export function parseChannelSort(value: unknown): ChannelSort {
  const v = String(value || "").trim();
  return (CHANNEL_SORTS as readonly string[]).includes(v) ? (v as ChannelSort) : "latestClip";
}

export function parseSortDir(value: unknown, sort: ChannelSort): "ASC" | "DESC" {
  const v = String(value || "").trim().toLowerCase();
  if (v === "asc" || v === "desc") return v.toUpperCase() as "ASC" | "DESC";
  return sort === "alphabetical" ? "ASC" : "DESC";
}

export function parseSearch(value: unknown) {
  return String(value || "").trim().slice(0, 80);
}

export function parsePositiveInt(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

export function applyGroupedSort(
  qb: { orderBy: (sort: string, order?: "ASC" | "DESC", nulls?: "NULLS FIRST" | "NULLS LAST") => unknown },
  sort: ChannelSort,
  dir: "ASC" | "DESC",
  nameExpr: string
) {
  if (sort === "firstClip") qb.orderBy("MIN(clip.createdAt)", dir);
  else if (sort === "clipCount") qb.orderBy("COUNT(clip.id)", dir);
  else if (sort === "alphabetical") qb.orderBy(nameExpr, dir);
  else if (sort === "subCount") qb.orderBy("MAX(channel.followerCount)", dir, "NULLS LAST");
  else qb.orderBy("MAX(clip.createdAt)", dir);
}
