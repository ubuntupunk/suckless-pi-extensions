/**
 * Alias API - Wrap ExtensionAPI to support command aliases
 */

import type {
  ExtensionAPI,
  CommandDefinition,
  ExtensionContext,
  ToolDefinition,
  MessageRenderer,
  TSchema,
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

  registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(tool: ToolDefinition<TParams, TDetails>): void {
    this.original.registerTool(tool);
  }

  registerMessageRenderer<T = unknown>(customType: string, renderer: MessageRenderer<T>): void {
    this.original.registerMessageRenderer(customType, renderer);
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

  sendMessage<T = unknown>(
    message: Pick<any, "customType" | "content" | "display" | "details">,
    options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }
  ): void {
    this.original.sendMessage(message, options);
  }

  appendEntry<T = unknown>(customType: string, data?: T): void {
    this.original.appendEntry(customType, data);
  }

  getExtensionContext(): ExtensionContext {
    return this.original.getExtensionContext();
  }

  getFlag(name: string): boolean | string | undefined {
    return this.original.getFlag(name);
  }

  registerFlag(
    name: string,
    options: {
      description?: string;
      type: "boolean" | "string";
      default?: boolean | string;
    }
  ): void {
    this.original.registerFlag(name, options);
  }

  registerShortcut(
    shortcut: any,
    options: {
      description?: string;
      handler: (ctx: ExtensionContext) => Promise<void> | void;
    }
  ): void {
    this.original.registerShortcut(shortcut, options);
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

  // Additional ExtensionAPI methods - pass through to original
  getActiveTools(): string[] {
    return this.original.getActiveTools();
  }

  getAllTools(): any[] {
    return this.original.getAllTools();
  }

  setActiveTools(toolNames: string[]): void {
    this.original.setActiveTools(toolNames);
  }

  getCommands(): any[] {
    return this.original.getCommands();
  }

  setModel(model: any): Promise<boolean> {
    return this.original.setModel(model);
  }

  getThinkingLevel(): any {
    return this.original.getThinkingLevel();
  }

  setThinkingLevel(level: any): void {
    this.original.setThinkingLevel(level);
  }

  setSessionName(name: string): void {
    this.original.setSessionName(name);
  }

  getSessionName(): string | undefined {
    return this.original.getSessionName();
  }

  setLabel(entryId: string, label: string | undefined): void {
    this.original.setLabel(entryId, label);
  }

  exec(command: string, args: string[], options?: any): Promise<any> {
    return this.original.exec(command, args, options);
  }

  getFlag(name: string): boolean | string | undefined {
    return this.original.getFlag(name);
  }

  registerProvider(name: string, config: any): void {
    this.original.registerProvider(name, config);
  }

  get events(): any {
    // Ensure events is always available, even if original doesn't have it
    return this.original.events || { on: () => {}, off: () => {}, emit: () => {} };
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
