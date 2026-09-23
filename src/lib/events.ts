export { eventText } from '../../supabase/functions/_shared/eventText'

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
