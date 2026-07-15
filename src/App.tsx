import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import type { SelfProfile } from './types/self'
import { ChatOnboarding } from './components/onboarding/ChatOnboarding'
import { ChatScreen } from './components/chat/ChatScreen'
import { ProfileListScreen } from './components/list/ProfileListScreen'
import { PlannerScreen } from './components/planner/PlannerScreen'
import { HomeScreen } from './components/home/HomeScreen'
import { ScheduleScreen } from './components/schedule/ScheduleScreen'
import { AppShell } from './components/nav/AppShell'
import { DEFAULT_MAIN_TAB, type MainTab } from './components/nav/types'
import { AuthScreen } from './components/auth/AuthScreen'
import { APP_NAME } from './lib/brand'
import { FutureMeLogo } from './components/brand/FutureMeLogo'
import { useAuth } from './contexts/AuthContext'
import { subscribeCloudPushStatus, isCloudPushFailing } from './lib/syncStatus'
import {
  ensureMigrated,
  loadProfileSummaries,
  loadProfileById,
  saveProfileRecord,
  deleteProfileRecord,
  reconcileProfileSummariesFromChats,
  clearOnboardingProgress,
  loadOnboardingProgress,
  ONBOARDING_PROGRESS_VERSION,
  parseBackup,
  applyBackup,
  saveChatAsync,
  loadModel,
  type ProfileSummary,
} from './lib/storage'

type Screen = 'list' | 'onboarding' | 'chat' | 'planner'

export default function App() {
  const { configured, loading: authLoading, syncing, session } = useAuth()
  const cloudPushFailing = useSyncExternalStore(subscribeCloudPushStatus, isCloudPushFailing)
  const [activeTab, setActiveTab] = useState<MainTab>(DEFAULT_MAIN_TAB)
  const [screen, setScreen] = useState<Screen>('list')
  const [summaries, setSummaries] = useState<ProfileSummary[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [profile, setProfile] = useState<SelfProfile | null>(null)
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null)
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

  const handleProfileUpdate = (next: SelfProfile) => {
    saveProfileRecord(next)
    setProfile(next)
  }

  const handleBackFromChat = () => {
    void reconcileProfileSummariesFromChats().then(() => {
      refreshList()
      setActiveProfileId(null)
      setProfile(null)
      setActiveTab('chat')
      setScreen('list')
    })
  }

  const handleDeleteProfile = async (id: string) => {
    await deleteProfileRecord(id)
    if (activeProfileId === id) {
      setActiveProfileId(null)
      setProfile(null)
      setScreen('list')
    }
    refreshList()
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
    <div className="goal-app h-full bg-void">
      {configured && session && syncing && (
        <div
          className="fixed top-0 inset-x-0 z-50 py-1.5 text-center text-[11px] text-muted bg-surface/90 border-b border-border/30 backdrop-blur-sm"
          role="status"
        >
          데이터 동기화 중…
        </div>
      )}
      {configured && session && !syncing && cloudPushFailing && (
        <div
          className="fixed top-0 inset-x-0 z-50 py-1.5 text-center text-[11px] text-status-warn bg-status-warn/10 border-b border-status-warn/25 backdrop-blur-sm"
          role="status"
        >
          클라우드 저장 실패 — 지금은 이 기기에만 저장되고 있어요. 다음 저장·동기화 때 다시 시도해요.
        </div>
      )}
      <div className="relative h-full">
        <AppShell
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showNav={screen === 'list'}
          chat={
            <ProfileListScreen
              summaries={summaries}
              onSelect={openProfile}
              onCreateNew={() => {
                const saved = loadOnboardingProgress<{ version?: number; stepIdx?: number }>()
                if (saved?.version === ONBOARDING_PROGRESS_VERSION && saved.stepIdx && saved.stepIdx > 0) {
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
              onDelete={handleDeleteProfile}
            />
          }
          home={<HomeScreen />}
          schedule={<ScheduleScreen />}
        />

        {screen === 'onboarding' && (
          <div className="fixed inset-0 z-40 bg-void">
            <ChatOnboarding
              onComplete={handleComplete}
              onExitToList={() => {
                setActiveTab('chat')
                setScreen('list')
              }}
            />
          </div>
        )}
        {screen === 'chat' && profile && activeProfileId && (
          <div className="fixed inset-0 z-40 bg-void">
            <ChatScreen
              profileId={activeProfileId}
              profile={profile}
              onBack={handleBackFromChat}
              onProfileDeleted={handleProfileDeleted}
              onProfileUpdate={handleProfileUpdate}
              onOpenPlanner={() => setScreen('planner')}
              initialPrompt={pendingChatPrompt}
              onInitialPromptUsed={() => setPendingChatPrompt(null)}
            />
          </div>
        )}
        {screen === 'planner' && profile && (
          <div className="fixed inset-0 z-40 bg-void">
            <PlannerScreen
              profile={profile}
              onBack={() => setScreen('chat')}
              onProfileUpdate={handleProfileUpdate}
              onAskFuture={(prompt) => {
                setPendingChatPrompt(prompt)
                setScreen('chat')
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
