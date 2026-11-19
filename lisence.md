# MinGE AI — Platform & Software License (`lisence.md`)

**Copyright (c) 2026 MinGE AI. All rights reserved.**  
*Applies to the MinGE Multiplayer AI Platform: Prompt IDE, Spatial AI Canvas, Yjs CRDT Sync Gateway, and Team Hierarchy Governance.*

---

## 1. Project License Options

MinGE AI operates under a **Dual Open-Core & Organizational Licensing Model** tailored to how the project is deployed:

| License Option | Scope & Intended Use | Key Entitlements |
| :--- | :--- | :--- |
| **1. Community Open-Core (MIT)** | Individual developers, academic research, and self-hosted single-project use. | Free use, modification, and redistribution of core SDKs (`@minge/crdt-core`, `@minge/shared`), Prompt IDE, and local AI Canvas. |
| **2. Team Hierarchy License** | Startup and organization workspaces using role-based approval workflows. | Full `Admin → Manager → Employee` reporting hierarchy, Ticket-to-Main approval gate, 30-day soft-delete recovery vault, and shared workspace persistence. |
| **3. Enterprise Compliance License** | Regulated organizations requiring dedicated isolation and custom quotas. | Dedicated PostgreSQL RLS & Redis clusters, full `minge.proxy_audit_logs` attribution export, custom daily token caps, and priority SLA. |

---

## 2. Intellectual Property & Content Ownership

1. **User & Organization Ownership (Terms §6.2, §7.1–7.2)**: You (or your organization, for Team/Enterprise workspaces) retain **100% ownership** of all prompts, prompt packages, spatial canvas graphs, grounded project memories, and AI-generated outputs created in your workspace.
2. **Workspace Persistence (Terms §3.3, §16.1–16.2)**: Work merged into an organization's `main` branch or shared canvas remains available to the organization workspace even if an individual contributor leaves or deletes their personal account.
3. **No Cross-Tenant Training or Bleed (Invariant #1)**: Project-Scoped Memory is strictly isolated via PostgreSQL Row Level Security (`project_id` foreign keys in private schema `minge`). MinGE never leaks or shares context across project boundaries.

---

## 3. Core Software Grant (MIT Terms for Open-Core Components)

Permission is hereby granted, free of charge, to any person obtaining a copy of the MinGE open-core software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the following conditions:

- The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
- Server-side provider API keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`) must remain strictly server-side and must never be bundled into client distributions.

---

## 4. Data Lifecycle & Disclaimer

- **30-Day Soft-Delete Recovery (Terms §16.3)**: Deleted memories, nodes, and work tickets are soft-deleted (`deleted_at`) and remain recoverable for **30 days** before permanent purge.
- **Warranty Disclaimer**: THE SOFTWARE AND AI OUTPUTS ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. USERS ARE RESPONSIBLE FOR VALIDATING PROMPTS AND AI OUTPUTS BEFORE PRODUCTION USE.
