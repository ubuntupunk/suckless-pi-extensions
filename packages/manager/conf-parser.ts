/**
 * Parse .conf files for extension management
 * 
 * Format:
 *   # Comments start with #
 *   enable <path>
 *   disable <path>
 *   alias <shortcut> <original>
 *   group <name> <command...>
 *   hide <command>
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface ExtensionConfig {
  enabled: Set<string>;
  disabled: Set<string>;
}

export interface CommandConfig {
  aliases: Map<string, string>;      // shortcut → original
  groups: Map<string, string[]>;      // group name → commands
  hidden: Set<string>;                // hidden commands
}

export interface ManagerConfig {
  extensions: ExtensionConfig;
  commands: CommandConfig;
}

/**
 * Parse extensions.conf file
 */
export function parseExtensionsConf(
  content: string,
  filePath: string = "extensions.conf"
): ExtensionConfig {
  const config: ExtensionConfig = {
    enabled: new Set(),
    disabled: new Set(),
  };

  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) return;
    
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      console.warn(`[${filePath}:${idx + 1}] Invalid format: ${line}`);
      return;
    }
    
    const [action, ...pathParts] = parts;
    const path = pathParts.join(" ");
    
    if (action === "enable") {
      config.enabled.add(path);
      config.disabled.delete(path); // Remove from disabled if present
    } else if (action === "disable") {
      config.disabled.add(path);
      config.enabled.delete(path); // Remove from enabled if present
    } else {
      console.warn(`[${filePath}:${idx + 1}] Unknown action: ${action}`);
    }
  });

  return config;
}

/**
 * Parse commands.conf file
 */
export function parseCommandsConf(
  content: string,
  filePath: string = "commands.conf"
): CommandConfig {
  const config: CommandConfig = {
    aliases: new Map(),
    groups: new Map(),
    hidden: new Set(),
  };

  const lines = content.split("\n");
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) return;
    
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) {
      console.warn(`[${filePath}:${idx + 1}] Invalid format: ${line}`);
      return;
    }
    
    const [action, ...args] = parts;
    
    if (action === "alias") {
      if (args.length < 2) {
        console.warn(`[${filePath}:${idx + 1}] alias requires 2 arguments`);
        return;
      }
      const [shortcut, original] = args;
      config.aliases.set(shortcut, original.startsWith("/") ? original : `/${original}`);
    } else if (action === "group") {
      if (args.length < 2) {
        console.warn(`[${filePath}:${idx + 1}] group requires name and commands`);
        return;
      }
      const [name, ...commands] = args;
      const normalized = commands.map(c => c.startsWith("/") ? c : `/${c}`);
      config.groups.set(name, normalized);
    } else if (action === "hide") {
      const cmd = args[0].startsWith("/") ? args[0] : `/${args[0]}`;
      config.hidden.add(cmd);
    } else {
      console.warn(`[${filePath}:${idx + 1}] Unknown action: ${action}`);
    }
  });

  return config;
}

/**
 * Load configuration from .pi directory
 *
 * Hybrid approach:
 * 1. Load project defaults from <rootDir>/.pi/
 * 2. Load user overrides from ~/.pi/
 * 3. Merge: user config takes precedence
 */
export function loadManagerConfig(rootDir: string = process.cwd()): ManagerConfig {
  const { homedir } = require("node:os");
  const homeDir = homedir();

  // Project config (defaults)
  const projectPiDir = join(rootDir, ".pi");
  const projectExtConfPath = join(projectPiDir, "extensions.conf");
  const projectCmdConfPath = join(projectPiDir, "commands.conf");

  // User config (overrides)
  const userPiDir = join(homeDir, ".pi");
  const userExtConfPath = join(userPiDir, "extensions.conf");
  const userCmdConfPath = join(userPiDir, "commands.conf");

  // Load project extensions.conf (defaults)
  let extConfig: ExtensionConfig = { enabled: new Set(), disabled: new Set() };

  if (existsSync(projectExtConfPath)) {
    const content = readFileSync(projectExtConfPath, "utf-8");
    extConfig = parseExtensionsConf(content, projectExtConfPath);
    console.log(`[manager] Loaded project extensions from ${projectExtConfPath}`);
  } else {
    console.log("[manager] No project extensions.conf, loading all extensions");
  }

  // Load user extensions.conf (overrides)
  if (existsSync(userExtConfPath)) {
    const content = readFileSync(userExtConfPath, "utf-8");
    const userConfig = parseExtensionsConf(content, userExtConfPath);
    console.log(`[manager] Loaded user extensions from ${userExtConfPath}`);

    // Merge: user disabled overrides project enabled
    for (const path of userConfig.disabled) {
      extConfig.enabled.delete(path);
      extConfig.disabled.add(path);
    }

    // Merge: user enabled overrides project disabled
    for (const path of userConfig.enabled) {
      extConfig.disabled.delete(path);
      extConfig.enabled.add(path);
    }
  }

  // Load project commands.conf (defaults)
  let cmdConfig: CommandConfig = { aliases: new Map(), groups: new Map(), hidden: new Set() };

  if (existsSync(projectCmdConfPath)) {
    const content = readFileSync(projectCmdConfPath, "utf-8");
    cmdConfig = parseCommandsConf(content, projectCmdConfPath);
    console.log(`[manager] Loaded project commands from ${projectCmdConfPath}`);
  } else {
    console.log("[manager] No project commands.conf, using defaults");
  }

  // Load user commands.conf (overrides)
  if (existsSync(userCmdConfPath)) {
    const content = readFileSync(userCmdConfPath, "utf-8");
    const userConfig = parseCommandsConf(content, userCmdConfPath);
    console.log(`[manager] Loaded user commands from ${userCmdConfPath}`);

    // Merge: user config takes precedence
    for (const [alias, target] of userConfig.aliases) {
      cmdConfig.aliases.set(alias, target);
    }
    for (const [group, commands] of userConfig.groups) {
      cmdConfig.groups.set(group, commands);
    }
    for (const cmd of userConfig.hidden) {
      cmdConfig.hidden.add(cmd);
    }
  }

  return {
    extensions: extConfig,
    commands: cmdConfig,
  };
}

/**
 * Check if an extension should be loaded
 *
 * Suckless philosophy: ALL extensions enabled by default.
 * Only list extensions you want to DISABLE in extensions.conf.
 *
 * Format:
 *   disable extensions/foo/bar.ts  # This extension won't load
 *   enable extensions/foo/bar.ts   # Override a project default disable
 *
 * Note: Paths are normalized - "extensions/" prefix is stripped for matching.
 */
export function shouldLoadExtension(
  extPath: string,
  config: ExtensionConfig
): boolean {
  // Normalize: strip "extensions/" prefix if present
  const normalizedPath = extPath.replace(/^extensions\//, '');

  // Check both normalized and original paths
  if (config.disabled.has(extPath) || config.disabled.has(normalizedPath)) {
    return false;
  }

  // Explicitly enabled (overrides project defaults)
  if (config.enabled.has(extPath) || config.enabled.has(normalizedPath)) {
    return true;
  }

  // Default: ENABLED (suckless - no config needed)
  return true;
}
