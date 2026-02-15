/**
 * Session Emoji Extension
 */

import { complete } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

interface SessionEmojiConfig {
  enabledByDefault: boolean;
  autoAssignMode: "immediate" | "delayed" | "ai";
  autoAssignThreshold: number;
  contextMessages: number;
  emojiSet: "default" | "animals" | "tech" | "fun" | "custom";
  customEmojis: string[];
}

interface SessionState {
  emoji: string | null;
  messageCount: number;
  assigned: boolean;
  selecting: boolean;
  enabledOverride: boolean | null;
}

const DEFAULT_CONFIG: SessionEmojiConfig = {
  enabledByDefault: true,
  autoAssignMode: "ai",
  autoAssignThreshold: 3,
  contextMessages: 5,
  emojiSet: "default",
  customEmojis: [],
};

const EMOJI_SETS: Record<string, string[]> = {
  default: ["🚀", "✨", "🎯", "💡", "🔥", "⚡", "🎨", "🌟", "💻", "🎭"],
  animals: ["🐱", "🐶", "🐼", "🦊", "🐻", "🦁", "🐯", "🐨", "🐰", "🦉"],
  tech: ["💻", "🖥️", "⌨️", "🖱️", "💾", "📱", "🔌", "🔋", "🖨️", "📡"],
  fun: ["🎉", "🎊", "🎈", "🎁", "🎂", "🍕", "🍩", "🌮", "🎮", "🎲"],
};

export default function (pi: ExtensionAPI) {
  const state: SessionState = {
    emoji: null,
    messageCount: 0,
    assigned: false,
    selecting: false,
    enabledOverride: null,
  };

  pi.registerCommand("emoji", {
    description: "Toggle session emoji",
    handler: async (_, ctx) => {
      const config = getConfig(ctx);
      const current = state.enabledOverride ?? config.enabledByDefault;
      state.enabledOverride = !current;
      if (state.enabledOverride) {
        ctx.ui.setStatus("0-emoji", state.emoji ?? "⏳");
      } else {
        ctx.ui.setStatus("0-emoji", "");
      }
    },
  });

  pi.on("session_start", (_, ctx) => initSession(ctx, pi, state));
  pi.on("agent_start", (_, ctx) => handleAgentStart(ctx, pi, state));
}

function getConfig(ctx: ExtensionContext): SessionEmojiConfig {
  const settings =
    (ctx as any).settingsManager?.getSettings()?.sessionEmoji ?? {};
  return { ...DEFAULT_CONFIG, ...settings };
}

async function initSession(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: SessionState,
) {
  Object.assign(state, {
    emoji: null,
    messageCount: 0,
    assigned: false,
    selecting: false,
    enabledOverride: null,
  });
  const config = getConfig(ctx);
  if (!config.enabledByDefault) return;

  if (config.autoAssignMode === "immediate")
    await assignEmoji(ctx, pi, state, config);
  else ctx.ui.setStatus("0-emoji", `⏳ (${config.autoAssignThreshold})`);
}

async function handleAgentStart(
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  state: SessionState,
) {
  const config = getConfig(ctx);
  if (state.assigned || config.autoAssignMode === "immediate") return;
  state.messageCount++;
  if (state.messageCount >= config.autoAssignThreshold)
    await assignEmoji(ctx, pi, state, config);
  else
    ctx.ui.setStatus(
      "0-emoji",
      `⏳ (${config.autoAssignThreshold - state.messageCount})`,
    );
}

async function assignEmoji(
  ctx: ExtensionContext,
  _pi: ExtensionAPI,
  state: SessionState,
  config: SessionEmojiConfig,
) {
  if (state.assigned || state.selecting) return;
  state.selecting = true;
  try {
    const emojis = EMOJI_SETS[config.emojiSet] ?? EMOJI_SETS.default;
    const emoji =
      config.autoAssignMode === "ai" && ctx.model
        ? await selectEmojiWithAI(ctx, config)
        : emojis[Math.floor(Math.random() * emojis.length)];
    state.emoji = emoji;
    state.assigned = true;
    ctx.ui.setStatus("0-emoji", emoji);
  } finally {
    state.selecting = false;
  }
}

async function selectEmojiWithAI(
  ctx: ExtensionContext,
  _config: SessionEmojiConfig,
): Promise<string> {
  try {
    const apiKey = await ctx.modelRegistry.getApiKey(ctx.model!);
    const response = await complete(
      ctx.model!,
      {
        systemPrompt:
          "Choose ONE unique emoji that represents the theme of the conversation. Output ONLY the emoji.",
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Start of session" }],
            timestamp: Date.now(),
          },
        ],
      },
      { apiKey, maxTokens: 10 },
    );
    const textContent = response.content.find(
      (c: any) => c.type === "text",
    ) as any;
    return textContent?.text.trim().slice(0, 2) || "🚀";
  } catch {
    return "🚀";
  }
}
