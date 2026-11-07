import { useConfirmDialog } from "@/frontend/components/ConfirmDialog";
import { useVaultPersistence } from "@/frontend/hooks/useVaultPersistence";
import { todayIso } from "@/frontend/lib/calculations";
import { ApiError, cancelOwnDeletion } from "@/frontend/lib/cloud";
import {
  cloneVault,
  type ViewKey
} from "@/frontend/lib/helpers";
import { clearSavedScheduleImportLocalState } from "@/frontend/lib/scheduleImportReviewLocalState";
import { clearStoredSession, clearVault, loadCloudVaultWithVersion, loginAccount, logoutCloud, registerAccount } from "@/frontend/lib/storage";
import {
  clearUnlockedSession,
  readUnlockedSession,
  writePersistentLoginPreference,
  writeUnlockedSession,
  type UnlockedSession
} from "@/frontend/lib/unlockSession";
import {
  repairCourseStudentLinksFromLessons
} from "@/frontend/lib/vaultMutations";
import type {
  AiScheduleSession,
  TeacherVault,
  UserDeletionState,
  UserRole
} from "@/shared/types";
import { useEffect, useState } from "react";

function isSessionRejected(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

interface CloudSessionOptions {
  view: ViewKey;
  setView: (view: ViewKey) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setAmountsVisible: (visible: boolean) => void;
  setAiScheduleSession: (session: AiScheduleSession | null) => void;
  setNoticeModalOpen: (open: boolean) => void;
  setFeedbackModalOpen: (open: boolean) => void;
  setOnboardingVisible: (visible: boolean) => void;
  setLessonFeedbackSyncNonce: import("react").Dispatch<import("react").SetStateAction<number>>;
  confirm: ReturnType<typeof useConfirmDialog>["confirm"];
}

export function useCloudSession({ view, setView, selectedDate, setSelectedDate, setAmountsVisible, setAiScheduleSession, setNoticeModalOpen, setFeedbackModalOpen, setOnboardingVisible, setLessonFeedbackSyncNonce, confirm }: CloudSessionOptions) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState<UserRole>("teacher");
  const [deletion, setDeletion] = useState<UserDeletionState | null>(null);
  const [vault, setVault] = useState<TeacherVault | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [cloudRestorePending, setCloudRestorePending] = useState(true);
  const [persistLoginAfterClose, setPersistLoginAfterClose] = useState(false);

  const {
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
  } = useVaultPersistence({ username, password, token, vault, setVault, cloudRestorePending, rememberUnlockedSession, repairedVaultForCourseLinks, setLessonFeedbackSyncNonce, confirm });

  function repairedVaultForCourseLinks(source: TeacherVault): TeacherVault {
    const next = cloneVault(source);
    return repairCourseStudentLinksFromLessons(next) > 0 ? next : source;
  }

  function rememberUnlockedSession(next?: Partial<UnlockedSession>) {
    const session: UnlockedSession = {
      username,
      password,
      token,
      role,
      deletion,
      vault: vault!,
      selectedDate,
      cloudVersion,
      persistAfterClose: persistLoginAfterClose,
      ...next
    };
    if (!session.username || !session.password || !session.token || !session.vault) return;
    void writeUnlockedSession(session);
  }

  async function login(nextUsername: string, nextPassword: string, nextPersistLoginAfterClose: boolean) {
    const result = await loginAccount(nextUsername, nextPassword);
    setUsername(result.account.username);
    setPassword(nextPassword);
    setToken(result.token);
    setRole(result.account.role);
    setDeletion(result.deletion);
    const nextVault = repairedVaultForCourseLinks(result.vault);
    setVault(nextVault);
    setAmountsVisible(false);
    setPersistLoginAfterClose(nextPersistLoginAfterClose);
    writePersistentLoginPreference(result.account.username, nextPersistLoginAfterClose);
    cloudVersionRef.current = result.cloudVersion;
    setCloudVersion(result.cloudVersion);
    setRemoteCloudVersion("");
    setSyncState("idle");
    setSyncMessage("");
    rememberUnlockedSession({
      username: result.account.username,
      password: nextPassword,
      token: result.token,
      role: result.account.role,
      deletion: result.deletion,
      vault: nextVault,
      cloudVersion: result.cloudVersion,
      persistAfterClose: nextPersistLoginAfterClose
    });
    if (view === "admin" && result.account.role !== "admin") {
      setView("today");
    }
  }

  async function register(nextUsername: string, nextPassword: string, nextPersistLoginAfterClose: boolean): Promise<UserRole> {
    const result = await registerAccount(nextUsername, nextPassword);
    setUsername(result.account.username);
    setPassword(nextPassword);
    setToken(result.token);
    setRole(result.account.role);
    setDeletion(result.deletion);
    const nextVault = repairedVaultForCourseLinks(result.vault);
    setVault(nextVault);
    setAmountsVisible(false);
    setPersistLoginAfterClose(nextPersistLoginAfterClose);
    writePersistentLoginPreference(result.account.username, nextPersistLoginAfterClose);
    cloudVersionRef.current = result.cloudVersion;
    setCloudVersion(result.cloudVersion);
    setRemoteCloudVersion("");
    setSyncState("idle");
    setSyncMessage("");
    rememberUnlockedSession({
      username: result.account.username,
      password: nextPassword,
      token: result.token,
      role: result.account.role,
      deletion: result.deletion,
      vault: nextVault,
      cloudVersion: result.cloudVersion,
      persistAfterClose: nextPersistLoginAfterClose
    });
    return result.account.role;
  }

  function updatePersistLoginAfterClose(nextPersistLoginAfterClose: boolean) {
    setPersistLoginAfterClose(nextPersistLoginAfterClose);
    if (username) {
      writePersistentLoginPreference(username, nextPersistLoginAfterClose);
    }
    rememberUnlockedSession({ persistAfterClose: nextPersistLoginAfterClose });
  }

  function resetUnlockedWorkspaceState() {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    pendingPersistVaultRef.current = null;
    vaultRef.current = null;
    setUsername("");
    setPassword("");
    setToken("");
    setRole("teacher");
    setDeletion(null);
    setVault(null);
    setAmountsVisible(false);
    setPersistLoginAfterClose(false);
    setCloudVersion("");
    setRemoteCloudVersion("");
    cloudVersionRef.current = "";
    setSyncState("idle");
    setSyncMessage("");
    setSaveState("idle");
    setAiScheduleSession(null);
    setNoticeModalOpen(false);
    setFeedbackModalOpen(false);
    setOnboardingVisible(false);
    clearUnlockedSession();
  }

  function signOut() {
    const currentToken = token;
    void flushPendingPersist().finally(() => {
      clearStoredSession();
      if (currentToken) {
        void logoutCloud(currentToken);
      }
      resetUnlockedWorkspaceState();
    });
  }

  function clearCurrentLocalCache() {
    const currentUsername = username;
    const currentToken = token;
    clearStoredSession();
    if (currentToken) {
      void logoutCloud(currentToken);
    }
    if (currentUsername) {
      clearVault(currentUsername);
      clearSavedScheduleImportLocalState(currentUsername);
    }
    resetUnlockedWorkspaceState();
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreUnlockedSession() {
      let loadingCloud = false;
      try {
        const session = await readUnlockedSession();
        if (!session || cancelled) return;
        if (!session.username || !session.password || !session.token || !session.vault) {
          clearUnlockedSession();
        } else {
          const today = todayIso();
          const cachedCloudVersion = session.cloudVersion ?? "";
          const restoredPersistLoginAfterClose = Boolean(session.persistAfterClose);
          setUsername(session.username);
          setPassword(session.password);
          setToken(session.token);
          setRole(session.role);
          setDeletion(session.deletion);
          const restoredVault = repairedVaultForCourseLinks(session.vault);
          setVault(restoredVault);
          setCloudVersion(cachedCloudVersion);
          setSelectedDate(today);
          setPersistLoginAfterClose(restoredPersistLoginAfterClose);
          writePersistentLoginPreference(session.username, restoredPersistLoginAfterClose);
          void writeUnlockedSession({
            ...session,
            selectedDate: today,
            cloudVersion: cachedCloudVersion,
            persistAfterClose: restoredPersistLoginAfterClose
          });
          loadingCloud = true;
          void loadCloudVaultWithVersion(session.token, session.password, session.username, { allowLocalFallback: false })
            .then((cloud) => {
              if (cancelled) return;
              const nextCloudVersion = cloud.updatedAt || cachedCloudVersion;
              const nextVault = repairedVaultForCourseLinks(cloud.vault);
              setVault(nextVault);
              cloudVersionRef.current = nextCloudVersion;
              setCloudVersion(nextCloudVersion);
              setRemoteCloudVersion("");
              setSyncState("idle");
              setSyncMessage("");
              void writeUnlockedSession({
                ...session,
                vault: nextVault,
                selectedDate: today,
                cloudVersion: nextCloudVersion,
                persistAfterClose: restoredPersistLoginAfterClose
              });
            })
            .catch((error) => {
              if (cancelled) return;
              if (isSessionRejected(error)) {
                clearVault(session.username);
                clearSavedScheduleImportLocalState(session.username);
                clearStoredSession();
                resetUnlockedWorkspaceState();
                return;
              }
              setSyncState("error");
              setSyncMessage("云端数据读取失败，当前显示本机缓存。");
            })
            .finally(() => { if (!cancelled) setCloudRestorePending(false); });
        }
      } catch {
        clearUnlockedSession();
      } finally {
        if (!cancelled) {
          if (!loadingCloud) setCloudRestorePending(false);
          setBootstrapped(true);
        }
      }
    }

    void restoreUnlockedSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!vault) return;
    rememberUnlockedSession({ selectedDate });
  }, [selectedDate]);

  async function cancelDeletionRequest() {
    if (!token) return;
    await cancelOwnDeletion(token);
    setDeletion(null);
  }

  return {
    username,
    password,
    token,
    role,
    deletion,
    vault,
    bootstrapped,
    persistLoginAfterClose,
    saveState,
    cloudVersion,
    remoteCloudVersion,
    syncState,
    syncMessage,
    syncCountdownResetKey,
    login,
    register,
    updatePersistLoginAfterClose,
    signOut,
    clearCurrentLocalCache,
    persist,
    updateVault,
    syncLatestCloudVault,
    confirmForceOverwriteCloud,
    cancelDeletionRequest
  };
}
