# Pi Introspection Extension

Inspect Pi agent internals: system prompt, tools, skills, context usage.

## Commands

All commands are prefixed with `pi:`.

- **`/pi:prompt`** - Tabbed system prompt viewer. Sections split by AGENTS.md file, with a separate tab for extension-injected guidance. Each AGENTS.md tab shows the full file path. Strips metadata (date/time, cwd) and skills (use `/pi:skills` instead).
- **`/pi:tools`** - All registered tools grouped by active/inactive status, rendered in bordered boxes with descriptions.
- **`/pi:skills`** - Available skills parsed from the system prompt, rendered in bordered boxes.
- **`/pi:context`** - Context window usage with a segmented progress bar showing cache read, cache write, input, and output token breakdown. Also shows cumulative token stats across all turns and total cost.
- **`/pi:extensions`** - Placeholder for extension listing.

## Keybindings

Shared across all viewers:

| Key | Action |
|---|---|
| `j` / `k` | Scroll up/down |
| `PgUp` / `PgDn` | Page up/down |
| `gg` | Go to top |
| `G` | Go to bottom |
| `q` / `Esc` | Close |

The tabbed prompt viewer (`/pi:prompt`) also supports:

| Key | Action |
|---|---|
| `Tab` | Next tab |
| `Shift+Tab` | Previous tab |
