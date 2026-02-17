/**
 * Alias API - Wrap ExtensionAPI to support command aliases
 */

import type {
  ExtensionAPI,
  CommandDefinition,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";

export class AliasAPI implements ExtensionAPI {
  private original: ExtensionAPI;
  private aliases: Map<string, string>; // alias → original
  private registeredCommands: Map<string, CommandDefinition>;

  constructor(
    api: ExtensionAPI,
    aliases: Map<string, string>
  ) {
    this.original = api;
    this.aliases = aliases;
    this.registeredCommands = new Map();
  }

  registerCommand(
    name: string,
    definition: CommandDefinition
  ): void {
    // Store original
    this.registeredCommands.set(name, definition);

    // Register original command
    this.original.registerCommand(name, definition);

    // Register aliases
    const normalizedName = name.startsWith("/") ? name : `/${name}`;
    for (const [alias, target] of this.aliases.entries()) {
      const normalizedTarget = target.startsWith("/") ? target : `/${target}`;
      
      if (normalizedTarget === normalizedName) {
        const aliasName = alias.startsWith("/") ? alias : `/${alias}`;
        const aliasDef: CommandDefinition = {
          ...definition,
          description: `${definition.description} (alias: ${name})`,
        };
        
        this.original.registerCommand(aliasName, aliasDef);
        this.registeredCommands.set(aliasName, aliasDef);
      }
    }
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.original.on(event, handler);
  }

  once(event: string, handler: (...args: any[]) => void): void {
    this.original.once(event, handler);
  }

  off(event: string, handler: (...args: any[]) => void): void {
    this.original.off(event, handler);
  }

  emit(event: string, ...args: any[]): void {
    this.original.emit(event, ...args);
  }

  sendUserMessage(
    content: string,
    options?: {
      deliverAs?: "newSession" | "followUp";
      streamingBehavior?: "newSession" | "followUp";
    }
  ): void {
    this.original.sendUserMessage(content, options);
  }

  getExtensionContext(): ExtensionContext {
    return this.original.getExtensionContext();
  }

  /**
   * Get all registered commands (including aliases)
   */
  getRegisteredCommands(): Map<string, CommandDefinition> {
    return new Map(this.registeredCommands);
  }

  /**
   * Get the original command name for an alias
   */
  resolveCommand(name: string): string {
    const normalized = name.startsWith("/") ? name : `/${name}`;
    return this.aliases.get(normalized) || normalized;
  }

  /**
   * Check if a command is an alias
   */
  isAlias(name: string): boolean {
    const normalized = name.startsWith("/") ? name : `/${name}`;
    return this.aliases.has(normalized);
  }
}

/**
 * Create wrapped API with alias support
 */
export function createAliasAPI(
  api: ExtensionAPI,
  aliases: Map<string, string>
): AliasAPI {
  return new AliasAPI(api, aliases);
}
