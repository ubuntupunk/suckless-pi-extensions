import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupSucksWarningHook } from "./sucks-warning";

export function setupSucksWarningHooks(pi: ExtensionAPI) {
  setupSucksWarningHook(pi);
}
