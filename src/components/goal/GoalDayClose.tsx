import { useState } from 'react'
import type { GoalPlan } from '../../types/goalPlan'
import {
  DAY_CLOSE_MOODS,
  buildClosingMessage,
  dayCloseStreak,
  dayKey,
  loadDayCloses,
  readChatPersonaLite,
  saveDayClose,
  type DayCloseRecord,
} from '../../lib/dayClose'

interface Props {
  ownerId: string
  /** 오늘(일간) 완료/전체 — 마감 메시지의 근거 */
  done: number
  total: number
  /** 미달 패턴(본인 표현)을 찾기 위한 목표 목록 */
  plans: GoalPlan[]
}

/**
 * 하루 마감 — 감정 칩 + 한 줄을 남기면 미래의 나가 마감 인사를 건넨다.
 * 못 한 날에는 사용자가 직접 쓴 편지·미달 답변을 근거로, 다그치지 않고 일으킨다.
 */
export function GoalDayClose({ ownerId, done, total, plans }: Props) {
  const [records, setRecords] = useState<DayCloseRecord[]>(() => loadDayCloses(ownerId))
  const [open, setOpen] = useState(false)
  const [mood, setMood] = useState<string>(DAY_CLOSE_MOODS[0])
  const [note, setNote] = useState('')

  const today = dayKey()
  const todayRecord = records.find((r) => r.date === today) ?? null
  const isEvening = new Date().getHours() >= 19

  const close = () => {
    const persona = readChatPersonaLite()
    const fearedPattern = plans
      .map((p) => p.motivation?.['failure-pattern']?.trim())
      .find((v): v is string => !!v)
    const streak = dayCloseStreak(records) + 1 // 오늘 포함
    const record: DayCloseRecord = {
      date: today,
      mood,
      note: note.trim() || undefined,
      done,
      total,
      message: buildClosingMessage({
        done,
        total,
        mood,
        adviceLine: persona.adviceLine,
        fearedPattern,
        streak,
      }),
      closedAt: Date.now(),
    }
    setRecords(saveDayClose(ownerId, record))
    setOpen(false)
    setNote('')
  }

  if (todayRecord) {
    return (
      <section className="goal-dayclose closed">
        <p className="goal-dayclose-tag">
          오늘 마감 완료 · {todayRecord.mood} · {todayRecord.done}/{todayRecord.total}
        </p>
        <p className="goal-dayclose-msg">{todayRecord.message}</p>
        {todayRecord.note ? <p className="goal-dayclose-note">내가 남긴 말: “{todayRecord.note}”</p> : null}
        <p className="goal-dayclose-from">— 5년 뒤의 나</p>
      </section>
    )
  }

  if (!open) {
    return (
      <section className={`goal-dayclose ${isEvening ? 'evening' : ''}`}>
        <div className="goal-dayclose-row">
          <div>
            <p className="goal-dayclose-tag">{isEvening ? '하루를 마감할 시간이야' : '하루 마감'}</p>
            <p className="goal-dayclose-sub">
              오늘 {done}/{total} · 기분 하나만 남기면 미래의 내가 인사할게
            </p>
          </div>
          <button type="button" className="goal-dayclose-btn" onClick={() => setOpen(true)}>
            마감하기
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="goal-dayclose">
      <p className="goal-dayclose-tag">오늘은 어떤 기분으로 끝나?</p>
      <div className="goal-dayclose-moods">
        {DAY_CLOSE_MOODS.map((m) => (
          <button
            key={m}
            type="button"
            className={`goal-dayclose-mood ${mood === m ? 'on' : ''}`}
            onClick={() => setMood(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <textarea
        className="goal-dayclose-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="오늘에 대해 한 줄 (선택)"
        rows={2}
        maxLength={140}
      />
      <div className="goal-dayclose-actions">
        <button type="button" className="goal-dayclose-cancel" onClick={() => setOpen(false)}>
          나중에
        </button>
        <button type="button" className="goal-dayclose-btn" onClick={close}>
          마감하기
        </button>
      </div>
    </section>
  )
}
