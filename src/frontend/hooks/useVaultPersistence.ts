import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { ApiError } from "@/frontend/lib/cloud";
import {
  cloneVault
} from "@/frontend/lib/helpers";
import { getCloudVaultMeta, loadCloudVaultWithVersion, saveVault } from "@/frontend/lib/storage";
import {
  type UnlockedSession
} from "@/frontend/lib/unlockSession";
import type {
  TeacherVault
} from "@/shared/types";
import { useEffect, useRef, useState } from "react";

export const syncCheckIntervalSeconds = 5 * 60;

const saveDebounceMs = 500;

interface VaultPersistenceOptions {
  username: string;
  password: string;
  token: string;
  vault: TeacherVault | null;
  setVault: (vault: TeacherVault | null) => void;
  cloudRestorePending: boolean;
  rememberUnlockedSession: (next?: Partial<UnlockedSession>) => void;
  repairedVaultForCourseLinks: (vault: TeacherVault) => TeacherVault;
  setLessonFeedbackSyncNonce: import("react").Dispatch<import("react").SetStateAction<number>>;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
}

export function useVaultPersistence({ username, password, token, vault, setVault, cloudRestorePending, rememberUnlockedSession, repairedVaultForCourseLinks, setLessonFeedbackSyncNonce, confirm }: VaultPersistenceOptions) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [cloudVersion, setCloudVersion] = useState("");
  const [remoteCloudVersion, setRemoteCloudVersion] = useState("");
  const [syncState, setSyncState] = useState<"idle" | "checking" | "syncing" | "outdated" | "conflict" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncCountdownResetKey, setSyncCountdownResetKey] = useState(0);

  const cloudVersionRef = useRef("");

  const vaultRef = useRef<TeacherVault | null>(null);

  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const pendingPersistVaultRef = useRef<TeacherVault | null>(null);

  const persistTimerRef = useRef<number | null>(null);

  const pendingSaveCountRef = useRef(0);

  const cloudCheckSeqRef = useRef(0);

  const skipCloudCheckUntilRef = useRef(0);

  async function persist(nextVault: TeacherVault, options: { force?: boolean } = {}) {
    if (!username || !password) return;
    if (pendingPersistVaultRef.current === nextVault) pendingPersistVaultRef.current = null;
    vaultRef.current = nextVault;
    setVault(nextVault);
    if (token && !options.force && !cloudVersionRef.current) {
      rememberUnlockedSession({ vault: nextVault });
      setSaveState("error");
      setSyncState("error");
      setSyncMessage("云端版本尚未确认。当前修改已保存在本机页面，请先同步云端数据后再继续保存，避免覆盖其他设备的数据。");
      return;
    }
    pendingSaveCountRef.current += 1;
    cloudCheckSeqRef.current += 1;
    setSaveState("saving");
    const saveJob = saveChainRef.current.then(async () => {
      let savedSuccessfully = false;
      let nextCloudVersion = cloudVersionRef.current;
      try {
        const result = await saveVault(username, password, nextVault, {
          token,
          expectedUpdatedAt: options.force ? undefined : cloudVersionRef.current || undefined,
          force: options.force
        });
        nextCloudVersion = result.updatedAt ?? cloudVersionRef.current;
        if (nextCloudVersion) {
          cloudVersionRef.current = nextCloudVersion;
          setCloudVersion(nextCloudVersion);
        }
        rememberUnlockedSession({ vault: nextVault, cloudVersion: nextCloudVersion });
        savedSuccessfully = true;
      } catch (error) {
        rememberUnlockedSession({ vault: nextVault });
        if (error instanceof ApiError && error.status === 409) {
          const currentUpdatedAt = typeof error.body?.currentUpdatedAt === "string" ? error.body.currentUpdatedAt : "";
          setRemoteCloudVersion(currentUpdatedAt);
          setSyncState("conflict");
          setSyncMessage("云端已有其他设备更新。当前页面的修改只保存在本机，继续保存前请先同步云端，或明确覆盖云端。");
        }
        setSaveState("error");
      } finally {
        pendingSaveCountRef.current = Math.max(pendingSaveCountRef.current - 1, 0);
        if (savedSuccessfully) {
          skipCloudCheckUntilRef.current = Date.now() + 2500;
          if (pendingSaveCountRef.current === 0 && !pendingPersistVaultRef.current) {
            setRemoteCloudVersion("");
            setSyncState("idle");
            setSyncMessage("");
            setSaveState("saved");
            window.setTimeout(() => {
              if (pendingSaveCountRef.current === 0) {
                setSaveState("idle");
              }
            }, 900);
          } else {
            setSaveState("saving");
          }
        }
      }
    });
    saveChainRef.current = saveJob.catch(() => undefined);
    await saveJob;
  }

  function schedulePersist(nextVault: TeacherVault) {
    vaultRef.current = nextVault;
    pendingPersistVaultRef.current = nextVault;
    setVault(nextVault);
    rememberUnlockedSession({ vault: nextVault });
    setSaveState("saving");
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      const pendingVault = pendingPersistVaultRef.current;
      if (pendingVault) void persist(pendingVault);
    }, saveDebounceMs);
  }

  function flushPendingPersist(): Promise<void> {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pendingVault = pendingPersistVaultRef.current;
    if (!pendingVault) return saveChainRef.current;
    pendingPersistVaultRef.current = null;
    return persist(pendingVault);
  }

  function updateVault(updater: (draft: TeacherVault) => void) {
    const currentVault = vaultRef.current ?? vault;
    if (!currentVault) return;
    const next = cloneVault(currentVault);
    updater(next);
    schedulePersist(next);
  }

  async function syncLatestCloudVault() {
    if (!username || !password || !token) return;
    if (saveState === "saving" || pendingSaveCountRef.current > 0) {
      await flushPendingPersist();
      if (pendingSaveCountRef.current > 0) {
        setSyncState("error");
        setSyncMessage("正在保存当前修改，请保存完成后再同步云端数据。");
        return;
      }
    }
    cloudCheckSeqRef.current += 1;
    setSyncState("syncing");
    setSyncMessage("正在同步云端最新数据...");
    try {
      const cloud = await loadCloudVaultWithVersion(token, password, username, { allowLocalFallback: false });
      const nextCloudVersion = cloud.updatedAt || cloudVersion;
      const nextVault = repairedVaultForCourseLinks(cloud.vault);
      setVault(nextVault);
      cloudVersionRef.current = nextCloudVersion;
      setCloudVersion(nextCloudVersion);
      setRemoteCloudVersion("");
      setSyncState("idle");
      setSyncMessage("");
      setSaveState("idle");
      setSyncCountdownResetKey((current) => current + 1);
      setLessonFeedbackSyncNonce((current) => current + 1);
      rememberUnlockedSession({ vault: nextVault, cloudVersion: nextCloudVersion });
    } catch (error) {
      setSyncState("error");
      setSyncMessage(error instanceof Error ? error.message : "云端同步失败，请稍后重试。");
    }
  }

  async function checkCloudVersion(silent = true) {
    const localCloudVersion = cloudVersionRef.current;
    if (!token || !localCloudVersion || document.hidden) return;
    if (saveState === "saving" || pendingSaveCountRef.current > 0 || Date.now() < skipCloudCheckUntilRef.current) return;
    const checkSeq = ++cloudCheckSeqRef.current;
    if (!silent) {
      setSyncState("checking");
      setSyncMessage("正在检查云端版本...");
    }
    try {
      const meta = await getCloudVaultMeta(token);
      if (checkSeq !== cloudCheckSeqRef.current) return;
      if (pendingSaveCountRef.current > 0 || Date.now() < skipCloudCheckUntilRef.current) return;
      const latestLocalCloudVersion = cloudVersionRef.current;
      if (meta.updatedAt && meta.updatedAt !== latestLocalCloudVersion) {
        setRemoteCloudVersion(meta.updatedAt);
        setSyncState("outdated");
        setSyncMessage("云端已有其他设备保存的新版本，建议先同步后继续编辑。");
        return;
      }
      setRemoteCloudVersion("");
      if (syncState === "checking" || syncState === "outdated") {
        setSyncState("idle");
        setSyncMessage("");
      }
      setSyncCountdownResetKey((current) => current + 1);
    } catch (error) {
      if (!silent) {
        setSyncState("error");
        setSyncMessage(error instanceof Error ? error.message : "云端版本检查失败。");
      }
    }
  }

  function forceOverwriteCloud() {
    const currentVault = vaultRef.current ?? vault;
    if (!currentVault) return;
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistVaultRef.current = null;
    void persist(currentVault, { force: true });
  }

  function confirmForceOverwriteCloud() {
    confirm({
      title: "确认用当前页面覆盖云端？",
      description: "这会把当前页面里的整份档案保存为云端最新版本。其他设备稍后会提示云端已有更新；如果当前页面缺少其他设备刚改的数据，那些数据会被覆盖。",
      confirmLabel: "覆盖云端",
      cancelLabel: "先不同步",
      tone: "danger",
      onConfirm: forceOverwriteCloud
    });
  }

  useEffect(() => {
    cloudVersionRef.current = cloudVersion;
  }, [cloudVersion]);

  useEffect(() => {
    vaultRef.current = vault;
  }, [vault]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.hidden) void flushPendingPersist();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [username, password]);

  useEffect(() => {
    if (cloudRestorePending || !vault || !username || !password) return;
    const currentVault = vaultRef.current ?? vault;
    if (currentVault.scheduleRules.length === 0) return;
    schedulePersist({ ...currentVault, scheduleRules: [] });
  }, [cloudRestorePending, vault?.scheduleRules.length, username, password]);

  useEffect(() => {
    if (!token || !cloudVersion) return;
    const checkWhenVisible = () => {
      if (!document.hidden) {
        void checkCloudVersion(true);
      }
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkCloudVersion(true);
      }
    };
    checkWhenVisible();
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const timer = window.setInterval(() => {
      if (!document.hidden && syncState !== "outdated" && syncState !== "conflict") {
        void checkCloudVersion(true);
        setLessonFeedbackSyncNonce((current) => current + 1);
      }
    }, syncCheckIntervalSeconds * 1000);
    return () => {
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(timer);
    };
  }, [token, cloudVersion, syncState, saveState]);

  return {
    saveState,
    setSaveState,
    cloudVersion,
    setCloudVersion,
    remoteCloudVersion,
    setRemoteCloudVersion,
    syncState,
    setSyncState,
    syncMessage,
    setSyncMessage,
    syncCountdownResetKey,
    cloudVersionRef,
    vaultRef,
    pendingPersistVaultRef,
    persistTimerRef,
    persist,
    flushPendingPersist,
    updateVault,
    syncLatestCloudVault,
    confirmForceOverwriteCloud
  };
}
