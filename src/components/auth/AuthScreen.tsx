import { useState } from 'react'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { FutureMeLogo } from '../brand/FutureMeLogo'
import { useAuth } from '../../contexts/AuthContext'
import { hasLocalData } from '../../lib/syncOrchestrator'

export function AuthScreen() {
  const { signInWithGoogle, syncing } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleGoogle = async () => {
    setError(null)
    setPending(true)
    try {
      await signInWithGoogle()
    } catch {
      setError('구글 로그인에 실패했어요. 다시 시도해주세요.')
      setPending(false)
    }
  }

  const localHint = hasLocalData()

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 bg-void">
      <div className="w-full max-w-sm text-center">
        <FutureMeLogo size={72} className="mx-auto mb-6" />
        <h1 className="text-xl font-medium text-ink mb-2">{APP_NAME}</h1>
        <p className="text-sm text-muted mb-8 leading-relaxed">{APP_TAGLINE}</p>

        {localHint && (
          <p className="text-xs text-muted/90 mb-4 leading-relaxed px-2">
            이 기기에 저장된 프로필·채팅이 있어요.
            <br />
            로그인하면 계정에 올려 다른 기기에서도 쓸 수 있어요.
          </p>
        )}

        <button
          type="button"
          disabled={pending || syncing}
          onClick={() => void handleGoogle()}
          className="w-full py-3.5 px-4 rounded-2xl bg-surface border border-border text-ink font-medium hover:border-accent/40 hover:bg-accent/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span className="text-lg" aria-hidden>
            G
          </span>
          {pending || syncing ? '연결 중…' : 'Google로 계속하기'}
        </button>

        {error && <p className="text-xs text-status-error mt-3">{error}</p>}

        <p className="text-[11px] text-muted/60 mt-6 leading-relaxed">
          로그인하면 프로필·채팅이 클라우드에 저장돼요.
          <br />
          Gemini API 키는 이 기기에만 남아요.
        </p>
      </div>
    </div>
  )
}
