// Pushmeldingen. Wordt via workbox.importScripts in de service worker van vite-plugin-pwa geladen.

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    (async () => {
      // Staat de app open en in beeld? Dan toont de app zelf al een melding.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (windows.some((w) => w.visibilityState === 'visible')) return
      await self.registration.showNotification(data.title || 'Boevenjacht', {
        body: data.body,
        tag: data.tag,
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        vibrate: [200, 100, 200],
        data: { url: data.url || '/' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).pathname === url) ?? windows[0]
      if (open) {
        await open.focus()
        if (new URL(open.url).pathname !== url) await open.navigate(url)
      } else {
        await self.clients.openWindow(url)
      }
    })(),
  )
})
