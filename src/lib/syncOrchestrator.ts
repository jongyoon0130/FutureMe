import type { ChatMessage, SelfProfile } from '../types/self'
import {
  fetchRemoteChats,
  fetchRemoteProfiles,
  fetchRemoteSettings,
  pushChatToCloud,
  pushProfileToCloud,
  pushSettingsToCloud,
  deleteProfileFromCloud,
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
} from './storage'

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
  row: RemoteProfileRow,
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
  profiles: RemoteProfileRow[],
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
  profiles: RemoteProfileRow[],
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

    const localHas = hasLocalData()
    const remoteProfiles = await fetchRemoteProfiles(userId)
    const remoteChats = await fetchRemoteChats(userId)
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

export function scheduleProfileDelete(profileId: string): void {
  void deleteProfileFromCloud(profileId).catch(() => {})
}
