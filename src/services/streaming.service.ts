import axios from "axios";
import { ENV } from "../env";

export type RemoteAccount = {
  id: string;
  name: string;
  handle: string;
  imageUrl: string;
  profileUrl: string;
};

function cleanUsername(value: string, hosts: string[]) {
  let raw = value.trim();
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      raw = url.pathname;
    }
  } catch {
    // keep raw
  }
  raw = raw.replace(/^\/+/, "").replace(/^@/, "");
  for (const host of hosts) {
    const prefix = `${host}/`;
    if (raw.toLowerCase().startsWith(prefix)) raw = raw.slice(prefix.length);
  }
  return raw.split("/")[0].split("?")[0].trim();
}

export function cleanTwitchUsername(value: string) {
  return cleanUsername(value, ["www.twitch.tv", "twitch.tv"]);
}

export function cleanKickUsername(value: string) {
  return cleanUsername(value, ["www.kick.com", "kick.com"]);
}

let twitchAppToken: { token: string; expiresAt: number } | null = null;

export async function getTwitchAppToken() {
  if (!ENV.TWITCH_CLIENT_ID || !ENV.TWITCH_CLIENT_SECRET) return null;
  if (twitchAppToken && twitchAppToken.expiresAt > Date.now() + 30_000) {
    return twitchAppToken.token;
  }
  const res = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id: ENV.TWITCH_CLIENT_ID,
      client_secret: ENV.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    },
  });
  twitchAppToken = {
    token: res.data.access_token,
    expiresAt: Date.now() + Number(res.data.expires_in || 3600) * 1000,
  };
  return twitchAppToken.token;
}

export async function fetchTwitchUser(username: string): Promise<RemoteAccount> {
  const login = cleanTwitchUsername(username);
  if (!login) throw Object.assign(new Error("Twitch username required"), { status: 400 });

  const fallback: RemoteAccount = {
    id: login.toLowerCase(),
    name: login,
    handle: login.toLowerCase(),
    imageUrl: "",
    profileUrl: `https://www.twitch.tv/${login}`,
  };

  const token = await getTwitchAppToken();
  if (!token || !ENV.TWITCH_CLIENT_ID) return fallback;

  const res = await axios.get("https://api.twitch.tv/helix/users", {
    params: { login },
    headers: {
      "Client-ID": ENV.TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });
  const user = res.data.data?.[0];
  if (!user) throw new Error("Twitch user not found");
  return {
    id: String(user.id),
    name: user.display_name || user.login,
    handle: String(user.login || login).toLowerCase(),
    imageUrl: user.profile_image_url || "",
    profileUrl: `https://www.twitch.tv/${user.login || login}`,
  };
}
