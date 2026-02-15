/**
 * pi-safe-git Extension (Simplified for Suckless Pi)
 *
 * Securely prevents dangerous git/gh interactions without explicit user approval.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

type PromptLevel = "high" | "medium" | "none";
type Severity = "high" | "medium";

interface SafeGitConfig {
  promptLevel?: PromptLevel;
  enabledByDefault?: boolean;
}

const DEFAULT_CONFIG: Required<SafeGitConfig> = {
  promptLevel: "medium",
  enabledByDefault: true,
};

export default function (pi: ExtensionAPI) {
  let sessionEnabledOverride: boolean | null = null;
  let sessionPromptLevelOverride: PromptLevel | null = null;
  const sessionApprovedActions = new Set<string>();
  const sessionBlockedActions = new Set<string>();

  const gitPatterns: { pattern: RegExp; action: string; severity: Severity }[] =
    [
      {
        pattern: /\bgit\s+push\s+.*--force(-with-lease)?\b/i,
        action: "force push",
        severity: "high",
      },
      {
        pattern: /\bgit\s+reset\s+--hard\b/i,
        action: "hard reset",
        severity: "high",
      },
      {
        pattern: /\bgit\s+clean\s+-[a-z]*f/i,
        action: "clean",
        severity: "high",
      },
      {
        pattern: /\bgit\s+stash\s+(drop|clear)\b/i,
        action: "drop/clear stash",
        severity: "high",
      },
      {
        pattern: /\bgit\s+branch\s+-[dD]\b/i,
        action: "delete branch",
        severity: "high",
      },
      { pattern: /\bgit\s+push\b/i, action: "push", severity: "medium" },
      { pattern: /\bgit\s+commit\b/i, action: "commit", severity: "medium" },
      { pattern: /\bgit\s+rebase\b/i, action: "rebase", severity: "medium" },
      { pattern: /\bgit\s+merge\b/i, action: "merge", severity: "medium" },
      { pattern: /\bgh\s+\S+/i, action: "GitHub CLI", severity: "medium" },
    ];

  function getEffectiveConfig(ctx: ExtensionContext): {
    enabled: boolean;
    promptLevel: PromptLevel;
  } {
    const settings = (ctx as any).settingsManager?.getSettings()?.safeGit ?? {};
    const enabled =
      sessionEnabledOverride ??
      settings.enabledByDefault ??
      DEFAULT_CONFIG.enabledByDefault;
    const promptLevel =
      sessionPromptLevelOverride ??
      settings.promptLevel ??
      DEFAULT_CONFIG.promptLevel;
    return { enabled, promptLevel };
  }

  pi.registerCommand("safegit", {
    description: "Toggle safe-git protection",
    handler: async (_, ctx) => {
      const { enabled } = getEffectiveConfig(ctx);
      sessionEnabledOverride = !enabled;
      ctx.ui.notify(
        sessionEnabledOverride ? "🔒 Safe-git ON" : "🔓 Safe-git OFF",
        "info",
      );
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const { enabled, promptLevel } = getEffectiveConfig(ctx);
    if (!enabled || promptLevel === "none") return undefined;

    const command = event.input.command as string;

    for (const { pattern, action, severity } of gitPatterns) {
      if (pattern.test(command)) {
        if (sessionBlockedActions.has(action))
          return { block: true, reason: `Blocked: ${action}` };
        if (sessionApprovedActions.has(action)) return undefined;
        if (promptLevel === "high" && severity === "medium") return undefined;

        if (!ctx.hasUI)
          return { block: true, reason: `Requires approval: ${action}` };

        const choice = await ctx.ui.select(
          `⚠️ Git ${action} requires approval`,
          [
            "✅ Allow once",
            "⏭️  Decline",
            `✅✅ Always allow ${action} (session)`,
            `🚫 Always block ${action} (session)`,
          ],
        );

        if (!choice || choice.includes("Decline"))
          return { block: true, reason: "User declined" };
        if (choice.includes("Always block")) {
          sessionBlockedActions.add(action);
          return { block: true, reason: "User blocked for session" };
        }
        if (choice.includes("Always allow")) sessionApprovedActions.add(action);
        return undefined;
      }
    }
  });

  pi.on("session_start", () => {
    sessionEnabledOverride = null;
    sessionPromptLevelOverride = null;
    sessionApprovedActions.clear();
    sessionBlockedActions.clear();
  });
}
