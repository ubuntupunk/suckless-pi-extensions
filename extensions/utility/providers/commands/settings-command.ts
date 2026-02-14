import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  configLoader,
  PROVIDER_DISPLAY_NAMES,
  PROVIDER_KEYS,
  type ProvidersConfig,
  type ResolvedConfig,
  type WidgetMode,
} from "../config";

const WIDGET_MODE_LABELS: Record<WidgetMode, string> = {
  always: "always",
  "warnings-only": "warnings only",
  never: "never",
};

function widgetDisplayValue(mode: WidgetMode): string {
  return WIDGET_MODE_LABELS[mode];
}

function widgetStorageValue(display: string): WidgetMode {
  for (const [mode, label] of Object.entries(WIDGET_MODE_LABELS)) {
    if (label === display) return mode as WidgetMode;
  }
  return "warnings-only";
}

export function registerProvidersSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<ProvidersConfig, ResolvedConfig>(pi, {
    commandName: "providers:settings",
    commandDescription: "Configure providers extension settings",
    title: "Providers Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: ProvidersConfig | null,
      resolved: ResolvedConfig,
    ): SettingsSection[] => {
      const sections: SettingsSection[] = [];

      // General section
      sections.push({
        label: "General",
        items: [
          {
            id: "refreshIntervalMinutes",
            label: "Refresh interval",
            description:
              "Minutes between rate limit checks (checked on events, not a timer)",
            currentValue: String(
              tabConfig?.refreshIntervalMinutes ??
                resolved.refreshIntervalMinutes,
            ),
            values: ["1", "5", "10", "15", "30"],
          },
        ],
      });

      // Per-provider sections
      for (const key of PROVIDER_KEYS) {
        const displayName = PROVIDER_DISPLAY_NAMES[key];
        const providerResolved = resolved.providers[key];
        const providerConfig = tabConfig?.providers?.[key];

        if (!providerResolved) continue;

        sections.push({
          label: displayName,
          items: [
            {
              id: `providers.${key}.widget`,
              label: "Widget",
              description: "When to show the usage bar widget",
              currentValue: widgetDisplayValue(
                providerConfig?.widget ?? providerResolved.widget,
              ),
              values: Object.values(WIDGET_MODE_LABELS),
            },
            {
              id: `providers.${key}.warnings`,
              label: "Warnings",
              description: "Show rate limit warning notifications",
              currentValue:
                (providerConfig?.warnings ?? providerResolved.warnings)
                  ? "enabled"
                  : "disabled",
              values: ["enabled", "disabled"],
            },
          ],
        });
      }

      return sections;
    },
    onSettingChange: (
      id: string,
      newValue: string,
      config: ProvidersConfig,
    ): ProvidersConfig | null => {
      const updated = structuredClone(config);

      if (id === "refreshIntervalMinutes") {
        const num = Number.parseInt(newValue, 10);
        if (Number.isFinite(num) && num > 0) {
          updated.refreshIntervalMinutes = num;
        }
        return updated;
      }

      // Provider settings: "providers.{key}.{field}"
      const match = id.match(/^providers\.(.+)\.(\w+)$/);
      if (match) {
        const providerKey = match[1] as string;
        const field = match[2] as string;

        if (!updated.providers) updated.providers = {};
        if (!updated.providers[providerKey])
          updated.providers[providerKey] = {};

        if (field === "widget") {
          updated.providers[providerKey].widget = widgetStorageValue(newValue);
        } else if (field === "warnings") {
          updated.providers[providerKey].warnings = newValue === "enabled";
        }

        return updated;
      }

      return null;
    },
  });
}
