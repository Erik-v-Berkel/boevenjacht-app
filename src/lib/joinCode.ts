/** "bier 42" → "BIER42". Dezelfde normalisatie doet join_game op de server. */
export function normalizeJoinCode(input: string): string {
  return input.replace(/\s/g, '').toUpperCase()
}

export function isValidJoinCode(code: string): boolean {
  return /^[A-Z]{4}\d{2}$/.test(code)
}

export function joinLink(origin: string, code: string): string {
  return `${origin}/j/${normalizeJoinCode(code)}`
}
