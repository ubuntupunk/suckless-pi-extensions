import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupExtensionDevTools, setupUpdateCommand } from "./core";

/**
 * Extension Development Tools
 * 
 * Provides tools for Pi extension developers: version detection,
 * changelog reading, documentation discovery, and package manager detection.
 */
export default function extensionDevExtension(pi: ExtensionAPI) {
  setupExtensionDevTools(pi);
  setupUpdateCommand(pi);
}
