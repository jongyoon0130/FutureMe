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
  isPushSubscriptionSaved,
  savePushSubscription,
} from '../../lib/pushSubscriptions'
import { describePushSendResult, requestServerPush } from '../../lib/pushSend'
import { Button } from '../ui'

/**
 * 알림 설정 — 단계 0 · 1-a · 1-b.
 *
 * 0   이 기기에서 알림이 뜨긴 하나 (테스트 알림)          ✅ 통과
 * 1-a 이 기기가 배송 주소를 받을 수 있나 (푸시 주소 발급)  ✅ 통과
 * 1-b 그 주소를 서버가 알게 하기 (여기서 저장)
 *
 * 여전히 **서버가 보내지는 않는다.** 시간 맞춰 오는 진짜 알림은 2단계다.
 */
export function NotifySettings() {
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  /** 1-a: 지금 이 기기에 발급된 배송 주소 (없으면 null) */
  const [endpoint, setEndpoint] = useState<string | null>(null)
  /** 1-b: 그 주소가 서버에도 저장돼 있나 */
  const [saved, setSaved] = useState(false)

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
      setSaved(sub ? await isPushSubscriptionSaved(sub.endpoint) : false)
    })
    return () => {
      alive = false
    }
  }, [])

  const blocker = describeNotifyBlocker(env)
  const canTest = env.permission === 'granted' && !blocker

  const handleEnable = async () => {
    setBusy(true)
    setMessage(null)
    const result = await requestNotifyPermission()
    refresh()
    setBusy(false)
    if (result === 'granted') setMessage('알림을 켰어. 아래 테스트를 눌러봐.')
    else if (result === 'denied') setMessage('거절됐어. 기기 설정에서 알림을 허용해야 켤 수 있어.')
    else if (result === 'unsupported') setMessage('이 브라우저는 알림을 지원하지 않아.')
    else setMessage(null)
  }

  const handleTest = async () => {
    setBusy(true)
    setMessage('5초 뒤에 알림이 떠. 앱을 열어둔 채로 기다려줘.')
    const result = await showTestNotification(5000)
    setBusy(false)
    if (result.ok) setMessage('알림을 보냈어. 안 떴으면 기기 알림 설정을 확인해줘.')
    else if (result.reason === 'denied') setMessage('먼저 알림을 켜야 해.')
    else if (result.reason === 'no_worker') setMessage('알림 수신기가 아직 준비 안 됐어 — 새로고침하고 다시.')
    else if (result.reason === 'unsupported') setMessage('이 브라우저는 알림을 지원하지 않아.')
    else setMessage(`실패했어${result.detail ? ` (${result.detail})` : ''}`)
  }

  const handleSubscribe = async () => {
    setBusy(true)
    setMessage('주소를 발급받는 중…')
    const result = await subscribeToPush()
    setEndpoint(result.ok ? result.endpoint : null)

    if (!result.ok) {
      setBusy(false)
      setSaved(false)
      setMessage(describePushSubscribeResult(result))
      return
    }

    // 1-b: 발급에 성공했으면 곧바로 서버에 적어둔다 (서버가 모르면 못 쏜다)
    setMessage('서버에 저장하는 중…')
    const sub = await readPushSubscription()
    const save = sub
      ? await savePushSubscription(sub)
      : ({ ok: false, reason: 'failed', detail: '주소를 다시 읽지 못했어' } as const)
    setBusy(false)
    setSaved(save.ok)
    setMessage(`${describePushSubscribeResult(result)}\n${describePushSaveResult(save)}`)
  }

  const handleUnsubscribe = async () => {
    setBusy(true)
    // 서버 기록부터 지운다 — 남겨두면 서버가 죽은 주소로 계속 쏘게 된다
    if (endpoint) await deletePushSubscription(endpoint)
    const dropped = await unsubscribeFromPush()
    setBusy(false)
    setEndpoint(null)
    setSaved(false)
    setMessage(dropped ? '발급받은 주소를 버렸어. 다시 눌러보면 새로 받아.' : '버릴 주소가 없었어.')
  }

  // 2-a: 서버에게 한 발 쏴달라고 부탁한다. 부탁만 하고 앱은 꺼도 된다
  const handleServerPush = async () => {
    setBusy(true)
    setMessage('서버에 부탁하는 중…')
    const result = await requestServerPush()
    setBusy(false)
    setMessage(describePushSendResult(result))
  }

  return (
    <div>
      <p className="text-xs text-muted mb-1">알림 (준비 중 — 서버 발송 시험 단계)</p>
      <p className="text-[11px] text-muted/70 mb-2 leading-relaxed">
        시간을 적어둔 할 일에 알림을 보내는 기능을 만들고 있어. 이 기기 주소를{' '}
        <strong className="font-medium">서버가 알고 있는</strong> 데까지 왔고, 지금은{' '}
        <strong className="font-medium">앱이 꺼져 있어도 오는지</strong>를 확인하는 단계야.
      </p>
      <p className="text-[11px] text-muted/60 mb-2.5 leading-relaxed">
        <strong className="font-medium">5초 뒤 테스트 알림</strong>은 앱을 열어둔 동안에만 떠 (타이머가 앱 안에서
        돌거든). <strong className="font-medium">서버에서 보내보기</strong>는 달라 — 누르고 앱을 완전히 꺼도 와야 해.
      </p>

      <div className="space-y-1 mb-2.5">
        <CheckLine ok={env.standalone} label="홈 화면에 설치됨" hint={env.isIOS ? '아이폰은 필수' : '선택'} />
        <CheckLine ok={env.permission === 'granted'} label="알림 권한" hint={env.permission} />
        <CheckLine ok={env.supportsServiceWorker} label="알림 수신기(서비스 워커)" />
        <CheckLine ok={env.supportsPush} label="서버 알림 지원" hint="브라우저 기능만 확인" />
        <CheckLine
          ok={endpoint !== null}
          label="푸시 주소 발급됨"
          hint={endpoint ? pushServiceHost(endpoint) : '아직 안 받음'}
        />
        <CheckLine ok={saved} label="서버에 저장됨" hint={saved ? '서버가 이 기기를 앎' : '2단계에 필요'} />
      </div>

      {env.isIOS && !env.standalone ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">
          아이폰은 <strong className="font-medium">공유 → 홈 화면에 추가</strong>로 설치한 뒤,
          그 아이콘으로 열어야 알림을 켤 수 있어. 사파리 탭에서는 안 돼.
        </p>
      ) : null}

      {blocker && !(env.isIOS && !env.standalone) ? (
        <p className="text-[11px] text-status-warn mb-2 leading-relaxed">{blocker}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleEnable}
          disabled={busy || env.permission === 'granted' || !!blocker}
        >
          {env.permission === 'granted' ? '알림 켜짐' : '알림 켜기'}
        </Button>
        <Button size="sm" variant="secondary" onClick={handleTest} disabled={busy || !canTest}>
          5초 뒤 테스트 알림
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleSubscribe}
          disabled={busy || !canTest || !env.supportsPush || !hasVapidKey}
        >
          푸시 주소 발급
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

      {!hasVapidKey ? (
        <p className="text-[11px] text-status-warn mt-2 leading-relaxed">
          VAPID 공개키가 아직 앱에 안 들어가 있어 — 배포 환경변수{' '}
          <code className="font-mono">VITE_VAPID_PUBLIC_KEY</code>를 설정하면 발급을 시험할 수 있어.
        </p>
      ) : null}

      {message ? (
        <p className="text-[11px] text-muted mt-2 leading-relaxed whitespace-pre-line">{message}</p>
      ) : null}

      {endpoint ? (
        <p className="text-[10px] text-muted/60 mt-1.5 leading-relaxed break-all font-mono">
          {endpoint.slice(0, 72)}
          {endpoint.length > 72 ? '…' : ''}
        </p>
      ) : null}
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
