import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Position } from './geo'

export interface SubmitResult {
  photo_id: string
  status: 'accepted' | 'rejected'
  reject_reason?: string
  bonus_min: number
  label?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i >= attempts || (err as { final?: boolean }).final) throw err
      await sleep(1000 * 2 ** i) // 2, 4, 8 s
    }
  }
}

/**
 * Uploadt de foto en registreert hem via submit_photo. De client_id bepaalt ook het bestandspad,
 * dus opnieuw proberen na slecht bereik levert nooit een dubbele foto of dubbele aftrek op.
 */
export async function sendPhoto(opts: {
  gameId: string
  clientId: string
  type: 'beer' | 'sight'
  blob: Blob
  position: Position | null
  barName?: string
}): Promise<SubmitResult> {
  const path = `${opts.gameId}/${opts.clientId}.jpg`

  await withRetry(async () => {
    const { error } = await supabase.storage.from('photos').upload(path, opts.blob, { contentType: 'image/jpeg' })
    // Bestaat al = een eerdere poging is wel aangekomen.
    if (error && !/exists|duplicate/i.test(error.message)) throw error
  })

  return withRetry(async () => {
    const { data, error } = await supabase.rpc('submit_photo', {
      p_game_id: opts.gameId,
      p_client_id: opts.clientId,
      p_type: opts.type,
      p_storage_path: path,
      p_lat: opts.position?.lat ?? null,
      p_lng: opts.position?.lng ?? null,
      p_accuracy_m: opts.position?.accuracy ?? null,
      p_bar_name: opts.barName ?? null,
    })
    if (error) {
      // Regelfout van de server (bv. "Alleen boeven…"): niet opnieuw proberen.
      if (error.code === 'P0001') throw Object.assign(new Error(error.message), { final: true })
      throw error
    }
    return data as SubmitResult
  })
}

// Getekende URL's voor de privé fotobucket, per pad onthouden.
const urlCache = new Map<string, string>()

export function usePhotoUrls(paths: string[]): Record<string, string> {
  const key = paths.join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    const missing = paths.filter((p) => !urlCache.has(p))
    const publish = () => setUrls(Object.fromEntries(paths.filter((p) => urlCache.has(p)).map((p) => [p, urlCache.get(p)!])))
    if (missing.length === 0) return publish()
    supabase.storage
      .from('photos')
      .createSignedUrls(missing, 6 * 3600)
      .then(({ data }) => {
        data?.forEach((d) => d.path && d.signedUrl && urlCache.set(d.path, d.signedUrl))
        publish()
      })
  }, [key])

  return urls
}
