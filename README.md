# Suckless Pi: Thoughts on an Open Source Supply Chain

## 1. Safety: The Prompt Injection Surface
The primary risk in the current Pi ecosystem is that **extensions are not just code; they are system instructions.** 
- **Vulnerability**: Every time we pull a 3rd-party extension, we are adding a "voice" to the agent's internal monologue. A malicious or poorly written extension could contain "Instruction Injection"—hidden prompts that steer the agent to leak environment variables, overwrite `.ssh/authorized_keys`, or exfiltrate data via `curl`.
- **The Suckless Approach**: Safety through visibility. A "suckless" extension should be small enough to be audited in a single sitting. If you can't read the whole source in 5 minutes, it’s too bloated to be safe.

## 2. Control: Moving from "Hacks" to "Personal Stacks"
We have already encountered the "Extension Conflict" problem. As we add more tools, namespaces like `/review` or `/files` become contested territory.
- **The Issue**: Relying on upstream `main` branches makes us "consumers" who are vulnerable to "breaking updates" or "instruction drift."
- **The Strategy**: 
    - **Local-First Curation**: Instead of tracking 20 disparate repos, we should consolidate our preferred tools into a **Personal Pi Package**. 
    - **Vetting over Updating**: We treat the supply chain like a library of parts, not a stream of updates. We "cherry-pick" features from the community, rename them to fit our workflow (e.g., `tui-review` vs `review`), and pin them.
    - **Ownership**: The move to local paths in `settings.json` is the first step toward a sovereign coding environment.

## 3. The Way Forward: Elegance without Ego
How do we contribute to the ecosystem without getting bogged down in "PR politics" or hurting feelings?
- **Maximize Elegance & Efficiency**: If an upstream repo is "messy," don't try to fix their world. Fork it, strip it to the bare essentials (the "suckless" version), and use it.
- **Upstream Etiquette**: Send "General Utility" fixes upstream (bug fixes, performance). Keep "Workflow Opinions" (specific command names, UI preferences) in the personal fork.
- **Code as Art**: Avoid the "Bloat-Cycle." If a feature requires three new npm dependencies, ask if it can be done with a simple bash script or a native Node.js call.

## 4. Afternote: From "Shit Coder" to "Suckless"
The current moniker **"Shit Coder"** is a badge of honor for functional velocity—it implies "I don't care if the code is pretty, as long as it works." While this is great for prototyping, it eventually hits a ceiling of technical debt.

**Why "Suckless" is the logical evolution:**
The [Suckless Project](https://suckless.org/) (creators of `dwm`, `st`, and `dmenu`) champions the idea that software should be simple, clear, and frugal. 
- **The Motivation**: "Shit coding" is about the *output*. "Suckless coding" is about the *craft*. 
- **The Homage**: Just as `st` (suckless terminal) stripped away the bloat of modern terminal emulators, "Suckless Pi" should strip away the bloat of "AI-generated boilerplate."

### Suggested Alternatives to "Shit Coder":
If "Suckless" feels too aggressive or niche, we could consider:
1. **Pi-Artisan**: Implies hand-tooled, high-quality curation.
2. **Core-Pi**: Focuses on the minimal, indispensable set of tools.
3. **Lean-Pi**: Focuses on performance and the removal of waste.
4. **Prime-Pi**: The "Gold Standard" version of your local setup.

**Verdict**: "Suckless" remains the strongest choice for those who value the philosophy of "Code is a liability; keep it minimal."
