import type { AiProviderKind } from "@/shared/types";

export type AiEndpointPath = "chat/completions" | "responses" | "messages";

export type AiProviderProtocol = "openai" | "openai_response" | "anthropic";

export function normalizeAiBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\s+/g, "")
    .replace(/\/+$/, "")
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/v1\/responses$/i, "")
    .replace(/\/responses$/i, "")
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/messages$/i, "")
    .replace(/\/+$/, "");
}

export function aiEndpointUrl(baseUrl: string, path: AiEndpointPath): string {
  const normalized = normalizeAiBaseUrl(baseUrl);
  if (!normalized) return "";
  return /\/v1$/i.test(normalized) ? `${normalized}/${path}` : `${normalized}/v1/${path}`;
}

export function aiProviderProtocol(provider: Pick<{ provider: AiProviderKind | string }, "provider">): AiProviderProtocol {
  if (provider.provider === "openai_response") return "openai_response";
  if (provider.provider === "anthropic") return "anthropic";
  return "openai";
}

export function aiEndpointPathForProvider(provider?: Pick<{ provider: AiProviderKind | string }, "provider">): AiEndpointPath {
  const protocol = provider ? aiProviderProtocol(provider) : "openai";
  if (protocol === "openai_response") return "responses";
  if (protocol === "anthropic") return "messages";
  return "chat/completions";
}

export function aiEndpointUrlForProvider(baseUrl: string, provider?: Pick<{ provider: AiProviderKind | string }, "provider">): string {
  return aiEndpointUrl(baseUrl, aiEndpointPathForProvider(provider));
}
