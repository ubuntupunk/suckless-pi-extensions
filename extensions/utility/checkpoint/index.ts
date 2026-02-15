/**
 * Checkpoint extension for pi-coding-agent.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as core from "./core";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("checkpoint", {
    description: "Create a named checkpoint of the current state",
    handler: async (args, ctx) => {
      const id = args.trim() || `cp-${Date.now()}`;
      const root = await core.getRepoRoot(ctx.cwd).catch(() => null);
      if (!root) {
        ctx.ui.notify("Not in a git repository", "error");
        return;
      }
      ctx.ui.notify(`Creating checkpoint: ${id}...`, "info");
      try {
        await core.createCheckpoint(
          root,
          id,
          0,
          ctx.sessionManager.getSessionId(),
        );
        ctx.ui.notify(`Checkpoint created: ${id}`, "info");
      } catch (e: any) {
        ctx.ui.notify(`Failed to create checkpoint: ${e.message}`, "error");
      }
    },
  });

  pi.registerCommand("restore", {
    description: "Restore a checkpoint",
    handler: async (args, ctx) => {
      const id = args.trim();
      const root = await core.getRepoRoot(ctx.cwd).catch(() => null);
      if (!root) {
        ctx.ui.notify("Not in a git repository", "error");
        return;
      }
      const refs = await core.listCheckpointRefs(root);
      if (refs.length === 0) {
        ctx.ui.notify("No checkpoints found", "info");
        return;
      }

      let targetId: string | undefined = id;
      if (!targetId && ctx.hasUI) {
        targetId = await ctx.ui.select("Restore checkpoint:", refs);
      }

      if (!targetId) return;

      const cp = await core.loadCheckpointFromRef(root, targetId);
      if (!cp) {
        ctx.ui.notify(`Checkpoint not found: ${targetId}`, "error");
        return;
      }

      const confirmed = await ctx.ui.confirm(
        `Restore checkpoint ${targetId}?`,
        "This will reset your working directory and index to the checkpoint state.",
      );
      if (!confirmed) return;

      ctx.ui.notify(`Restoring checkpoint: ${targetId}...`, "info");
      try {
        await core.restoreCheckpoint(root, cp);
        ctx.ui.notify(`Restored checkpoint: ${targetId}`, "info");
      } catch (e: any) {
        ctx.ui.notify(`Failed to restore checkpoint: ${e.message}`, "error");
      }
    },
  });

  pi.registerCommand("checkpoints", {
    description: "List all checkpoints",
    handler: async (_, ctx) => {
      const root = await core.getRepoRoot(ctx.cwd).catch(() => null);
      if (!root) {
        ctx.ui.notify("Not in a git repository", "error");
        return;
      }
      const refs = await core.listCheckpointRefs(root);
      if (refs.length === 0) {
        ctx.ui.notify("No checkpoints found", "info");
      } else {
        ctx.ui.notify(
          `Checkpoints:\n${refs.map((r) => `  • ${r}`).join("\n")}`,
          "info",
        );
      }
    },
  });
}
