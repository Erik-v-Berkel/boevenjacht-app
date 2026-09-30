import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/router'
import { errorMessage } from '../lib/errors'
import { joinLink } from '../lib/joinCode'
import { Button, ErrorText, Screen, inputClass } from '../components/ui'
import { QrCode } from '../components/QrCode'

interface Created {
  game_id: string
  join_code: string
}

const LETTERS = ['A', 'B', 'C', 'D', 'E']

export default function NewGame() {
  const [adminCode, setAdminCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [policeTeams, setPoliceTeams] = useState(3)
  const [citySlug, setCitySlug] = useState('')

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_game', {
      p_admin_code: adminCode,
      p_settings: { police_teams: policeTeams, ...(testMode ? { time_scale: 12 } : {}) },
      p_city_slug: citySlug.trim() || null,
    })
    setBusy(false)
    if (error) setError(errorMessage(error))
    else setCreated(data as Created)
  }

  if (created) {
    const link = joinLink(location.origin, created.join_code)
    const share = async () => {
      const text = `Doe mee met Boevenjacht Düsseldorf! Spelcode ${created.join_code}`
      if (navigator.share) {
        await navigator.share({ title: 'Boevenjacht', text, url: link }).catch(() => {})
      } else {
        await navigator.clipboard.writeText(`${text}\n${link}`)
        setCopied(true)
      }
    }
    return (
      <Screen>
        <h1 className="pt-6 text-2xl font-black">Spel aangemaakt</h1>
        <div className="rounded-2xl bg-slate-800 p-6 text-center ring-1 ring-slate-700">
          <p className="text-sm text-slate-400">Spelcode</p>
          <p className="font-mono text-5xl font-black tracking-widest text-yellow-400">{created.join_code}</p>
          <p className="mt-3 text-sm break-all text-slate-400">{link}</p>
        </div>
        <QrCode url={link} size={220} />
        <Button onClick={share}>{copied ? 'Gekopieerd ✓' : 'Deel link in de groepsapp'}</Button>
        <Button variant="secondary" onClick={() => navigate(`/j/${created.join_code}`)}>
          Zelf meedoen
        </Button>
      </Screen>
    )
  }

  return (
    <Screen>
      <h1 className="pt-6 text-2xl font-black">Nieuw spel</h1>
      <p className="text-slate-400">
        Maakt een spel met de teams Boeven,{' '}
        {LETTERS.slice(0, policeTeams)
          .map((l) => `Polizei ${l}`)
          .join(', ')}
        .
      </p>
      <form onSubmit={create} className="flex flex-col gap-3">
        <input
          type="password"
          className={inputClass}
          placeholder="Beheerderscode"
          value={adminCode}
          onChange={(e) => setAdminCode(e.target.value)}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-slate-400">Aantal Polizei-teams (max. 3 spelers per team)</legend>
          <div className="flex gap-2">
            {LETTERS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPoliceTeams(i + 1)}
                className={`flex-1 rounded-xl py-3 text-lg font-bold ring-1 ${policeTeams === i + 1 ? 'bg-yellow-400 text-slate-900 ring-yellow-400' : 'bg-slate-800 ring-slate-700'}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-slate-300">
          <input type="checkbox" className="h-5 w-5" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          Testspel: tijd loopt 12× zo snel (hele spel in ±16 min)
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-400">
          Stadspakket (leeg = standaard Düsseldorf-testlab)
          <input
            type="text"
            className={inputClass}
            placeholder="bv. dusseldorf of utrecht"
            value={citySlug}
            onChange={(e) => setCitySlug(e.target.value)}
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !adminCode}>
          {busy ? 'Bezig…' : 'Nieuw spel'}
        </Button>
      </form>
      <button className="text-sm text-slate-500 underline" onClick={() => navigate('/')}>
        Terug
      </button>
    </Screen>
  )
}
