import { useState } from 'react'
import { renderShareCard, type ShareCardData } from '../lib/shareCard'
import { Button } from './ui'

/** Maakt een deelbare afbeelding van de replay en opent het systeem-deelvenster (of downloadt hem als delen niet kan). */
export function ShareReplayButton({
  data,
  fileName,
  className,
}: {
  data: ShareCardData
  fileName: string
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  const share = async () => {
    setState('busy')
    try {
      const blob = await renderShareCard(data)
      const file = new File([blob], `${fileName}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Boevenjacht', text: data.title })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${fileName}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      }
      setState('idle')
    } catch (err) {
      // Gebruiker annuleerde het systeem-deelvenster: geen fout, gewoon niets gedaan.
      if (err instanceof DOMException && err.name === 'AbortError') {
        setState('idle')
        return
      }
      setState('failed')
    }
  }

  return (
    <Button variant="secondary" className={className} onClick={share} disabled={state === 'busy'}>
      {state === 'busy' ? 'Bezig…' : '📤 Deel replay'}
      {state === 'failed' && ' — mislukt, probeer opnieuw'}
    </Button>
  )
}
