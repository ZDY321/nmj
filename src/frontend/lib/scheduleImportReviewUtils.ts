export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeLinkedSystemLessonIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = Array.from(new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))));
  return ids.length > 0 ? ids : undefined;
}
