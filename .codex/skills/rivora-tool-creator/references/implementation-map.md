# Rivora Mini Tool Implementation Map

## Existing Tool Patterns

### Bulk Clone

- Route: `src/app/bulk-clone/page.tsx`
- APIs:
  - `src/app/api/workbook/parse/route.ts`
  - `src/app/api/workbook/image/route.ts`
  - `src/app/api/generate/start/route.ts`
  - `src/app/api/generate/status/route.ts`
  - `src/app/api/generate/regenerate/route.ts`
  - `src/app/api/export/zip/route.ts`
  - `src/app/api/image/download/route.ts`
- Core libs:
  - `src/lib/xlsx-parser.ts`
  - `src/lib/workbook-store.ts`
  - `src/lib/prompt.ts`
  - `src/lib/job-store.ts`
  - `src/lib/kie.ts`
- Tests:
  - `tests/workbook.test.ts`
  - `tests/api.test.ts`

Use this pattern when the new tool starts from structured files, row-based generation, selected subsets, or per-row prompts.

### Ecommerce Assets

- Route: `src/app/ecommerce-assets/page.tsx`
- APIs:
  - `src/app/api/ecommerce-assets/create/route.ts`
  - `src/app/api/ecommerce-assets/status/route.ts`
  - `src/app/api/ecommerce-assets/retry/route.ts`
  - `src/app/api/ecommerce-assets/regenerate/route.ts`
  - `src/app/api/ecommerce-assets/zip/route.ts`
- Core libs:
  - `src/lib/ecommerce-assets.ts`
  - `src/lib/ecommerce-assets-workflow.ts`
  - `src/lib/ecommerce-assets-store.ts`
  - `src/lib/ecommerce-assets-presentation.ts`
  - `src/lib/ecommerce-language.ts`
  - `src/lib/openrouter.ts`
  - `src/lib/kie.ts`
- Tests:
  - `tests/ecommerce-assets.test.ts`
  - `tests/ecommerce-requirement-phrases.test.ts`

Use this pattern when the new tool starts from user-uploaded assets and creates a multi-slot output set such as images, videos, storyboards, or variants.

## File Checklist for a New Tool

Create or update these files as needed:

```text
src/app/<tool-slug>/page.tsx
src/app/api/<tool-slug>/create/route.ts
src/app/api/<tool-slug>/status/route.ts
src/app/api/<tool-slug>/retry/route.ts
src/app/api/<tool-slug>/regenerate/route.ts
src/app/api/<tool-slug>/zip/route.ts
src/lib/<tool-slug>.ts
src/lib/<tool-slug>-workflow.ts
src/lib/<tool-slug>-store.ts
src/lib/<tool-slug>-presentation.ts
tests/<tool-slug>.test.ts
```

Do not create every file automatically. Create the smallest set that supports the requested workflow.

## API Route Shape

Use Node runtime for KIE, OpenRouter, ZIP, XLSX, or file operations:

```ts
export const runtime = "nodejs";
export const maxDuration = 300;
```

Routes should:

1. Parse and normalize request JSON or form data.
2. Validate required inputs with clear `400` responses.
3. Call lib/workflow functions.
4. Return stable JSON payloads with `success`, `jobId`, `job`, `error`, or route-specific output.
5. Catch errors, log with a route-specific prefix, and return a concise message.

Keep prompt construction, model payload selection, and job refresh logic outside route handlers.

## Job Model

Prefer a job shape with:

- `id`
- `status`: `preparing`, `processing`, `completed`, `failed`
- input settings and normalized options
- output slots with `taskId`, `status`, `resultUrl`, `error`, and `prompt`
- `createdAt` and `updatedAt`

For slot status, follow the existing terms: `waiting`, `processing`, `success`, `fail`.

## Prompt and Model Logic

Keep these functions pure where possible:

- `normalize<ToolOption>()`
- `fallback<ToolBrief>()`
- `build<Tool>Prompts()`
- `build<Tool>VideoPrompt()`
- `get<Tool>Presentation()`

Test prompt builders for:

- required constraints
- language handling
- custom requirement insertion
- default fallback behavior
- model-specific size/aspect limits

## KIE Integration

Current helpers:

- `uploadKieImage(dataUrl, fileName, uploadPath)`
- `createKieImageTask({ prompt, inputUrls, aspectRatio, resolution, callBackUrl })`
- `createKieSeedanceVideoTask({ prompt, referenceImageUrls, aspectRatio, resolution, duration, callBackUrl })`
- `getKieCallbackUrl()`
- `normalizeKieRecordInfo(payload)`
- `getKieImageStatus(taskId)`

When adding a KIE model:

1. Add docs under `docs/kie/` if the model is new to the project.
2. Add a named constant for the model ID in `src/lib/kie.ts`.
3. Add a typed helper only if existing helpers cannot represent the payload.
4. Extend `normalizeKieRecordInfo` only if the result JSON returns a new URL shape.
5. Mock `globalThis.fetch` in tests and assert outgoing payloads.

## Home Page Entry

Update `src/app/page.tsx`:

- Add an entry in both `features.zh` and `features.en`.
- Use a relevant lucide icon.
- Keep title, description, meta, and action concise.
- Preserve language handling and existing links.

## Test Strategy

Minimum tests for a new tool:

- Pure prompt/normalizer tests.
- API validation rejects missing or invalid input.
- Create/start route uploads assets and creates expected KIE tasks.
- Status route maps webhook or polling results into the job.
- Retry/regenerate route preserves the right previous state and sends expected model payload.
- ZIP/download route validates URLs and returns an attachment when present.

Use existing tests as templates. Always restore `globalThis.fetch` and mutated env vars in `finally`.
