/**
 * Configuration schema for the providers extension.
 *
 * ProvidersConfig is the user-facing schema (all fields optional).
 * ResolvedConfig is the internal schema (all fields required, defaults applied).
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";

// --- Types ---

export type WidgetMode = "always" | "warnings-only" | "never";

export interface ProviderOverrides {
  widget?: WidgetMode;
  warnings?: boolean;
}

export interface ProvidersConfig {
  providers?: Record<string, ProviderOverrides>;
  refreshIntervalMinutes?: number;
}

export interface ResolvedProviderSettings {
  widget: WidgetMode;
  warnings: boolean;
}

export interface ResolvedConfig {
  providers: Record<string, ResolvedProviderSettings>;
  refreshIntervalMinutes: number;
}

// --- Provider keys (shared with hooks) ---

export type ProviderKey = "anthropic" | "openai-codex" | "opencode";

export const PROVIDER_KEYS: ProviderKey[] = [
  "anthropic",
  "openai-codex",
  "opencode",
];

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKey, string> = {
  anthropic: "Claude",
  "openai-codex": "Codex",
  opencode: "Opencode",
};

// --- Defaults ---

const DEFAULT_PROVIDER_SETTINGS: ResolvedProviderSettings = {
  widget: "warnings-only",
  warnings: true,
};

const DEFAULT_CONFIG: ResolvedConfig = {
  providers: Object.fromEntries(
    PROVIDER_KEYS.map((key) => [key, { ...DEFAULT_PROVIDER_SETTINGS }]),
  ),
  refreshIntervalMinutes: 5,
};

// --- Loader ---

export const configLoader = new ConfigLoader<ProvidersConfig, ResolvedConfig>(
  "providers",
  DEFAULT_CONFIG,
  {
    scopes: ["global", "memory"],
  },
);

// --- Helpers ---

/**
 * Get the resolved settings for a specific provider.
 * Falls back to defaults if provider has no explicit config.
 */
export function getProviderSettings(
  providerKey: ProviderKey,
): ResolvedProviderSettings {
  const config = configLoader.getConfig();
  return config.providers[providerKey] ?? DEFAULT_PROVIDER_SETTINGS;
}
