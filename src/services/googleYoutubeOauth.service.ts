import { randomBytes } from "crypto";
import axios from "axios";
import { ENV } from "../env";
import { fetchMyYouTubeChannels } from "./youtubeChannel.service";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

type PendingYoutubeOauth = {
  userId: number;
  expiresAt: number;
};

const pendingYoutubeOauth = new Map<string, PendingYoutubeOauth>();

function requireGoogleSecret() {
  if (!ENV.GOOGLE_CLIENT_ID || !ENV.GOOGLE_CLIENT_SECRET) {
    throw Object.assign(
      new Error("Google client secret is missing. Add GOOGLE_CLIENT_SECRET to the backend .env."),
      { status: 400 }
    );
  }
}

export function startYoutubeOAuth(userId: number) {
  requireGoogleSecret();
  const state = randomBytes(16).toString("hex");
  pendingYoutubeOauth.set(state, { userId, expiresAt: Date.now() + 10 * 60 * 1000 });

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", ENV.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", ENV.GOOGLE_YOUTUBE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "false");
  url.searchParams.set("prompt", "select_account consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeGoogleCode(code: string, redirectUri: string) {
  const tokenRes = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({
      code,
      client_id: ENV.GOOGLE_CLIENT_ID,
      client_secret: ENV.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  const accessToken = tokenRes.data?.access_token;
  if (!accessToken) {
    throw Object.assign(new Error("Google did not return a YouTube access token"), { status: 401 });
  }
  return fetchMyYouTubeChannels(accessToken);
}

export async function exchangeYoutubeOAuth(code: string, state: string) {
  requireGoogleSecret();
  const pending = pendingYoutubeOauth.get(state);
  pendingYoutubeOauth.delete(state);
  if (!pending || pending.expiresAt < Date.now()) {
    throw Object.assign(new Error("YouTube sign-in expired. Try again."), { status: 400 });
  }

  const youtubeChannels = await exchangeGoogleCode(code, ENV.GOOGLE_YOUTUBE_REDIRECT_URI);
  return { userId: pending.userId, youtubeChannels };
}

/** GIS popup code client uses redirect_uri=postmessage — no Cloud Console redirect URI needed. */
export async function exchangeYoutubeGisCode(code: string) {
  requireGoogleSecret();
  return exchangeGoogleCode(code, "postmessage");
}
