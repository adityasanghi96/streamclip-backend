import { createHash, createPublicKey, createVerify, randomBytes } from "crypto";
import axios from "axios";
import { ENV } from "../env";
import { cleanKickUsername, RemoteAccount } from "./streaming.service";

const KICK_AUTHORIZE_URL = "https://id.kick.com/oauth/authorize";
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_API = "https://api.kick.com/public/v1";
const KICK_SCOPES = "user:read channel:read";

type PendingKickOauth = {
  userId: number;
  verifier: string;
  expiresAt: number;
};

const pendingKickOauth = new Map<string, PendingKickOauth>();

let kickAppToken: { token: string; expiresAt: number } | null = null;

export function isKickConfigured() {
  return Boolean(ENV.KICK_CLIENT_ID && ENV.KICK_CLIENT_SECRET);
}

function requireKickConfig() {
  if (!isKickConfigured()) {
    throw Object.assign(new Error("Kick linking is not configured. Add KICK_CLIENT_ID and KICK_CLIENT_SECRET."), {
      status: 400,
    });
  }
}

function toAccount(user?: { user_id?: number; name?: string; profile_picture?: string }, channel?: { slug?: string; broadcaster_user_id?: number; banner_picture?: string }): RemoteAccount {
  const handle = String(channel?.slug || user?.name || "").toLowerCase();
  const id = String(user?.user_id || channel?.broadcaster_user_id || handle);
  return {
    id,
    name: user?.name || channel?.slug || handle,
    handle,
    imageUrl: user?.profile_picture || channel?.banner_picture || "",
    profileUrl: `https://kick.com/${handle}`,
  };
}

async function getKickAppToken() {
  requireKickConfig();
  if (kickAppToken && kickAppToken.expiresAt > Date.now() + 30_000) return kickAppToken.token;

  const res = await axios.post(
    KICK_TOKEN_URL,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ENV.KICK_CLIENT_ID,
      client_secret: ENV.KICK_CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  kickAppToken = {
    token: res.data.access_token,
    expiresAt: Date.now() + Number(res.data.expires_in || 3600) * 1000,
  };
  return kickAppToken.token;
}

export async function fetchKickChannel(username: string): Promise<RemoteAccount> {
  const slug = cleanKickUsername(username).toLowerCase();
  if (!slug) throw Object.assign(new Error("Kick username required"), { status: 400 });

  const token = await getKickAppToken();
  const channelRes = await axios.get(`${KICK_API}/channels`, {
    params: { slug },
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const channel = channelRes.data?.data?.[0];
  if (!channel) throw Object.assign(new Error("Kick channel not found"), { status: 404 });

  let user: { user_id?: number; name?: string; profile_picture?: string } | undefined;
  if (channel.broadcaster_user_id) {
    const userRes = await axios.get(`${KICK_API}/users`, {
      params: { id: channel.broadcaster_user_id },
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    user = userRes.data?.data?.[0];
  }
  return toAccount(user, channel);
}

export async function fetchKickAccountFromUserToken(accessToken: string): Promise<RemoteAccount> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const [userRes, channelRes] = await Promise.all([
    axios.get(`${KICK_API}/users`, { headers }),
    axios.get(`${KICK_API}/channels`, { headers }),
  ]);
  const user = userRes.data?.data?.[0];
  const channel = channelRes.data?.data?.[0];
  if (!user && !channel) throw Object.assign(new Error("Kick account not found"), { status: 404 });
  return toAccount(user, channel);
}

export function startKickOAuth(userId: number) {
  requireKickConfig();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  pendingKickOauth.set(state, { userId, verifier, expiresAt: Date.now() + 10 * 60 * 1000 });

  const url = new URL(KICK_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", ENV.KICK_CLIENT_ID);
  url.searchParams.set("redirect_uri", ENV.KICK_REDIRECT_URI);
  url.searchParams.set("scope", KICK_SCOPES);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeKickOAuth(code: string, state: string) {
  requireKickConfig();
  const pending = pendingKickOauth.get(state);
  pendingKickOauth.delete(state);
  if (!pending || pending.expiresAt < Date.now()) {
    throw Object.assign(new Error("Kick sign-in expired. Try again."), { status: 400 });
  }

  const res = await axios.post(
    KICK_TOKEN_URL,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ENV.KICK_CLIENT_ID,
      client_secret: ENV.KICK_CLIENT_SECRET,
      redirect_uri: ENV.KICK_REDIRECT_URI,
      code_verifier: pending.verifier,
      code,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const accessToken = res.data?.access_token;
  if (!accessToken) throw Object.assign(new Error("Kick did not return an access token"), { status: 401 });
  const account = await fetchKickAccountFromUserToken(accessToken);
  return {
    userId: pending.userId,
    account,
    accessToken,
    refreshToken: res.data?.refresh_token ? String(res.data.refresh_token) : null,
    tokenExpiresAt: new Date(Date.now() + Number(res.data.expires_in || 3600) * 1000),
  };
}

export async function fetchKickLivestream(broadcasterUserId: string) {
  const token = await getKickAppToken();
  const res = await axios.get(`${KICK_API}/livestreams`, {
    params: { broadcaster_user_id: broadcasterUserId },
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return res.data?.data?.[0] || null;
}

export function kickLivestreamId(livestream: Record<string, any> | null) {
  if (!livestream) return null;
  const id = livestream.livestream_id || livestream.id;
  return id ? String(id) : null;
}

export async function refreshKickUserToken(refreshToken: string) {
  requireKickConfig();
  const res = await axios.post(
    KICK_TOKEN_URL,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: ENV.KICK_CLIENT_ID,
      client_secret: ENV.KICK_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const accessToken = res.data?.access_token;
  if (!accessToken) throw Object.assign(new Error("Could not refresh Kick login"), { status: 401 });
  return {
    accessToken: String(accessToken),
    refreshToken: res.data?.refresh_token ? String(res.data.refresh_token) : refreshToken,
    tokenExpiresAt: new Date(Date.now() + Number(res.data.expires_in || 3600) * 1000),
  };
}

const KICK_CHAT_EVENTS = ["chat.message.sent", "kicks.gifted"] as const;

type KickEventSubscription = {
  id?: string;
  event?: string;
  name?: string;
  broadcaster_user_id?: number;
};

async function listKickEventSubscriptions(broadcasterUserId: string): Promise<KickEventSubscription[]> {
  const token = await getKickAppToken();
  const res = await axios.get(`${KICK_API}/events/subscriptions`, {
    params: { broadcaster_user_id: Number(broadcasterUserId) },
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

export async function ensureKickChatSubscription(broadcasterUserId: string) {
  const existing = await listKickEventSubscriptions(broadcasterUserId);
  const have = new Set(
    existing
      .map((item) => String(item.event || item.name || ""))
      .filter(Boolean)
  );
  const missing = KICK_CHAT_EVENTS.filter((name) => !have.has(name));
  if (!missing.length) return;

  const token = await getKickAppToken();
  await axios.post(
    `${KICK_API}/events/subscriptions`,
    {
      broadcaster_user_id: Number(broadcasterUserId),
      events: missing.map((name) => ({ name, version: 1 })),
    },
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
  );
}

export async function removeKickChatSubscriptions(broadcasterUserId: string) {
  const existing = await listKickEventSubscriptions(broadcasterUserId);
  const ids = existing
    .filter((item) => KICK_CHAT_EVENTS.includes(String(item.event || item.name || "") as (typeof KICK_CHAT_EVENTS)[number]))
    .map((item) => item.id)
    .filter(Boolean) as string[];
  if (!ids.length) return;

  const token = await getKickAppToken();
  const search = new URLSearchParams();
  for (const id of ids) search.append("id", id);
  await axios.delete(`${KICK_API}/events/subscriptions?${search.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

let kickPublicKeyPem: { pem: string; expiresAt: number } | null = null;

async function getKickPublicKeyPem() {
  if (kickPublicKeyPem && kickPublicKeyPem.expiresAt > Date.now()) return kickPublicKeyPem.pem;
  const res = await axios.get(`${KICK_API}/public-key`, { headers: { Accept: "application/json" } });
  const pem = res.data?.data?.public_key || res.data?.public_key;
  if (!pem) throw new Error("Kick public key missing");
  kickPublicKeyPem = { pem: String(pem), expiresAt: Date.now() + 60 * 60 * 1000 };
  return kickPublicKeyPem.pem;
}

export async function verifyKickWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
  const messageId = String(headers["kick-event-message-id"] || "");
  const timestamp = String(headers["kick-event-message-timestamp"] || "");
  const signature = String(headers["kick-event-signature"] || "");
  if (!messageId || !timestamp || !signature) return false;

  const signed = `${messageId}.${timestamp}.${rawBody.toString("utf8")}`;
  try {
    const pem = await getKickPublicKeyPem();
    const key = createPublicKey(pem);
    const verifier = createVerify("SHA256");
    verifier.update(signed);
    verifier.end();
    return verifier.verify(key, signature, "base64");
  } catch (err) {
    console.error("Kick webhook signature failed", err);
    return false;
  }
}

export function kickLivestreamGame(livestream: Record<string, any> | null) {
  const category = livestream?.category || livestream?.categories?.[0];
  const name = category?.name || category?.slug;
  if (!name) return null;
  return {
    name: String(name),
    imageUrl: category?.thumbnail || category?.banner || null,
  };
}

export type KickNativeClip = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  creator?: string;
  createdAt?: string;
};

export async function fetchKickChannelClips(slug: string): Promise<KickNativeClip[]> {
  const handle = slug.replace(/^@/, "").toLowerCase();
  if (!handle) return [];
  try {
    const res = await axios.get(`https://kick.com/api/v2/channels/${encodeURIComponent(handle)}/clips`, {
      headers: { Accept: "application/json" },
      timeout: 8000,
    });
    const raw = res.data?.clips || res.data?.data || res.data || [];
    const items = Array.isArray(raw) ? raw : [];
    return items
      .map((item: Record<string, any>) => {
        const id = String(item.id || item.clip_id || item.uuid || "");
        if (!id) return null;
        return {
          id,
          title: String(item.title || item.clip_title || "Kick clip"),
          thumbnailUrl: item.thumbnail_url || item.thumbnail || item.image_url,
          creator: item.creator?.username || item.clipper?.username || item.user?.username,
          createdAt: item.created_at || item.createdAt,
        };
      })
      .filter(Boolean)
      .slice(0, 20) as KickNativeClip[];
  } catch {
    return [];
  }
}
