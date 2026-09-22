import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/router'
import { errorMessage } from '../lib/errors'
import { joinLink } from '../lib/joinCode'
import { Button, ErrorText, Screen, inputClass } from '../components/ui'

interface Created {
  game_id: string
  join_code: string
}

export default function NewGame() {
  const [adminCode, setAdminCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState(false)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('create_game', { p_admin_code: adminCode })
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
      <p className="text-slate-400">Maakt een spel met de teams Boeven, Politie A, Politie B en Politie C.</p>
      <form onSubmit={create} className="flex flex-col gap-3">
        <input
          type="password"
          className={inputClass}
          placeholder="Beheerderscode"
          value={adminCode}
          onChange={(e) => setAdminCode(e.target.value)}
        />
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
