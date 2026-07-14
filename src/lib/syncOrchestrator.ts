import type { ChatMessage, SelfProfile } from '../types/self'
import {
  fetchRemoteChats,
  fetchRemoteProfiles,
  fetchRemoteSettings,
  pushChatToCloud,
  pushProfileToCloud,
  pushSettingsToCloud,
  tombstoneProfileInCloud,
  isCloudTombstone,
  setActiveSyncUser,
  type RemoteChatRow,
  type RemoteProfileRow,
} from './cloudSync'
import { isSupabaseConfigured, supabase } from './supabase'
import {
  ensureMigrated,
  loadProfileSummaries,
  loadProfileById,
  loadChatAsync,
  saveProfileRecord,
  saveChatAsync,
  getLocalChatRevision,
  invalidateChatLoadCache,
  loadModel,
  saveModel,
  loadProfileTombstones,
  removeProfileTombstone,
  deleteProfileLocally,
} from './storage'

/** tombstone이 제거된, 실제 프로필 데이터가 담긴 행 */
type LiveRemoteProfileRow = RemoteProfileRow & { profile_data: SelfProfile }

export type SyncResult = {
  mode: 'uploaded' | 'downloaded' | 'merged' | 'empty'
  count: number
}

let syncInFlight: Promise<SyncResult> | null = null

export function hasLocalData(): boolean {
  return loadProfileSummaries().length > 0
}

function chatTimestamp(messages: ChatMessage[]): number {
  return messages.length > 0 ? messages[messages.length - 1].timestamp : 0
}

// ---------------------------------------------------------------------------
// 삭제 기록(tombstone) 병합 — 규칙: "삭제 시각 vs 수정 시각, 늦은 쪽이 이긴다"
// ---------------------------------------------------------------------------

/** 삭제가 이기면 true. 삭제 이후에 다른 쪽이 수정됐으면 false(부활). */
export function deletionWins(deletedAt: number, otherUpdatedAt: number | undefined): boolean {
  return deletedAt >= (otherUpdatedAt ?? 0)
}

/** 이 기기의 삭제 기록을 클라우드에 tombstone으로 남긴다 (다른 기기 전파용) */
async function pushLocalTombstones(): Promise<void> {
  for (const [id, deletedAt] of Object.entries(loadProfileTombstones())) {
    await tombstoneProfileInCloud(id, deletedAt).catch(() => {})
  }
}

/**
 * 병합 전에 삭제 기록을 정리하고, 살아 있는(tombstone이 아닌) 원격 행만 돌려준다.
 * - 원격이 tombstone: 로컬 복사본이 삭제보다 최신이면 살리고, 아니면 로컬에서도 삭제
 * - 로컬에 tombstone: 원격이 삭제보다 최신이면 부활시키고, 아니면 다운로드에서 제외
 */
async function reconcileDeletedProfiles(remoteRows: RemoteProfileRow[]): Promise<LiveRemoteProfileRow[]> {
  const localTombstones = loadProfileTombstones()
  const live: LiveRemoteProfileRow[] = []

  for (const row of remoteRows) {
    if (isCloudTombstone(row.profile_data)) {
      const local = loadProfileSummaries().find((s) => s.id === row.id)
      if (local && !deletionWins(row.updated_at, local.updatedAt)) {
        // 다른 기기에서 지웠지만, 이 기기에서 그 뒤에 수정함 → 살린다.
        // (원격 목록에 없으므로 아래 병합 단계에서 로컬본이 다시 업로드된다)
        removeProfileTombstone(row.id)
      } else {
        await deleteProfileLocally(row.id)
        removeProfileTombstone(row.id) // 클라우드에 이미 기록돼 있으므로 로컬 기록은 정리
      }
      continue
    }

    const deletedAt = localTombstones[row.id]
    if (deletedAt != null) {
      if (deletionWins(deletedAt, row.updated_at)) continue // 삭제 유지 — 다운로드하지 않음
      removeProfileTombstone(row.id) // 삭제 이후 다른 기기에서 수정 → 부활
    }
    live.push(row as LiveRemoteProfileRow)
  }

  // 남은 로컬 tombstone(= 삭제가 이긴 것·클라우드에 행이 없는 것)을 클라우드에 기록
  await pushLocalTombstones()

  return live
}

async function uploadAllLocal(): Promise<number> {
  const summaries = loadProfileSummaries()
  for (const s of summaries) {
    const profile = loadProfileById(s.id)
    if (!profile) continue
    const messages = await loadChatAsync(s.id)
    await pushProfileToCloud(profile, s.preview, s.updatedAt)
    await pushChatToCloud(s.id, messages, getLocalChatRevision(s.id) || chatTimestamp(messages) || s.updatedAt)
  }
  await pushSettingsToCloud(loadModel())
  return summaries.length
}

async function applyRemoteProfile(
  row: LiveRemoteProfileRow,
  messages: ChatMessage[],
  chatUpdatedAt?: number,
): Promise<void> {
  saveProfileRecord(row.profile_data, row.preview)
  const localMessages = await loadChatAsync(row.id)
  if (messages.length > 0) {
    await saveChatAsync(row.id, messages, {
      pushCloud: false,
      revision: chatUpdatedAt ?? chatTimestamp(messages),
    })
  } else if (localMessages.length === 0) {
    await saveChatAsync(row.id, [], { pushCloud: false, revision: chatUpdatedAt ?? Date.now() })
  }
}

async function syncChatForProfile(
  profileId: string,
  localMessages: ChatMessage[],
  remoteChat: RemoteChatRow | undefined,
): Promise<void> {
  const remoteMessages = remoteChat?.messages ?? []
  const localRev = getLocalChatRevision(profileId) || chatTimestamp(localMessages)
  const remoteRev = remoteChat?.updated_at ?? chatTimestamp(remoteMessages)

  if (localMessages.length > 0 && remoteMessages.length === 0) {
    await pushChatToCloud(profileId, localMessages, localRev || Date.now())
    return
  }
  if (remoteMessages.length > 0 && localMessages.length === 0 && localRev === 0) {
    await saveChatAsync(profileId, remoteMessages, { pushCloud: false, revision: remoteRev })
    return
  }
  if (localMessages.length === 0 && remoteMessages.length === 0) return

  if (remoteRev > localRev) {
    await saveChatAsync(profileId, remoteMessages, { pushCloud: false, revision: remoteRev })
  } else if (localRev >= remoteRev) {
    await pushChatToCloud(profileId, localMessages, localRev)
  }
}

async function downloadAllRemote(
  profiles: LiveRemoteProfileRow[],
  chats: RemoteChatRow[],
): Promise<number> {
  const chatMap = new Map(chats.map((c) => [c.profile_id, c]))
  for (const row of profiles) {
    const chat = chatMap.get(row.id)
    await applyRemoteProfile(row, chat?.messages ?? [], chat?.updated_at)
  }
  return profiles.length
}

async function mergeLocalAndRemote(
  profiles: LiveRemoteProfileRow[],
  chats: RemoteChatRow[],
): Promise<void> {
  const remoteMap = new Map(profiles.map((p) => [p.id, p]))
  const chatMap = new Map(chats.map((c) => [c.profile_id, c]))
  const localSummaries = loadProfileSummaries()

  for (const local of localSummaries) {
    const remote = remoteMap.get(local.id)
    const localMessages = await loadChatAsync(local.id)

    if (!remote) {
      const profile = loadProfileById(local.id)
      if (profile) {
        await pushProfileToCloud(profile, local.preview, local.updatedAt)
        await pushChatToCloud(
          local.id,
          localMessages,
          getLocalChatRevision(local.id) || chatTimestamp(localMessages) || local.updatedAt,
        )
      }
      continue
    }

    if (remote.updated_at > local.updatedAt) {
      saveProfileRecord(remote.profile_data, remote.preview)
    } else if (local.updatedAt > remote.updated_at) {
      const profile = loadProfileById(local.id)
      if (profile) {
        await pushProfileToCloud(profile, local.preview, local.updatedAt)
      }
    }

    await syncChatForProfile(local.id, localMessages, chatMap.get(local.id))
    remoteMap.delete(local.id)
  }

  for (const [, remote] of remoteMap) {
    const chat = chatMap.get(remote.id)
    await applyRemoteProfile(remote, chat?.messages ?? [], chat?.updated_at)
  }

  await pushSettingsToCloud(loadModel())
}

export async function syncOnLogin(userId: string): Promise<SyncResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { mode: 'empty', count: 0 }
  }

  if (syncInFlight) return syncInFlight

  syncInFlight = (async () => {
    setActiveSyncUser(userId)
    await ensureMigrated()

    const remoteRows = await fetchRemoteProfiles(userId)
    const remoteChats = await fetchRemoteChats(userId)
    // 삭제 기록을 먼저 반영 — 지운 프로필은 다시 내려받지 않고, 로컬에서도 지운다
    const remoteProfiles = await reconcileDeletedProfiles(remoteRows)
    const localHas = hasLocalData() // reconcile이 로컬 프로필을 지울 수 있으므로 이후에 계산
    const remoteHas = remoteProfiles.length > 0

    if (localHas && !remoteHas) {
      const count = await uploadAllLocal()
      invalidateChatLoadCache()
      return { mode: 'uploaded', count }
    }

    if (!localHas && remoteHas) {
      const count = await downloadAllRemote(remoteProfiles, remoteChats)
      invalidateChatLoadCache()
      const settings = await fetchRemoteSettings(userId)
      if (settings?.gemini_model) {
        saveModel(settings.gemini_model)
        const resolved = loadModel()
        if (resolved && resolved !== settings.gemini_model.trim()) {
          void pushSettingsToCloud(resolved)
        }
      }
      return { mode: 'downloaded', count }
    }

    if (localHas && remoteHas) {
      await mergeLocalAndRemote(remoteProfiles, remoteChats)
      invalidateChatLoadCache()
      const settings = await fetchRemoteSettings(userId)
      if (settings?.gemini_model) {
        saveModel(settings.gemini_model)
        const resolved = loadModel()
        if (resolved && resolved !== settings.gemini_model.trim()) {
          void pushSettingsToCloud(resolved)
        }
      }
      return { mode: 'merged', count: remoteProfiles.length }
    }

    return { mode: 'empty', count: 0 }
  })()

  try {
    return await syncInFlight
  } finally {
    syncInFlight = null
  }
}

export async function uploadLocalWithConfirm(): Promise<SyncResult | null> {
  if (!hasLocalData()) return null

  if (supabase) {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) setActiveSyncUser(data.session.user.id)
  }

  const ok = window.confirm(
    '이 기기에 저장된 프로필·채팅을 구글 계정에 올릴까요?\n\n다른 기기에서도 같은 데이터를 쓸 수 있어요.',
  )
  if (!ok) return null

  await ensureMigrated()
  const count = await uploadAllLocal()
  await pushLocalTombstones()
  return { mode: 'uploaded', count }
}

export function scheduleProfileSync(profile: SelfProfile, preview?: string): void {
  const summaries = loadProfileSummaries()
  const summary = summaries.find((s) => s.id === profile.id)
  const updatedAt = summary?.updatedAt ?? Date.now()
  const prev = preview ?? summary?.preview ?? ''
  void pushProfileToCloud(profile, prev, updatedAt).catch(() => {})
}

export function scheduleChatSync(profileId: string, messages: ChatMessage[]): void {
  const updatedAt =
    getLocalChatRevision(profileId) ||
    (messages.length > 0
      ? messages[messages.length - 1].timestamp
      : loadProfileSummaries().find((s) => s.id === profileId)?.updatedAt ?? Date.now())
  void pushChatToCloud(profileId, messages, updatedAt).catch(() => {})
}

export function scheduleSettingsSync(): void {
  void pushSettingsToCloud(loadModel()).catch(() => {})
}

