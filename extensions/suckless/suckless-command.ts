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

  // Helper: Parse extensions.conf (user config first, then project config)
  function parseExtensionsConf(projectRoot: string): { disabled: string[], configPath: string } {
    // Check user config first (~/.pi/extensions.conf)
    const userConfigPath = join(process.env.HOME || process.env.USERPROFILE || '', '.pi', CONFIG_PATH);

    if (existsSync(userConfigPath)) {
      console.log('[suckless] Using user config:', userConfigPath);
      const disabled: string[] = [];
      const content = readFileSync(userConfigPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("disable")) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) disabled.push(parts[1]);
        }
      }
      return { disabled, configPath: userConfigPath };
    }

    // Fall back to project config
    const projectConfigPath = join(projectRoot, CONFIG_PATH);
    console.log('[suckless] Using project config:', projectConfigPath);

    if (!existsSync(projectConfigPath)) {
      console.warn('[suckless] Config not found:', projectConfigPath);
      return { disabled: [], configPath: projectConfigPath };
    }

    const disabled: string[] = [];
    const content = readFileSync(projectConfigPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("disable")) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) disabled.push(parts[1]);
      }
    }

    return { disabled, configPath: projectConfigPath };
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

  // Helper: Update config (writes to project config, user config is manual only)
  function updateExtensionsConf(projectRoot: string, extensionPath: string, enable: boolean): boolean {
    // Always write to project config (~/.pi is for manual user overrides only)
    const confPath = join(projectRoot, CONFIG_PATH);
    if (!existsSync(confPath)) return false;

    const content = readFileSync(confPath, "utf-8");
    const lines = content.split("\n");
    const normalizedPath = extensionPath.replace(/^extensions\//, "");

    if (enable) {
      const newLines = lines.filter(line => {
        const trimmed = line.trim();
        return !(trimmed.startsWith("disable") && trimmed.includes(normalizedPath));
      });
      writeFileSync(confPath, newLines.join("\n"), "utf-8");
    } else {
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
        const enabledCount = allExtensions.filter(ext => !disabled.some(d => d.includes(ext.path))).length;

        const lines = [
          "━━━ Suckless Extensions Status ━━━",
          ``,
          `Loaded: ${enabledCount} enabled, ${disabled.length} disabled`,
          ``,
          `Config: ${configPath}`,
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
          const isDisabled = disabled.some(d => d.includes(ext.path));
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
