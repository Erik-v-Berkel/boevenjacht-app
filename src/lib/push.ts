import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState = 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied'

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function save(gameId: string, sub: PushSubscription) {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_game_id: gameId,
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys!.p256dh,
    p_auth: json.keys!.auth,
  })
  if (error) throw error
}

/** Pushmeldingen voor dit spel: status en een functie om ze aan te zetten. */
export function usePush(gameId: string) {
  const [state, setState] = useState<PushState>('off')

  useEffect(() => {
    if (!VAPID_KEY || !('serviceWorker' in navigator)) return setState('unsupported')
    // iOS kan alleen pushen vanuit de app op het beginscherm
    if (!('PushManager' in window)) return setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported')
    if (Notification.permission === 'denied') return setState('denied')
    void subscription().then(async (sub) => {
      if (sub && Notification.permission === 'granted') {
        // Opnieuw koppelen: hetzelfde toestel kan in een nieuw spel zitten
        await save(gameId, sub).catch(() => {})
        setState('on')
      }
    })
  }, [gameId])

  const enable = async () => {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return setState(permission === 'denied' ? 'denied' : 'off')
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(VAPID_KEY!) }))
    await save(gameId, sub)
    setState('on')
  }

  return { state, enable }
}
