import type { GameSettings } from '../lib/types'

/** Korte versie van de spelregels (PLAN.md §2), met de waarden van dit spel. */
export function Rules({ settings: s }: { settings: GameSettings }) {
  const idle = s.idle_ping_min ?? 30
  const finalPhase = s.final_phase_min ?? 30
  const finalPing = s.final_ping_min ?? 10
  const radius = s.ping_radius_m ?? 300
  const radars = s.radars_per_team ?? 1
  return (
    <article className="flex flex-col gap-4 text-slate-200 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-2xl font-black">Spielregeln</h1>
      {s.time_scale !== 1 && (
        <p className="rounded-lg bg-amber-950 px-3 py-2 text-amber-200">Testmodus: de tijd loopt {s.time_scale}× zo snel.</p>
      )}
      <section>
        <h2>Tijd</h2>
        <ul>
          <li>De boeven krijgen {s.headstart_min} minuten voorsprong.</li>
          <li>Daarna zoekt de Polizei {s.search_min / 60} uur. Staat de klok op 0, dan winnen de boeven.</li>
        </ul>
      </section>
      <section>
        <h2>🦹 Boeven: tijd aftrekken met foto's</h2>
        <ul>
          <li>🍺 Bier in een kroeg: −{s.beer_bonus_min} min. Elke kroeg telt 1×. Prost!</li>
          <li>🏛️ Bij een bezienswaardigheid: −{s.sight_bonus_min} min. Elke bezienswaardigheid telt 1×.</li>
          <li>Minstens {s.cooldown_min} minuten tussen twee foto's (voor het hele team).</li>
          <li>Maximaal {s.max_bonus_total_min} minuten aftrek in totaal.</li>
          <li>Let op: elke foto laat direct je locatie zien aan de Polizei!</li>
          <li>Blijf als team bij elkaar.</li>
        </ul>
      </section>
      <section>
        <h2>📡 Pings</h2>
        <ul>
          <li>
            Maken de boeven {idle} minuten geen foto, dan ziet iedereen een cirkel van {radius} m op de kaart. De boeven zitten daar
            ergens in, niet per se in het midden.
          </li>
          <li>
            Slotfase: in de laatste {finalPhase} minuten komt er minstens elke {finalPing} minuten een ping.
          </li>
          <li>Een bonusfoto zet de teller weer op nul. De klok laat zien wanneer de volgende ping komt.</li>
        </ul>
      </section>
      <section>
        <h2>🚓 Polizei: vangen</h2>
        <ul>
          <li>Maak een foto waarop de boeven herkenbaar staan en druk op "Halt, Polizei! Gevangen!".</li>
          <li>De eerste vangstfoto telt. Dat Polizei-team wint.</li>
          <li>
            Elk Polizei-team heeft {radars}× een radar (op de kaart). Alleen jullie team ziet dan een cirkel rond de boeven. De andere
            teams zien wél dat jullie hem gebruikt hebben, en de boeven ook.
          </li>
        </ul>
      </section>
      <section>
        <h2>Spelgebied</h2>
        <ul>
          <li>Altstadt, Carlstadt, Königsallee, Hofgarten, Rheinuferpromenade, Rheinturm en MedienHafen.</li>
          <li>Foto's buiten het gebied tellen niet.</li>
        </ul>
      </section>
      <section>
        <h2>Na afloop</h2>
        <ul>
          <li>Op het eindscherm zie je de replay: wie liep waar, met alle foto's en pings.</li>
        </ul>
      </section>
    </article>
  )
}
