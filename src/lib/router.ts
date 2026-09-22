import { useSyncExternalStore } from 'react'

// Minimale router: vier schermen hebben geen routerbibliotheek nodig.
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('popstate', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('popstate', cb)
  }
}

export function navigate(path: string, replace = false) {
  if (replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  listeners.forEach((cb) => cb())
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname)
}
