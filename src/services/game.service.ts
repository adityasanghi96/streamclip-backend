import AppDataSource from "../db/data-source";
import { Game } from "../db/entities/Game";
import { parsePositiveInt, parseSearch } from "../utils/query";

export type DetectedGame = {
  name: string;
  slug: string;
  imageUrl?: string | null;
};

const GENERIC_TOPICS = new Set([
  "video-game",
  "video-game-culture",
  "video-games",
  "entertainment",
  "live-streaming",
  "youtube",
  "music",
  "hobby",
  "sport",
  "sports",
  "association-football",
  "electronic-sports",
  "esports",
  "just-chatting",
  "irl",
  "film",
  "movie",
  "television",
  "lifestyle-sociology",
  "action-game",
  "action-adventure-game",
  "adventure-game",
  "role-playing-video-game",
  "first-person-shooter",
  "third-person-shooter",
  "shooter-game",
  "battle-royale-game",
  "survival-game",
  "horror-game",
  "survival-horror",
  "stealth-game",
  "fighting-game",
  "racing-game",
  "sports-video-game",
  "simulation-video-game",
  "strategy-video-game",
  "sandbox-game",
  "platform-game",
  "puzzle-video-game",
  "indie-game",
  "mobile-game",
  "online-game",
  "multiplayer-video-game",
  "open-world",
  "free-to-play",
]);

function isGenericTopic(slug: string) {
  if (GENERIC_TOPICS.has(slug)) return true;
  if (slug.includes("video-game")) return true;
  if (/(^|-)(game|games|genre|sociology)$/.test(slug)) return true;
  return false;
}

export function slugifyGame(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function detectedGame(name: string, imageUrl?: string | null): DetectedGame | null {
  const trimmed = String(name || "").trim();
  const slug = slugifyGame(trimmed);
  if (!trimmed || !slug || isGenericTopic(slug)) return null;
  return { name: trimmed, slug, imageUrl: imageUrl || null };
}

export function gameFromWikipediaUrl(url: string): DetectedGame | null {
  try {
    const path = new URL(url).pathname.split("/").pop() || "";
    const name = decodeURIComponent(path).replace(/_/g, " ");
    return detectedGame(name);
  } catch {
    return null;
  }
}

export async function findGameBySlug(slug: string) {
  const trimmed = String(slug || "").trim();
  if (!trimmed) return null;
  return AppDataSource.getRepository(Game).findOneBy({ slug: trimmed });
}

export async function findGameById(id: number) {
  if (!Number.isInteger(id) || id < 1) return null;
  return AppDataSource.getRepository(Game).findOneBy({ id });
}

export async function resolveRequestedGame(query: { gameId?: unknown; game?: unknown }) {
  const id = parsePositiveInt(query.gameId);
  if (id) {
    return { requested: true as const, game: await findGameById(id) };
  }
  const slug = parseSearch(query.game);
  if (slug) {
    return { requested: true as const, game: await findGameBySlug(slug) };
  }
  return { requested: false as const, game: null };
}

export async function upsertGame(detected: DetectedGame) {
  const repo = AppDataSource.getRepository(Game);
  let game = await repo.findOneBy({ slug: detected.slug });
  if (!game) {
    game = repo.create({
      slug: detected.slug,
      name: detected.name,
      imageUrl: detected.imageUrl || null,
    });
  } else {
    if (detected.imageUrl && !game.imageUrl) game.imageUrl = detected.imageUrl;
    if (detected.name && game.name !== detected.name && detected.name.length > game.name.length) {
      game.name = detected.name;
    }
  }
  return repo.save(game);
}

export function gameNameMatchesText(text: string, name: string) {
  const hay = String(text || "");
  const needle = String(name || "").trim();
  if (!hay || needle.length < 3) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(hay);
}

export function matchGameFromList(text: string, games: Game[]): Game | null {
  let best: Game | null = null;
  for (const game of games) {
    if (!gameNameMatchesText(text, game.name)) continue;
    if (!best || game.name.length > best.name.length) best = game;
  }
  return best;
}

export async function matchGameFromText(text: string): Promise<DetectedGame | null> {
  const hay = String(text || "").toLowerCase();
  if (!hay.trim()) return null;
  const games = await AppDataSource.getRepository(Game).find();
  const best = matchGameFromList(text, games);
  return best ? { name: best.name, slug: best.slug, imageUrl: best.imageUrl } : null;
}

export async function detectYoutubeGame(input: {
  title?: string;
  tags?: string[];
  topicCategories?: string[];
}): Promise<DetectedGame | null> {
  const blob = [input.title, ...(input.tags || [])].filter(Boolean).join(" ");
  const fromCatalog = await matchGameFromText(blob);
  if (fromCatalog) return fromCatalog;

  const repo = AppDataSource.getRepository(Game);
  for (const topic of input.topicCategories || []) {
    const fromTopic = gameFromWikipediaUrl(topic);
    if (!fromTopic) continue;
    const existing = await repo.findOneBy({ slug: fromTopic.slug });
    if (existing) {
      return { name: existing.name, slug: existing.slug, imageUrl: existing.imageUrl };
    }
  }
  return null;
}
