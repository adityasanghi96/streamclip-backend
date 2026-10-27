export type LiveChatProvider = "youtube" | "twitch" | "kick";
export type StreamOrientation = "horizontal" | "vertical";
export type LiveChatMessageKind =
  | "text"
  | "superChat"
  | "sticker"
  | "membership"
  | "cheer"
  | "gift";

export type LiveChatStream = {
  key: string;
  provider: LiveChatProvider;
  accountId: string;
  accountName: string;
  handle: string | null;
  streamId: string;
  orientation: StreamOrientation;
};

export type LiveChatMessage = {
  id: string;
  authorName: string;
  authorImageUrl: string | null;
  provider: LiveChatProvider;
  streamId: string;
  orientation: StreamOrientation;
  text: string;
  kind: LiveChatMessageKind;
  amount: string | null;
  stickerUrl: string | null;
  createdAt: string;
};

export type LiveChatStatus = {
  code: string;
  message: string;
};

export type LiveChatEvent =
  | { type: "streams"; streams: LiveChatStream[] }
  | { type: "message"; message: LiveChatMessage }
  | { type: "status"; status: LiveChatStatus };

export function streamKey(provider: LiveChatProvider, accountId: string) {
  return `${provider}:${accountId}`;
}

export function orientationFromSize(width?: number | null, height?: number | null): StreamOrientation {
  if (!width || !height) return "horizontal";
  return height > width ? "vertical" : "horizontal";
}
