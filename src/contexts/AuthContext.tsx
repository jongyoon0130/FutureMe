import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { setActiveSyncUser } from '../lib/cloudSync'
import { syncOnLogin, uploadLocalWithConfirm, type SyncResult } from '../lib/syncOrchestrator'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  syncing: boolean
  session: Session | null
  user: User | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  uploadLocalData: () => Promise<SyncResult | null>
  lastSync: SyncResult | null
}

const SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000 // 자동 전체 동기화 최소 간격 (5분)

function lastSyncKey(userId: string): string {
  return `futureme_last_full_sync_${userId}`
}

function getLastFullSyncAt(userId: string): number {
  try {
    return Number(sessionStorage.getItem(lastSyncKey(userId)) || 0)
  } catch {
    return 0
  }
}

function markFullSyncAt(userId: string): void {
  try {
    sessionStorage.setItem(lastSyncKey(userId), String(Date.now()))
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured()
  const [loading, setLoading] = useState(configured)
  const [syncing, setSyncing] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [lastSync, setLastSync] = useState<SyncResult | null>(null)

  const runSync = useCallback(async (userId: string, opts?: { force?: boolean }) => {
    if (!opts?.force) {
      const elapsed = Date.now() - getLastFullSyncAt(userId)
      if (elapsed < SYNC_MIN_INTERVAL_MS) return null
    }
    setSyncing(true)
    try {
      const result = await syncOnLogin(userId)
      markFullSyncAt(userId)
      setLastSync(result)
      return result
    } finally {
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    if (!configured || !supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
      if (data.session?.user) {
        void runSync(data.session.user.id) // 5분 이내 재방문·탭 복귀 시 스킵
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession)
      if (event === 'SIGNED_IN' && nextSession?.user) {
        await runSync(nextSession.user.id, { force: true })
      } else if (!nextSession) {
        setActiveSyncUser(null)
        setLastSync(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [configured, runSync])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setActiveSyncUser(null)
    await supabase.auth.signOut()
  }, [])

  const uploadLocalData = useCallback(async () => {
    if (!session?.user) return null
    setSyncing(true)
    try {
      const result = await uploadLocalWithConfirm()
      if (result) {
        markFullSyncAt(session.user.id)
        setLastSync(result)
      }
      return result
    } finally {
      setSyncing(false)
    }
  }, [session?.user])

  const value = useMemo(
    () => ({
      configured,
      loading,
      syncing,
      session,
      user: session?.user ?? null,
      signInWithGoogle,
      signOut,
      uploadLocalData,
      lastSync,
    }),
    [configured, loading, syncing, session, signInWithGoogle, signOut, uploadLocalData, lastSync],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
