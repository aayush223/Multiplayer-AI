# UI/UX Design Document: Minge Multiplayer AI Platform

**Document Version**: 1.0  
**Status**: Approved Specification  
**Visual Reference**: [Figma: UI Design for IDE and Canvas](https://www.figma.com/make/HHwZ4RpfDiZrNu8rQ8NjLm/UI-Design-for-IDE-and-Canvas?t=u7pt6HKcS8w7lYg4-1)  
**Aesthetic Foundation**: Antigravity Desktop IDE + Roobinium Dark Cyberpunk Glassmorphism  

---

## 1. Design Philosophy & Visual Language

Minge unites two distinct collaboration modalities under a unified, high-octane dark visual identity:
1. **The Prompt IDE**: Modeled directly after **Antigravity's IDE** (Void/Code-OSS base) with activity bar, collapsible file tree, Monaco tabbed editor, status bar, and integrated AI agent panel — supercharged with a dedicated **Prompt Branching & Review (PPR)** surface.
2. **The AI Canvas**: A spatial, infinite collaborative board featuring the **Roobinium Cyberpunk** aesthetic: deep obsidian backdrops, multi-layered glassmorphic cards, luminous neon accent borders (`#00F2FE`, `#6366F1`, `#A855F7`), animated Bezier connection cables, and real-time multiplayer cursors with glowing trails.

---

## 2. Design Tokens & Visual Hierarchy

### 2.1 Color Palette

```css
:root {
  /* Surface & Background (Obsidian & Void) */
  --bg-primary: #07080C;         /* Core app background */
  --bg-secondary: #0D0F17;       /* Activity bar, panels, canvas grid base */
  --bg-surface: #131622;         /* Cards, tab bars, inspector panels */
  --bg-surface-elevated: #1A1E2E;/* Modals, popovers, dropdown menus */
  --bg-glass: rgba(19, 22, 34, 0.65); /* Glassmorphism card fill */

  /* Cyberpunk Neon Accents */
  --neon-cyan: #00F2FE;          /* Active nodes, memory connections, prompt runs */
  --neon-purple: #A855F7;        /* AI generation, agent actions, streaming states */
  --neon-indigo: #6366F1;        /* Primary branding, selected tabs, focus rings */
  --neon-pink: #EC4899;          /* Prompt branching root, experimental flags */
  --neon-emerald: #10B981;       /* Merged PRs, benchmark pass, online presence */
  --neon-amber: #F59E0B;         /* Warnings, prompt diff deletions, review requests */

  /* Text & Typography */
  --text-primary: #F8FAFC;       /* Headings, active code, node titles */
  --text-secondary: #94A3B8;     /* Metadata, inactive tabs, prompt templates */
  --text-muted: #64748B;         /* Line numbers, timestamps, grid coordinates */
  --text-code: #E2E8F0;          /* Monospace prompt body */

  /* Glassmorphic Borders & Highlights */
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-glass: rgba(255, 255, 255, 0.12);
  --border-neon-cyan: rgba(0, 242, 254, 0.4);
  --border-neon-purple: rgba(168, 85, 247, 0.4);

  /* Shadows & Glows */
  --glow-cyan: 0 0 24px rgba(0, 242, 254, 0.25);
  --glow-purple: 0 0 24px rgba(168, 85, 247, 0.25);
  --glow-card: 0 12px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
```

### 2.2 Typography
- **Headings & UI Chrome**: `Outfit`, `Figma Sans`, or `Inter` (sans-serif, weights 400, 500, 600, 700).
- **Code, Prompts & Diff Views**: `JetBrains Mono` or `Figma Mono` (monospace, weights 400, 500, with ligature support).
- **Micro-labels & Tags**: Uppercase with `letter-spacing: 0.08em`, font size `11px`.

---

## 3. Surface 1: The Prompt IDE (Antigravity Shell + Prompt Branching)

### 3.1 IDE Spatial Layout

```
┌────┬──────────────┬──────────────────────────────────────────┬────────────────────────┐
│ A  │  EXPLORER    │  Tab: system_prompt.prompt.json   [●] ✕   │  AGENT & PROMPT PRs    │
│ C  ├──────────────┼──────────────────────────────────────────┼────────────────────────┤
│ T  │ ▼ PROMPT PRs │ 1 │ {                                    │ [ Chat ] [★ Branch PR] │
│ I  │   • #12 main │ 2 │   "name": "clarify-summary",         │────────────────────────┤
│ V  │   • #14 exp* │ 3 │   "branch": "exp/chain-of-thought",  │ Active Branch:         │
│ I  │              │ 4 │   "model": "gemini-2.5-flash",       │ ⎇ exp/chain-of-thought │
│ T  │ ▼ WORKSPACE  │ 5 │   "system_prompt": "You are a...",   │                        │
│ Y  │   src/       │ 6 │   "grounded_memories": [             │ Grounded Memories (3): │
│    │     prompts/ │ 7 │     "mem_arch_01", "mem_policy_02"  │ ◈ Project Schema [x]   │
│ B  │     evals/   │ 8 │   ]                                  │ ◈ Auth Rules     [x]   │
│ A  │              │ 9 │ }                                    │                        │
│ R  │              │   │                                      │ [ Run Benchmark Eval ] │
├────┴──────────────┴───┴──────────────────────────────────────┴────────────────────────┤
│  STATUS BAR:  ⎇ exp/chain-of-thought*  |  gemini-2.5-flash  |  UTF-8  |  Tokens: 1,420 │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Key Zones of the Prompt IDE

#### 1. Activity Bar (Far Left - 48px width)
- **Explorer Icon**: Standard file tree.
- **Prompt Branches Icon (New - Git Branch Icon with AI Sparkle)**: Switches the sidebar to the **Prompt Branch Explorer**.
- **Search Icon**: Semantic search over project memories and prompt files.
- **Source Control Icon**: Git diffing for codebase files.
- **Canvas Switcher Icon (Neon Cyan)**: Instant toggle to jump straight into the **AI Canvas** spatial board for the active project.
- **Settings & Account**: Bottom-anchored.

#### 2. Primary Side Panel: Prompt Branch Explorer (260px width)
- **Branch Dropdown**: Switch between `main`, `exp/shorter-cot`, `feature/json-mode`.
- **Branch Tree View**: Visual commit graph showing:
  - Commit hash (e.g. `c4f81a`)
  - Prompt name & author avatar
  - Benchmark score delta (e.g. `+4.2% accuracy`, `-$0.003 / 1k`)
  - "New Branch from Here" action on hover.
- **Prompt Pull Requests List**:
  - Open PRs with status badges (`In Review`, `Approved`, `Draft`).
  - Author, reviewer count, and target branch.

#### 3. Central Editor Area
- Tab bar with `.prompt.json` syntax badges and dirty indicator.
- **Split-View Prompt Diff Mode**:
  - When comparing a branch to `main`, opens an integrated side-by-side Monaco diff editor.
  - Left: Base Prompt (`main`). Right: Branch Prompt (`exp/chain-of-thought`).
  - Highlights token modifications, variable insertions, and updated model parameters.

#### 4. Dedicated Agent & Prompt Branching Sidebar (Right - 360px width)
- **Header Segmented Control**:
  - `[ Agent Chat ]` | `[ Prompt Branching & PPR ]` | `[ Benchmark Matrix ]`
- **When "Prompt Branching & PPR" is active**:
  - **Active Branch Capsule**: Displays current branch name with a glowing badge (`⎇ exp/chain-of-thought`).
  - **Grounded Memory References**: Interactive pill tags showing which project memories ground this prompt. Clicking a pill opens the memory inspector drawer.
  - **Live Evaluation Card**:
    - "Test Run with Mock Context" button.
    - Model parameter dials: Temperature slider, Top-P, Max Output Tokens.
    - Side-by-side response output box showing latency, token count, and cost.
  - **PPR Action Button**: High-visibility glowing button:
    `[ Create Prompt Pull Request (PPR) ➔ ]`

#### 5. Bottom Status Bar (24px height)
- Active Git/Prompt branch.
- Upstream LLM provider status indicator (`Gemini 2.5 Flash: Online`).
- Room sync status (`CRDT: Synced (Room: proj-101:main)`).
- Project memory item counter (`Memories: 48 active`).

---

## 4. Surface 2: The AI Canvas (Roobinium Cyberpunk Spatial Board)

### 4.1 Canvas Spatial Layout & Viewport

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  MINGE // CANVAS  │ ⎇ Project: Alpha   │ [● 3 Online] [Share Link] │ [Open IDE ⇱]      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│     ┌─────────────────────┐                   ┌──────────────────────────────┐        │
│     │ ◈ PROMPT NODE       │                   │ ★ AI OUTPUT NODE             │        │
│     ├─────────────────────┤  Neon Cable       ├──────────────────────────────┤        │
│     │ Model: Gemini-Flash │══════════════════►│ "Generated response text...  │        │
│     │ Temp: 0.7  [Run ▷]  │                   │  Tokens: 420 | Latency: 1.2s │        │
│     │ "Summarize the spec"│                   │  [Branch to Prompt IDE ⎇]    │        │
│     └─────────────────────┘                   └──────────────┬───────────────┘        │
│                                                              │                         │
│     ┌─────────────────────┐                                  │ (Edge Cable)            │
│     │ ▤ DOCUMENT DROP     │                                  ▼                         │
│     ├─────────────────────┤                   ┌──────────────────────────────┐        │
│     │ arch_spec.pdf       │══════════════════►│ ◈ MEMORY CAPSULE             │        │
│     │ 24 pages • 8 chunks │                   ├──────────────────────────────┤        │
│     │ [Ingested to Mem]   │                   │ ID: mem_914 (Grounded)       │        │
│     └─────────────────────┘                   └──────────────────────────────┘        │
│                                                                                        │
│                                 ↗ Alice (Pink cursor)                                 │
│        ↖ Bob (Cyan cursor)                                                            │
│                                                                                        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  [ + Add Node ]  [ ⇱ Reset View ]  [ Undo ↩ ]  [ Redo ↪ ]           [ 100% Zoom ]     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Canvas Card Primitives

#### 1. Prompt Node
- **Frame**: Glassmorphic panel with neon indigo border (`rgba(99, 102, 241, 0.4)`).
- **Header**: Icon, node name, drag handle, and model selector dropdown.
- **Body**: Auto-expanding textarea for prompt drafting with syntax highlighting for template variables (`{{variable}}`).
- **Footer**: Parameter sliders (Temperature, Tokens) and a pulsating neon **Run ▷** button.
- **Connectors**: Left port (Inputs / Grounding), Right port (AI Output).

#### 2. Document Drop Node
- **Frame**: Deep navy glass with subtle dashed cyan border.
- **Drop Target**: Accepts PDF, Markdown, TXT, JSON, and code files.
- **Status Indicator**: Progress ring showing document parsing, chunking, and embedding generation into `pgvector`.
- **Memory Pill**: Shows total chunks and an "Add to Project Memory" toggle.

#### 3. AI Output Node
- **Frame**: Luminous border with gradient flow (`#A855F7` to `#00F2FE`).
- **Body**: Markdown rendered response with syntax-highlighted code blocks, copy buttons, and streaming cursor.
- **Action Toolbar**:
  - `[ Branch to Prompt IDE ]`: Instantly converts this output and prompt into a versioned `.prompt.json` package in the IDE.
  - `[ Rerun ]`: Triggers a new generation pass.
  - `[ Pin as Memory ]`: Elevates the output into active project memory.

#### 4. Memory Capsule Node
- **Frame**: Compact capsule card with amber/emerald neon glow.
- **Content**: Displays an active ground-truth memory snippet, similarity score, and its `superseded_by_id` lineage.

### 4.3 Multiplayer Presence & Cursors
- **Live Peer Cursors**:
  - Rendered with individual user brand colors (User 1: Neon Cyan `#00F2FE`, User 2: Hot Pink `#EC4899`, User 3: Cyber Violet `#A855F7`).
  - Small cursor arrow with smooth interpolation + floating pill badge displaying the user's name (e.g. `Alice`).
- **Selection Halo**: When a teammate clicks a node, the card receives a 2px colored halo matching that user's presence color.
- **Typing Indicator**: Floating `...` bubble above the user's cursor when they are actively editing a prompt or document node.

---

## 5. Dual-Primitive Switching & Unified Navigation

The user must feel that the **Prompt IDE** and the **AI Canvas** are two views of the exact same brain:

| Action | In Prompt IDE | In AI Canvas |
| :--- | :--- | :--- |
| **Top Navigation** | "Switch to AI Canvas" (top-right button) | "Open in Prompt IDE" (top-right button) |
| **Memory Sync** | Side drawer shows all memories created on Canvas | Canvas displays Memory Capsules ingested in IDE |
| **Prompt Pull** | Pulls prompt package with grounded memory IDs | Canvas node references prompt package branch |
| **Real-Time Edits** | Co-editing code/prompts via `y-monaco` | Co-editing cards and positions via `y-canvas` |
| **Undo / Redo** | Git history & branch commits | Instant canvas spatial undo/redo (`Ctrl+Z` / `Ctrl+Y`) |

---

## 6. Micro-Interactions & Animation Specifications

1. **Card Hover Effect**:
   - `transform: translateY(-2px) scale(1.005);`
   - `transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);`
   - Border opacity shifts from `0.1` to `0.4` with subtle neon outer glow.
2. **Neon Connection Cable Animation**:
   - Bezier curves drawn with SVG `<path>`.
   - When data or tokens stream between nodes, an animated dashed stroke gradient (`stroke-dasharray`, `stroke-dashoffset`) pulses along the wire from left to right.
3. **AI Streaming State**:
   - Breathing radial gradient behind the AI Output Node.
   - Smooth typewriter token appearance with a glowing cursor pip.
4. **Prompt PR Success Modal**:
   - Confetti/pulse ripple effect on merge, updating branch tree nodes from dotted (draft) to solid emerald (merged).

---

## 7. Verification & Implementation Mapping

- **Figma Design Invariants Checked**: Dark mode aesthetic, glassmorphic elevation layers, neon accent hierarchy, and multi-surface alignment verified against the provided Figma project structure.
- **Antigravity IDE Match**: 100% compliant with the existing Antigravity workbench layout (Activity bar, tabbed Monaco editor, status bar, and agent chat panel).
- **Prompt Branching Surface**: Documented in Section 3 as a first-class feature integrated into the IDE workbench.
