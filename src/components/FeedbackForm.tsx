import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import { Button, ErrorText, inputClass } from './ui'

// COP-74: feedback na het spel. In-app i.p.v. een los Google Form/Typeform, zodat het meteen
// in Supabase staat (geen nieuw account/dienst nodig) en vanaf het eindscherm werkt, ook
// offline-ish: een mislukte poging laat het formulier gewoon staan zodat je 'm opnieuw kan
// versturen (geen wachtrij nodig, dit is geen spelregel die de klok beïnvloedt).

const SCORES = [1, 2, 3, 4, 5] as const

export function FeedbackForm({ gameId }: { gameId: string }) {
  const [enjoyed, setEnjoyed] = useState<number | null>(null)
  const [boringMoment, setBoringMoment] = useState('')
  const [winnerComment, setWinnerComment] = useState('')
  const [bugReport, setBugReport] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!enjoyed) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('submit_feedback', {
      p_game_id: gameId,
      p_enjoyed: enjoyed,
      p_boring_moment: boringMoment,
      p_winner_comment: winnerComment,
      p_bug_report: bugReport,
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else setDone(true)
  }

  if (done) {
    return (
      <section className="rounded-2xl bg-slate-800 p-4 text-center ring-1 ring-slate-700">
        <p className="text-2xl">🙏</p>
        <p className="mt-1 font-semibold">Bedankt voor je feedback!</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl bg-slate-800 p-4 ring-1 ring-slate-700">
      <h2 className="mb-3 text-sm font-semibold text-slate-400 uppercase">Feedback</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <p className="mb-2 text-slate-300">Heb je het leuk gevonden?</p>
          <div className="flex gap-2">
            {SCORES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setEnjoyed(n)}
                className={`flex-1 rounded-xl py-3 text-lg font-bold ring-1 ${enjoyed === n ? 'bg-yellow-400 text-slate-900 ring-yellow-400' : 'bg-slate-900 ring-slate-700'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 flex justify-between text-xs text-slate-500">
            <span>Niet leuk</span>
            <span>Heel leuk</span>
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Was er een saai moment? (optioneel)
          <textarea className={inputClass} rows={2} value={boringMoment} onChange={(e) => setBoringMoment(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Wie won en hoe? (optioneel)
          <textarea className={inputClass} rows={2} value={winnerComment} onChange={(e) => setWinnerComment(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Wat brak er in de app? (optioneel)
          <textarea className={inputClass} rows={2} value={bugReport} onChange={(e) => setBugReport(e.target.value)} />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !enjoyed}>
          {busy ? 'Bezig…' : 'Versturen'}
        </Button>
      </form>
    </section>
  )
}
