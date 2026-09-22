import { useEffect, useState, type ReactNode } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// Kleine plaatjes van de knoppen die je moet zoeken
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline h-6 w-6 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="deel-icoon">
    <path d="M12 3v12M7 8l5-5 5 5" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
)
const AddIcon = () => (
  <svg viewBox="0 0 24 24" className="inline h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="plus-icoon">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)
const MenuIcon = () => (
  <svg viewBox="0 0 24 24" className="inline h-6 w-6" fill="currentColor" aria-label="menu">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
)

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-700 text-sm font-bold">{n}</span>
      <span>{children}</span>
    </li>
  )
}

/** Uitleg "Zet deze app op je beginscherm" voor iPhone en Android. */
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
      <p className="mb-3 font-semibold text-slate-100">📲 Zet deze app op je beginscherm</p>
      {ios ? (
        <ol className="flex flex-col gap-2">
          <Step n={1}>
            Open deze pagina in <b>Safari</b>
          </Step>
          <Step n={2}>
            Tik onderaan op <ShareIcon /> <b>Deel</b>
          </Step>
          <Step n={3}>
            Scroll en kies <AddIcon /> <b>Zet op beginscherm</b>
          </Step>
          <Step n={4}>Open de app voortaan via het icoon</Step>
        </ol>
      ) : prompt ? (
        <button className="rounded-lg bg-yellow-400 px-4 py-2 font-semibold text-slate-900" onClick={() => void prompt.prompt()}>
          Installeer de app
        </button>
      ) : (
        <ol className="flex flex-col gap-2">
          <Step n={1}>
            Open deze pagina in <b>Chrome</b>
          </Step>
          <Step n={2}>
            Tik rechtsboven op <MenuIcon /> (menu)
          </Step>
          <Step n={3}>
            Kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>
          </Step>
        </ol>
      )}
      <p className="mt-3 text-xs text-slate-400">Sta camera en locatie toe als de app erom vraagt, die zijn nodig tijdens het spel.</p>
    </div>
  )
}
