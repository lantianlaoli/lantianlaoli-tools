import { NextResponse } from "next/server";

import { analyzeReviewzonBatchStream } from "@/lib/reviewzon-ai";
import { analyzeStreamEventSchema, reviewBatchRequestSchema } from "@/lib/reviewzon";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function toSsePayload(event: unknown): Uint8Array {
  const parsed = analyzeStreamEventSchema.parse(event);
  const encoder = new TextEncoder();
  return encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsedBody = reviewBatchRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid request body.",
        details: parsedBody.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of analyzeReviewzonBatchStream(parsedBody.data.rows)) {
            controller.enqueue(toSsePayload(event));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected error while analyzing reviews.";
          controller.enqueue(toSsePayload({ type: "error", message }));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error while analyzing reviews.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

