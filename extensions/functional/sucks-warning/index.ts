import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupSucksWarningCommands } from "./commands";
import { setupSucksWarningHooks } from "./hooks";

/**
 * Sucks Warning Extension
 *
 * Shows an overlay when the agent response contains matching phrases.
 */
export default function (pi: ExtensionAPI) {
  setupSucksWarningHooks(pi);
  setupSucksWarningCommands(pi);
}
