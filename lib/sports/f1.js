// Adaptateur F1 via Jolpica-F1 (api.jolpi.ca), le remplaçant communautaire de
// l'ancienne API Ergast (fermée fin 2024) — même format de réponse, GRATUIT,
// SANS clé API, limite ~200 req/heure en anonyme. Doc : https://github.com/jolpica/jolpica-f1
//
// Différence avec les autres fournisseurs : il n'y a qu'"une" F1, pas plusieurs
// ligues à choisir — le champ `competitionId` du formulaire n'est donc pas
// utilisé ici (n'importe quelle valeur convient), seul `season` compte (ex:
// "2026"). Chaque pari = un Grand Prix, les options = les pilotes inscrits
// cette saison. C'est un pari mutuel à N options (comme le tiercé), le même
// mécanisme que pour le foot/basket — juste avec plus d'options.

const BASE_URL = 'https://api.jolpi.ca/ergast/f1';

async function request(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Jolpica-F1 a répondu ${res.status}`);
  return res.json();
}

function resolveSeason(season) {
  const s = season && String(season).trim();
  return s || String(new Date().getUTCFullYear());
}

function raceDateTime(r) {
  return new Date(`${r.date}T${r.time || '00:00:00Z'}`);
}

export async function getUpcomingFixtures({ season, days = 14 }) {
  const yr = resolveSeason(season);
  const [scheduleData, driversData] = await Promise.all([
    request(`/${yr}/races.json`),
    request(`/${yr}/drivers.json`),
  ]);

  const drivers = driversData?.MRData?.DriverTable?.Drivers || [];
  if (drivers.length === 0) return []; // saison pas encore peuplée chez Jolpica (ex: trop tôt en hiver)

  const options = drivers.map((d) => ({
    label: `${d.givenName} ${d.familyName}`,
    externalRole: d.driverId,
  }));

  const races = scheduleData?.MRData?.RaceTable?.Races || [];
  const now = Date.now();
  const horizon = now + days * 86400000;

  return races
    .filter((r) => {
      const t = raceDateTime(r).getTime();
      return t > now && t <= horizon;
    })
    .map((r) => ({
      externalId: `f1-${yr}-${r.round}`,
      startTime: raceDateTime(r).toISOString(),
      title: `${r.raceName} — vainqueur`,
      options,
    }));
}

export async function getFinishedFixtures({ season, sinceDays = 3 }) {
  const yr = resolveSeason(season);
  const scheduleData = await request(`/${yr}/races.json`);
  const races = scheduleData?.MRData?.RaceTable?.Races || [];

  const now = Date.now();
  const since = now - sinceDays * 86400000;
  const candidates = races.filter((r) => {
    const t = raceDateTime(r).getTime();
    return t <= now && t >= since;
  });

  const finished = [];
  for (const r of candidates) {
    try {
      const data = await request(`/${yr}/${r.round}/results.json`);
      const results = data?.MRData?.RaceTable?.Races?.[0]?.Results || [];
      const winner = results.find((res) => res.position === '1');
      if (winner) {
        finished.push({ externalId: `f1-${yr}-${r.round}`, void: false, winningRole: winner.Driver.driverId });
      }
      // Pas encore de résultats publiés pour ce Grand Prix -> on ne renvoie rien,
      // le cron du lendemain retentera automatiquement.
    } catch {
      // Un round en particulier a échoué -> on l'ignore, retenté au prochain passage.
    }
  }
  return finished;
}
