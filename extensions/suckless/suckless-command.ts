/**
 * Suckless Extension Manager Command
 *
 * Provides `/suckless` command for managing suckless extensions:
 * - /suckless status   - Show loaded extensions, config status
 * - /suckless list     - List all available extensions
 * - /suckless enable   - Enable an extension
 * - /suckless disable  - Disable an extension
 * - /suckless reload   - Reload all extensions
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

interface ExtensionInfo {
  path: string;
  name: string;
  category: string;
  enabled: boolean;
  description: string;
}

const EXTENSION_CATEGORIES = {
  functional: "Functional",
  utility: "Utility",
  suckless: "Suckless",
};

const CONFIG_PATH = ".pi/extensions.conf";

/**
 * Parse extensions.conf to get enabled/disabled lists
 */
function parseExtensionsConf(rootDir: string): { enabled: string[]; disabled: string[] } {
  const confPath = join(rootDir, CONFIG_PATH);
  const disabled: string[] = [];
  
  if (existsSync(confPath)) {
    const content = readFileSync(confPath, "utf-8");
    const lines = content.split("\n");
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("disable")) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          disabled.push(parts[1]);
        }
      }
    }
  }
  
  return { enabled: [], disabled };
}

/**
 * Discover all extensions in the extensions/ directory
 */
function discoverExtensions(rootDir: string): ExtensionInfo[] {
  const extensions: ExtensionInfo[] = [];
  const extDir = join(rootDir, "extensions");
  
  if (!existsSync(extDir)) {
    return extensions;
  }
  
  // Read categories (functional, utility, suckless)
  const categories = ["functional", "utility", "suckless"];
  
  for (const category of categories) {
    const categoryDir = join(extDir, category);
    if (!existsSync(categoryDir)) continue;
    
    const entries = require("node:fs").readdirSync(categoryDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      
      if (entry.isDirectory()) {
        const indexPath = join(categoryDir, entry.name, "index.ts");
        if (existsSync(indexPath)) {
          extensions.push({
            path: `extensions/${category}/${entry.name}/index.ts`,
            name: entry.name,
            category: EXTENSION_CATEGORIES[category as keyof typeof EXTENSION_CATEGORIES] || category,
            enabled: true, // Will be filtered by config
            description: `${category} extension`,
          });
        }
      } else if (entry.name.endsWith(".ts") && !entry.name.startsWith("_")) {
        const name = entry.name.replace(".ts", "");
        extensions.push({
          path: `extensions/${category}/${entry.name}`,
          name: name,
          category: EXTENSION_CATEGORIES[category as keyof typeof EXTENSION_CATEGORIES] || category,
          enabled: true,
          description: `${category} extension`,
        });
      }
    }
  }
  
  return extensions.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Update extensions.conf to enable or disable an extension
 */
function updateExtensionsConf(rootDir: string, extensionPath: string, enable: boolean): boolean {
  const confPath = join(rootDir, CONFIG_PATH);
  
  if (!existsSync(confPath)) {
    return false;
  }
  
  const content = readFileSync(confPath, "utf-8");
  const lines = content.split("\n");
  const normalizedPath = extensionPath.replace(/^extensions\//, "");
  
  if (enable) {
    // Remove disable line if present
    const newLines = lines.filter(line => {
      const trimmed = line.trim();
      return !(trimmed.startsWith("disable") && trimmed.includes(normalizedPath));
    });
    writeFileSync(confPath, newLines.join("\n"), "utf-8");
  } else {
    // Add disable line if not present
    const hasDisable = lines.some(line => {
      const trimmed = line.trim();
      return trimmed.startsWith("disable") && trimmed.includes(normalizedPath);
    });
    
    if (!hasDisable) {
      lines.push(`disable ${extensionPath}`);
      writeFileSync(confPath, lines.join("\n"), "utf-8");
    }
  }
  
  return true;
}

export default function sucklessCommandExtension(pi: ExtensionAPI) {
  const cwd = process.cwd();
  
  // /suckless command
  pi.registerCommand("suckless", {
    description: "Manage suckless extensions",
    handler: async (args, ctx) => {
      const subcommand = args.trim().split(/\s+/)[0] || "status";
      const extensionName = args.trim().split(/\s+/)[1];
      
      switch (subcommand) {
        case "status":
          await showStatus(ctx);
          break;
        case "list":
          await listExtensions(ctx);
          break;
        case "enable":
          if (!extensionName) {
            ctx.ui.notify("Usage: /suckless enable <extension-name>", "error");
            return;
          }
          await toggleExtension(extensionName, true, ctx);
          break;
        case "disable":
          if (!extensionName) {
            ctx.ui.notify("Usage: /suckless disable <extension-name>", "error");
            return;
          }
          await toggleExtension(extensionName, false, ctx);
          break;
        case "reload":
          await reloadExtensions(ctx);
          break;
        default:
          ctx.ui.notify(
            "Usage: /suckless <status|list|enable|disable|reload> [extension-name]",
            "warning"
          );
      }
    },
  });
  
  async function showStatus(ctx: any) {
    const config = parseExtensionsConf(cwd);
    const allExtensions = discoverExtensions(cwd);
    
    const enabledCount = allExtensions.filter(
      ext => !config.disabled.some(d => d.includes(ext.path))
    ).length;
    const disabledCount = config.disabled.length;
    
    const lines = [
      "━━━ Suckless Extensions Status ━━━",
      ``,
      `Loaded: ${enabledCount} enabled, ${disabledCount} disabled`,
      ``,
      `Config: ${CONFIG_PATH}`,
    ];
    
    if (config.disabled.length > 0) {
      lines.push(``, `Disabled:`);
      for (const disabled of config.disabled) {
        lines.push(`  • ${disabled}`);
      }
    }
    
    ctx.ui.notify(lines.join("\n"), "info");
  }
  
  async function listExtensions(ctx: any) {
    const config = parseExtensionsConf(cwd);
    const allExtensions = discoverExtensions(cwd);
    
    const lines = ["━━━ Available Extensions ━━━", ``];
    
    for (const ext of allExtensions) {
      const isDisabled = config.disabled.some(d => d.includes(ext.path));
      const status = isDisabled ? "○" : "●";
      const statusColor = isDisabled ? "dim" : "success";
      
      lines.push(
        `  ${ctx.ui.theme.fg(statusColor, status)} ${ext.name.padEnd(25)} [${ext.category}]`
      );
    }
    
    ctx.ui.notify(lines.join("\n"), "info");
  }
  
  async function toggleExtension(name: string, enable: boolean, ctx: any) {
    const allExtensions = discoverExtensions(cwd);
    const extension = allExtensions.find(ext => ext.name === name);
    
    if (!extension) {
      ctx.ui.notify(`Extension '${name}' not found`, "error");
      return;
    }
    
    const success = updateExtensionsConf(cwd, extension.path, enable);
    
    if (success) {
      ctx.ui.notify(
        `Extension '${name}' ${enable ? "enabled" : "disabled"}. Run /suckless reload to apply.`,
        "success"
      );
    } else {
      ctx.ui.notify("Failed to update configuration", "error");
    }
  }
  
  async function reloadExtensions(ctx: any) {
    ctx.ui.notify("Extension reload not available - restart Pi to reload extensions", "warning");
  }
}
