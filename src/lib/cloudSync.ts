import type { ChatMessage, SelfProfile } from '../types/self'
import { supabase, isSupabaseConfigured } from './supabase'
import { noteCloudPushFailure, noteCloudPushSuccess } from './syncStatus'

let activeUserId: string | null = null

export function setActiveSyncUser(userId: string | null): void {
  activeUserId = userId
}

export function getActiveSyncUser(): string | null {
  return activeUserId
}

function requireClient() {
  if (!supabase || !activeUserId) return null
  return { client: supabase, userId: activeUserId }
}

/**
 * 클라우드 tombstone(묘비) — 프로필을 지울 때 행을 없애는 대신 이 표식으로 바꿔 둔다.
 * 행이 아예 사라지면 다른 기기가 "삭제된 것"과 "아직 동기화 안 된 것"을 구분할 수
 * 없어서, 지운 프로필이 병합 때 되살아나는 버그가 생긴다.
 */
export type CloudProfileTombstone = {
  __deleted: true
  deletedAt: number
}

export function isCloudTombstone(data: unknown): data is CloudProfileTombstone {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as CloudProfileTombstone).__deleted === true
  )
}

export type RemoteProfileRow = {
  id: string
  profile_data: SelfProfile | CloudProfileTombstone
  preview: string
  updated_at: number
}

export type RemoteChatRow = {
  profile_id: string
  messages: ChatMessage[]
  updated_at: number
}

export type RemoteGoalDataRow = {
  owner_id: string
  plans: unknown[]
  misc_todos: unknown[]
  /** 반복 일정 — 컬럼을 아직 안 만든 프로젝트도 있어서 없을 수 있다 */
  routines?: unknown[] | null
  updated_at: number
}

export type GoalDataPayload = {
  ownerId: string
  plans: unknown[]
  miscTodos: unknown[]
  routines: unknown[]
  updatedAt: number
}

export async function pushProfileToCloud(
  profile: SelfProfile,
  preview: string,
  updatedAt: number,
): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  const { error } = await ctx.client.from('futureme_profiles').upsert(
    {
      id: profile.id,
      user_id: ctx.userId,
      profile_data: profile,
      preview: preview.slice(0, 80),
      updated_at: updatedAt,
    },
    { onConflict: 'user_id,id' },
  )
  if (error) {
    noteCloudPushFailure()
    throw error
  }
  noteCloudPushSuccess()
}

export async function pushChatToCloud(
  profileId: string,
  messages: ChatMessage[],
  updatedAt?: number,
): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  const ts =
    updatedAt ??
    (messages.length > 0 ? messages[messages.length - 1].timestamp : Date.now())

  const { error } = await ctx.client.from('futureme_chats').upsert(
    {
      profile_id: profileId,
      user_id: ctx.userId,
      messages,
      updated_at: ts,
    },
    { onConflict: 'user_id,profile_id' },
  )
  if (error) {
    noteCloudPushFailure()
    throw error
  }
  noteCloudPushSuccess()
}

/** routines 컬럼을 아직 안 만든 프로젝트인지 (SUPABASE_SETUP.md의 alter table 미실행) */
function isMissingRoutinesColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  return /routines/i.test(error.message ?? '') && /column|schema cache/i.test(error.message ?? '')
}

export async function pushGoalDataToCloud(payload: GoalDataPayload): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  const base = {
    user_id: ctx.userId,
    owner_id: payload.ownerId,
    plans: payload.plans,
    misc_todos: payload.miscTodos,
    updated_at: payload.updatedAt,
  }

  let { error } = await ctx.client
    .from('futureme_goal_data')
    .upsert({ ...base, routines: payload.routines }, { onConflict: 'user_id' })

  // 컬럼이 없는 옛 프로젝트에서는 반복 일정만 빼고 나머지는 계속 동기화한다
  if (isMissingRoutinesColumn(error)) {
    console.info('[FutureMe/Cloud] routines 컬럼 없음 — 반복 일정 빼고 동기화 (SUPABASE_SETUP.md 참고)')
    ;({ error } = await ctx.client.from('futureme_goal_data').upsert(base, { onConflict: 'user_id' }))
  }

  if (error) {
    noteCloudPushFailure()
    throw error
  }
  noteCloudPushSuccess()
}

export async function fetchRemoteGoalData(userId: string): Promise<RemoteGoalDataRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('futureme_goal_data')
    // routines 컬럼이 없는 프로젝트에서도 깨지지 않게 * 로 받는다
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as RemoteGoalDataRow | null) ?? null
}

/**
 * 프로필 삭제를 클라우드에 기록한다.
 * 채팅 행은 지우고, 프로필 행은 tombstone으로 바꿔 다른 기기에 삭제를 전파한다.
 */
export async function tombstoneProfileInCloud(profileId: string, deletedAt: number): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  const tombstone: CloudProfileTombstone = { __deleted: true, deletedAt }
  const { error: chatError } = await ctx.client
    .from('futureme_chats')
    .delete()
    .eq('user_id', ctx.userId)
    .eq('profile_id', profileId)
  const { error: profileError } = await ctx.client.from('futureme_profiles').upsert(
    {
      id: profileId,
      user_id: ctx.userId,
      profile_data: tombstone,
      preview: '',
      updated_at: deletedAt,
    },
    { onConflict: 'user_id,id' },
  )
  const error = chatError ?? profileError
  if (error) {
    noteCloudPushFailure()
    throw error
  }
  noteCloudPushSuccess()
}

export async function pushSettingsToCloud(geminiModel: string | null): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  const { error } = await ctx.client.from('futureme_settings').upsert(
    {
      user_id: ctx.userId,
      gemini_model: geminiModel,
      updated_at: Date.now(),
    },
    { onConflict: 'user_id' },
  )
  if (error) {
    noteCloudPushFailure()
    throw error
  }
  noteCloudPushSuccess()
}

export async function fetchRemoteProfiles(userId: string): Promise<RemoteProfileRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('futureme_profiles')
    .select('id, profile_data, preview, updated_at')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as RemoteProfileRow[]
}

export async function fetchRemoteChats(userId: string): Promise<RemoteChatRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('futureme_chats')
    .select('profile_id, messages, updated_at')
    .eq('user_id', userId)
  if (error) throw error
  return (data ?? []) as RemoteChatRow[]
}

export async function fetchRemoteSettings(userId: string): Promise<{ gemini_model: string | null } | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('futureme_settings')
    .select('gemini_model')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export function isCloudSyncAvailable(): boolean {
  return isSupabaseConfigured() && Boolean(activeUserId)
}
