import type { ChatMessage, SelfProfile } from '../types/self'
import { supabase, isSupabaseConfigured } from './supabase'

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

export type RemoteProfileRow = {
  id: string
  profile_data: SelfProfile
  preview: string
  updated_at: number
}

export type RemoteChatRow = {
  profile_id: string
  messages: ChatMessage[]
  updated_at: number
}

export async function pushProfileToCloud(
  profile: SelfProfile,
  preview: string,
  updatedAt: number,
): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  await ctx.client.from('futureme_profiles').upsert(
    {
      id: profile.id,
      user_id: ctx.userId,
      profile_data: profile,
      preview: preview.slice(0, 80),
      updated_at: updatedAt,
    },
    { onConflict: 'user_id,id' },
  )
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
  if (error) throw error
}

export async function deleteProfileFromCloud(profileId: string): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  await ctx.client
    .from('futureme_chats')
    .delete()
    .eq('user_id', ctx.userId)
    .eq('profile_id', profileId)
  await ctx.client.from('futureme_profiles').delete().eq('user_id', ctx.userId).eq('id', profileId)
}

export async function pushSettingsToCloud(geminiModel: string | null): Promise<void> {
  const ctx = requireClient()
  if (!ctx) return

  await ctx.client.from('futureme_settings').upsert(
    {
      user_id: ctx.userId,
      gemini_model: geminiModel,
      updated_at: Date.now(),
    },
    { onConflict: 'user_id' },
  )
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
