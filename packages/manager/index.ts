/**
 * Extension Manager
 *
 * Loads and manages extensions based on .conf configuration files.
 *
 * Philosophy: Auto-discover extensions, configure only overrides.
 *
 * Usage:
 *   // In package.json pi.extensions:
 *   "packages/manager/index.ts"  // Load first - handles the rest
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  loadManagerConfig,
  shouldLoadExtension,
  type ManagerConfig,
} from "./conf-parser";
import { createAliasAPI } from "./alias-api";
import { info, debug, warn, error } from "./debug.js";

/**
 * Get the directory containing this manager module
 */
function getManagerDir(): string {
  return dirname(import.meta.dirname || __dirname);
}

/**
 * Get the project root (parent of packages/)
 */
function getProjectRoot(): string {
  const managerDir = getManagerDir();
  // Go up from packages/manager to project root
  return join(managerDir, "..");
}

/**
 * Discover extension entry points using simple glob pattern
 * Suckless approach: convention over configuration
 */
function discoverExtensions(rootDir: string): string[] {
  const results: string[] = [];
  const extDir = join(rootDir, "extensions");

  debug(`Scanning: ${extDir}`);

  if (!existsSync(extDir)) {
    warn(`Directory not found: ${extDir}`);
    return results;
  }

  try {
    // Read top-level directories (functional, suckless, utility)
    const categories = readdirSync(extDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);

    debug(`Categories: ${categories.join(', ')}`);

    for (const cat of categories) {
      const catDir = join(extDir, cat);
      try {
        const entries = readdirSync(catDir, { withFileTypes: true });
        debug(`${cat}: ${entries.length} entries`);

        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;

          if (entry.isDirectory()) {
            const indexPath = join(catDir, entry.name, 'index.ts');
            if (existsSync(indexPath)) {
              const relPath = join(cat, entry.name, 'index.ts');
              debug(`Found: ${relPath}`);
              results.push(relPath);
            }
          } else if (entry.name.endsWith('.ts') && !entry.name.startsWith('_')) {
            const relPath = join(cat, entry.name);
            debug(`Found: ${relPath}`);
            results.push(relPath);
          }
        }
      } catch (err: any) {
        warn(`Error reading ${catDir}: ${err.message}`);
      }
    }
  } catch (err: any) {
    warn(`Error reading ${extDir}: ${err.message}`);
  }

  debug(`Total discovered: ${results.length}`);
  return results.sort();
}

/**
 * Import and initialize a single extension
 */
async function loadExtension(
  extPath: string,
  api: ExtensionAPI,
  projectRoot: string
): Promise<void> {
  try {
    // Resolve path relative to project root
    // extPath is like "functional/files-widget/index.ts"
    // Need to join with "extensions/" subdirectory
    const resolvedPath = join(projectRoot, "extensions", extPath);
    const module = await import(resolvedPath);
    if (module.default && typeof module.default === "function") {
      await module.default(api);
      debug(`Loaded: ${extPath}`);
    } else {
      warn(`No default export: ${extPath}`);
    }
  } catch (e: any) {
    error(`Failed to load ${extPath}: ${e.message}`);
  }
}

/**
 * Main entry point - load all enabled extensions
 */
export async function loadExtensions(
  pi: ExtensionAPI,
  rootDir?: string
): Promise<void> {
  const projectRoot = rootDir || getProjectRoot();

  info("Initializing extension manager...");
  debug(`Project root: ${projectRoot}`);

  // Load configuration
  const config = loadManagerConfig(projectRoot);

  // Log configuration summary
  info(`Extensions: ${config.extensions.enabled.size} enabled overrides, ${config.extensions.disabled.size} disabled`);
  info(`Commands: ${config.commands.aliases.size} aliases, ${config.commands.groups.size} groups, ${config.commands.hidden.size} hidden`);

  // Create wrapped API with alias support
  const api = createAliasAPI(pi, config.commands.aliases);

  // Discover extensions from filesystem (suckless: convention over config)
  const extensions = discoverExtensions(projectRoot);

  debug(`Discovery returned: ${extensions.length} extensions`);

  if (extensions.length === 0) {
    warn("No extensions found in extensions/ directory");
    return;
  }

  info(`Discovered ${extensions.length} extensions`);

  // Filter by config (default: all enabled, only disable what's listed)
  const enabledExtensions = extensions
    .filter((ext) => shouldLoadExtension(ext, config.extensions));

  info(`Loading ${enabledExtensions.length}/${extensions.length} extensions`);

  // Load extensions sequentially to avoid race conditions
  for (const ext of enabledExtensions) {
    await loadExtension(ext, api, projectRoot);
  }

  info("Extension manager initialized");
}

/**
 * Default export - Pi calls this when loading the extension
 */
export default async function(pi: ExtensionAPI): Promise<void> {
  await loadExtensions(pi);
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
