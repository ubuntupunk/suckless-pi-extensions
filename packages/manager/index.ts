/**
 * Extension Manager
 * 
 * Loads and manages extensions based on .conf configuration files.
 * 
 * Usage:
 *   import { loadExtensions } from "./packages/manager";
 *   loadExtensions(pi);
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  loadManagerConfig,
  shouldLoadExtension,
  type ManagerConfig,
} from "./conf-parser";
import { createAliasAPI } from "./alias-api";

/**
 * Load package.json to get extension list
 */
function loadPackageExtensions(rootDir: string): string[] {
  const pkgPath = join(rootDir, "package.json");
  
  if (!existsSync(pkgPath)) {
    console.error("[manager] package.json not found");
    return [];
  }
  
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.pi?.extensions || [];
  } catch (e: any) {
    console.error("[manager] Failed to parse package.json:", e.message);
    return [];
  }
}

/**
 * Import and initialize a single extension
 */
async function loadExtension(
  extPath: string,
  api: ExtensionAPI
): Promise<void> {
  try {
    const module = await import(extPath);
    if (module.default && typeof module.default === "function") {
      await module.default(api);
      console.log(`[manager] Loaded: ${extPath}`);
    } else {
      console.warn(`[manager] No default export: ${extPath}`);
    }
  } catch (e: any) {
    console.error(`[manager] Failed to load ${extPath}:`, e.message);
  }
}

/**
 * Main entry point - load all enabled extensions
 */
export async function loadExtensions(
  pi: ExtensionAPI,
  rootDir: string = process.cwd()
): Promise<void> {
  console.log("[manager] Initializing extension manager...");
  
  // Load configuration
  const config = loadManagerConfig(rootDir);
  
  // Log configuration summary
  console.log(
    `[manager] Extensions: ${config.extensions.enabled.size} enabled, ${config.extensions.disabled.size} disabled`
  );
  console.log(
    `[manager] Commands: ${config.commands.aliases.size} aliases, ${config.commands.groups.size} groups, ${config.commands.hidden.size} hidden`
  );
  
  // Create wrapped API with alias support
  const api = createAliasAPI(pi, config.commands.aliases);
  
  // Get extension list from package.json
  const extensions = loadPackageExtensions(rootDir);
  
  if (extensions.length === 0) {
    console.warn("[manager] No extensions found in package.json");
    return;
  }
  
  // Filter and load extensions
  const enabledExtensions = extensions.filter((ext) =>
    shouldLoadExtension(ext, config.extensions)
  );
  
  console.log(`[manager] Loading ${enabledExtensions.length}/${extensions.length} extensions`);
  
  // Load extensions sequentially to avoid race conditions
  for (const ext of enabledExtensions) {
    await loadExtension(ext, api);
  }
  
  console.log("[manager] Extension manager initialized");
}

/**
 * Get extension status (for debugging/status commands)
 */
export function getExtensionStatus(
  rootDir: string = process.cwd()
): {
  enabled: string[];
  disabled: string[];
  total: number;
} {
  const config = loadManagerConfig(rootDir);
  const extensions = loadPackageExtensions(rootDir);
  
  const enabled: string[] = [];
  const disabled: string[] = [];
  
  for (const ext of extensions) {
    if (shouldLoadExtension(ext, config.extensions)) {
      enabled.push(ext);
    } else {
      disabled.push(ext);
    }
  }
  
  return {
    enabled,
    disabled,
    total: extensions.length,
  };
}

/**
 * Get command configuration (for help/status commands)
 */
export function getCommandConfig(
  rootDir: string = process.cwd()
): ManagerConfig["commands"] {
  const config = loadManagerConfig(rootDir);
  return config.commands;
}

/**
 * Helper to check if a command should be hidden
 */
export function isCommandHidden(
  command: string,
  rootDir: string = process.cwd()
): boolean {
  const config = loadManagerConfig(rootDir);
  const normalized = command.startsWith("/") ? command : `/${command}`;
  return config.commands.hidden.has(normalized);
}

/**
 * Get commands by group
 */
export function getCommandsByGroup(
  groupName: string,
  rootDir: string = process.cwd()
): string[] {
  const config = loadManagerConfig(rootDir);
  return config.commands.groups.get(groupName) || [];
}

/**
 * Get all groups
 */
export function getCommandGroups(
  rootDir: string = process.cwd()
): Map<string, string[]> {
  const config = loadManagerConfig(rootDir);
  return config.commands.groups;
}
