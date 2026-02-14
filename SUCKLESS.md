# The Suckless Manifesto for Pi

> "Software is like entropy. It is difficult to grasp, weighs nothing, and obeys the Second Law of Thermodynamics; i.e., it always increases." — Norman Augustine

In the world of AI agents, entropy is the default state. Extensions are added as "hacks," system prompts grow into bloated monologues, and dependencies form opaque chains of "instruction slop."

**Suckless Pi** is a rejection of this entropy. It is an application of the [Suckless Philosophy](https://suckless.org/) to the personal AI stack.

## 1. Minimalist Core
If a tool can be a shell script, it shouldn't be an npm package. If a prompt can be a single sentence, it shouldn't be a paragraph. We strip away the "AI-generated boilerplate" to find the functional core.

## 2. Sovereignty over Consumption
Relying on upstream `main` branches makes you a consumer of drift. We vendor our tools locally. We audit every line. We own our internal monologue. Your agent's "voice" should not change because a 3rd party decided to "optimize" their prompt.

## 3. Auditability
A "suckless" extension is one that can be audited in a single sitting. If you cannot read the entire source of your agent's tools in 5 minutes, you are running code you don't understand and logic you don't control.

## 4. The Craft of the Curator
We move from "functional velocity" (make it work at any cost) to "sovereign craft" (make it elegant, minimal, and stable). Every item in this repository is here for a reason. If the reason disappears, the code follows.

## 5. Principles
- **Code is a liability**: Keep it small to minimize the attack surface and the cognitive load.
- **Simplicity is stability**: Fewer moving parts mean fewer points of failure in the chat loop.
- **Vetting over Updating**: We cherry-pick features and pin them. We don't follow the stream; we build the dam.

---

*This repository is a curated collection of tools that don't suck.*
