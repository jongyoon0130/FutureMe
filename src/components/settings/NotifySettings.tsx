import { useCallback, useEffect, useState } from 'react'
import {
  describeNotifyBlocker,
  describePushSubscribeResult,
  pushServiceHost,
  readNotifyEnv,
  readPushSubscription,
  readVapidPublicKey,
  requestNotifyPermission,
  showTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
  type NotifyEnv,
} from '../../lib/notify'
import {
  deletePushSubscription,
  describePushSaveResult,
  getPushEnabled,
  isPushSubscriptionSaved,
  savePushSubscription,
  setPushEnabled,
} from '../../lib/pushSubscriptions'
import { describePushSendResult, requestServerPush } from '../../lib/pushSend'
import { Button } from '../ui'

/**
 * 알림 설정.
 *
 * 일반 사용자가 보는 것은 딱 하나다: **알림 켜기** 한 번(권한 요청 → 주소 발급 →
 * 서버 저장을 자동으로) 그리고 켜진 뒤엔 **이 기기 토글**. 진단 6줄·테스트 버튼 등
 * 개발/문제해결용은 "문제가 있나요?" 안에 접어둔다.
 */
export function NotifySettings() {
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /** 이 기기에 발급된 배송 주소 (없으면 null) */
  const [endpoint, setEndpoint] = useState<string | null>(null)
  /** 그 주소가 서버에 저장돼 있나 */
  const [saved, setSaved] = useState(false)
  /** 이 기기 알림 스위치 (서버 enabled 값). 저장 전이면 null */
  const [enabled, setEnabled] = useState<boolean | null>(null)

  const hasVapidKey = readVapidPublicKey() !== null

  const refresh = useCallback(() => setEnv(readNotifyEnv()), [])

  useEffect(() => {
    // 홈 화면에서 열었는지, 권한이 바뀌었는지 되돌아왔을 때 다시 읽는다
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refresh])

  useEffect(() => {
    let alive = true
    void readPushSubscription().then(async (sub) => {
      if (!alive) return
      setEndpoint(sub?.endpoint ?? null)
      if (sub) {
        setSaved(await isPushSubscriptionSaved(sub.endpoint))
        setEnabled(await getPushEnabled(sub.endpoint))
      } else {
        setSaved(false)
        setEnabled(null)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const blocker = describeNotifyBlocker(env)
  const canTest = env.permission === 'granted' && !blocker
  /** 알림을 켤 수 있는 기기인가 (막는 이유 없음 + VAPID 키 있음) */
  const canTurnOn = !blocker && env.supportsPush && hasVapidKey
  /** 켜짐 = 주소 발급 + 서버 저장 + 스위치 on */
  const isOn = saved && enabled === true

  // 알림 켜기 — 권한 → 주소 발급 → 서버 저장을 한 번에
  const handleTurnOn = async () => {
    setBusy(true)
    setMessage(null)

    if (env.permission !== 'granted') {
      const perm = await requestNotifyPermission()
      refresh()
      if (perm !== 'granted') {
        setBusy(false)
        setMessage(
          perm === 'denied'
            ? '알림이 거절됐어. 기기 설정에서 알림을 허용한 뒤 다시 켜줘.'
            : '이 브라우저는 알림을 지원하지 않아.',
        )
        return
      }
    }

    setMessage('알림을 켜는 중…')
    const result = await subscribeToPush()
    if (!result.ok) {
      setBusy(false)
      setEndpoint(null)
      setSaved(false)
      setEnabled(null)
      setMessage(describePushSubscribeResult(result))
      return
    }
    setEndpoint(result.endpoint)

    const sub = await readPushSubscription()
    const save = sub
      ? await savePushSubscription(sub)
      : ({ ok: false, reason: 'failed', detail: '주소를 다시 읽지 못했어' } as const)
    setBusy(false)
    setSaved(save.ok)
    setEnabled(save.ok ? true : null)
    setMessage(save.ok ? '알림을 켰어. 시간을 적어둔 할 일에 그 시각 알림이 와.' : describePushSaveResult(save))
  }

  // 이 기기 토글 — 주소는 그대로 두고 enabled만 바꾼다
  const handleToggleDevice = async () => {
    if (!endpoint || enabled === null) return
    const next = !enabled
    setBusy(true)
    setEnabled(next) // 낙관적 반영
    const ok = await setPushEnabled(endpoint, next)
    setBusy(false)
    if (!ok) {
      setEnabled(!next) // 실패 시 되돌림
      setMessage('설정을 저장하지 못했어. 잠시 뒤 다시 시도해줘.')
    } else {
      setMessage(next ? '이 기기 알림을 켰어.' : '이 기기 알림을 껐어. 다시 켤 수 있어.')
    }
  }

  // --- 아래는 "문제가 있나요?" 안의 진단/개발용 동작 ---

  const handleTest = async () => {
    setBusy(true)
    setMessage('5초 뒤에 알림이 떠. 앱을 열어둔 채로 기다려줘.')
    const result = await showTestNotification(5000)
    setBusy(false)
    if (result.ok) setMessage('테스트 알림을 보냈어. 안 떴으면 기기 알림 설정을 확인해줘.')
    else if (result.reason === 'denied') setMessage('먼저 알림을 켜야 해.')
    else if (result.reason === 'no_worker') setMessage('알림 수신기가 아직 준비 안 됐어 — 새로고침하고 다시.')
    else if (result.reason === 'unsupported') setMessage('이 브라우저는 알림을 지원하지 않아.')
    else setMessage(`실패했어${result.detail ? ` (${result.detail})` : ''}`)
  }

  const handleServerPush = async () => {
    setBusy(true)
    setMessage('서버에 부탁하는 중…')
    const result = await requestServerPush()
    setBusy(false)
    setMessage(describePushSendResult(result))
  }

  const handleUnsubscribe = async () => {
    setBusy(true)
    if (endpoint) await deletePushSubscription(endpoint)
    const dropped = await unsubscribeFromPush()
    setBusy(false)
    setEndpoint(null)
    setSaved(false)
    setEnabled(null)
    setMessage(dropped ? '주소를 버렸어. "알림 켜기"를 누르면 새로 받아.' : '버릴 주소가 없었어.')
  }

  return (
    <div>
      <p className="text-xs text-muted mb-1">알림</p>
      <p className="text-[11px] text-muted/70 mb-2.5 leading-relaxed">
        시간을 적어둔 할 일에, 그 시각이 되면 알림을 보내줘. 앱이 꺼져 있어도 와.
      </p>

      {/* 아이폰인데 홈 화면 미설치 — 알림 자체가 불가하니 설치부터 안내 */}
      {env.isIOS && !env.standalone ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">
          아이폰은 <strong className="font-medium">공유 → 홈 화면에 추가</strong>로 설치한 뒤,
          그 아이콘으로 열어야 알림을 켤 수 있어. 사파리 탭에서는 안 돼.
        </p>
      ) : blocker ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">{blocker}</p>
      ) : !hasVapidKey ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">
          알림 키가 아직 앱에 안 들어가 있어 (배포 환경변수{' '}
          <code className="font-mono">VITE_VAPID_PUBLIC_KEY</code>).
        </p>
      ) : isOn ? (
        // 켜짐 — 이 기기 토글
        <div className="flex items-center justify-between rounded-lg border border-border/40 bg-surface/40 px-3 py-2 mb-1">
          <span className="text-xs text-ink/80">
            이 기기 알림 <span className="text-status-ok">켜짐</span>
          </span>
          <Button size="sm" variant="secondary" onClick={handleToggleDevice} disabled={busy}>
            끄기
          </Button>
        </div>
      ) : saved && enabled === false ? (
        // 저장돼 있지만 이 기기에서 꺼둠
        <div className="flex items-center justify-between rounded-lg border border-border/40 bg-surface/40 px-3 py-2 mb-1">
          <span className="text-xs text-muted">이 기기 알림 꺼짐</span>
          <Button size="sm" variant="primary" onClick={handleToggleDevice} disabled={busy}>
            켜기
          </Button>
        </div>
      ) : (
        // 아직 안 켬 — 한 번에 켜기
        <Button size="sm" variant="primary" onClick={handleTurnOn} disabled={busy || !canTurnOn}>
          알림 켜기
        </Button>
      )}

      {message ? (
        <p className="text-[11px] text-muted mt-2 leading-relaxed whitespace-pre-line">{message}</p>
      ) : null}

      {/* 진단·테스트·개발용 — 평소엔 접혀 있다 */}
      <details className="mt-3 group">
        <summary className="text-[11px] text-muted/70 cursor-pointer select-none list-none hover:text-muted">
          문제가 있나요? <span className="text-muted/50">(진단·테스트)</span>
        </summary>

        <div className="mt-2 space-y-1">
          <CheckLine ok={env.standalone} label="홈 화면에 설치됨" hint={env.isIOS ? '아이폰은 필수' : '선택'} />
          <CheckLine ok={env.permission === 'granted'} label="알림 권한" hint={env.permission} />
          <CheckLine ok={env.supportsServiceWorker} label="알림 수신기(서비스 워커)" />
          <CheckLine ok={env.supportsPush} label="서버 알림 지원" hint="브라우저 기능만 확인" />
          <CheckLine
            ok={endpoint !== null}
            label="푸시 주소 발급됨"
            hint={endpoint ? pushServiceHost(endpoint) : '아직 안 받음'}
          />
          <CheckLine ok={saved} label="서버에 저장됨" hint={saved ? '서버가 이 기기를 앎' : '알림 켜면 저장됨'} />
        </div>

        <div className="flex flex-wrap gap-2 mt-2.5">
          <Button size="sm" variant="secondary" onClick={handleTest} disabled={busy || !canTest}>
            5초 뒤 테스트 알림
          </Button>
          {saved ? (
            <Button size="sm" variant="secondary" onClick={handleServerPush} disabled={busy}>
              서버에서 보내보기
            </Button>
          ) : null}
          {endpoint ? (
            <Button size="sm" variant="secondary" onClick={handleUnsubscribe} disabled={busy}>
              주소 버리기
            </Button>
          ) : null}
        </div>

        {endpoint ? (
          <p className="text-[10px] text-muted/60 mt-2 leading-relaxed break-all font-mono">
            {endpoint.slice(0, 72)}
            {endpoint.length > 72 ? '…' : ''}
          </p>
        ) : null}
      </details>
    </div>
  )
}

function CheckLine({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className={ok ? 'text-status-ok' : 'text-muted/50'}>{ok ? '●' : '○'}</span>
      <span className={ok ? 'text-ink/80' : 'text-muted'}>{label}</span>
      {hint ? <span className="text-muted/50">· {hint}</span> : null}
    </div>
  )
}
