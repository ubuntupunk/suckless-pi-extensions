import type {
  AgentToolResult,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { markExecutionEnd, markExecutionStart } from "./timing";

export interface ToolTimingMeta {
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface WrapToolDefinitionsWithTimingOptions {
  /**
   * Key used on details object for timing metadata.
   * Default: "__meta"
   */
  detailsMetaKey?: string;
}

/**
 * Wrap ToolDefinition execute handlers and inject timing metadata into result details.
 *
 * Metadata shape:
 * details[detailsMetaKey].timing = { startedAt, endedAt, durationMs }
 */
export function wrapToolDefinitionsWithTiming(
  tools: ToolDefinition[],
  options: WrapToolDefinitionsWithTimingOptions = {},
): ToolDefinition[] {
  const detailsMetaKey = options.detailsMetaKey ?? "__meta";

  return tools.map((tool) => {
    const originalExecute = tool.execute.bind(tool);

    return {
      ...tool,
      async execute(toolCallId, args, signal, onUpdate, ctx) {
        const timing: Partial<ToolTimingMeta> = {};
        markExecutionStart(timing, Date.now());

        const result = (await originalExecute(
          toolCallId,
          args,
          signal,
          onUpdate,
          ctx,
        )) as AgentToolResult<Record<string, unknown> | undefined>;

        markExecutionEnd(timing, Date.now());

        return injectTimingIntoResult(
          result,
          timing as ToolTimingMeta,
          detailsMetaKey,
        );
      },
    } as ToolDefinition;
  });
}

function injectTimingIntoResult(
  result: AgentToolResult<Record<string, unknown> | undefined>,
  timing: ToolTimingMeta,
  detailsMetaKey: string,
): AgentToolResult<Record<string, unknown>> {
  const details = result.details ?? {};
  const detailsRecord = details as Record<string, unknown>;
  const existingMeta =
    typeof detailsRecord[detailsMetaKey] === "object" &&
    detailsRecord[detailsMetaKey] !== null
      ? (detailsRecord[detailsMetaKey] as Record<string, unknown>)
      : {};

  return {
    ...result,
    details: {
      ...detailsRecord,
      [detailsMetaKey]: {
        ...existingMeta,
        timing,
      },
    },
  };
}
