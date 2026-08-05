import { nowMs } from "./utils";

export type FeedbackVote = "up" | "down";

export interface FeedbackSample {
  messageId: string;
  conversationId: string;
  vote: FeedbackVote;
  snippet: string;
  modelId: string | null;
  at: number;
}

export interface FeedbackProfile {
  likes: number;
  dislikes: number;
  /** Latest vote per message id */
  byMessage: Record<string, FeedbackVote>;
  samples: FeedbackSample[];
}

const KEY = "glow.feedbackProfile";
const MAX_SAMPLES = 40;

export function getFeedbackProfile(): FeedbackProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProfile();
    const parsed = JSON.parse(raw) as FeedbackProfile;
    return {
      likes: parsed.likes || 0,
      dislikes: parsed.dislikes || 0,
      byMessage: parsed.byMessage || {},
      samples: Array.isArray(parsed.samples) ? parsed.samples : [],
    };
  } catch {
    return emptyProfile();
  }
}

function emptyProfile(): FeedbackProfile {
  return { likes: 0, dislikes: 0, byMessage: {}, samples: [] };
}

function save(profile: FeedbackProfile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

/** Record like/dislike for personalization. Toggle same vote clears it. */
export function recordFeedback(input: {
  messageId: string;
  conversationId: string;
  vote: FeedbackVote;
  content: string;
  modelId: string | null;
}): FeedbackProfile {
  const profile = getFeedbackProfile();
  const prev = profile.byMessage[input.messageId];

  if (prev === "up") profile.likes = Math.max(0, profile.likes - 1);
  if (prev === "down") profile.dislikes = Math.max(0, profile.dislikes - 1);

  if (prev === input.vote) {
    delete profile.byMessage[input.messageId];
    profile.samples = profile.samples.filter((s) => s.messageId !== input.messageId);
    save(profile);
    return profile;
  }

  profile.byMessage[input.messageId] = input.vote;
  if (input.vote === "up") profile.likes += 1;
  else profile.dislikes += 1;

  const sample: FeedbackSample = {
    messageId: input.messageId,
    conversationId: input.conversationId,
    vote: input.vote,
    snippet: input.content.replace(/\s+/g, " ").trim().slice(0, 220),
    modelId: input.modelId,
    at: nowMs(),
  };
  profile.samples = [
    sample,
    ...profile.samples.filter((s) => s.messageId !== input.messageId),
  ].slice(0, MAX_SAMPLES);

  save(profile);
  return profile;
}

/** Short hints for system prompt from recent thumbs. */
export function feedbackPreferenceHints(): string {
  const { samples, likes, dislikes } = getFeedbackProfile();
  if (!samples.length) return "";
  const recent = samples.slice(0, 8);
  const liked = recent.filter((s) => s.vote === "up").map((s) => s.snippet);
  const disliked = recent.filter((s) => s.vote === "down").map((s) => s.snippet);
  const lines: string[] = [
    `User feedback profile: ${likes} helpful / ${dislikes} not helpful ratings.`,
  ];
  if (liked.length) {
    lines.push(
      "Recent replies marked helpful (match this style/quality):",
      ...liked.map((s) => `- ${s}`),
    );
  }
  if (disliked.length) {
    lines.push(
      "Recent replies marked not helpful (avoid similar issues):",
      ...disliked.map((s) => `- ${s}`),
    );
  }
  return lines.join("\n");
}
