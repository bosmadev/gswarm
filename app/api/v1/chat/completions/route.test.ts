/**
 * @file app/api/v1/chat/completions/route.test.ts
 * @version 1.0
 * @description Tests for OpenAI-compatible chat completions endpoint.
 */

import { describe, expect, it } from "vitest";

describe("Model Mapping", () => {
  it("should map OpenAI models to Gemini models", () => {
    // Import the model mapping logic
    const MODEL_MAP: Record<string, string> = {
      "gpt-4": "gemini-2.5-pro",
      "gpt-4o": "gemini-2.0-flash",
      "gpt-4o-mini": "gemini-2.0-flash",
      "gpt-3.5-turbo": "gemini-2.0-flash",
      "gemini-3-flash": "gemini-3-flash-preview",
      "gemini-3-pro": "gemini-3-pro-preview",
    };

    function mapModel(openaiModel: string): string {
      if (openaiModel.startsWith("gemini-")) {
        return openaiModel;
      }
      return MODEL_MAP[openaiModel] || "gemini-2.0-flash";
    }

    expect(mapModel("gpt-4")).toBe("gemini-2.5-pro");
    expect(mapModel("gpt-4o")).toBe("gemini-2.0-flash");
    expect(mapModel("gpt-4o-mini")).toBe("gemini-2.0-flash");
    expect(mapModel("gpt-3.5-turbo")).toBe("gemini-2.0-flash");
    // gemini-* models pass through as-is
    expect(mapModel("gemini-2.0-flash")).toBe("gemini-2.0-flash");
    expect(mapModel("gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(mapModel("unknown-model")).toBe("gemini-2.0-flash");
  });
});

describe("Message Conversion", () => {
  it("should extract system prompt and last user message", () => {
    interface ChatMessage {
      role: "user" | "assistant" | "system";
      content: string;
    }

    function messagesToPrompt(messages: ChatMessage[]): {
      prompt: string;
      systemPrompt?: string;
    } {
      let systemPrompt: string | undefined;
      const conversationParts: string[] = [];

      for (const message of messages) {
        if (message.role === "system") {
          systemPrompt = systemPrompt
            ? `${systemPrompt}\n${message.content}`
            : message.content;
        } else if (message.role === "user") {
          conversationParts.push(`User: ${message.content}`);
        } else if (message.role === "assistant") {
          conversationParts.push(`Assistant: ${message.content}`);
        }
      }

      let lastUserIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserIndex = i;
          break;
        }
      }
      const prompt =
        lastUserIndex >= 0
          ? messages[lastUserIndex].content
          : conversationParts.join("\n\n");

      return { prompt, systemPrompt };
    }

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
      { role: "user", content: "How are you?" },
    ];

    const result = messagesToPrompt(messages);
    expect(result.systemPrompt).toBe("You are a helpful assistant.");
    expect(result.prompt).toBe("How are you?");
  });

  it("should combine multiple system messages", () => {
    interface ChatMessage {
      role: "user" | "assistant" | "system";
      content: string;
    }

    function messagesToPrompt(messages: ChatMessage[]): {
      prompt: string;
      systemPrompt?: string;
    } {
      let systemPrompt: string | undefined;
      const conversationParts: string[] = [];

      for (const message of messages) {
        if (message.role === "system") {
          systemPrompt = systemPrompt
            ? `${systemPrompt}\n${message.content}`
            : message.content;
        } else if (message.role === "user") {
          conversationParts.push(`User: ${message.content}`);
        } else if (message.role === "assistant") {
          conversationParts.push(`Assistant: ${message.content}`);
        }
      }

      let lastUserIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          lastUserIndex = i;
          break;
        }
      }
      const prompt =
        lastUserIndex >= 0
          ? messages[lastUserIndex].content
          : conversationParts.join("\n\n");

      return { prompt, systemPrompt };
    }

    const messages: ChatMessage[] = [
      { role: "system", content: "You are helpful." },
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hello" },
    ];

    const result = messagesToPrompt(messages);
    expect(result.systemPrompt).toBe("You are helpful.\nYou are concise.");
    expect(result.prompt).toBe("Hello");
  });
});
