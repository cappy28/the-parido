// Adaptateur API-Basketball (api-basketball.com, même famille API-SPORTS qu'API-Football,
// mais compte et clé séparés). Pas de match nul possible en basket.

const BASE_URL = 'https://v1.basketball.api-sports.io';
const FINISHED_STATUSES = ['FT', 'AOT']; // terminé / terminé après prolongation
const VOID_STATUSES = ['POST', 'CANC', 'ABD'];

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function request(path, params) {
  const key = process.env.API_BASKETBALL_KEY;
  if (!key) throw new Error('API_BASKETBALL_KEY manquant dans les variables d\'environnement.');

  const url = new URL(BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });

  const res = await fetch(url, { headers: { 'x-apisports-key': key } });
  if (!res.ok) throw new Error(`API-Basketball a répondu ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Basketball error: ${JSON.stringify(data.errors)}`);
  }
  return data.response || [];
}

export async function getUpcomingFixtures({ competitionId, season, days = 7 }) {
  const response = await request('/games', {
    league: competitionId,
    season,
    from: todayISO(0),
    to: todayISO(days),
  });

  return response
    .filter((g) => g.status?.short === 'NS')
    .map((g) => ({
      externalId: String(g.id),
      startTime: g.date,
      title: `${g.teams.home.name} vs ${g.teams.away.name}`,
      allowDraw: false,
      options: [
        { label: g.teams.home.name, externalRole: 'HOME' },
        { label: g.teams.away.name, externalRole: 'AWAY' },
      ],
    }));
}

export async function getFinishedFixtures({ competitionId, season, sinceDays = 3 }) {
  const response = await request('/games', {
    league: competitionId,
    season,
    from: todayISO(-sinceDays),
    to: todayISO(0),
  });

  const finished = [];
  for (const g of response) {
    const status = g.status?.short;
    if (FINISHED_STATUSES.includes(status)) {
      const home = g.scores?.home?.total;
      const away = g.scores?.away?.total;
      let winningRole = null;
      if (home != null && away != null) winningRole = home > away ? 'HOME' : away > home ? 'AWAY' : null;
      finished.push({ externalId: String(g.id), void: false, winningRole });
    } else if (VOID_STATUSES.includes(status)) {
      finished.push({ externalId: String(g.id), void: true, winningRole: null });
    }
  }
  return finished;
}
