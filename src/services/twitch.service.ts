import { randomBytes } from "crypto";
import axios from "axios";
import { ENV } from "../env";
import { getTwitchAppToken, RemoteAccount } from "./streaming.service";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";
const TWITCH_SCOPES = "user:read:email clips:edit user:read:chat";

type PendingTwitchOauth = {
  userId: number;
  expiresAt: number;
};

const pendingTwitchOauth = new Map<string, PendingTwitchOauth>();

export function isTwitchConfigured() {
  return Boolean(ENV.TWITCH_CLIENT_ID && ENV.TWITCH_CLIENT_SECRET);
}

function requireTwitchConfig() {
  if (!isTwitchConfigured()) {
    throw Object.assign(
      new Error("Twitch linking is not configured. Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET."),
      { status: 400 }
    );
  }
}

function toAccount(user: {
  id?: string;
  login?: string;
  display_name?: string;
  profile_image_url?: string;
}): RemoteAccount {
  const handle = String(user.login || "").toLowerCase();
  return {
    id: String(user.id || handle),
    name: user.display_name || handle,
    handle,
    imageUrl: user.profile_image_url || "",
    profileUrl: `https://www.twitch.tv/${handle}`,
  };
}

export async function fetchTwitchAccountFromUserToken(accessToken: string): Promise<RemoteAccount> {
  requireTwitchConfig();
  const res = await axios.get(TWITCH_USERS_URL, {
    headers: {
      "Client-ID": ENV.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const user = res.data?.data?.[0];
  if (!user) throw Object.assign(new Error("Twitch user not found"), { status: 404 });
  return toAccount(user);
}

export function startTwitchOAuth(userId: number) {
  requireTwitchConfig();
  const state = randomBytes(16).toString("hex");
  pendingTwitchOauth.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });

  const url = new URL(TWITCH_AUTHORIZE_URL);
  url.searchParams.set("client_id", ENV.TWITCH_CLIENT_ID);
  url.searchParams.set("redirect_uri", ENV.TWITCH_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", TWITCH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("force_verify", "true");
  return url.toString();
}

export async function exchangeTwitchOAuth(code: string, state: string) {
  requireTwitchConfig();
  const pending = pendingTwitchOauth.get(state);
  pendingTwitchOauth.delete(state);
  if (!pending || pending.expiresAt < Date.now()) {
    throw Object.assign(new Error("Twitch sign-in expired. Try again."), { status: 400 });
  }

  const res = await axios.post(
    TWITCH_TOKEN_URL,
    new URLSearchParams({
      client_id: ENV.TWITCH_CLIENT_ID,
      client_secret: ENV.TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: ENV.TWITCH_REDIRECT_URI,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const accessToken = res.data?.access_token;
  if (!accessToken) throw Object.assign(new Error("Twitch did not return an access token"), { status: 401 });
  const account = await fetchTwitchAccountFromUserToken(accessToken);
  return {
    userId: pending.userId,
    account,
    accessToken,
    refreshToken: res.data?.refresh_token ? String(res.data.refresh_token) : null,
    tokenExpiresAt: new Date(Date.now() + Number(res.data.expires_in || 3600) * 1000),
  };
}

export async function refreshTwitchUserToken(refreshToken: string) {
  requireTwitchConfig();
  const res = await axios.post(
    TWITCH_TOKEN_URL,
    new URLSearchParams({
      client_id: ENV.TWITCH_CLIENT_ID,
      client_secret: ENV.TWITCH_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const accessToken = res.data?.access_token;
  if (!accessToken) throw Object.assign(new Error("Could not refresh Twitch login"), { status: 401 });
  return {
    accessToken: String(accessToken),
    refreshToken: res.data?.refresh_token ? String(res.data.refresh_token) : refreshToken,
    tokenExpiresAt: new Date(Date.now() + Number(res.data.expires_in || 3600) * 1000),
  };
}

export async function fetchTwitchGames(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, { name: string; imageUrl: string }>();
  const token = await getTwitchAppToken();
  if (!token || !ENV.TWITCH_CLIENT_ID) return new Map<string, { name: string; imageUrl: string }>();
  const search = new URLSearchParams();
  for (const id of unique) search.append("id", id);
  const res = await axios.get(`https://api.twitch.tv/helix/games?${search.toString()}`, {
    headers: {
      "Client-ID": ENV.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const map = new Map<string, { name: string; imageUrl: string }>();
  for (const game of res.data?.data || []) {
    map.set(String(game.id), {
      name: String(game.name || ""),
      imageUrl: twitchBoxArt(game.box_art_url),
    });
  }
  return map;
}

export async function fetchTwitchGamesByName(names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  const map = new Map<string, { name: string; imageUrl: string }>();
  if (!unique.length) return map;
  const token = await getTwitchAppToken();
  if (!token || !ENV.TWITCH_CLIENT_ID) return map;

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const search = new URLSearchParams();
    for (const name of chunk) search.append("name", name);
    const res = await axios.get(`https://api.twitch.tv/helix/games?${search.toString()}`, {
      headers: {
        "Client-ID": ENV.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    for (const game of res.data?.data || []) {
      const name = String(game.name || "");
      const imageUrl = twitchBoxArt(game.box_art_url);
      if (!name || !imageUrl) continue;
      map.set(name.toLowerCase(), { name, imageUrl });
    }
  }
  return map;
}

export type TwitchLiveStream = {
  id: string;
  userId: string;
  title: string;
  thumbnailUrl: string;
  gameName: string | null;
  gameId: string | null;
};

export async function fetchTwitchStream(userId: string): Promise<TwitchLiveStream | null> {
  const token = await getTwitchAppToken();
  if (!token || !ENV.TWITCH_CLIENT_ID) return null;
  const res = await axios.get("https://api.twitch.tv/helix/streams", {
    params: { user_id: userId },
    headers: {
      "Client-ID": ENV.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const stream = res.data?.data?.[0];
  if (!stream?.id) return null;
  return {
    id: String(stream.id),
    userId: String(stream.user_id || userId),
    title: String(stream.title || ""),
    thumbnailUrl: twitchThumbnail(stream.thumbnail_url),
    gameName: stream.game_name ? String(stream.game_name) : null,
    gameId: stream.game_id ? String(stream.game_id) : null,
  };
}

export async function fetchTwitchStreamGame(userId: string) {
  const stream = await fetchTwitchStream(userId);
  if (!stream?.gameName) return null;
  const games = stream.gameId ? await fetchTwitchGames([stream.gameId]) : new Map();
  const art = games.get(stream.gameId || "");
  return {
    name: stream.gameName,
    slug: stream.gameName,
    imageUrl: art?.imageUrl || null,
    gameId: stream.gameId,
  };
}

export async function twitchTokenScopes(accessToken: string): Promise<string[]> {
  const res = await axios.get("https://id.twitch.tv/oauth2/validate", {
    headers: { Authorization: `OAuth ${accessToken}` },
  });
  return Array.isArray(res.data?.scopes) ? res.data.scopes.map(String) : [];
}

export function twitchHasChatRead(scopes: string[]) {
  return scopes.includes("user:read:chat") || scopes.includes("chat:read");
}

const twitchAvatarCache = new Map<string, { url: string | null; expiresAt: number }>();

export async function fetchTwitchProfileImages(userIds: string[]) {
  const unique = [...new Set(userIds.map(String).filter(Boolean))];
  const now = Date.now();
  const missing: string[] = [];
  const result = new Map<string, string | null>();
  for (const id of unique) {
    const cached = twitchAvatarCache.get(id);
    if (cached && cached.expiresAt > now) result.set(id, cached.url);
    else missing.push(id);
  }
  if (!missing.length) return result;

  const token = await getTwitchAppToken();
  if (!token || !ENV.TWITCH_CLIENT_ID) return result;

  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const search = new URLSearchParams();
    for (const id of chunk) search.append("id", id);
    const res = await axios.get(`https://api.twitch.tv/helix/users?${search.toString()}`, {
      headers: {
        "Client-ID": ENV.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    const found = new Set<string>();
    for (const user of res.data?.data || []) {
      const id = String(user.id);
      const url = user.profile_image_url ? String(user.profile_image_url) : null;
      found.add(id);
      twitchAvatarCache.set(id, { url, expiresAt: now + 30 * 60 * 1000 });
      result.set(id, url);
    }
    for (const id of chunk) {
      if (found.has(id)) continue;
      twitchAvatarCache.set(id, { url: null, expiresAt: now + 5 * 60 * 1000 });
      result.set(id, null);
    }
  }
  return result;
}

export function twitchBoxArt(url?: string) {
  return (url || "")
    .replace("{width}", "144")
    .replace("{height}", "192")
    .replace("%{width}", "144")
    .replace("%{height}", "192");
}

export async function createTwitchClip(accessToken: string, broadcasterId: string) {
  requireTwitchConfig();
  const res = await axios.post(
    "https://api.twitch.tv/helix/clips",
    null,
    {
      params: { broadcaster_id: broadcasterId },
      headers: {
        "Client-ID": ENV.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const clip = res.data?.data?.[0];
  if (!clip?.id) throw Object.assign(new Error("Channel is not live or Twitch could not create a clip"), { status: 404 });
  return {
    id: String(clip.id),
    editUrl: clip.edit_url ? String(clip.edit_url) : `https://clips.twitch.tv/${clip.id}`,
  };
}

export type TwitchHelixClip = {
  id: string;
  url: string;
  embed_url?: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id?: string;
  creator_name?: string;
  video_id?: string;
  game_id?: string;
  title?: string;
  created_at?: string;
  thumbnail_url?: string;
  duration?: number;
  vod_offset?: number | null;
};

export async function fetchTwitchClipsByIds(ids: string[]): Promise<TwitchHelixClip[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const token = await getTwitchAppToken();
  if (!token || !ENV.TWITCH_CLIENT_ID || !unique.length) return [];

  const clips: TwitchHelixClip[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const search = new URLSearchParams();
    for (const id of chunk) search.append("id", id);
    const res = await axios.get(`https://api.twitch.tv/helix/clips?${search.toString()}`, {
      headers: {
        "Client-ID": ENV.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    });
    clips.push(...(res.data?.data || []));
  }
  return clips;
}

export async function fetchRecentTwitchClips(broadcasterId: string): Promise<TwitchHelixClip[]> {
  const token = await getTwitchAppToken();
  if (!token || !ENV.TWITCH_CLIENT_ID) return [];

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 30 * 60 * 1000);
  const res = await axios.get("https://api.twitch.tv/helix/clips", {
    params: {
      broadcaster_id: broadcasterId,
      first: 20,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
    },
    headers: {
      "Client-ID": ENV.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data?.data || [];
}

export function twitchThumbnail(url?: string) {
  return (url || "")
    .replace("%{width}", "480")
    .replace("%{height}", "272")
    .replace("{width}", "480")
    .replace("{height}", "272");
}
