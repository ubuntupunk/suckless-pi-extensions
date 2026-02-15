/**
 * Ralph Wiggum - Long-running agent loops for iterative development.
 * Ported to Suckless Pi.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const RALPH_DIR = ".ralph";
const _COMPLETE_MARKER = "<promise>COMPLETE</promise>";

const DEFAULT_TEMPLATE = `# Task\n\nDescribe your task here.\n\n## Goals\n- Goal 1\n\n## Checklist\n- [ ] Item 1\n`;

interface LoopState {
  name: string;
  taskFile: string;
  iteration: number;
  maxIterations: number;
  status: "active" | "paused" | "completed";
}

export default function (pi: ExtensionAPI) {
  let currentLoop: string | null = null;

  const getPath = (ctx: ExtensionContext, name: string, ext: string) =>
    path.join(ctx.cwd, RALPH_DIR, `${name}${ext}`);

  pi.registerCommand("ralph", {
    description: "Ralph loop control",
    handler: async (args, ctx) => {
      const [cmd, name] = args.trim().split(/\s+/);
      if (cmd === "start" && name) {
        const taskFile = path.join(RALPH_DIR, `${name}.md`);
        const fullPath = path.resolve(ctx.cwd, taskFile);
        if (!fs.existsSync(path.dirname(fullPath)))
          fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        if (!fs.existsSync(fullPath))
          fs.writeFileSync(fullPath, DEFAULT_TEMPLATE);

        const state: LoopState = {
          name,
          taskFile,
          iteration: 1,
          maxIterations: 50,
          status: "active",
        };
        fs.writeFileSync(getPath(ctx, name, ".json"), JSON.stringify(state));
        currentLoop = name;
        pi.sendUserMessage(
          `Starting Ralph loop: ${name}\n\nTask file: ${taskFile}`,
        );
      } else if (cmd === "stop") {
        currentLoop = null;
        ctx.ui.notify("Ralph loop paused", "info");
      }
    },
  });

  pi.registerTool({
    name: "ralph_done",
    label: "Ralph Done",
    description: "Signal iteration complete",
    parameters: Type.Object({}),
    async execute(_id, _params, _sig, _upd, ctx) {
      if (!currentLoop)
        return {
          content: [{ type: "text", text: "No active loop" }],
          details: {},
        };
      const state: LoopState = JSON.parse(
        fs.readFileSync(getPath(ctx, currentLoop, ".json"), "utf-8"),
      );
      state.iteration++;
      fs.writeFileSync(
        getPath(ctx, currentLoop, ".json"),
        JSON.stringify(state),
      );
      pi.sendUserMessage(`Iteration ${state.iteration} starting...`, {
        deliverAs: "followUp",
      });
      return {
        content: [{ type: "text", text: "Iteration done" }],
        details: {},
      };
    },
  });

  pi.on("before_agent_start", async (_event, _ctx) => {
    if (!currentLoop) return;
    return {
      systemPrompt:
        _event.systemPrompt +
        `\n[RALPH LOOP ACTIVE: ${currentLoop}]\nUpdate the task file and call ralph_done when an iteration is finished.`,
    };
  });
}
