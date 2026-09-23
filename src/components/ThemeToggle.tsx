import { useState } from 'react'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: 'polizei', label: '🚓 Polizei', hint: 'Zwart-rood-goud' },
  { id: 'downton', label: '🎩 Lords & Ladies', hint: 'Bordeaux en goud' },
]

/** Thema kiezen; de telefoon onthoudt het. */
export function ThemeToggle() {
  const [theme, set] = useState(getTheme)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-400">Thema (alleen op deze telefoon)</p>
      <div className="flex gap-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTheme(t.id)
              set(t.id)
            }}
            className={`flex-1 rounded-xl px-3 py-2 text-left ring-1 ${theme === t.id ? 'bg-yellow-400 text-slate-900 ring-yellow-400' : 'bg-slate-800 ring-slate-700'}`}
          >
            <b className="block">{t.label}</b>
            <span className={`text-xs ${theme === t.id ? 'text-slate-800' : 'text-slate-400'}`}>{t.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
