import { useState } from 'react'
import { LIABILITY_TEXT, SAFETY_EXPLAINER } from '../lib/safety'

/** Veiligheidsuitleg + eigen-risicoverklaring met akkoord-checkbox (COP-7). Verplicht bij het joinen. */
export function SafetyConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-slate-800/70 p-4 ring-1 ring-slate-700">
      <h2 className="text-lg font-bold">🛟 Veiligheid</h2>
      <ul className="ml-5 flex list-disc flex-col gap-1 text-sm text-slate-300">
        {SAFETY_EXPLAINER.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" className="text-left text-sm text-yellow-400 underline" onClick={() => setExpanded((e) => !e)}>
        {expanded ? 'Verberg volledige eigen-risicoverklaring' : 'Lees de volledige eigen-risicoverklaring'}
      </button>
      {expanded && (
        <ul className="ml-5 flex list-disc flex-col gap-2 text-sm text-slate-400">
          {LIABILITY_TEXT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      <label className="flex items-start gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-yellow-400"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        Ik ga akkoord met de voorwaarden en de eigen-risicoverklaring hierboven.
      </label>
    </section>
  )
}
