import { useState, useEffect, useCallback } from 'react'
import type { SelfProfile } from './types/self'
import { ChatOnboarding } from './components/onboarding/ChatOnboarding'
import { ChatScreen } from './components/chat/ChatScreen'
import { ProfileListScreen } from './components/list/ProfileListScreen'
import { AuthScreen } from './components/auth/AuthScreen'
import { APP_NAME } from './lib/brand'
import { FutureMeLogo } from './components/brand/FutureMeLogo'
import { useAuth } from './contexts/AuthContext'
import {
  ensureMigrated,
  loadProfileSummaries,
  loadProfileById,
  saveProfileRecord,
  reconcileProfileSummariesFromChats,
  clearOnboardingProgress,
  loadOnboardingProgress,
  parseBackup,
  applyBackup,
  saveChatAsync,
  loadModel,
  type ProfileSummary,
} from './lib/storage'

type Screen = 'list' | 'onboarding' | 'chat'

export default function App() {
  const { configured, loading: authLoading, syncing, session } = useAuth()
  const [screen, setScreen] = useState<Screen>('list')
  const [summaries, setSummaries] = useState<ProfileSummary[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [profile, setProfile] = useState<SelfProfile | null>(null)
  const [ready, setReady] = useState(false)

  const refreshList = useCallback(() => {
    setSummaries(loadProfileSummaries())
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (configured && !session) {
      setReady(false)
      return
    }
    ensureMigrated().then(async () => {
      loadModel()
      await reconcileProfileSummariesFromChats()
      refreshList()
      setReady(true)
    })
  }, [authLoading, configured, session, refreshList])

  useEffect(() => {
    if (!syncing && session) {
      void reconcileProfileSummariesFromChats().then(refreshList)
    }
  }, [syncing, session, refreshList])

  const openProfile = (id: string) => {
    const p = loadProfileById(id)
    if (!p) return
    setActiveProfileId(id)
    setProfile(p)
    setScreen('chat')
  }

  const handleComplete = (p: SelfProfile) => {
    const saved: SelfProfile = {
      ...p,
      id: p.id || crypto.randomUUID(),
    }
    saveProfileRecord(saved)
    refreshList()
    setActiveProfileId(saved.id)
    setProfile(saved)
    setScreen('chat')
  }

  const handleBackFromChat = () => {
    void reconcileProfileSummariesFromChats().then(() => {
      refreshList()
      setActiveProfileId(null)
      setProfile(null)
      setScreen('list')
    })
  }

  const handleProfileDeleted = () => {
    refreshList()
    setActiveProfileId(null)
    setProfile(null)
    setScreen('list')
  }

  const handleRestoreBackup = async (file: File) => {
    try {
      const backup = parseBackup(await file.text())
      if (!backup) {
        window.alert('백업 파일 형식이 맞지 않아요.')
        return
      }
      const id = await applyBackup(backup)
      await saveChatAsync(id, backup.messages)
      const restored = loadProfileById(id)
      if (!restored) return
      refreshList()
      setActiveProfileId(id)
      setProfile(restored)
      setScreen('chat')
    } catch {
      window.alert('백업을 불러오지 못했어요. 파일을 다시 확인해주세요.')
    }
  }

  if (authLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted bg-void">
        <FutureMeLogo size={56} />
        {APP_NAME} 불러오는 중…
      </div>
    )
  }

  if (configured && !session) {
    return <AuthScreen />
  }

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-sm text-muted bg-void">
        <FutureMeLogo size={56} />
        {APP_NAME} 불러오는 중…
      </div>
    )
  }

  return (
    <div className="h-full bg-void">
      {configured && session && syncing && (
        <div
          className="fixed top-0 inset-x-0 z-50 py-1.5 text-center text-[11px] text-muted bg-surface/90 border-b border-border/30 backdrop-blur-sm"
          role="status"
        >
          데이터 동기화 중…
        </div>
      )}
      <div className="relative h-full">
        {screen === 'list' && (
          <ProfileListScreen
            summaries={summaries}
            onSelect={openProfile}
            onCreateNew={() => {
              const saved = loadOnboardingProgress<{ stepIdx?: number }>()
              if (saved?.stepIdx && saved.stepIdx > 0) {
                const resume = window.confirm(
                  '진행 중인 만들기가 저장돼 있어요.\n\n확인 → 이어서 만들기\n취소 → 처음부터 새로 만들기',
                )
                if (resume) {
                  setScreen('onboarding')
                  return
                }
              }
              clearOnboardingProgress()
              setScreen('onboarding')
            }}
            onRestoreBackup={handleRestoreBackup}
          />
        )}
        {screen === 'onboarding' && (
          <ChatOnboarding
            onComplete={handleComplete}
            onExitToList={() => setScreen('list')}
          />
        )}
        {screen === 'chat' && profile && activeProfileId && (
          <ChatScreen
            profileId={activeProfileId}
            profile={profile}
            onBack={handleBackFromChat}
            onProfileDeleted={handleProfileDeleted}
            onProfileUpdate={setProfile}
          />
        )}
      </div>
    </div>
  )
}
