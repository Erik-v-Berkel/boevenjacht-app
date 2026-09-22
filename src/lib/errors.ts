/** Haalt een leesbare (Nederlandse) melding uit een Supabase/RPC-fout. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    if (err.message.includes('Failed to fetch')) return 'Geen verbinding. Probeer het opnieuw.'
    return err.message
  }
  return 'Er ging iets mis. Probeer het opnieuw.'
}
