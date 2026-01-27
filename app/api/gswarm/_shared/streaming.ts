/**
 * SSE Streaming Support
 *
 * Provides OpenAI-compatible Server-Sent Events (SSE) streaming for chat completions.
 * Since the underlying Cloud Code API doesn't natively support streaming, this module
 * simulates streaming by chunking the complete response.
 */

/**
 * OpenAI-compatible streaming chunk
 */
export interface StreamChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason: "stop" | "length" | null;
  }>;
}

/**
 * Options for streaming response
 */
export interface StreamingOptions {
  /** Completion ID */
  id: string;
  /** Model name */
  model: string;
  /** Complete response text to stream */
  text: string;
  /** Creation timestamp */
  created: number;
  /** Chunk size in characters (default: 20) */
  chunkSize?: number;
  /** Delay between chunks in ms (default: 30) */
  chunkDelay?: number;
  /** Rate limit remaining */
  rateLimitRemaining?: number;
  /** Rate limit reset timestamp */
  rateLimitReset?: number;
}

/**
 * Formats a chunk as an SSE message
 */
function formatSSE(chunk: StreamChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

/**
 * Creates the final [DONE] message
 */
function formatDone(): string {
  return "data: [DONE]\n\n";
}

/**
 * Splits text into chunks for streaming
 */
function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];

  // Split by words to avoid breaking in the middle of words
  const words = text.split(/(\s+)/); // Keep whitespace
  let currentChunk = "";

  for (const word of words) {
    if (currentChunk.length + word.length <= chunkSize) {
      currentChunk += word;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = word;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Creates a streaming response with simulated SSE chunks
 *
 * This function takes a complete response and streams it to the client
 * in OpenAI-compatible SSE format. Since the underlying API doesn't support
 * true streaming, we simulate it by chunking the response.
 *
 * @param options - Streaming options
 * @returns ReadableStream response
 */
export function streamingResponse(options: StreamingOptions): Response {
  const {
    id,
    model,
    text,
    created,
    chunkSize = 20,
    chunkDelay = 30,
    rateLimitRemaining,
    rateLimitReset,
  } = options;

  // Split text into chunks
  const textChunks = chunkText(text, chunkSize);

  // Create a readable stream
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial chunk with role
        const initialChunk: StreamChunk = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
              },
              finish_reason: null,
            },
          ],
        };
        controller.enqueue(encoder.encode(formatSSE(initialChunk)));

        // Send text chunks
        for (const chunk of textChunks) {
          // Add delay to simulate streaming
          if (chunkDelay > 0 && chunkIndex > 0) {
            await new Promise((resolve) => setTimeout(resolve, chunkDelay));
          }

          const streamChunk: StreamChunk = {
            id,
            object: "chat.completion.chunk",
            created,
            model,
            choices: [
              {
                index: 0,
                delta: {
                  content: chunk,
                },
                finish_reason: null,
              },
            ],
          };

          controller.enqueue(encoder.encode(formatSSE(streamChunk)));
          chunkIndex++;
        }

        // Send final chunk with finish_reason
        const finalChunk: StreamChunk = {
          id,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
        };
        controller.enqueue(encoder.encode(formatSSE(finalChunk)));

        // Send [DONE] message
        controller.enqueue(encoder.encode(formatDone()));

        // Close the stream
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  // Create response with appropriate headers
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable buffering in nginx
  });

  // Add rate limit headers if provided
  if (rateLimitRemaining !== undefined) {
    headers.set("X-RateLimit-Remaining", rateLimitRemaining.toString());
  }
  if (rateLimitReset !== undefined) {
    headers.set("X-RateLimit-Reset", rateLimitReset.toString());
  }

  return new Response(stream, { headers });
}
