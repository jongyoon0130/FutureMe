import type { ChatMessage } from '../types/self'

const DB_NAME = 'futureme'
/** 구버전 IndexedDB (TalkBack / aime) */
const LEGACY_DB_NAME = 'talkback'
const LEGACY_AIME_DB_NAME = 'aime'
const DB_VERSION = 1
const STORE = 'chat'
const LEGACY_CHAT_KEY = 'main'

let legacyDbMigrated = false

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'))
  })
}

async function readAllEntries(dbName: string): Promise<[string, ChatMessage[]][]> {
  const db = await openDb(dbName)
  if (!db.objectStoreNames.contains(STORE)) {
    db.close()
    return []
  }

  const tx = db.transaction(STORE, 'readonly')
  const store = tx.objectStore(STORE)
  const entries = await new Promise<[string, ChatMessage[]][]>((resolve, reject) => {
    const req = store.openCursor()
    const rows: [string, ChatMessage[]][] = []
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve(rows)
        return
      }
      rows.push([String(cursor.key), cursor.value as ChatMessage[]])
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
  db.close()
  return entries.filter(([, messages]) => Array.isArray(messages))
}

async function ensureLegacyDbMigrated(): Promise<void> {
  if (legacyDbMigrated) return
  legacyDbMigrated = true

  try {
    for (const legacyName of [LEGACY_DB_NAME, LEGACY_AIME_DB_NAME]) {
      const legacyEntries = await readAllEntries(legacyName)
      if (!legacyEntries.length) continue

      const currentEntries = await readAllEntries(DB_NAME)
      const currentByKey = new Map(currentEntries)

      const db = await openDb(DB_NAME)
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)

      for (const [key, messages] of legacyEntries) {
        const existing = currentByKey.get(key)
        if (!existing?.length) {
          store.put(messages, key)
        }
      }

      await txDone(tx)
      db.close()
    }
  } catch {
    /* ignore private mode / quota */
  }
}

async function dbGet(key: string): Promise<ChatMessage[] | undefined> {
  await ensureLegacyDbMigrated()
  const db = await openDb(DB_NAME)
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).get(key)
  const raw = await new Promise<ChatMessage[] | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as ChatMessage[] | undefined)
    req.onerror = () => reject(req.error)
  })
  await txDone(tx)
  db.close()
  return raw
}

async function dbPut(key: string, messages: ChatMessage[]): Promise<void> {
  await ensureLegacyDbMigrated()
  const db = await openDb(DB_NAME)
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(messages, key)
  await txDone(tx)
  db.close()
}

async function dbDelete(key: string): Promise<void> {
  await ensureLegacyDbMigrated()
  const db = await openDb(DB_NAME)
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(key)
  await txDone(tx)
  db.close()
}

export async function loadChatFromDb(profileId: string): Promise<ChatMessage[]> {
  try {
    const raw = await dbGet(profileId)
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/** 단일 프로필 시절 키(main) — 마이그레이션용 */
export async function loadLegacyChatFromDb(): Promise<ChatMessage[]> {
  try {
    const raw = await dbGet(LEGACY_CHAT_KEY)
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export async function saveChatToDb(profileId: string, messages: ChatMessage[]): Promise<void> {
  try {
    await dbPut(profileId, messages)
  } catch {
    /* ignore quota / private mode */
  }
}

export async function deleteChatFromDb(profileId: string): Promise<void> {
  try {
    await dbDelete(profileId)
  } catch {
    /* ignore */
  }
}

export async function clearLegacyChatDb(): Promise<void> {
  try {
    await dbDelete(LEGACY_CHAT_KEY)
  } catch {
    /* ignore */
  }
}
