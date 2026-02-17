/**
 * API Compatibility Layer
 * 
 * Provides fallback implementations for Pi API methods that may not exist
 * in older Pi versions. This allows extensions to work across versions.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export interface CompatibleExtensionAPI extends ExtensionAPI {
  // Ensure these methods exist with proper types
  registerTool: ExtensionAPI["registerTool"];
  registerMessageRenderer: ExtensionAPI["registerMessageRenderer"];
  sendMessage: ExtensionAPI["sendMessage"];
}

/**
 * Wrap the Pi API to ensure compatibility methods exist
 */
export function createCompatibleAPI(pi: ExtensionAPI): CompatibleExtensionAPI {
  const compatibleAPI = pi as CompatibleExtensionAPI;
  
  // Polyfill registerTool if missing
  if (!compatibleAPI.registerTool) {
    console.warn("[manager] Pi API missing registerTool - tools will not be available");
    compatibleAPI.registerTool = () => {
      console.warn("[manager] registerTool called but not supported by this Pi version");
    };
  }
  
  // Polyfill registerMessageRenderer if missing
  if (!compatibleAPI.registerMessageRenderer) {
    console.warn("[manager] Pi API missing registerMessageRenderer - custom message types will not render");
    compatibleAPI.registerMessageRenderer = () => {
      console.warn("[manager] registerMessageRenderer called but not supported by this Pi version");
    };
  }
  
  // Polyfill sendMessage if missing
  if (!compatibleAPI.sendMessage) {
    console.warn("[manager] Pi API missing sendMessage - custom messages will not be sent");
    compatibleAPI.sendMessage = () => {
      console.warn("[manager] sendMessage called but not supported by this Pi version");
    };
  }
  
  return compatibleAPI;
}
