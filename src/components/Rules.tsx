import type { GameSettings } from '../lib/types'

/** Korte versie van de spelregels (PLAN.md §2), met de waarden van dit spel. */
export function Rules({ settings: s }: { settings: GameSettings }) {
  return (
    <article className="flex flex-col gap-4 text-slate-200 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
      <h1 className="text-2xl font-black">Spelregels</h1>
      {s.time_scale !== 1 && (
        <p className="rounded-lg bg-amber-950 px-3 py-2 text-amber-200">Testmodus: de tijd loopt {s.time_scale}× zo snel.</p>
      )}
      <section>
        <h2>Tijd</h2>
        <ul>
          <li>De boeven krijgen {s.headstart_min} minuten voorsprong.</li>
          <li>Daarna zoekt de politie {s.search_min / 60} uur. Staat de klok op 0, dan winnen de boeven.</li>
        </ul>
      </section>
      <section>
        <h2>🦹 Boeven: tijd aftrekken met foto's</h2>
        <ul>
          <li>🍺 Bier in een kroeg: −{s.beer_bonus_min} min. Elke kroeg telt 1×.</li>
          <li>🏛️ Bij een bezienswaardigheid: −{s.sight_bonus_min} min. Elke bezienswaardigheid telt 1×.</li>
          <li>Minstens {s.cooldown_min} minuten tussen twee foto's (voor het hele team).</li>
          <li>Maximaal {s.max_bonus_total_min} minuten aftrek in totaal.</li>
          <li>Let op: elke foto laat direct je locatie zien aan de politie!</li>
          <li>Blijf als team bij elkaar.</li>
        </ul>
      </section>
      <section>
        <h2>🚓 Politie: vangen</h2>
        <ul>
          <li>Maak een foto waarop de boeven herkenbaar staan en druk op "Boeven gevangen!".</li>
          <li>De eerste vangstfoto telt. Dat politieteam wint.</li>
        </ul>
      </section>
      <section>
        <h2>Spelgebied</h2>
        <ul>
          <li>Altstadt, Carlstadt, Königsallee, Hofgarten, Rheinuferpromenade, Rheinturm en MedienHafen.</li>
          <li>Foto's buiten het gebied tellen niet.</li>
        </ul>
      </section>
    </article>
  )
}
