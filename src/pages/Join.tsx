import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/router'
import { errorMessage } from '../lib/errors'
import { normalizeJoinCode } from '../lib/joinCode'
import { CONSENT_VERSION } from '../lib/safety'
import { Button, ErrorText, Screen, inputClass } from '../components/ui'
import { InstallHint } from '../components/InstallHint'
import { SafetyConsent } from '../components/SafetyConsent'

const NAME_KEY = 'boevenjacht:name'

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function Join({ code }: { code: string }) {
  const joinCode = normalizeJoinCode(code)
  const [name, setName] = useState(savedName)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const join = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error } = await supabase.rpc('join_game', {
      p_join_code: joinCode,
      p_name: name,
      p_consent: consent,
      p_consent_version: CONSENT_VERSION,
    })
    setBusy(false)
    if (error) return setError(errorMessage(error))
    try {
      localStorage.setItem(NAME_KEY, name.trim())
    } catch {
      // geen opslag beschikbaar: niet erg
    }
    navigate(`/spel/${(data as { game_id: string }).game_id}`, true)
  }

  return (
    <Screen>
      <header className="pt-6">
        <p className="text-sm text-slate-400">Meedoen met spel</p>
        <h1 className="font-mono text-4xl font-black tracking-widest text-yellow-400">{joinCode}</h1>
      </header>
      <form onSubmit={join} className="flex flex-col gap-3">
        <label className="text-sm text-slate-400" htmlFor="name">
          Je naam
        </label>
        <input
          id="name"
          className={inputClass}
          maxLength={20}
          autoComplete="nickname"
          placeholder="Bijv. Erik"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <SafetyConsent checked={consent} onChange={setConsent} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !name.trim() || !consent}>
          {busy ? 'Bezig…' : 'Naar de lobby'}
        </Button>
      </form>
      <InstallHint />
      <button className="mt-auto text-sm text-slate-500 underline" onClick={() => navigate('/')}>
        Andere code
      </button>
    </Screen>
  )
}
