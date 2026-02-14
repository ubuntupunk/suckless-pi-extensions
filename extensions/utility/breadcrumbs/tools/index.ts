import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupFindSessionsTool } from "./find-sessions";
import { setupHandoffTool } from "./handoff";
import { setupReadSessionTool } from "./read-session";

export { FIND_SESSIONS_GUIDANCE } from "./find-sessions";
export { HANDOFF_GUIDANCE } from "./handoff";
export { READ_SESSION_GUIDANCE } from "./read-session";

export interface SessionToolsOptions {
  handoffTool: boolean;
}

export function setupSessionTools(
  pi: ExtensionAPI,
  options: SessionToolsOptions,
) {
  setupFindSessionsTool(pi);
  setupReadSessionTool(pi);
  if (options.handoffTool) {
    setupHandoffTool(pi);
  }
}
