/**
 * Test extension to verify loading
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { appendFileSync } from "node:fs";

export default function testExtension(pi: ExtensionAPI): void {
  // Log that extension is loading to a file
  try {
    appendFileSync("/tmp/pi-ext-test.log", `[${new Date().toISOString()}] Test extension loading\n`);
  } catch (e) {
    // Ignore file errors
  }

  pi.registerCommand("test-ext", {
    description: "Test extension command",
    handler: async (_args, ctx) => {
      try {
        appendFileSync("/tmp/pi-ext-test.log", `[${new Date().toISOString()}] test-ext command executed\n`);
      } catch {}
      ctx.ui.notify("Test extension is working!", "info");
    },
  });

  try {
    appendFileSync("/tmp/pi-ext-test.log", `[${new Date().toISOString()}] Test extension loaded successfully\n`);
  } catch {}
}
