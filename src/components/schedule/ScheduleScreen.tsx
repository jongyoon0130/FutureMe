export function ScheduleScreen() {
  return (
    <div className="h-full flex flex-col max-w-[480px] mx-auto">
      <header className="goal-nav">
        <div className="goal-crumb">
          <p className="goal-crumb-lv f">스케줄</p>
          <h1>일정</h1>
        </div>
      </header>

      <div className="goal-scroll flex-1 flex flex-col items-center justify-center text-center">
        <div
          className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-4"
          style={{ background: 'var(--goal-accent-soft)', color: 'var(--goal-accent-deep)' }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </div>
        <p className="goal-empty max-w-xs">
          스케줄 화면은 준비 중이에요.
          <br />
          일정·루틴 관리가 여기에 들어갈 예정이에요.
        </p>
      </div>
    </div>
  )
}
