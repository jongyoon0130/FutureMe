import { useRef, useState } from 'react'
import { APP_NAME, APP_TAGLINE } from '../../lib/brand'
import { formatListTime, type ProfileSummary } from '../../lib/storage'
import { useAuth } from '../../contexts/AuthContext'
import { FutureMeLogo } from '../brand/FutureMeLogo'
import { SwipeableListRow } from './SwipeableListRow'

interface Props {
  summaries: ProfileSummary[]
  onSelect: (id: string) => void
  onCreateNew: () => void
  onRestoreBackup: (file: File) => void | Promise<void>
  onDelete: (id: string) => void | Promise<void>
}

export function ProfileListScreen({ summaries, onSelect, onCreateNew, onRestoreBackup, onDelete }: Props) {
  const { configured, user, signOut, uploadLocalData, syncing, lastSync } = useAuth()
  const hasProfiles = summaries.length > 0
  const importRef = useRef<HTMLInputElement>(null)
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'fail'>('idle')
  const [accountOpen, setAccountOpen] = useState(false)
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  const handleDelete = async (summary: ProfileSummary) => {
    if (
      !window.confirm(
        `'${summary.name}' 채팅방을 삭제할까요?\n대화와 프로필이 이 기기·클라우드에서 지워져요.`,
      )
    ) {
      return
    }
    setOpenRowId(null)
    await onDelete(summary.id)
  }

  const handleImportFile = async (file: File) => {
    setImportStatus('loading')
    try {
      await onRestoreBackup(file)
      setImportStatus('idle')
    } catch {
      setImportStatus('fail')
    }
  }

  const handleUpload = async () => {
    const result = await uploadLocalData()
    if (result && result.count > 0) {
      window.alert(`${result.count}개 프로필을 클라우드에 올렸어요.`)
    }
  }

  const syncLabel =
    lastSync?.mode === 'uploaded'
      ? '클라우드에 올림'
      : lastSync?.mode === 'downloaded'
        ? '클라우드에서 받음'
        : lastSync?.mode === 'merged'
          ? '동기화됨'
          : null

  return (
    <div className="h-full flex flex-col max-w-[480px] mx-auto">
      <header className="goal-nav sticky top-0 z-10">
        <div className="goal-crumb min-w-0 flex-1">
          <p className="goal-crumb-lv f">채팅</p>
          <h1>{APP_NAME}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {configured && user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-surface-2 text-xs font-medium text-ink hover:border-accent/40 hover:bg-accent/5 transition-colors overflow-hidden"
                title={user.email ?? '계정'}
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url as string}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (user.email?.[0] ?? 'G').toUpperCase()
                )}
              </button>
              {accountOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-20 cursor-default"
                    aria-label="메뉴 닫기"
                    onClick={() => setAccountOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-xl border border-border bg-surface shadow-lg py-1 text-sm">
                    <p className="px-3 py-2 text-[11px] text-muted truncate border-b border-border/60">
                      {user.email}
                    </p>
                    {syncLabel && (
                      <p className="px-3 py-1.5 text-[11px] text-accent">{syncLabel}</p>
                    )}
                    <button
                      type="button"
                      disabled={syncing}
                      onClick={() => {
                        setAccountOpen(false)
                        void handleUpload()
                      }}
                      className="w-full text-left px-3 py-2 text-ink hover:bg-ink/[0.04] disabled:opacity-50"
                    >
                      {syncing ? '동기화 중…' : '클라우드에 올리기'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false)
                        void signOut()
                      }}
                      className="w-full text-left px-3 py-2 text-muted hover:bg-ink/[0.04]"
                    >
                      로그아웃
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onCreateNew}
            className="goal-nav-btn"
            title="미래의 나 추가"
          >
            +
          </button>
        </div>
      </header>

      {!hasProfiles ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center animate-fade-up">
          <div className="mb-8">
            <FutureMeLogo size={72} />
          </div>
          <h2 className="text-xl font-medium text-ink mb-2">{APP_NAME}</h2>
          <p className="text-sm text-muted mb-3">{APP_TAGLINE}</p>
          <p className="text-sm text-muted max-w-xs leading-relaxed mb-8">
            가치관·말투까지 세팅한
            <br />
            5년 뒤 목표하는 나와 대화해보세요.
          </p>
          <div className="w-full max-w-xs space-y-3">
            <button type="button" onClick={onCreateNew} className="goal-cta">
              미래의 나 만들기
            </button>
            <button
              type="button"
              disabled={importStatus === 'loading'}
              onClick={() => importRef.current?.click()}
              className="goal-mode-card w-full"
              style={{ alignItems: 'center', textAlign: 'center' }}
            >
              {importStatus === 'loading' ? '불러오는 중…' : '백업에서 불러오기 (.json)'}
            </button>
          </div>
          {importStatus === 'fail' && (
            <p className="text-xs text-status-error mt-3">파일 형식이 맞지 않아요</p>
          )}
          <p className="text-[11px] text-muted/60 mt-4 max-w-xs leading-relaxed">
            다른 기기·브라우저에서 내보낸 futureme-backup 파일을 바로 복원할 수 있어요.
          </p>
        </div>
      ) : (
        <>
          <p className="px-5 py-2.5 text-[11px] text-muted/80 border-b border-border/50 bg-surface-2/50 flex items-center justify-between">
            <span>채팅방</span>
            <button
              type="button"
              disabled={importStatus === 'loading'}
              onClick={() => importRef.current?.click()}
              className="text-accent hover:underline disabled:opacity-50"
            >
              {importStatus === 'loading' ? '불러오는 중…' : '백업 가져오기'}
            </button>
          </p>
          {importStatus === 'fail' && (
            <p className="px-5 py-1 text-[11px] text-status-error">파일 형식이 맞지 않아요</p>
          )}
          <ul className="flex-1 overflow-y-auto divide-y divide-border/60">
            {summaries.map((s) => (
              <li key={s.id}>
                <SwipeableListRow
                  open={openRowId === s.id}
                  onOpenChange={(open) => {
                    if (open) setOpenRowId(s.id)
                    else if (openRowId === s.id) setOpenRowId(null)
                  }}
                  onPress={() => onSelect(s.id)}
                  onDelete={() => void handleDelete(s)}
                >
                  <div className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink/[0.03] active:bg-ink/[0.05] transition-colors text-left">
                    <div className="w-11 h-11 rounded-2xl chat-avatar flex items-center justify-center text-base font-medium shrink-0">
                      {s.name[0] ?? '나'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span className="font-medium text-ink truncate">{s.name}</span>
                        <span className="text-[11px] text-muted shrink-0">{formatListTime(s.updatedAt)}</span>
                      </div>
                      <p className="text-sm text-muted truncate leading-snug">{s.preview}</p>
                    </div>
                  </div>
                </SwipeableListRow>
              </li>
            ))}
          </ul>
        </>
      )}

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
  )
}
