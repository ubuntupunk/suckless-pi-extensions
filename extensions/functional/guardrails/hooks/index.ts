import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config";
import setupFilterOutput from "../filter-output";
import { setupPermissionGateHook } from "./permission-gate";
import { setupProtectEnvFilesHook } from "./protect-env-files";
import setupSafeGit from "./safe-git";

export function setupGuardrailsHooks(pi: ExtensionAPI, config: ResolvedConfig) {
  setupProtectEnvFilesHook(pi, config);
  setupPermissionGateHook(pi, config);
  setupSafeGit(pi);
  setupFilterOutput(pi);
}
