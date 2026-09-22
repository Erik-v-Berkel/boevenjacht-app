import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Position } from './geo'
import type { Photo, Sight } from './types'

export type PhotoKind = 'beer' | 'sight' | 'capture'

export interface SubmitResult {
  photo_id: string
  status: 'accepted' | 'rejected'
  reject_reason?: string
  bonus_min: number
  label?: string
}

export interface PhotoUpload {
  clientId: string
  gameId: string
  kind: PhotoKind
  blob: Blob
  position: Position | null
  barName?: string
}

/** Fout die opnieuw proberen niet oplost (regel van de server, bv. "Alleen boeven…"). */
export class FinalError extends Error {}

/**
 * Eén poging: uploaden en registreren. De client_id bepaalt ook het bestandspad, dus opnieuw
 * proberen na slecht bereik levert nooit een dubbele foto of dubbele aftrek op.
 */
export async function sendOnce(u: PhotoUpload): Promise<SubmitResult> {
  const path = `${u.gameId}/${u.clientId}.jpg`
  const up = await supabase.storage.from('photos').upload(path, u.blob, { contentType: 'image/jpeg' })
  // Bestaat al = een eerdere poging is wel aangekomen.
  if (up.error && !/exists|duplicate/i.test(up.error.message)) throw up.error

  const pos = {
    p_lat: u.position?.lat ?? null,
    p_lng: u.position?.lng ?? null,
    p_accuracy_m: u.position?.accuracy ?? null,
  }
  const { data, error } =
    u.kind === 'capture'
      ? await supabase.rpc('submit_capture', { p_game_id: u.gameId, p_client_id: u.clientId, p_storage_path: path, ...pos })
      : await supabase.rpc('submit_photo', {
          p_game_id: u.gameId,
          p_client_id: u.clientId,
          p_type: u.kind,
          p_storage_path: path,
          ...pos,
          p_bar_name: u.barName ?? null,
        })
  if (error) {
    if (error.code === 'P0001') throw new FinalError(error.message)
    throw error
  }
  return data as SubmitResult
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
      .createSignedUrls(missing, 12 * 3600)
      .then(({ data }) => {
        data?.forEach((d) => d.path && d.signedUrl && urlCache.set(d.path, d.signedUrl))
        publish()
      })
  }, [key])

  return urls
}

/** Omschrijving van een foto: naam van de bezienswaardigheid of de kroeg. */
export function photoLabel(photo: Photo, sights: Sight[]): string {
  if (photo.type === 'sight') return sights.find((s) => s.id === photo.sight_id)?.name ?? 'Bezienswaardigheid'
  if (photo.type === 'beer') return photo.bar_name ?? 'Kroeg'
  return 'Vangstfoto'
}

/** Geaccepteerde bonusfoto's van de boeven, oudste eerst. */
export function thiefPhotos(photos: Photo[]): Photo[] {
  return photos.filter((p) => p.status === 'accepted' && (p.type === 'beer' || p.type === 'sight'))
}
