import { useSyncExternalStore } from 'react'
import { createStore, del, entries, set, type UseStore } from 'idb-keyval'
import { FinalError, sendOnce, type PhotoUpload, type SubmitResult } from './photos'
import { errorMessage } from './errors'

// Uploadwachtrij voor slecht bereik (PLAN.md §5). Foto's staan in IndexedDB tot de server ze heeft,
// dus ook app sluiten of telefoon leeg is geen probleem: bij het openen gaat het verder.
// Een bonus telt pas als de server de foto heeft ontvangen.

export type QueueState = 'pending' | 'sending' | 'done' | 'failed'

export interface QueueItem extends Omit<PhotoUpload, 'blob'> {
  blob: Blob | null // weg na verzenden
  createdAt: number
  state: QueueState
  attempts: number
  result?: SubmitResult
  error?: string
}

let store: UseStore | null = null
try {
  store = createStore('boevenjacht', 'upload-queue')
} catch {
  store = null // geen IndexedDB (privévenster): alleen in het geheugen
}

const items = new Map<string, QueueItem>()
let loaded = false
let running = false
let again = false // tijdens het verzenden kwam er iets bij
let retryTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()
let snapshot: QueueItem[] = []

function emit() {
  snapshot = [...items.values()].sort((a, b) => b.createdAt - a.createdAt)
  listeners.forEach((l) => l())
}

async function persist(item: QueueItem) {
  items.set(item.clientId, item)
  emit()
  if (store) await set(item.clientId, item, store).catch(() => {})
}

async function load() {
  if (loaded) return
  loaded = true
  if (!store) return
  try {
    const stored = (await entries<string, QueueItem>(store)).map(([, v]) => v)
    const hourAgo = Date.now() - 3600_000
    for (const item of stored) {
      // Oude afgeronde items opruimen
      if ((item.state === 'done' || item.state === 'failed') && item.createdAt < hourAgo) {
        await del(item.clientId, store)
        continue
      }
      // Was aan het verzenden toen de app sloot: opnieuw proberen
      items.set(item.clientId, item.state === 'sending' ? { ...item, state: 'pending' } : item)
    }
    emit()
  } catch {
    // IndexedDB kapot: dan maar zonder
  }
}

/** Verstuurt alle wachtende foto's, één voor één (volgorde blijft gelijk). */
export async function processQueue() {
  await load()
  if (running) {
    again = true
    return
  }
  running = true
  try {
    for (const item of [...items.values()].sort((a, b) => a.createdAt - b.createdAt)) {
      if (item.state !== 'pending' || !item.blob) continue
      await persist({ ...item, state: 'sending' })
      try {
        const result = await sendOnce({ ...item, blob: item.blob })
        await persist({ ...item, state: 'done', result, blob: null, attempts: item.attempts + 1 })
      } catch (err) {
        if (err instanceof FinalError) {
          await persist({ ...item, state: 'failed', error: err.message, attempts: item.attempts + 1 })
        } else {
          await persist({ ...item, state: 'pending', error: errorMessage(err), attempts: item.attempts + 1 })
          scheduleRetry(item.attempts + 1)
          break // geen verbinding: de rest hoeft ook niet
        }
      }
    }
  } finally {
    running = false
    if (again) {
      again = false
      void processQueue()
    }
  }
}

function scheduleRetry(attempts: number) {
  if (retryTimer) clearTimeout(retryTimer)
  const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempts, 4))
  retryTimer = setTimeout(() => void processQueue(), delay)
}

export async function enqueue(upload: PhotoUpload): Promise<void> {
  await load()
  await persist({ ...upload, createdAt: Date.now(), state: 'pending', attempts: 0 })
  void processQueue()
}

export async function dismiss(clientId: string) {
  items.delete(clientId)
  emit()
  if (store) await del(clientId, store).catch(() => {})
}

/** Direct opnieuw proberen (knop). */
export function retryNow() {
  void processQueue()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void processQueue())
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void processQueue())
  void processQueue()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Alle wachtrij-items van dit spel, nieuwste eerst. */
export function useUploadQueue(gameId: string): QueueItem[] {
  const all = useSyncExternalStore(subscribe, () => snapshot)
  return all.filter((i) => i.gameId === gameId)
}

/** Item met deze client-id (voor het resultaatscherm). */
export function useQueueItem(clientId: string | null): QueueItem | undefined {
  return useSyncExternalStore(subscribe, () => snapshot).find((i) => i.clientId === clientId)
}
