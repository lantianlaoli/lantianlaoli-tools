# Reviewzon

Reviewzon is integrated into Lantian Tools as the `/reviewzon` workspace. It turns product reviews into structured user-feedback tags and exports a filter-ready Excel report.

## Stack

- Lantian Tools / Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- `@openrouter/sdk` for AI analysis
- `xlsx` for CSV/XLSX parsing and Excel export
- `zod` for request and stream event validation

## Setup

Set OpenRouter credentials in the root project `.env.local` or deployment environment.

```bash
OPENROUTER_API_KEY=<set-this-in-your-environment>
OPENROUTER_MODEL=google/gemini-2.5-flash
```

Install dependencies and start the Lantian Tools dev server.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000/reviewzon](http://localhost:3000/reviewzon) and use the workspace to:

- upload a CSV/XLSX with `asin` and `content`
- analyze the reviews via `/api/reviewzon/analyze-reviews`
- review the structured results
- export a final XLSX file

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`
- `pnpm type-check`

## API

### `POST /api/reviewzon/analyze-reviews`

Request body:

```json
{
  "rows": [
    {
      "id": "row-1",
      "asin": "B000000001",
      "content": "红肿减轻了，狗狗不再频繁抓耳。",
      "sellingPoints": ["抗炎", "易喂食"]
    }
  ]
}
```

Success response is an SSE stream with `progress`, `summary`, `chunk`, and `done` events.

Error response:

```json
{
  "error": "..."
}
```
