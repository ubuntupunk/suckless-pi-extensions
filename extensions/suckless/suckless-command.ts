/**
 * Suckless Extension Manager Command
 *
 * Provides `/suckless` command for managing suckless extensions.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const CONFIG_PATH = ".pi/extensions.conf";

interface ExtensionInfo {
  path: string;
  name: string;
  category: string;
  enabled: boolean;
}

const EXTENSION_CATEGORIES = {
  functional: "Functional",
  utility: "Utility",
  suckless: "Suckless",
};

export default function sucklessCommandExtension(pi: ExtensionAPI) {
  console.log('[suckless-command] Extension loading...');

  // Helper: Parse extensions.conf (MERGES user + project like Manager does)
  function parseExtensionsConf(projectRoot: string): { disabled: string[], configPath: string } {
    const homedir = require("node:os").homedir();
    const userConfigPath = join(homedir, '.pi', CONFIG_PATH);
    const projectConfigPath = join(projectRoot, CONFIG_PATH);

    const disabled = new Set<string>();
    let configPath = projectConfigPath;

    // 1. Load project config first (defaults)
    if (existsSync(projectConfigPath)) {
      console.log('[suckless] Loading project config:', projectConfigPath);
      const content = readFileSync(projectConfigPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("disable")) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            // Normalize: strip "extensions/" prefix to match Manager
            const path = parts[1].replace(/^extensions\//, '');
            disabled.add(path);
          }
        }
      }
      configPath = projectConfigPath;
    }

    // 2. Load user config (overrides project)
    if (existsSync(userConfigPath)) {
      console.log('[suckless] Loading user config:', userConfigPath);
      const content = readFileSync(userConfigPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("disable")) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            const path = parts[1].replace(/^extensions\//, '');
            disabled.add(path); // User disable overrides project enable
          }
        } else if (trimmed.startsWith("enable")) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            const path = parts[1].replace(/^extensions\//, '');
            disabled.delete(path); // User enable overrides project disable
          }
        }
      }
      configPath = userConfigPath + " (overrides project)";
    } else {
      console.log('[suckless] No user config found (~/.pi/extensions.conf)');
    }

    return { disabled: Array.from(disabled), configPath };
  }

  // Helper: Discover extensions
  function discoverExtensions(rootDir: string): ExtensionInfo[] {
    const extensions: ExtensionInfo[] = [];
    const extDir = join(rootDir, "extensions");
    
    console.log('[suckless] Scanning:', extDir);
    
    if (!existsSync(extDir)) {
      console.warn('[suckless] Extensions dir not found:', extDir);
      return extensions;
    }
    
    for (const category of ["functional", "utility", "suckless"]) {
      const categoryDir = join(extDir, category);
      if (!existsSync(categoryDir)) continue;
      
      const entries = readdirSync(categoryDir, { withFileTypes: true });
      console.log(`[suckless] ${category}: ${entries.length} entries`);
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        if (entry.isDirectory()) {
          const indexPath = join(categoryDir, entry.name, "index.ts");
          if (existsSync(indexPath)) {
            extensions.push({
              path: `extensions/${category}/${entry.name}/index.ts`,
              name: entry.name,
              category: EXTENSION_CATEGORIES[category as keyof typeof EXTENSION_CATEGORIES] || category,
              enabled: true,
            });
          }
        } else if (entry.name.endsWith(".ts") && !entry.name.startsWith("_")) {
          extensions.push({
            path: `extensions/${category}/${entry.name}`,
            name: entry.name.replace(".ts", ""),
            category: EXTENSION_CATEGORIES[category as keyof typeof EXTENSION_CATEGORIES] || category,
            enabled: true,
          });
        }
      }
    }
    
    console.log('[suckless] Found:', extensions.length, 'extensions');
    return extensions.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Helper: Update config (writes to USER config ~/.pi/extensions.conf)
  function updateExtensionsConf(_projectRoot: string, extensionPath: string, enable: boolean): boolean {
    // Always write to user config (~/.pi/extensions.conf) for user preferences
    const homedir = require("node:os").homedir();
    const userPiDir = join(homedir, ".pi");
    const confPath = join(userPiDir, CONFIG_PATH);

    // Create ~/.pi directory if it doesn't exist
    const { mkdirSync } = require("node:fs");
    if (!existsSync(userPiDir)) {
      mkdirSync(userPiDir, { recursive: true });
    }

    // Normalize extension path (ensure it has extensions/ prefix for config file)
    const configPath = extensionPath.startsWith('extensions/')
      ? extensionPath
      : `extensions/${extensionPath}`;

    // If enabling, add "enable" line to override project disable
    if (enable) {
      let content = "";
      if (existsSync(confPath)) {
        content = readFileSync(confPath, "utf-8");
        // Check if already enabled
        if (content.split("\n").some(line => {
          const trimmed = line.trim();
          return trimmed.startsWith("enable") && trimmed.includes(configPath);
        })) {
          return true; // Already enabled
        }
      }
      // Add enable line (overrides project disable)
      content = content.trim() + (content ? "\n" : "") + `enable ${configPath}\n`;
      writeFileSync(confPath, content, "utf-8");
    } else {
      // Disable: add "disable" line to user config (overrides project enable)
      let content = "";
      if (existsSync(confPath)) {
        content = readFileSync(confPath, "utf-8");
        // Check if already disabled
        if (content.split("\n").some(line => {
          const trimmed = line.trim();
          return trimmed.startsWith("disable") && trimmed.includes(configPath);
        })) {
          return true; // Already disabled
        }
      }
      // Add disable line
      content = content.trim() + (content ? "\n" : "") + `disable ${configPath}\n`;
      writeFileSync(confPath, content, "utf-8");
    }

    return true;
  }

  // Register /suckless command
  pi.registerCommand("suckless", {
    description: "Manage suckless extensions",
    handler: async (args, ctx) => {
      console.log('[suckless-command] Handler called');
      console.log('[suckless-command] ctx.cwd:', ctx.cwd);

      // Find the suckless-pi-extensions directory
      // ctx.cwd might be the parent project, so we need to find our repo
      let projectRoot = ctx.cwd;

      // If we're in suckless-project, look for suckless-pi-extensions subdirectory
      if (ctx.cwd.endsWith('suckless-project')) {
        const candidate = join(ctx.cwd, 'suckless-pi-extensions');
        if (existsSync(candidate)) {
          projectRoot = candidate;
          console.log('[suckless-command] Found extensions repo:', projectRoot);
        }
      }

      // Also check if .pi/extensions.conf exists, if not try parent directories
      if (!existsSync(join(projectRoot, CONFIG_PATH))) {
        const parent = join(projectRoot, '..');
        if (existsSync(join(parent, CONFIG_PATH))) {
          projectRoot = parent;
          console.log('[suckless-command] Using parent:', projectRoot);
        }
      }

      console.log('[suckless-command] Using projectRoot:', projectRoot);

      const subcommand = args.trim().split(/\s+/)[0] || "status";
      const extensionName = args.trim().split(/\s+/)[1];

      ctx.ui.notify(`[suckless] Running ${subcommand}...`, "info");
      
      if (subcommand === "status") {
        const { disabled, configPath } = parseExtensionsConf(projectRoot);
        const allExtensions = discoverExtensions(projectRoot);
        // Normalize ext.path to match disabled array format
        const enabledCount = allExtensions.filter(ext => {
          const normalizedPath = ext.path.replace(/^extensions\//, '');
          return !disabled.some(d => d === normalizedPath);
        }).length;

        const lines = [
          "━━━ Suckless Extensions Status ━━━",
          ``,
          `Loaded: ${enabledCount} enabled, ${disabled.length} disabled`,
          ``,
          `Config: ${configPath}`,
          ``,
          `💡 Tip: /suckless disable writes to ~/.pi/extensions.conf`,
        ];

        if (disabled.length > 0) {
          lines.push(``, `Disabled:`);
          for (const d of disabled) lines.push(`  • ${d}`);
        }

        ctx.ui.notify(lines.join("\n"), "info");
      }
      else if (subcommand === "list") {
        const { disabled, configPath } = parseExtensionsConf(projectRoot);
        const allExtensions = discoverExtensions(projectRoot);

        const lines = ["━━━ Available Extensions ━━━", ``];
        for (const ext of allExtensions) {
          // Normalize ext.path to match disabled array format (strip extensions/ prefix)
          const normalizedPath = ext.path.replace(/^extensions\//, '');
          const isDisabled = disabled.some(d => d === normalizedPath);
          const status = isDisabled ? "○" : "●";
          const color = isDisabled ? "dim" : "success";
          lines.push(`  ${ctx.ui.theme.fg(color, status)} ${ext.name.padEnd(25)} [${ext.category}]`);
        }

        ctx.ui.notify(lines.join("\n"), "info");
      }
      else if (subcommand === "enable" || subcommand === "disable") {
        if (!extensionName) {
          ctx.ui.notify(`Usage: /suckless ${subcommand} <extension-name>`, "error");
          return;
        }

        const allExtensions = discoverExtensions(projectRoot);
        const extension = allExtensions.find(ext => ext.name === extensionName);

        if (!extension) {
          ctx.ui.notify(`Extension '${extensionName}' not found`, "error");
          return;
        }

        const success = updateExtensionsConf(projectRoot, extension.path, subcommand === "enable");
        if (success) {
          ctx.ui.notify(
            `Extension '${extensionName}' ${subcommand}d.\n\n⚠️ Restart Pi to apply changes.`,
            "success"
          );
        } else {
          ctx.ui.notify("Failed to update configuration", "error");
        }
      }
      else if (subcommand === "reload") {
        ctx.ui.notify("Extension reload not available - restart Pi to reload extensions", "warning");
      }
      else {
        ctx.ui.notify("Usage: /suckless <status|list|enable|disable|reload> [name]", "warning");
      }
    },
  });

  console.log('[suckless-command] Command registered');
}
