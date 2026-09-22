// Kroegnamen normaliseren (PLAN.md §4). Spiegel van public.normalize_bar_name in Postgres;
// de server beslist, dit is alleen voor directe feedback. tests/db/photos.test.ts bewaakt dat ze gelijk blijven.

const STOPWORDS = new Set([
  'brauerei', 'brauhaus', 'hausbrauerei', 'gasthaus', 'zum', 'zur', 'zu', 'im', 'in',
  'am', 'an', 'bar', 'kneipe', 'cafe', 'pub', 'die', 'der', 'das', 'de', 'het', 'the',
])

const FROM = 'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ'
const TO = 'aaaaaaeeeeiiiiooooouuuuyycn'

export function normalizeBarName(name: string): string {
  let clean = name.toLowerCase().replace(/ß/g, 'ss')
  clean = [...clean].map((c) => { const i = FROM.indexOf(c); return i >= 0 ? TO[i] : c }).join('')
  clean = clean.replace(/[^a-z0-9]+/g, ' ').trim()
  if (!clean) return ''
  const words = clean.split(' ').filter((w) => !STOPWORDS.has(w))
  return words.join('') || clean.replace(/ /g, '')
}
