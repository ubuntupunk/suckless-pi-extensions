# Suckless Pi: A Sovereign Coding Environment

## Sovereignty
Sovereignty in our coding environment is the transition from being a consumer of bloated, opaque extensions to being the **architect of our own tools**. It means vendoring our dependencies, auditing every line of logic that steers our agent, and prioritizing "suckless" principles: simplicity, clarity, and frugality. By owning the code that runs our agent, we eliminate "instruction drift," "vulnerability injection," and "workflow rot." This repository is our single source of truth — a curated, local-first stack where every tool is included for a reason, and every reason is aligned with the craft of coding.

## Repository Map & Curated Stack

| Category | Extension / Tool | Reason for Inclusion |
| :--- | :--- | :--- |
| **Suckless** | `status-bar.ts` | Minimal, stable session info without TUI bloat. |
| **Suckless** | `core-tools.ts` | Essential primitives: Time, Breadcrumb Titles, and Directory-Aware Read. |
| **Utility** | `introspection` | Transparency: View exactly what the agent knows (Context, Tools, Skills). |
| **Utility** | `neovim` | Editor Awareness: Deep integration with LSP and buffer context. |
| **Utility** | `processes` | Asynchronous Velocity: Manage background tasks without blocking chat. |
| **Utility** | `breadcrumbs` | Context Navigation: Handoff work between sessions to avoid context bloat. |
| **Utility** | `subagents` | Specialized Intelligence: Scout (research), Oracle (planning), Worker (execution). |
| **Utility** | `providers` | Supply Chain Visibility: Real-time rate-limit and usage tracking. |
| **Utility** | `presenter` | AV Layer: Terminal titles, Linux-compatible notifications, and audio alerts. |
| **Utility** | `session-naming` | Organization: Human-readable auto-titling for conversation history. |
| **Utility** | `theme-selector` | Aesthetics: Interactive `/theme` command with live preview. |
| **Utility** | `notification-hook` | Situational Awareness: Audio-visual cues for turn completion and user input requests. |
| **Functional** | `guardrails` | Security: AST-based permission gates for dangerous commands and .env protection. |
| **Functional** | `files-widget` | Navigation: High-fidelity TUI file browser and viewer. |
| **Functional** | `sucks-warning` | Quality Control: Automated detection of "slop" patterns and context exhaustion. |
| **Functional** | `planning` | Structure: Visualizing and tracking long-term implementation plans. |

## The Road Ahead
- **Audit Subagents**: Strip complex prompts and logic to their bare essentials.
- **Suckless Refactoring**: Gradually move "Functional" items to "Suckless" by reducing their dependency footprint.
- **Custom Tooling**: Build tailored solutions that solve *our* specific workflow problems, not the "general case."
