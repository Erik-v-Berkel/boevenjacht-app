export interface ShareCardData {
  emoji: string
  title: string
  duration: string // al geformatteerd, bv. "2:14:03"
  bonusMin: number
  beerCount: number
  sightCount: number
}

const WIDTH = 1080
const HEIGHT = 1080

/** Knipt de titel in regels van maximaal `maxChars` zodat hij op het canvas past (geen DOM nodig, dus testbaar). */
export function wrapTitle(title: string, maxChars = 22): string[] {
  const words = title.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > maxChars && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Tekent de deelbare replay-kaart op een offscreen canvas en levert hem als PNG-blob. */
export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas niet ondersteund')

  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  gradient.addColorStop(0, '#0f172a')
  gradient.addColorStop(1, '#1e293b')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#facc15'
  ctx.font = '700 44px system-ui, sans-serif'
  ctx.fillText('BOEVENJACHT', WIDTH / 2, 100)

  ctx.font = '150px system-ui, sans-serif'
  ctx.fillText(data.emoji, WIDTH / 2, 300)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '700 52px system-ui, sans-serif'
  wrapTitle(data.title).forEach((line, i) => ctx.fillText(line, WIDTH / 2, 410 + i * 62))

  const stats: [string, string][] = [
    ['Speelduur', data.duration],
    ['Totale aftrek', `${data.bonusMin} min`],
    ['Kroegen', `🍺 ${data.beerCount}`],
    ['Bezienswaardigheden', `🏛️ ${data.sightCount}`],
  ]
  const top = 660
  const cellW = WIDTH / 2
  const cellH = 180
  stats.forEach(([label, value], i) => {
    const cx = (i % 2) * cellW + cellW / 2
    const cy = top + Math.floor(i / 2) * cellH
    ctx.fillStyle = '#94a3b8'
    ctx.font = '400 28px system-ui, sans-serif'
    ctx.fillText(label, cx, cy)
    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 48px system-ui, sans-serif'
    ctx.fillText(value, cx, cy + 56)
  })

  ctx.fillStyle = '#64748b'
  ctx.font = '400 24px system-ui, sans-serif'
  ctx.fillText('boevenjacht.nl', WIDTH / 2, HEIGHT - 50)

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('kon geen afbeelding maken'))), 'image/png'),
  )
}
