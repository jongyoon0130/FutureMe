// 프로필 삭제 기록(tombstone) 테스트
// 핵심 보장: "지운 프로필이 동기화 병합 때 되살아나지 않는다" (PRODUCT_PRINCIPLES의 신뢰 원칙)
import { beforeEach, describe, expect, it } from 'bun:test'

// 테스트 환경(bun)에는 브라우저의 localStorage가 없으므로 메모리 구현으로 대체한다.
// storage.ts는 함수를 호출할 때만 localStorage를 쓰기 때문에 import 전에 없어도 안전하다.
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}
globalThis.localStorage = new MemoryStorage()

import { emptyProfile, type SelfProfile } from '../src/types/self'
import {
  addProfileTombstone,
  deleteProfileRecord,
  loadProfileSummaries,
  loadProfileTombstones,
  removeProfileTombstone,
  saveProfileRecord,
} from '../src/lib/storage'
import { deletionWins } from '../src/lib/syncOrchestrator'
import { isCloudTombstone } from '../src/lib/cloudSync'

function makeProfile(id: string, name = '지웅'): SelfProfile {
  return { ...emptyProfile(), id, name, completedAt: new Date().toISOString() }
}

beforeEach(() => {
  localStorage.clear()
})

describe('tombstone 저장/조회', () => {
  it('추가하면 조회되고, 제거하면 사라진다', () => {
    const at = Date.now() - 1000 // 너무 옛날 시각은 TTL 정리에 걸리므로 최근 시각 사용
    addProfileTombstone('p1', at)
    expect(loadProfileTombstones()).toEqual({ p1: at })

    removeProfileTombstone('p1')
    expect(loadProfileTombstones()).toEqual({})
  })

  it('180일이 지난 기록은 자동으로 정리된다', () => {
    const oldAt = Date.now() - 1000 * 60 * 60 * 24 * 181
    addProfileTombstone('old', oldAt)
    addProfileTombstone('recent') // 지금 시각

    const tombstones = loadProfileTombstones()
    expect(tombstones.old).toBeUndefined()
    expect(tombstones.recent).toBeDefined()
  })
})

describe('삭제 → 저장 흐름', () => {
  it('deleteProfileRecord는 목록에서 지우고 tombstone을 남긴다', async () => {
    saveProfileRecord(makeProfile('p1'))
    expect(loadProfileSummaries()).toHaveLength(1)

    await deleteProfileRecord('p1')

    expect(loadProfileSummaries()).toHaveLength(0)
    expect(loadProfileTombstones().p1).toBeNumber()
  })

  it('같은 ID를 다시 저장하면(백업 복원 등) tombstone이 지워져 부활한다', async () => {
    saveProfileRecord(makeProfile('p1'))
    await deleteProfileRecord('p1')
    expect(loadProfileTombstones().p1).toBeDefined()

    saveProfileRecord(makeProfile('p1'))
    expect(loadProfileTombstones().p1).toBeUndefined()
    expect(loadProfileSummaries()).toHaveLength(1)
  })
})

describe('deletionWins — 삭제 시각 vs 수정 시각', () => {
  it('삭제가 더 최신이면 삭제가 이긴다', () => {
    expect(deletionWins(2000, 1000)).toBe(true)
  })

  it('삭제 이후에 수정됐으면 수정(부활)이 이긴다', () => {
    expect(deletionWins(1000, 2000)).toBe(false)
  })

  it('상대 기록이 없으면 삭제가 이긴다', () => {
    expect(deletionWins(1000, undefined)).toBe(true)
  })

  it('시각이 같으면 삭제가 이긴다 (같은 순간이면 사용자의 의도는 삭제)', () => {
    expect(deletionWins(1000, 1000)).toBe(true)
  })
})

describe('isCloudTombstone — 클라우드 행 구분', () => {
  it('tombstone 표식만 tombstone으로 인식한다', () => {
    expect(isCloudTombstone({ __deleted: true, deletedAt: 123 })).toBe(true)
    expect(isCloudTombstone(makeProfile('p1'))).toBe(false)
    expect(isCloudTombstone(null)).toBe(false)
    expect(isCloudTombstone(undefined)).toBe(false)
    expect(isCloudTombstone({ __deleted: false })).toBe(false)
  })
})
