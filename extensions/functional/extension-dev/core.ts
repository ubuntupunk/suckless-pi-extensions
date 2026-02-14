import * as fs from "node:fs";
import * as path from "node:path";
import { ToolBody, ToolCallHeader, ToolFooter } from "@aliou/pi-utils-ui";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@mariozechner/pi-coding-agent";
import { keyHint, VERSION } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { type Static, Type } from "@sinclair/typebox";

// ============================================================================
// UTILS
// ============================================================================

export function findPiInstallation(): string | null {
  try {
    const piModulePath = require.resolve("@mariozechner/pi-coding-agent/package.json");
    return path.dirname(piModulePath);
  } catch {
    const scriptPath = process.argv[1];
    if (scriptPath) {
      let currentDir = path.dirname(scriptPath);
      while (currentDir !== path.dirname(currentDir)) {
        const pkgPath = path.join(currentDir, "package.json");
        if (fs.existsSync(pkgPath)) {
          try {
            if (JSON.parse(fs.readFileSync(pkgPath, "utf-8")).name === "@mariozechner/pi-coding-agent") return currentDir;
          } catch {}
        }
        currentDir = path.dirname(currentDir);
      }
    }
    return null;
  }
}

export function resolveCtx(signal: AbortSignal | undefined, onUpdate: unknown, ctx: ExtensionContext): ExtensionContext {
  return typeof signal === "function" ? onUpdate as ExtensionContext : ctx;
}

// ============================================================================
// TOOLS
// ============================================================================

export function setupExtensionDevTools(pi: ExtensionAPI) {
  // 1. Version Tool
  pi.registerTool({
    name: "pi_version",
    label: "Pi Version",
    description: "Get the current Pi version.",
    parameters: Type.Object({}),
    async execute() { return { content: [{ type: "text", text: VERSION }], details: { success: true, version: VERSION } }; },
    renderCall: (_, theme) => new ToolCallHeader({ toolName: "Pi Version" }, theme),
    renderResult: (res, _, theme) => new Text(theme.fg("accent", `Version: ${res.details?.version}`), 0, 0)
  });

  // 2. Package Manager Tool
  const LOCKFILES: Record<string, string> = { "pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn", "package-lock.json": "npm", "bun.lockb": "bun" };
  pi.registerTool({
    name: "detect_package_manager",
    label: "Package Manager",
    description: "Detect the package manager used in the current project.",
    parameters: Type.Object({}),
    async execute(_id, _p, signal, onUpdate, ctx) {
      const cwd = resolveCtx(signal, onUpdate, ctx).cwd;
      let pm = "npm", lockfile = "";
      let searchDir = cwd;
      while (true) {
        for (const [f, p] of Object.entries(LOCKFILES)) if (fs.existsSync(path.join(searchDir, f))) { pm = p; lockfile = f; break; }
        if (lockfile || fs.existsSync(path.join(searchDir, ".git"))) break;
        const parent = path.dirname(searchDir);
        if (parent === searchDir) break;
        searchDir = parent;
      }
      return { content: [{ type: "text", text: `PM: ${pm}` }], details: { success: true, packageManager: pm, lockfile } };
    },
    renderCall: (_, theme) => new ToolCallHeader({ toolName: "Detect PM" }, theme),
    renderResult: (res, _, theme) => new Text(theme.fg("success", `PM: ${res.details?.packageManager}`), 0, 0)
  });

  // 3. Docs Tool
  const listFiles = (dir: string, prefix = ""): string[] => {
    let res: string[] = [];
    if (!fs.existsSync(dir)) return res;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) res.push(...listFiles(path.join(dir, e.name), rel));
      else res.push(rel);
    }
    return res;
  };
  pi.registerTool({
    name: "pi_docs",
    label: "Pi Docs",
    description: "List Pi markdown documentation.",
    parameters: Type.Object({}),
    async execute() {
      const piPath = findPiInstallation();
      if (!piPath) return { content: [{ type: "text", text: "Pi not found" }], details: { success: false } };
      const docs = ["README.md", ...listFiles(path.join(piPath, "docs")).map(f => `docs/${f}`), ...listFiles(path.join(piPath, "examples")).map(f => `examples/${f}`)].filter(f => f.endsWith(".md"));
      return { content: [{ type: "text", text: docs.join("\n") }], details: { success: true, docFiles: docs } };
    },
    renderCall: (_, theme) => new ToolCallHeader({ toolName: "Pi Docs" }, theme),
    renderResult: (res, _, theme) => new Text(theme.fg("accent", `Found ${res.details?.docFiles?.length} docs`), 0, 0)
  });

  // 4. Changelog Tools
  const parseEntries = (content: string) => {
    const lines = content.split("\n"), entries: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]?.trim().match(/^#+\s*(?:\[([^\]]+)\]|([^[\s]+))/);
      if (m && /^v?\d+\.\d+/.test(m[1] || m[2] || "")) entries.push({ version: m[1] || m[2], lineStart: i });
    }
    entries.forEach((e, i) => {
      const end = entries[i+1]?.lineStart || lines.length;
      const raw = lines.slice(e.lineStart + 1, end).join("\n").trim();
      e.content = raw.length > 10 ? raw : "[No details]";
    });
    return entries;
  };
  pi.registerTool({
    name: "pi_changelog",
    label: "Pi Changelog",
    description: "Get changelog entry for a version.",
    parameters: Type.Object({ version: Type.Optional(Type.String()) }),
    async execute(_id, params) {
      try {
        const piPath = findPiInstallation();
        if (!piPath) throw new Error("Pi not found");
        const entries = parseEntries(fs.readFileSync(path.join(piPath, "CHANGELOG.md"), "utf-8"));
        const e = params.version ? entries.find((x: any) => x.version.includes(params.version!)) : entries[0];
        if (!e) throw new Error("Version not found");
        return { content: [{ type: "text", text: e.content }], details: { success: true, changelog: e } as any };
      } catch (err: any) { return { content: [{ type: "text", text: err.message }], details: { success: false, message: err.message } }; }
    },
    renderCall: (a, theme) => new ToolCallHeader({ toolName: "Pi Changelog", mainArg: a.version || "latest" }, theme),
    renderResult: (res, _, theme) => new Text(`${theme.fg("success", "Found version")}\n${res.details?.changelog?.content.split("\n").slice(0, 5).join("\n")}`, 0, 0)
  });
}

// ============================================================================
// UPDATE COMMAND
// ============================================================================

export function setupUpdateCommand(pi: ExtensionAPI) {
  pi.registerCommand("extensions:update", {
    description: "Update repo to a target Pi version",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const target = args?.trim() || VERSION;
      pi.sendUserMessage(`Target Pi version: ${target}\n\n# Update Plan\n1. Detect PM\n2. Check versions\n3. Read docs\n4. Analyze code\n5. Apply updates`);
    },
  });
}
