import { useEffect, useRef, useState } from 'react'
import type { SelfProfile, ChatMessage, StyleSample } from '../../types/self'
import { INSIGHT_LABELS } from '../../types/self'
import { Button } from '../ui'
import { ProfileSheet } from '../profile/ProfileSheet'
import { ThemePicker } from '../theme/ThemePicker'
import { ChatMessageList } from './ChatMessageList'
import { splitMessageParagraphs, formatChatTime, stripApiTurnTimestampFromContent } from '../../lib/chatDisplay'
import {
  buildReplyPlan,
  insertReplyAfterUser,
} from '../../lib/chatReplyPlan'
import {
  fetchAIResponse,
  detectRegister,
  extractStyleRules,
  accumulateInsights,
  analyzeInsightsWithAI,
  mergeInsight,
  updateConversationSummary,
  verifyApiKey,
  GEMINI_MODEL_OPTIONS,
  AI_ANALYZE_EVERY,
  geminiErrorUserMessage,
  getLastGeminiUsage,
  shouldUpdateConversationSummary,
  isBackgroundApiPaused,
  resolveModel,
  getActiveModel,
  isUnsupportedStoredModel,
  GeminiApiError,
  resetProfilePromptBulk,
  shouldUseLitePrompt,
  suggestSmallAction,
} from '../../lib/selfEngine'
import type { ApiCheckResult } from '../../lib/selfEngine'
import {
  loadChatAsync,
  saveChat,
  saveChatAsync,
  loadApiKey,
  saveApiKey,
  loadModel,
  saveModel,
  saveProfileRecord,
  deleteProfileRecord,
  downloadBackup,
  parseBackup,
  applyBackup,
  resolveCachedApiStatus,
  saveApiCheckCache,
  clearApiCheckCache,
  loadApiCheckCache,
} from '../../lib/storage'
import { addSavedDilemma, addSmallAction } from '../../lib/growthStore'

function readInitialApiStatus(): 'idle' | ApiCheckResult {
  const key = loadApiKey()?.trim() ?? ''
  const mdl = resolveModel(loadModel())
  const cached = resolveCachedApiStatus(key, mdl)
  return cached === 'idle' ? 'idle' : cached
}

/** 저장된 키 — 끝 4자리만 노출 (···abcd) */
function maskApiKeyDisplay(key: string): string {
  if (!key) return ''
  if (key.length <= 4) return '•'.repeat(key.length)
  return `···${key.slice(-4)}`
}

function fallbackSmallActionEncouragement(action: string): string {
  const lines = [
    `오케이, ${action}. 오늘 한 번만 해보자.`,
    `좋아. ${action} 정했으면 반은 한 거야. 하고 나면 나한테 얘기해줘.`,
    `${action} 가자. 지금 아니면 또 미룰걸?`,
  ]
  return lines[Math.floor(Math.random() * lines.length)]
}

interface Props {
  profileId: string
  profile: SelfProfile
  onBack: () => void
  onProfileDeleted: () => void
  onProfileUpdate: (p: SelfProfile) => void
  onOpenPlanner: () => void
  initialPrompt?: string | null
  onInitialPromptUsed?: () => void
}

const MAX_SAMPLES = 60
/** 연속 전송 간격 (burst → 503/RPM 완화) */
const SEND_COOLDOWN_MS = 8000
/** chatReply 503 후 재시도 대기 */
const POST_503_COOLDOWN_MS = 90_000
/** chatReply 후 대화 요약 API — 동시 호출 방지 */
const CONVERSATION_SUMMARY_DELAY_MS = 20_000

/** 예전 버전: 대화 시작 시 자동으로 넣던 인사만 있으면 빈 채팅으로 취급 */
function stripLegacyIntro(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length !== 1) return messages
  const m = messages[0]
  if (m.role === 'self' && m.content.startsWith('안녕, 나야.')) return []
  return messages
}

export function ChatScreen({ profileId, profile, onBack, onProfileDeleted, onProfileUpdate, onOpenPlanner, initialPrompt, onInitialPromptUsed }: Props) {
  const [self, setSelf] = useState<SelfProfile>(profile)

  const persistSelf = (next: SelfProfile) => {
    setSelf(next)
    onProfileUpdate(next)
    saveProfileRecord(next)
  }
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatReady, setChatReady] = useState(false)
  const [importStatus, setImportStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (!initialPrompt) return
    setInput(initialPrompt)
    onInitialPromptUsed?.()
  }, [initialPrompt, onInitialPromptUsed])
  const [revealProgress, setRevealProgress] = useState<{ msgId: string; shown: number } | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [apiKey, setApiKey] = useState(loadApiKey() ?? '')
  const [model, setModel] = useState(() => resolveModel(loadModel()))
  const [modelMigrationFrom, setModelMigrationFrom] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('futureme-model-migrated-from')
    } catch {
      return null
    }
  })
  const [legacyModelBanner, setLegacyModelBanner] = useState(false)
  const [apiStatus, setApiStatus] = useState<'idle' | 'testing' | ApiCheckResult>(readInitialApiStatus)
  const [apiCheckedAt, setApiCheckedAt] = useState<number | null>(() => {
    const key = loadApiKey()?.trim() ?? ''
    const mdl = resolveModel(loadModel())
    if (resolveCachedApiStatus(key, mdl) === 'idle') return null
    return loadApiCheckCache()?.checkedAt ?? null
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeyFocused, setApiKeyFocused] = useState(false)
  const apiKeyRevealed = showApiKey || apiKeyFocused
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const msgSinceAnalyze = useRef(0)
  const analyzing = useRef(false)
  const lastSendAt = useRef(0)
  const last503At = useRef(0)
  const summaryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastUsageTick, setLastUsageTick] = useState(0)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  /** 이번 채팅 세션에서 API 실패 직후에만 표시 (나갔다 들어오면 안 뜸) */
  const [retryBannerMsgId, setRetryBannerMsgId] = useState<string | null>(null)

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const enterSelectMode = (msgId: string) => {
    if (typing) return
    setShowSettings(false)
    setShowProfile(false)
    setSelectMode(true)
    setSelectedIds(new Set([msgId]))
  }

  const toggleSelect = (msgId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === messages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(messages.map((m) => m.id)))
    }
  }

  const deleteSelectedMessages = async () => {
    if (!selectedIds.size) return
    const n = selectedIds.size
    if (!window.confirm(`선택한 ${n}개의 메시지를 삭제할까요?`)) return
    const next = messages.filter((m) => !selectedIds.has(m.id))
    setMessages(next)
    exitSelectMode()
    await saveChatAsync(profileId, next)
  }

  useEffect(() => {
    setRetryBannerMsgId(null)
  }, [profileId])

  useEffect(() => {
    let cancelled = false
    const raw = localStorage.getItem('futureme-gemini-model')
    const resolved = getActiveModel(loadModel())
    setModel(resolved)
    setLegacyModelBanner(isUnsupportedStoredModel(raw))
    loadChatAsync(profileId).then((saved) => {
      if (cancelled) return
      setMessages(stripLegacyIntro(saved))
      setChatReady(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  const handleDeleteProfile = async () => {
        if (
      !window.confirm(
        `'${self.name}' 프로필과 대화를 삭제할까요?\n다른 프로필은 그대로 남아요.`,
      )
    ) {
      return
    }
    await deleteProfileRecord(profileId)
    onProfileDeleted()
  }

  const handleImportFile = async (file: File) => {
    setImportStatus('idle')
    try {
      const backup = parseBackup(await file.text())
      if (!backup) {
        setImportStatus('fail')
        return
      }
      const ok = window.confirm(
        `'${backup.profile.name}' 백업 (${backup.messages.length}개 메시지)을 가져올까요?\n지금 프로필·대화를 덮어씁니다.`,
      )
      if (!ok) return
      await applyBackup(backup, profileId)
      const p = { ...backup.profile, id: profileId }
      persistSelf(p)
      setMessages(backup.messages)
      setChatReady(true)
      setImportStatus('ok')
    } catch {
      setImportStatus('fail')
    }
  }

  // 몇 메시지마다 AI가 최근 대화를 읽고 지속적 성격·가치관을 추론해 반영 (조심스럽게)
  const runAIAnalysis = async (history: ChatMessage[]) => {
    const key = loadApiKey()?.trim()
    if (!key || analyzing.current || isBackgroundApiPaused()) return
    analyzing.current = true
    try {
      const recent = history.slice(-14).map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }))
      const found = await analyzeInsightsWithAI(recent, key, resolveModel(loadModel()))
      if (found.length) {
        setSelf((prev) => {
          let ins = prev.insights ?? []
          for (const c of found) ins = mergeInsight(ins, { ...c, source: 'ai' })
          const updated: SelfProfile = { ...prev, insights: ins }
          saveProfileRecord(updated)
          onProfileUpdate(updated)
          return updated
        })
      }
    } catch {
      /* 분석 실패는 조용히 무시 */
    } finally {
      analyzing.current = false
    }
  }

  const scheduleDeferredSummary = (
    profile: SelfProfile,
    history: { role: 'user' | 'assistant'; content: string; timestamp?: number }[],
    key: string,
    mdl: string,
  ) => {
    if (isBackgroundApiPaused()) return
    if (!shouldUpdateConversationSummary(history.length, profile.summarizedMessageCount ?? 0)) {
      return
    }
    if (summaryTimer.current) clearTimeout(summaryTimer.current)
    summaryTimer.current = setTimeout(() => {
      void (async () => {
        if (isBackgroundApiPaused()) return
        try {
          const sumResult = await updateConversationSummary(profile, history, key, mdl)
          if (!sumResult) return
          setSelf((prev) => {
            const updated: SelfProfile = {
              ...prev,
              conversationSummary: sumResult.summary,
              summarizedMessageCount: sumResult.summarizedMessageCount,
            }
            saveProfileRecord(updated)
            onProfileUpdate(updated)
            return updated
          })
        } catch {
          /* 요약 실패는 조용히 무시 */
        }
      })()
    }, CONVERSATION_SUMMARY_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (summaryTimer.current) clearTimeout(summaryTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!showSettings) return
    setModel(resolveModel(loadModel()))
    try {
      setModelMigrationFrom(sessionStorage.getItem('futureme-model-migrated-from'))
    } catch {
      /* ignore */
    }
  }, [showSettings])

  // 카톡처럼 입력이 최대 4줄까지 늘어나고, 그 이상은 최근 줄만 보이며 스크롤
  const autoGrow = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
    const paddingY = 24 // py-3 (위아래 12px씩)
    const maxHeight = lineHeight * 4 + paddingY
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    autoGrow()
  }, [input])

  // 저장 시 실제 테스트 호출로 연결 상태 확인
  const saveAndVerify = async () => {
    const key = apiKey.trim()
    const resolved = getActiveModel(model.trim())
    saveApiKey(key)
    saveModel(resolved)
    setModel(resolved)
    setLegacyModelBanner(false)
    if (!key) {
      clearApiCheckCache()
      setApiStatus('idle')
      setApiCheckedAt(null)
      return
    }
    setApiStatus('testing')
    const result = await verifyApiKey(key, resolved)
    setApiStatus(result)
    saveApiCheckCache(result, key, resolved)
    setApiCheckedAt(Date.now())
    if (result === 'ok') {
      try {
        sessionStorage.removeItem('futureme-model-migrated-from')
      } catch {
        /* ignore */
      }
      setModelMigrationFrom(null)
    }
  }

  // 설정 열 때 API 자동 ping 하지 않음 (429 유발 방지) — '저장' 버튼으로만 확인

  useEffect(() => {
    if (!chatReady) return
    saveChat(profileId, messages)
  }, [messages, chatReady, profileId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing, revealProgress])

  // 대화에서 자동축적: 말투(즉시) + 가치관·상황 인사이트(조심스럽게, 반복 시 신뢰↑)
  const learnFromMessage = (text: string) => {
    if (text.trim().length < 3) return
    const sample: StyleSample = {
      register: detectRegister(text),
      text: text.trim(),
      source: 'chat',
      at: Date.now(),
    }
    setSelf((prev) => {
      const samples = [...prev.styleSamples, sample].slice(-MAX_SAMPLES)
      const insights = accumulateInsights(prev.insights ?? [], text)
      const updated: SelfProfile = {
        ...prev,
        styleSamples: samples,
        styleRules: extractStyleRules(samples),
        insights,
      }
      saveProfileRecord(updated)
      onProfileUpdate(updated)
      return updated
    })
  }

  const appendSelfReply = async (focusMessageId: string, reply: string) => {
    const selfMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'self',
      content: stripApiTurnTimestampFromContent(reply.trim()),
      timestamp: Date.now(),
    }
    const segments = splitMessageParagraphs(reply)

    if (segments.length > 1) {
      setMessages((m) => insertReplyAfterUser(m, focusMessageId, selfMsg))
      setTyping(false)
      setRevealProgress({ msgId: selfMsg.id, shown: 1 })
      for (let i = 2; i <= segments.length; i++) {
        await new Promise((r) => setTimeout(r, 380 + Math.random() * 420))
        setRevealProgress({ msgId: selfMsg.id, shown: i })
      }
      setRevealProgress(null)
    } else {
      setMessages((m) => insertReplyAfterUser(m, focusMessageId, selfMsg))
      setTyping(false)
    }

    return selfMsg
  }

  const requestReply = async (workingMessages: ChatMessage[], focusMessageId?: string) => {
    const plan = buildReplyPlan(workingMessages, focusMessageId)
    if (!plan) return { ok: false as const, reason: 'no_plan' as const }

    const key = loadApiKey()
    const mdl = getActiveModel(loadModel())
    const profileForAI = self

    if (!key) {
      setTyping(true)
      await appendSelfReply(
        plan.focusMessageId,
        '(⚙️ Gemini API 키가 없어서 AI가 답할 수 없어. 설정에서 키를 넣어줘.)',
      )
      return { ok: false as const, reason: 'no_key' as const, plan }
    }

    setTyping(true)
    let reply: string
    let chatOk = false
    try {
      const history = workingMessages.map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
        timestamp: m.timestamp,
      }))
      reply = await fetchAIResponse(profileForAI, history, key, mdl, {
        contextMessages: plan.contextMessages,
        focusContent: plan.focusContent,
        focusTimestamp: plan.focusTimestamp,
        focusInstruction: plan.focusInstruction,
      })
      chatOk = true
      setLastUsageTick(Date.now())
    } catch (e) {
      if (e instanceof GeminiApiError && e.code === 'HTTP' && e.httpStatus === 503) {
        last503At.current = Date.now()
      }
      reply = geminiErrorUserMessage(e)
    }

    const selfMsg = await appendSelfReply(plan.focusMessageId, reply)

    if (chatOk) {
      if (focusMessageId == null) {
        msgSinceAnalyze.current += 1
      }
      if (msgSinceAnalyze.current >= AI_ANALYZE_EVERY) {
        msgSinceAnalyze.current = 0
        void runAIAnalysis(workingMessages.concat(selfMsg))
      }

      const history = insertReplyAfterUser(workingMessages, plan.focusMessageId, selfMsg).map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
        timestamp: m.timestamp,
      }))
      scheduleDeferredSummary(self, history, key, mdl)
    }

    return { ok: chatOk, selfMsg, plan }
  }

  const hideRetryBanner = () => {
    setRetryBannerMsgId(null)
  }

  const showRetryBannerForFailure = (messageId: string) => {
    setRetryBannerMsgId(messageId)
  }

  const getFailedMessageId = (
    result: Awaited<ReturnType<typeof requestReply>> | undefined,
    fallbackId: string,
  ): string | null => {
    if (!result || result.ok) return null
    if ('reason' in result && result.reason === 'no_plan') return null
    if ('plan' in result && result.plan) return result.plan.focusMessageId
    return fallbackId
  }

  const send = async () => {
    const text = input.trim()
    if (!text || typing || !chatReady) return

    const now = Date.now()
    const since503 = now - last503At.current
    if (last503At.current > 0 && since503 < POST_503_COOLDOWN_MS) {
      const waitSec = Math.ceil((POST_503_COOLDOWN_MS - since503) / 1000)
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: now,
      }
      const cooldownMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'self',
        content: `(Google 서버 503 — ${waitSec}초만 더 쉬었다 보내줘. 연속으로 보내면 더 막혀 ㅠ)`,
        timestamp: now + 1,
      }
      setMessages((m) => [...m, userMsg, cooldownMsg])
      setInput('')
      hideRetryBanner()
      return
    }

    const sinceLast = now - lastSendAt.current
    if (lastSendAt.current > 0 && sinceLast < SEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((SEND_COOLDOWN_MS - sinceLast) / 1000)
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: now,
      }
      const cooldownMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'self',
        content: `(잠깐 — ${waitSec}초만 더 쉬었다 보내줘. 너무 빨리 연속으로 보내면 Google 쪽에서 막혀 ㅠ)`,
        timestamp: now + 1,
      }
      setMessages((m) => [...m, userMsg, cooldownMsg])
      setInput('')
      hideRetryBanner()
      return
    }
    lastSendAt.current = now

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() }
    const workingMessages = [...messages, userMsg]
    setMessages(workingMessages)
    setInput('')
    hideRetryBanner()
    learnFromMessage(text)
    const result = await requestReply(workingMessages)
    const failedId = getFailedMessageId(result, userMsg.id)
    if (failedId) showRetryBannerForFailure(failedId)
  }

  const retryReplyForMessage = async (userMessageId: string) => {
    if (typing || !chatReady) return

    const now = Date.now()
    const since503 = now - last503At.current
    if (last503At.current > 0 && since503 < POST_503_COOLDOWN_MS) {
      const waitSec = Math.ceil((POST_503_COOLDOWN_MS - since503) / 1000)
      window.alert(`Google 503 — ${waitSec}초만 더 쉬었다 다시 시도해줘.`)
      return
    }

    const sinceLast = now - lastSendAt.current
    if (lastSendAt.current > 0 && sinceLast < SEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((SEND_COOLDOWN_MS - sinceLast) / 1000)
      window.alert(`잠깐 — ${waitSec}초만 더 쉬었다 다시 시도해줘.`)
      return
    }
    lastSendAt.current = now

    hideRetryBanner()
    const result = await requestReply(messages, userMessageId)
    const failedId = getFailedMessageId(result, userMessageId)
    if (failedId) showRetryBannerForFailure(failedId)
  }

  const handleResetPromptBulk = () => {
    if (
      !window.confirm(
        '저장된 대화 요약을 지울까요?\n\n채팅 메시지는 그대로 두고, API에 실리는 맥락만 가벼워져요. (503 완화)',
      )
    ) {
      return
    }
    persistSelf(resetProfilePromptBulk(self))
  }

  // ── 자기이해 → 용기 → 실행 액션 ─────────────────────────────
  const [toast, setToast] = useState<string | null>(null)
  const [actionSuggesting, setActionSuggesting] = useState(false)
  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 1600)
  }

  const lastUserMessage = () => [...messages].reverse().find((m) => m.role === 'user') ?? null

  const saveLastUserAsDilemma = () => {
    const last = lastUserMessage()
    if (!last) return flashToast('저장할 고민이 아직 없어')
    persistSelf(addSavedDilemma(self, last.content))
    flashToast('고민 저장됨 🔖')
  }

  // C: AI가 최근 대화에서 작은 행동 하나 제안 → 프리필 → A: 현재의 나가 바로 밀어줌
  const addSmallActionQuick = async () => {
    if (typing || !chatReady || actionSuggesting) return
    let suggestion = ''
    const key = loadApiKey()
    if (key && messages.length > 0) {
      setActionSuggesting(true)
      try {
        const history = messages.map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content,
          timestamp: m.timestamp,
        }))
        suggestion = await suggestSmallAction(history, key, getActiveModel(loadModel()))
      } catch {
        /* 제안 실패는 조용히 무시 → 빈 입력창 */
      } finally {
        setActionSuggesting(false)
      }
    }
    const text = window.prompt(
      suggestion
        ? '이 행동 어때? 마음에 안 들면 고쳐도 돼 ✍️'
        : '작게 해볼 한 걸음을 적어줘\n예: 오늘 밤 이력서 첫 줄만 고치기',
      suggestion,
    )
    if (!text?.trim()) return
    const action = text.trim()
    persistSelf(addSmallAction(self, action))

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: action,
      timestamp: Date.now(),
    }
    const workingMessages = [...messages, userMsg]
    setMessages(workingMessages)
    learnFromMessage(action)

    const mdl = getActiveModel(loadModel())
    let reply = fallbackSmallActionEncouragement(action)
    if (key) {
      hideRetryBanner()
      setTyping(true)
      try {
        const history = workingMessages.map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content,
          timestamp: m.timestamp,
        }))
        reply = await fetchAIResponse(
          self,
          history,
          key,
          mdl,
          {
            contextMessages: history.slice(0, -1),
            focusContent: action,
            focusTimestamp: userMsg.timestamp,
            focusInstruction:
              'user가 방금 \'작은 행동\'으로 위 한 줄을 정했다. 이미 정한 행동이니 다시 제안하지 말고, 내 말투로 짧게 밀어줘. 행동명을 작은따옴표+대시로 되따라치지 말 것. 행동과 안 맞는 "5분" 같은 시간은 붙이지 말 것.',
          },
          'courage',
        )
      } catch {
        /* fallback 유지 */
      } finally {
        setTyping(false)
      }
    }

    const pushMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'self',
      content: reply,
      timestamp: Date.now(),
    }
    setMessages((m) => insertReplyAfterUser(m, userMsg.id, pushMsg))
    flashToast('작은 행동 추가됨 ✅')
  }

  const apiHeavyProfile = shouldUseLitePrompt(self, messages.length)
  const retryBannerMessage =
    retryBannerMsgId != null
      ? messages.find((m) => m.id === retryBannerMsgId && m.role === 'user') ?? null
      : null
  const showRetryBanner = retryBannerMessage != null && !typing

  const dismissRetryBanner = () => {
    hideRetryBanner()
  }

  const suggestions = [
    '요즘 좀 지치는데 어떡하지',
    '이 선택 맞는 걸까?',
    '그냥 오늘 있었던 일 얘기할래',
  ]

  const insightsAll = self.insights ?? []
  const surfacedInsights = [
    ...insightsAll.filter((i) => i.kind === 'state').sort((a, b) => b.lastAt - a.lastAt).slice(0, 2),
    ...insightsAll
      .filter((i) => i.kind !== 'state' && (i.source === 'ai' || i.count >= 2))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4),
  ]

  const rules = self.styleRules
  const styleChips: string[] = []
  if (rules) {
    styleChips.push(rules.banmal ? '반말' : '존댓말')
    if (rules.usesConsonants) styleChips.push('ㅋㅋ/ㅠㅠ')
    if (rules.endings[0]) styleChips.push(rules.endings[0])
    if (rules.fillers[0]) styleChips.push(rules.fillers[0])
  }

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-void">
      {(legacyModelBanner || modelMigrationFrom) && !selectMode ? (
        <div className="px-4 py-2.5 bg-status-warn/10 border-b border-status-warn/25 text-[11px] leading-relaxed text-status-warn shrink-0">
          {modelMigrationFrom ? (
            <>
              구 모델 <span className="font-medium">{modelMigrationFrom}</span> →{' '}
              {GEMINI_MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model}(으)로 바꿨어요.
            </>
          ) : (
            <>구 Gemini 1.5 모델이면 채팅만 503이 납니다.</>
          )}{' '}
          ⚙️에서 <span className="font-medium">2.5 Flash-Lite</span> 선택 후{' '}
          <span className="font-medium">저장</span> 눌러주세요.
        </div>
      ) : null}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-surface shrink-0 min-h-[52px]">
        {selectMode ? (
          <>
            <button
              type="button"
              onClick={exitSelectMode}
              className="text-[15px] text-ink px-1 py-2 -ml-1 hover:bg-ink/5 rounded-lg transition-colors"
            >
              취소
            </button>
            <span className="text-[15px] font-medium text-ink">
              {selectedIds.size > 0 ? `${selectedIds.size}개 선택` : '메시지 선택'}
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={messages.length === 0}
              className="text-[13px] text-accent px-1 py-2 -mr-1 hover:bg-accent/5 rounded-lg transition-colors disabled:opacity-40"
            >
              {selectedIds.size === messages.length && messages.length > 0 ? '전체 해제' : '전체 선택'}
            </button>
          </>
        ) : (
          <>
        <button
          type="button"
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2.5 text-left rounded-lg -ml-0.5 pl-0.5 pr-2 py-0.5 hover:bg-ink/[0.04] transition-colors"
        >
          <div className="w-8 h-8 rounded-full chat-avatar flex items-center justify-center text-xs font-medium">
            {self.name[0] ?? '나'}
          </div>
          <div>
            <h1 className="text-[15px] font-normal leading-tight text-ink">5년 뒤 {self.name}</h1>
            <p className="text-[11px] text-muted">미래의 나</p>
          </div>
        </button>
        <div className="flex gap-1 items-center">
          <button
            type="button"
            onClick={onOpenPlanner}
            className="text-muted hover:text-ink p-2 rounded-lg hover:bg-ink/5 text-xs whitespace-nowrap"
            title="내 플래너"
          >
            계획
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="relative text-muted hover:text-ink p-2 rounded-lg hover:bg-ink/5 text-sm"
            title={
              apiStatus === 'ok'
                ? 'AI 정상 연결됨'
                : apiStatus === 'bad_key'
                ? '키 오류'
                : apiStatus === 'rate_limit' || apiStatus === 'error'
                ? '연결 주의'
                : '설정'
            }
          >
            ⚙️
            {apiStatus !== 'idle' && apiStatus !== 'testing' && (
              <span
                className={`absolute top-1 right-1 w-2 h-2 rounded-full border border-surface ${
                  apiStatus === 'ok'
                    ? 'bg-status-ok'
                    : apiStatus === 'bad_key'
                    ? 'bg-status-error'
                    : 'bg-status-warn'
                }`}
              />
            )}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="text-muted hover:text-ink p-2 rounded-lg hover:bg-ink/5 text-xs whitespace-nowrap"
          >
            ← 목록
          </button>
        </div>
          </>
        )}
      </header>

      {showProfile && (
        <ProfileSheet
          profile={self}
          onClose={() => setShowProfile(false)}
          onDelete={handleDeleteProfile}
          onUpdate={(next) => persistSelf(next)}
        />
      )}

      {showSettings && !selectMode && (
        <div className="px-5 py-4 bg-surface-2 border-b border-border animate-fade-up space-y-4">
          <ThemePicker />
          <div>
            <p className="text-xs text-muted mb-1">Gemini API Key (무료 · 없으면 로컬 엔진 사용)</p>
            <p className="text-[11px] text-muted/70 mb-2">
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent underline">
                aistudio.google.com/apikey
              </a>{' '}
              에서 무료로 발급 (구글 로그인만)
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={apiKeyRevealed ? apiKey : maskApiKeyDisplay(apiKey)}
                  readOnly={!apiKeyRevealed}
                  onFocus={() => setApiKeyFocused(true)}
                  onBlur={() => {
                    setApiKeyFocused(false)
                    setShowApiKey(false)
                  }}
                  onChange={(e) => {
                    setApiKey(e.target.value)
                    setApiStatus('idle')
                    setApiCheckedAt(null)
                  }}
                  placeholder="AIza..."
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full pl-3 pr-9 py-2 rounded-lg bg-surface border border-border text-sm font-mono focus:outline-none focus:border-accent"
                />
                {apiKey.length > 0 && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-ink transition-colors"
                    title={showApiKey ? '키 숨기기' : '키 보기'}
                    aria-label={showApiKey ? 'API 키 숨기기' : 'API 키 보기'}
                  >
                    {showApiKey ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-4-11-4a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 4 11 4a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <path d="m1 1 22 22" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <Button size="sm" onClick={saveAndVerify} disabled={apiStatus === 'testing'}>
                {apiStatus === 'testing' ? '확인 중…' : '저장'}
              </Button>
            </div>
            {apiStatus !== 'idle' && (
              <div className="mt-2 text-xs flex items-center gap-1.5">
                {apiStatus === 'testing' && (
                  <span className="text-muted flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
                    연결 확인 중…
                  </span>
                )}
                {apiStatus === 'ok' && (
                  <span className="text-status-ok flex items-center gap-1.5 flex-wrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-ok shrink-0" />
                    <span>
                      ✓ 정상 호출 — AI가 응답합니다
                      {apiCheckedAt ? (
                        <span className="text-muted/60 font-normal">
                          {' '}
                          · {formatChatTime(apiCheckedAt)} 확인
                        </span>
                      ) : null}
                    </span>
                  </span>
                )}
                {apiStatus === 'bad_key' && (
                  <span className="text-status-error flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-error" />
                    ✕ 키가 올바르지 않아요 — 다시 확인해주세요
                  </span>
                )}
                {apiStatus === 'rate_limit' && (
                  <span className="text-status-warn flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-warn" />
                    ⚠ API 한도 초과 — 1~2분 후 재시도
                  </span>
                )}
                {apiStatus === 'error' && (
                  <span className="text-status-warn flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-warn" />
                    ⚠ 연결에 실패했어요 — 네트워크를 확인해주세요
                  </span>
                )}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted mb-2">모델</p>
            {modelMigrationFrom ? (
              <p className="text-[11px] text-status-warn mb-2 leading-relaxed">
                예전 모델({modelMigrationFrom})은 불안정해서{' '}
                {GEMINI_MODEL_OPTIONS.find((m) => m.id === model)?.label ?? model}(으)로 바꿨어요. 아래{' '}
                <strong className="font-medium">저장</strong> 한 번 눌러줘.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {GEMINI_MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setModel(m.id)
                    setApiStatus('idle')
                    setApiCheckedAt(null)
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    model === m.id
                      ? 'bg-accent/15 text-accent border-accent/40'
                      : 'bg-surface border-border text-muted hover:text-ink'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {(() => {
              void lastUsageTick
              const u = getLastGeminiUsage()
              if (!u) return null
              return (
                <p className="text-[10px] text-muted/60 mt-2 leading-relaxed">
                  마지막 API: 입력 {u.usage.promptTokenCount ?? '?'} · 출력 {u.usage.candidatesTokenCount ?? '?'} 토큰
                  {u.label === 'chatReply' ? '' : ` (${u.label})`}
                  {' · '}개발자 도구 콘솔에도 기록됨
                </p>
              )
            })()}
          </div>
          <div>
            <p className="text-xs text-muted mb-2">지금까지 학습한 내 말투</p>
            <div className="flex flex-wrap gap-1.5">
              {styleChips.length ? styleChips.map((c) => (
                <span key={c} className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20">{c}</span>
              )) : <span className="text-xs text-muted">아직 수집 중...</span>}
              <span className="text-xs px-2.5 py-1 rounded-full bg-glow/10 text-glow border border-glow/20">
                샘플 {self.styleSamples.length}개
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted mb-2">대화에서 알게 된 것 (잠정)</p>
            {surfacedInsights.length ? (
              <div className="space-y-1">
                {surfacedInsights.map((i) => (
                  <div key={i.id} className="text-xs text-ink/80 flex items-start gap-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-glow/10 text-glow border border-glow/20 whitespace-nowrap mt-0.5">
                      {INSIGHT_LABELS[i.kind]}
                    </span>
                    <span className="leading-relaxed">{i.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted">
                아직 없음 · 대화가 쌓이면 조심스럽게 반영돼요{insightsAll.length ? ` (관찰 ${insightsAll.length}개 모으는 중)` : ''}
              </span>
            )}
          </div>
          <div>
            <p className="text-xs text-muted mb-2">데이터 보관</p>
            <p className="text-[11px] text-muted/70 mb-2">
              대화 {messages.length}개 · IndexedDB 저장
              {self.conversationSummary
                ? ` · 요약 ${self.summarizedMessageCount ?? 0}개까지 압축`
                : messages.length >= 36
                ? ' · 곧 대화 요약 시작'
                : ''}
              {apiHeavyProfile ? ' · API 경량 모드' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {self.conversationSummary ? (
                <Button size="sm" variant="secondary" onClick={handleResetPromptBulk}>
                  대화 요약 초기화
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => downloadBackup(self, messages)}>
                내보내기 (.json)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => importRef.current?.click()}>
                가져오기
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void handleImportFile(f)
                }}
              />
            </div>
            {importStatus === 'ok' && (
              <p className="text-[11px] text-status-ok mt-1.5">✓ 백업을 가져왔어요</p>
            )}
            {importStatus === 'fail' && (
              <p className="text-[11px] text-status-error mt-1.5">✕ 파일 형식이 맞지 않아요</p>
            )}
            <p className="text-[11px] text-muted/50 mt-1.5">
              다른 기기·브라우저로 옮기거나, 혹시 모를 분실 대비용이에요. API 키는 포함되지 않아요.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {!chatReady ? (
          <div className="flex justify-center py-12 text-sm text-muted">대화 불러오는 중…</div>
        ) : (
          <>
        {messages.length > 0 && (
          <ChatMessageList
            messages={messages}
            selfName={self.name}
            revealProgress={revealProgress}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEnterSelectMode={enterSelectMode}
          />
        )}
        {typing && (
          <div className="flex items-end gap-1.5">
            <div className="w-7 h-7 rounded-full chat-avatar flex items-center justify-center text-[11px] font-medium shrink-0">
              {self.name[0] ?? '나'}
            </div>
            <div className="chat-bubble-them px-3.5 py-3 flex gap-1">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
          </>
        )}
      </div>

      {chatReady && messages.length === 0 && !selectMode && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-[13px] px-3 py-2 rounded-full bg-bubble-me text-ink/90 hover:brightness-[1.03] whitespace-nowrap flex-shrink-0 transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {selectMode ? (
        <div className="px-4 py-3 border-t border-border/60 bg-surface shrink-0">
          <button
            type="button"
            onClick={deleteSelectedMessages}
            disabled={selectedIds.size === 0}
            className="w-full py-3.5 rounded-2xl text-[15px] font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed bg-surface-2 text-status-error hover:bg-status-error/10 border border-border/50"
          >
            삭제
          </button>
        </div>
      ) : (
      <div className="border-t border-border/60 bg-surface shrink-0">
        {showRetryBanner && retryBannerMessage ? (
          <div className="px-3 pt-2.5 pb-1.5 border-b border-border/40 bg-status-warn/5 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void retryReplyForMessage(retryBannerMessage.id)}
              className="flex-1 min-w-0 flex items-center gap-1.5 text-[12px] px-2.5 py-2 rounded-xl bg-surface border border-status-warn/30 text-ink/90 hover:bg-status-warn/10 transition-colors text-left"
              title={retryBannerMessage.content}
            >
              <span className="shrink-0 text-status-warn">↻</span>
              <span className="truncate">{retryBannerMessage.content}</span>
            </button>
            <button
              type="button"
              onClick={dismissRetryBanner}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-ink/5 transition-colors"
              aria-label="답 못 받은 말 배너 닫기"
            >
              ✕
            </button>
          </div>
        ) : null}
      {messages.length > 0 && (
        <div className="px-3 pt-2 -mb-0.5 flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={saveLastUserAsDilemma}
            className="text-[12px] px-2.5 py-1.5 rounded-full bg-surface-2 border border-border/50 text-ink/80 hover:text-ink hover:border-accent/40 transition-colors"
          >
            🔖 고민 저장
          </button>
          <button
            type="button"
            onClick={() => void addSmallActionQuick()}
            disabled={actionSuggesting || typing}
            className="text-[12px] px-2.5 py-1.5 rounded-full bg-surface-2 border border-border/50 text-ink/80 hover:text-ink hover:border-accent/40 transition-colors disabled:opacity-40"
          >
            {actionSuggesting ? '행동 떠올리는 중…' : '✅ 작은 행동'}
          </button>
          {toast && <span className="text-[11px] text-status-ok ml-0.5">{toast}</span>}
        </div>
      )}
      <div className="px-3 py-2.5">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="나에게 말 걸어봐..."
            className="flex-1 px-3.5 py-2.5 rounded-2xl bg-surface-2 border border-border/40 focus:border-accent/40 focus:outline-none text-ink placeholder:text-muted/60 text-[15px] resize-none leading-[1.45] overflow-y-auto"
          />
          <Button onClick={send} disabled={!input.trim() || typing || !chatReady} className="px-4 h-[42px] rounded-2xl text-sm">→</Button>
        </div>
      </div>
      </div>
      )}
    </div>
  )
}
