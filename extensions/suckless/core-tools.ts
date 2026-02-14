import * as fs from "node:fs";
import { lstat } from "node:fs/promises";
import * as path from "node:path";
import { ConfigLoader } from "@aliou/pi-utils-settings";
import { ToolCallHeader } from "@aliou/pi-utils-ui";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLsTool, createReadTool } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { AgentsDiscoveryManager } from "./lib/agents-discovery";

/**
 * Suckless Core Tools
 *
 * Minimal, indispensable tools that don't belong in heavy extensions.
 * Current: get_current_time, read (directory-aware), terminal-title, agents-discovery, session-naming
 */

// --- Configuration ---
export interface CoreConfig {
  agentsIgnorePaths?: string[];
}

export interface ResolvedCoreConfig {
  agentsIgnorePaths: string[];
}

const DEFAULT_CONFIG: ResolvedCoreConfig = {
  agentsIgnorePaths: [],
};

export const configLoader = new ConfigLoader<CoreConfig, ResolvedCoreConfig>(
  "suckless-core",
  DEFAULT_CONFIG,
  { scopes: ["global"] },
);

// --- get_current_time ---
const GetCurrentTimeParams = Type.Object({
  format: Type.Optional(
    Type.String({
      description:
        "Output format: 'iso8601' (default), 'unix', 'date', 'time', or custom strftime-like pattern",
    }),
  ),
});
// type GetCurrentTimeParamsType = Static<typeof GetCurrentTimeParams>;

interface TimeDetails {
  formatted: string;
  date: string;
  time: string;
  timezone: string;
  timezone_name: string;
  day_of_week: string;
  unix: number;
}

function formatDate(date: Date, format: string): string {
  switch (format.toLowerCase()) {
    case "iso8601":
    case "iso":
      return date.toISOString();
    case "unix":
      return Math.floor(date.getTime() / 1000).toString();
    case "date":
      return date.toLocaleDateString();
    case "time":
      return date.toLocaleTimeString();
    default:
      return date.toISOString();
  }
}

// --- terminal-title ---
const TERMINAL_TITLE_EVENT = "ad:terminal-title";
const TERMINAL_TITLE_ENTRY = "ad:terminal-title";
const MAX_BREADCRUMB_DEPTH = 2;
const ROOT_MARKERS = [".git", ".root", "pnpm-workspace.yaml"];

function findProjectRoot(startDir: string): string | null {
  let currentDir = startDir;
  while (true) {
    for (const marker of ROOT_MARKERS) {
      const markerPath = path.join(currentDir, marker);
      try {
        if (fs.existsSync(markerPath)) return currentDir;
      } catch {}
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

function getContextName(cwd: string): string {
  const projectRoot = findProjectRoot(cwd);
  if (!projectRoot) return path.basename(cwd);
  if (projectRoot === cwd) return path.basename(projectRoot);
  const relativePath = path.relative(projectRoot, cwd);
  const parts = relativePath.split(path.sep);
  const rootName = path.basename(projectRoot);
  if (parts.length <= MAX_BREADCRUMB_DEPTH)
    return `${rootName} > ${parts.join(" > ")}`;
  return `${rootName} > ... > ${parts[parts.length - 1]}`;
}

function emitTitle(pi: ExtensionAPI, title: string) {
  pi.events.emit(TERMINAL_TITLE_EVENT, { title });
  pi.appendEntry(TERMINAL_TITLE_ENTRY, { title });
}

export default async function coreToolsExtension(pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();
  const cwd = process.cwd();

  // 1. get_current_time tool
  pi.registerTool<typeof GetCurrentTimeParams, TimeDetails>({
    name: "get_current_time",
    label: "Get Current Time",
    description: "Get the current date and time.",
    parameters: GetCurrentTimeParams,
    async execute(_toolCallId, params) {
      const now = new Date();
      const details: TimeDetails = {
        formatted: formatDate(now, params.format || "iso8601"),
        date: now.toLocaleDateString("en-CA"),
        time: now.toLocaleTimeString("en-GB", { hour12: false }),
        timezone: `UTC${now.getTimezoneOffset() >= 0 ? "-" : "+"}${String(Math.floor(Math.abs(now.getTimezoneOffset()) / 60)).padStart(2, "0")}:${String(Math.abs(now.getTimezoneOffset()) % 60).padStart(2, "0")}`,
        timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone,
        day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
        unix: Math.floor(now.getTime() / 1000),
      };
      return {
        content: [
          {
            type: "text",
            text: `Date: ${details.date} (${details.day_of_week})\nTime: ${details.time}`,
          },
        ],
        details,
      };
    },
    renderCall: (args, theme) =>
      new ToolCallHeader(
        {
          toolName: "Current Time",
          optionArgs: args.format
            ? [{ label: "format", value: args.format }]
            : [],
        },
        theme,
      ),
    renderResult: (result, _opts, theme) =>
      new Text(
        `${theme.fg("dim", "Date:")} ${theme.fg("accent", result.details?.date)} (${result.details?.day_of_week})\n${theme.fg("dim", "Time:")} ${theme.fg("accent", result.details?.time)}`,
        0,
        0,
      ),
  });

  // 2. read override (directory-aware)
  const nativeRead = createReadTool(cwd);
  const nativeLs = createLsTool(cwd);
  pi.registerTool({
    ...nativeRead,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { path: p } = params as { path: string };
      const absolutePath = path.resolve(ctx.cwd, p);
      try {
        const stat = await lstat(absolutePath);
        if (stat.isDirectory())
          return nativeLs.execute(toolCallId, { path: p }, signal, onUpdate);
      } catch {}
      return nativeRead.execute(toolCallId, params as any, signal, onUpdate);
    },
  });

  // 3. terminal-title hooks
  pi.on("session_start", async (_event, ctx) =>
    emitTitle(pi, `π: ${getContextName(ctx.cwd)}`),
  );
  pi.on("session_switch", async (_event, ctx) =>
    emitTitle(pi, `π: ${getContextName(ctx.cwd)}`),
  );
  pi.on("agent_start", async (_event, ctx) =>
    emitTitle(pi, `π: ${getContextName(ctx.cwd)} (thinking...)`),
  );
  pi.on("tool_call", async (event, ctx) => {
    emitTitle(pi, `π: ${getContextName(ctx.cwd)} (${event.toolName})`);
    return undefined;
  });
  pi.on("agent_end", async (_event, ctx) =>
    emitTitle(pi, `π: ${getContextName(ctx.cwd)}`),
  );
  pi.on("session_shutdown", async () => emitTitle(pi, "Terminal"));

  // 4. agents-discovery hook
  const discoveryManager = new AgentsDiscoveryManager(
    () => config.agentsIgnorePaths,
  );
  pi.on("session_start", (_e, ctx) => discoveryManager.resetSession(ctx.cwd));
  pi.on("session_switch", (_e, ctx) => discoveryManager.resetSession(ctx.cwd));
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "read" || event.isError) return undefined;
    const pathInput = event.input.path as string;
    if (!pathInput) return undefined;
    if (!discoveryManager.isInitialized) discoveryManager.resetSession(ctx.cwd);
    const discovered = await discoveryManager.discover(pathInput);
    if (!discovered) return undefined;
    const additions = discovered.map((f) => ({
      type: "text" as const,
      text: `Loaded subdirectory context from ${discoveryManager.prettyPath(f.path)}\n\n${f.content}`,
    }));
    if (ctx.hasUI)
      ctx.ui.notify(
        `Loaded subdirectory context: ${discovered.map((f) => discoveryManager.prettyPath(f.path)).join(", ")}`,
        "info",
      );
    return {
      content: [...(event.content ?? []), ...additions],
      details: event.details,
    };
  });

  // 5. session manual naming
  pi.registerCommand("name", {
    description: "Set session name manually",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (!input) {
        const current = pi.getSessionName();
        ctx.ui.notify(
          current ? `Session: ${current}` : "Session not named",
          "info",
        );
        return;
      }
      pi.setSessionName(input);
      ctx.ui.notify(`Session: ${input}`, "info");
    },
  });

  pi.registerCommand("core_test", {
    description: "Test if core tools extension is loaded",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Core tools extension is LOADED", "info");
    },
  });
}
