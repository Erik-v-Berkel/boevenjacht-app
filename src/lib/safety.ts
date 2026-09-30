// Tekst uit veiligheid.md, woordelijk (status: concept, wordt nagekeken bij het juridisch
// spreekuur in week 4 — zie veiligheid.md). CONSENT_VERSION ophogen bij elke tekstwijziging:
// dat laat spelers met een oudere versie bij een volgende join opnieuw akkoord geven
// (supabase/migrations/20260930000005_safety.sql).
export const CONSENT_VERSION = 'v1'

export const SAFETY_EXPLAINER = [
  'Jij bent verantwoordelijk voor je eigen veiligheid en gedrag.',
  'Volg altijd verkeersregels en aanwijzingen van politie, handhaving en terreineigenaren.',
  'Geen spoor, water, bouwplaatsen of privéterrein — blijf binnen het speelgebied.',
  'Drink met mate; een alcoholvrij drankje telt ook mee voor de bonus.',
  'Bij een noodgeval: bel altijd eerst 112. Gebruik daarna de noodknop in de app.',
]

export const LIABILITY_TEXT = [
  'Ik doe vrijwillig en op eigen risico mee aan Boevenjacht. Ik ben 18 jaar of ouder en in staat om enkele uren te lopen.',
  'Ik volg altijd de verkeersregels en aanwijzingen van politie, handhaving en eigenaren van terreinen. Het spel geeft nooit toestemming om regels te overtreden.',
  'Ik ren niet door het verkeer, betreed geen spoor, water, bouwplaatsen of privéterrein, en blijf binnen het speelgebied.',
  'Ik bepaal zelf wat ik drink; een alcoholvrij drankje telt ook. Ik ben zelf verantwoordelijk voor mijn alcoholgebruik.',
  'Ik ben zelf verantwoordelijk voor mijn telefoon en spullen, en voor schade die ik aan anderen toebreng.',
  'Ik fotografeer alleen medespelers, geen omstanders.',
  'Boevenjacht is niet aansprakelijk voor letsel of schade door mijn eigen handelen of dat van andere spelers, voor zover de wet dat toestaat.',
  'Bij een noodgeval bel ik 112 en gebruik ik de noodknop in de app.',
]
