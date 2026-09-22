import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Uitleg "Zet deze app op je beginscherm" (iPhone en Android). */
export function InstallHint() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (isStandalone()) return null
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)

  return (
    <div className="rounded-xl bg-slate-800/60 p-4 text-sm text-slate-300 ring-1 ring-slate-700">
      <p className="mb-2 font-semibold text-slate-100">📲 Zet deze app op je beginscherm</p>
      {ios ? (
        <p>
          Open deze pagina in <b>Safari</b>, tik op het deel-icoon <b>(□↑)</b> onderaan en kies <b>"Zet op beginscherm"</b>.
        </p>
      ) : prompt ? (
        <button className="font-semibold text-yellow-400 underline" onClick={() => void prompt.prompt()}>
          Installeer de app
        </button>
      ) : (
        <p>
          Tik in Chrome op het menu <b>⋮</b> rechtsboven en kies <b>"App installeren"</b> of <b>"Toevoegen aan startscherm"</b>.
        </p>
      )}
    </div>
  )
}
