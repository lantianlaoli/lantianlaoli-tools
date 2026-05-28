---
name: rivora-tool-creator
description: Create or extend Rivora project mini tools. Use when adding a new workspace/tool to this repository, expanding a KIE/OpenRouter-powered generation flow, wiring a new Next.js page plus API routes, or turning a new image/video/content generation requirement into the same structure as the existing bulk-clone and ecommerce-assets tools.
---

# Rivora Tool Creator

## Purpose

Use this skill to add a new small tool to Rivora quickly while matching the two existing tools:

- `bulk-clone`: XLSX-driven batch image generation.
- `ecommerce-assets`: product-photo-driven image and video generation.

Keep the result as an actual usable workspace, not a marketing page.

## First Pass

1. Restate the requested tool as a concrete workflow: inputs, generated outputs, user controls, job lifecycle, downloads, retry/regenerate behavior, and language requirements.
2. Inspect the existing implementation before editing:
   - [src/app/page.tsx](/Users/lantianlaoli/projects/Rivora/src/app/page.tsx)
   - [src/app/bulk-clone/page.tsx](/Users/lantianlaoli/projects/Rivora/src/app/bulk-clone/page.tsx)
   - [src/app/ecommerce-assets/page.tsx](/Users/lantianlaoli/projects/Rivora/src/app/ecommerce-assets/page.tsx)
   - [src/lib/kie.ts](/Users/lantianlaoli/projects/Rivora/src/lib/kie.ts)
   - [src/lib/types.ts](/Users/lantianlaoli/projects/Rivora/src/lib/types.ts)
3. Read [references/implementation-map.md](references/implementation-map.md) when the request requires implementation.
4. For Next.js APIs, read the relevant guide in `node_modules/next/dist/docs/` before changing routes, server actions, runtime settings, metadata, or app routing.
5. For external libraries, SDKs, APIs, or CLI behavior, follow the repository `AGENTS.md` rule and fetch current docs with `npx ctx7@latest library ...` then `npx ctx7@latest docs ...`.

## Implementation Workflow

1. Add types first in `src/lib/types.ts` for request payloads, job state, slot state, and tool-specific options.
2. Add pure domain logic in `src/lib/<tool-name>.ts`: prompt builders, normalization, presentation helpers, and fallback behavior.
3. Add workflow orchestration in `src/lib/<tool-name>-workflow.ts` when the tool starts or refreshes multi-step KIE/OpenRouter jobs.
4. Add persistence helpers only when needed. Prefer the existing in-memory/Redis patterns in `job-store`, `workbook-store`, and `ecommerce-assets-store`.
5. Add API routes under `src/app/api/<tool-name>/`:
   - `create` or `start` for job creation.
   - `status` for polling/refreshing.
   - `retry` or `regenerate` when the UI exposes corrections.
   - `zip` or download routes when users need bulk export.
6. Add the page under `src/app/<tool-name>/page.tsx`.
7. Add the new entry to `src/app/page.tsx`.
8. Add focused tests in `tests/<tool-name>.test.ts` and extend shared tests only when shared behavior changes.

## KIE and OpenRouter Rules

- Reuse `src/lib/kie.ts` for uploads, task creation, callback URLs, status normalization, and retries.
- Add new KIE model helpers in `kie.ts` only when the payload shape differs from existing image or Seedance helpers.
- Store callback results through `src/app/api/kie/callback/route.ts` when the KIE task can use the shared `taskId` lifecycle.
- Keep prompt builders pure and testable. Do not hide prompt construction inside route handlers.
- Use OpenRouter analysis only for structured interpretation that improves prompts; provide deterministic fallback briefs when analysis fails.
- Never embed API keys or credentials in tests, docs, or skill files.

## UI Rules

- Build a dense, usable workstation as the first screen.
- Match the current dark Rivora visual system: restrained panels, lime highlights, compact controls, and lucide icons.
- Use feature-complete states: empty, uploading/preparing, processing, success, partial failure, retry/regenerate, and download.
- Keep controls ergonomic: tabs or segmented controls for modes, icon buttons for repeated actions, file drop/upload surfaces for assets, and progress indicators for long jobs.
- Avoid nested cards and decorative-only sections.

## Validation

Run the checks that match the change:

```bash
pnpm test
pnpm lint
pnpm type-check
```

For UI changes, start `pnpm dev` and inspect the new route plus the home page in a browser. Verify mobile and desktop layouts, text wrapping, upload controls, status transitions, and disabled states.
