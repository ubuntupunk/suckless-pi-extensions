/**
 * Session management extension configuration.
 *
 * Global: ~/.pi/agent/extensions/breadcrumbs.json
 * Project: .pi/extensions/breadcrumbs.json
 */

import { ConfigLoader } from "@aliou/pi-utils-settings";

export interface SessionManagementConfig {
  /** Whether the handoff tool (agent-callable) is enabled. */
  handoffTool?: boolean;
}

export interface ResolvedSessionManagementConfig {
  handoffTool: boolean;
}

const DEFAULT_CONFIG: ResolvedSessionManagementConfig = {
  handoffTool: false,
};

export const configLoader = new ConfigLoader<
  SessionManagementConfig,
  ResolvedSessionManagementConfig
>("breadcrumbs", DEFAULT_CONFIG, {
  scopes: ["global"],
});
