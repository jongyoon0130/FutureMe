import { useCallback, useEffect, useState } from 'react'
import {
  describeNotifyBlocker,
  readNotifyEnv,
  requestNotifyPermission,
  showTestNotification,
  type NotifyEnv,
} from '../../lib/notify'
import { Button } from '../ui'

/**
 * 알림 설정 — 단계 0(관문).
 *
 * 여기서 확인하려는 건 딱 하나다: **이 기기에서 알림이 뜨긴 하나.**
 * 서버는 아직 없다. 그래서 "테스트 알림"은 기기가 스스로 띄우는 것이고,
 * 시간 맞춰 오는 진짜 알림은 다음 단계에서 붙는다.
 */
export function NotifySettings() {
  const [env, setEnv] = useState<NotifyEnv>(() => readNotifyEnv())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  return (
    <div>
      <p className="text-xs text-muted mb-1">알림 (준비 중 — 지금은 테스트만)</p>
      <p className="text-[11px] text-muted/70 mb-2 leading-relaxed">
        시간을 적어둔 할 일에 알림을 보내는 기능을 만들고 있어. 먼저 <strong className="font-medium">이 기기에서
        알림이 뜨는지</strong>부터 확인하는 단계야.
      </p>
      <p className="text-[11px] text-muted/60 mb-2.5 leading-relaxed">
        테스트 알림은 <strong className="font-medium">앱을 열어둔 동안에만</strong> 떠. 앱을 닫으면 타이머도 같이
        멈추거든 — 꺼져 있을 때도 오게 하는 게 다음 단계(서버)야.
      </p>

      <div className="space-y-1 mb-2.5">
        <CheckLine ok={env.standalone} label="홈 화면에 설치됨" hint={env.isIOS ? '아이폰은 필수' : '선택'} />
        <CheckLine ok={env.permission === 'granted'} label="알림 권한" hint={env.permission} />
        <CheckLine ok={env.supportsServiceWorker} label="알림 수신기(서비스 워커)" />
        <CheckLine ok={env.supportsPush} label="서버 알림 지원" hint="2단계에서 필요" />
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
      </div>

      {message ? <p className="text-[11px] text-muted mt-2 leading-relaxed">{message}</p> : null}
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
