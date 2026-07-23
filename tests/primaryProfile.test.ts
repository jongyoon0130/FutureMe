// 주 프로필 — 채팅·홈·프로필 세 탭이 같은 사람을 보게 하는 한 곳
// 여기가 흔들리면 탭마다 다른 "나"가 보인다 (그게 이 변경 전의 상태였다).
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

const store = new Map<string, string>()

// storage.ts가 localStorage를 쓰므로 최소한만 흉내낸다
beforeEach(() => {
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage
})

function seedSummaries(list: { id: string; name: string; updatedAt: number }[]) {
  store.set(
    'futureme-profiles-index',
    JSON.stringify(list.map((s) => ({ ...s, preview: '', lastMessageAt: s.updatedAt }))),
  )
}

async function load() {
  // localStorage를 심은 뒤에 불러와야 한다
  return await import('../src/lib/primaryProfile')
}

describe('getPrimaryProfileId', () => {
  it('프로필이 없으면 null (= 온보딩 대상)', async () => {
    const { getPrimaryProfileId } = await load()
    expect(getPrimaryProfileId()).toBeNull()
  })

  it('정한 적 없으면 가장 최근에 쓴 프로필', async () => {
    seedSummaries([
      { id: 'new', name: '나', updatedAt: 200 },
      { id: 'old', name: '옛날', updatedAt: 100 },
    ])
    const { getPrimaryProfileId } = await load()
    expect(getPrimaryProfileId()).toBe('new')
  })

  it('한 번 정하면 그걸 유지한다 (목록 순서가 바뀌어도)', async () => {
    seedSummaries([
      { id: 'a', name: 'A', updatedAt: 200 },
      { id: 'b', name: 'B', updatedAt: 100 },
    ])
    const { getPrimaryProfileId, setPrimaryProfileId } = await load()
    setPrimaryProfileId('b')
    expect(getPrimaryProfileId()).toBe('b')

    seedSummaries([
      { id: 'a', name: 'A', updatedAt: 400 },
      { id: 'b', name: 'B', updatedAt: 100 },
    ])
    expect(getPrimaryProfileId()).toBe('b')
  })

  it('정해둔 프로필이 삭제됐으면 남은 것 중 최근 것으로 되돌아온다', async () => {
    const { getPrimaryProfileId, setPrimaryProfileId } = await load()
    seedSummaries([{ id: 'gone', name: '지운것', updatedAt: 300 }])
    setPrimaryProfileId('gone')

    seedSummaries([
      { id: 'left', name: '남은것', updatedAt: 200 },
      { id: 'older', name: '더옛것', updatedAt: 100 },
    ])
    expect(getPrimaryProfileId()).toBe('left')
  })

  it('지운 뒤 프로필이 하나도 없으면 null', async () => {
    const { getPrimaryProfileId, setPrimaryProfileId } = await load()
    seedSummaries([{ id: 'only', name: '하나', updatedAt: 1 }])
    setPrimaryProfileId('only')
    seedSummaries([])
    expect(getPrimaryProfileId()).toBeNull()
  })
})

describe('canCreateProfile', () => {
  it('하나도 없을 때만 만들 수 있다 — 미래의 나는 한 명', async () => {
    const { canCreateProfile } = await load()
    expect(canCreateProfile(0)).toBe(true)
    expect(canCreateProfile(1)).toBe(false)
    expect(canCreateProfile(5)).toBe(false)
  })
})
