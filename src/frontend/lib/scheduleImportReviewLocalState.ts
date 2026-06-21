export const legacyMappingStorageKey = "teacher-schedule-import-mapping-v1";
export const workspaceStorageKey = "teacher-schedule-import-workspace-v1";

export function scopedScheduleImportStorageKey(baseKey: string, scope?: string): string {
  const normalizedScope = scope?.trim();
  return normalizedScope ? `${baseKey}:${encodeURIComponent(normalizedScope)}` : baseKey;
}

export function clearSavedScheduleImportLocalState(scope?: string): void {
  const keys = [
    scopedScheduleImportStorageKey(workspaceStorageKey, scope),
    scopedScheduleImportStorageKey(legacyMappingStorageKey, scope)
  ];
  if (scope?.trim()) {
    keys.push(workspaceStorageKey, legacyMappingStorageKey);
  }
  for (const key of new Set(keys)) {
    localStorage.removeItem(key);
  }
}
