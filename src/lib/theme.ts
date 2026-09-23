// Thema per telefoon. "polizei" is het standaardthema (donker, zwart-rood-goud).
// "downton" (Lords & Ladies) definieert alleen de Tailwind-kleuren en lettertypes opnieuw, zie index.css.

export type Theme = 'polizei' | 'downton'

const KEY = 'boevenjacht-theme'
const THEME_COLOR: Record<Theme, string> = { polizei: '#0f172a', downton: '#2c0710' }
const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Playfair+Display:wght@600;700;900&display=swap'

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'downton' ? 'downton' : 'polizei'
  } catch {
    return 'polizei'
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'polizei') delete root.dataset.theme
  else root.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  // Lettertypes alleen laden als dit thema gekozen is; zonder internet valt het terug op Georgia
  if (theme === 'downton' && !document.getElementById('theme-fonts')) {
    const link = document.createElement('link')
    link.id = 'theme-fonts'
    link.rel = 'stylesheet'
    link.href = FONTS
    document.head.appendChild(link)
  }
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // geen opslag: geldt alleen voor deze sessie
  }
  applyTheme(theme)
}
