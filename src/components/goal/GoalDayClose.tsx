import { useEffect, useState } from 'react'
import type { GoalPlan } from '../../types/goalPlan'
import {
  DAY_CLOSE_MOODS,
  buildClosingMessage,
  dayCloseStreak,
  dayKey,
  loadDayCloses,
  readChatPersonaLite,
  removeDayClose,
  saveDayClose,
  type DayCloseRecord,
} from '../../lib/dayClose'

interface Props {
  ownerId: string
  /** 달력에서 선택한 날 — 오늘이면 마감 가능, 과거면 그날의 기록을 보여준다 */
  selectedDate: Date
  /** 오늘(일간) 완료/전체 — 마감 메시지의 근거 */
  done: number
  total: number
  /** 미달 패턴(본인 표현)을 찾기 위한 목표 목록 */
  plans: GoalPlan[]
  /** 마감 후 미래의 나에게 이어 말하기 (채팅 프리필) */
  onTellFuture?: (prompt: string) => void
}

/**
 * 하루 마감 — 감정 칩 + 한 줄을 남기면 미래의 나가 마감 인사를 건넨다.
 * 못 한 날에는 사용자가 직접 쓴 편지·미달 답변을 근거로, 다그치지 않고 일으킨다.
 * 기록은 언제든 고치고 지울 수 있다 — 내 기록의 주인은 나다.
 */
export function GoalDayClose({ ownerId, selectedDate, done, total, plans, onTellFuture }: Props) {
  const [records, setRecords] = useState<DayCloseRecord[]>(() => loadDayCloses(ownerId))
  const [formOpen, setFormOpen] = useState(false)
  const [mood, setMood] = useState<string>(DAY_CLOSE_MOODS[0])
  const [note, setNote] = useState('')

  const today = dayKey()
  const selectedKey = dayKey(selectedDate)
  const isToday = selectedKey === today
  const record = records.find((r) => r.date === selectedKey) ?? null
  const isEvening = new Date().getHours() >= 19

  // 다른 날짜로 이동하면 열려 있던 폼은 닫는다
  useEffect(() => {
    setFormOpen(false)
  }, [selectedKey])

  const openForm = () => {
    setMood(record?.mood ?? DAY_CLOSE_MOODS[0])
    setNote(record?.note ?? '')
    setFormOpen(true)
  }

  const save = () => {
    const persona = readChatPersonaLite()
    const fearedPattern = plans
      .map((p) => p.motivation?.['failure-pattern']?.trim())
      .find((v): v is string => !!v)
    // 수정이면 그날의 완료 수를 유지하고, 새 마감이면 지금의 오늘 수치를 쓴다
    const counts = record ? { done: record.done, total: record.total } : { done, total }
    const others = records.filter((r) => r.date !== selectedKey)
    const streak = dayCloseStreak(others, selectedDate) + 1
    const next: DayCloseRecord = {
      date: selectedKey,
      mood,
      note: note.trim() || undefined,
      ...counts,
      message: buildClosingMessage({
        ...counts,
        mood,
        adviceLine: persona.adviceLine,
        fearedPattern,
        streak,
      }),
      closedAt: Date.now(),
    }
    setRecords(saveDayClose(ownerId, next))
    setFormOpen(false)
  }

  const remove = () => {
    if (!window.confirm('이 마감 기록을 지울까요?')) return
    setRecords(removeDayClose(ownerId, selectedKey))
    setFormOpen(false)
  }

  if (formOpen) {
    return (
      <section className="goal-dayclose">
        <p className="goal-dayclose-tag">
          {record ? '마감 기록 고치기' : '오늘은 어떤 기분으로 끝나?'}
        </p>
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
          <button type="button" className="goal-dayclose-cancel" onClick={() => setFormOpen(false)}>
            {record ? '취소' : '나중에'}
          </button>
          <button type="button" className="goal-dayclose-btn" onClick={save}>
            {record ? '다시 저장' : '마감하기'}
          </button>
        </div>
      </section>
    )
  }

  if (record) {
    const dateLabel = isToday
      ? '오늘 마감 완료'
      : `${Number(selectedKey.slice(5, 7))}월 ${Number(selectedKey.slice(8, 10))}일 마감 기록`
    return (
      <section className="goal-dayclose closed">
        <div className="goal-dayclose-row">
          <p className="goal-dayclose-tag">
            {dateLabel} · {record.mood} · {record.done}/{record.total}
          </p>
          <div className="goal-dayclose-manage">
            <button type="button" onClick={openForm}>
              고치기
            </button>
            <button type="button" onClick={remove}>
              지우기
            </button>
          </div>
        </div>
        <p className="goal-dayclose-msg">{record.message}</p>
        {record.note ? <p className="goal-dayclose-note">내가 남긴 말: “{record.note}”</p> : null}
        <p className="goal-dayclose-from">— 5년 뒤의 나</p>
        {isToday && onTellFuture ? (
          <button
            type="button"
            className="goal-dayclose-talk"
            onClick={() =>
              onTellFuture(
                `오늘 하루를 마감하면서 '${record.mood}'라고 남겼어${record.note ? ` — "${record.note}"` : ''}. 조금 더 얘기하고 싶어.`,
              )
            }
          >
            미래의 나에게 더 말하기 →
          </button>
        ) : null}
      </section>
    )
  }

  // 과거 날짜인데 기록이 없으면 아무것도 보여주지 않는다 (마감은 오늘만 가능)
  if (!isToday) return null

  return (
    <section className={`goal-dayclose ${isEvening ? 'evening' : ''}`}>
      <div className="goal-dayclose-row">
        <div>
          <p className="goal-dayclose-tag">{isEvening ? '하루를 마감할 시간이야' : '하루 마감'}</p>
          <p className="goal-dayclose-sub">
            오늘 {done}/{total} · 기분 하나만 남기면 미래의 내가 인사할게
          </p>
        </div>
        <button type="button" className="goal-dayclose-btn" onClick={openForm}>
          마감하기
        </button>
      </div>
    </section>
  )
}
