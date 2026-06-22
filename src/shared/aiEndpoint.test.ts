import { describe, expect, it } from "vitest";
import {
  aiEndpointPathForProvider,
  aiEndpointUrl,
  aiEndpointUrlForProvider,
  aiProviderProtocol,
  normalizeAiBaseUrl
} from "@/shared/aiEndpoint";

describe("AI endpoint helpers", () => {
  it("normalizes saved base URLs by stripping known request suffixes", () => {
    expect(normalizeAiBaseUrl(" https://api.example.com/v1/chat/completions ")).toBe("https://api.example.com");
    expect(normalizeAiBaseUrl("https://api.example.com/chat/completions/")).toBe("https://api.example.com");
    expect(normalizeAiBaseUrl("https://api.example.com/v1/responses")).toBe("https://api.example.com");
    expect(normalizeAiBaseUrl("https://api.example.com/messages")).toBe("https://api.example.com");
    expect(normalizeAiBaseUrl(" https://api.example.com / v1 ")).toBe("https://api.example.com/v1");
  });

  it("builds endpoint URLs without duplicating v1", () => {
    expect(aiEndpointUrl("https://api.example.com", "chat/completions")).toBe("https://api.example.com/v1/chat/completions");
    expect(aiEndpointUrl("https://api.example.com/v1", "chat/completions")).toBe("https://api.example.com/v1/chat/completions");
    expect(aiEndpointUrl("https://api.example.com/v1/responses", "responses")).toBe("https://api.example.com/v1/responses");
    expect(aiEndpointUrl("", "messages")).toBe("");
  });

  it("maps provider kinds to the same endpoint paths used by worker calls and frontend previews", () => {
    expect(aiProviderProtocol({ provider: "openai" })).toBe("openai");
    expect(aiProviderProtocol({ provider: "openai_compatible" })).toBe("openai");
    expect(aiProviderProtocol({ provider: "newapi" })).toBe("openai");
    expect(aiProviderProtocol({ provider: "openai_response" })).toBe("openai_response");
    expect(aiProviderProtocol({ provider: "anthropic" })).toBe("anthropic");

    expect(aiEndpointPathForProvider({ provider: "openai_response" })).toBe("responses");
    expect(aiEndpointPathForProvider({ provider: "anthropic" })).toBe("messages");
    expect(aiEndpointPathForProvider({ provider: "deepseek" })).toBe("chat/completions");
    expect(aiEndpointUrlForProvider("https://api.example.com", { provider: "anthropic" })).toBe("https://api.example.com/v1/messages");
  });
});
