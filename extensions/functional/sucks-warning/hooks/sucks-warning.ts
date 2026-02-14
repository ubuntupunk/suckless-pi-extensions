import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { checkSucksWarning } from "../checks";
import { triggerSucksWarningOverlay } from "../overlay";

/**
 * Setup the "this sucks" warning detection hook.
 * Runs checks after each agent turn and displays overlay if violations detected.
 */
export function setupSucksWarningHook(pi: ExtensionAPI): void {
  pi.on("agent_end", async (event, ctx) => {
    const result = checkSucksWarning(ctx, event.messages);

    if (result.inZone) {
      triggerSucksWarningOverlay(ctx, result.details);
    }
  });
}
