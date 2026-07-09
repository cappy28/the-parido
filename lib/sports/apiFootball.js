// Adaptateur API-Football (api-football.com, famille API-SPORTS).
// Plan gratuit : 100 requêtes/jour, 10/minute — largement suffisant si on
// synchronise 1x/jour (voir /api/cron/*). Doc : https://www.api-football.com/documentation-v3

const BASE_URL = 'https://v3.football.api-sports.io';

const FINISHED_STATUSES = ['FT', 'AET', 'PEN'];
const VOID_STATUSES = ['PST', 'CANC', 'ABD', 'WO']; // reporté / annulé / abandonné / forfait

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function request(path, params) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY manquant dans les variables d\'environnement.');

  const url = new URL(BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });

  const res = await fetch(url, { headers: { 'x-apisports-key': key } });
  if (!res.ok) throw new Error(`API-Football a répondu ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
  }
  return data.response || [];
}

function normalizeFixture(f) {
  return {
    externalId: String(f.fixture.id),
    startTime: f.fixture.date,
    statusShort: f.fixture.status?.short,
    homeTeam: f.teams.home.name,
    awayTeam: f.teams.away.name,
    homeWinner: f.teams.home.winner,
    awayWinner: f.teams.away.winner,
    homeGoals: f.goals?.home,
    awayGoals: f.goals?.away,
  };
}

// Matchs à venir dans les `days` prochains jours pour cette ligue/saison.
export async function getUpcomingFixtures({ competitionId, season, days = 7 }) {
  const response = await request('/fixtures', {
    league: competitionId,
    season,
    from: todayISO(0),
    to: todayISO(days),
  });

  return response
    .filter((f) => f.fixture.status?.short === 'NS') // "Not Started" uniquement
    .map((f) => {
      const n = normalizeFixture(f);
      return {
        externalId: n.externalId,
        startTime: n.startTime,
        title: `${n.homeTeam} vs ${n.awayTeam}`,
        allowDraw: true,
        options: [
          { label: n.homeTeam, externalRole: 'HOME' },
          { label: 'Match nul', externalRole: 'DRAW' },
          { label: n.awayTeam, externalRole: 'AWAY' },
        ],
      };
    });
}

// Matchs terminés (ou annulés/reportés) dans les `sinceDays` derniers jours.
export async function getFinishedFixtures({ competitionId, season, sinceDays = 3 }) {
  const response = await request('/fixtures', {
    league: competitionId,
    season,
    from: todayISO(-sinceDays),
    to: todayISO(0),
  });

  const finished = [];
  for (const f of response) {
    const n = normalizeFixture(f);
    if (FINISHED_STATUSES.includes(n.statusShort)) {
      let winningRole = null;
      if (n.homeWinner === true) winningRole = 'HOME';
      else if (n.awayWinner === true) winningRole = 'AWAY';
      else if (n.homeGoals != null && n.homeGoals === n.awayGoals) winningRole = 'DRAW';
      finished.push({ externalId: n.externalId, void: false, winningRole });
    } else if (VOID_STATUSES.includes(n.statusShort)) {
      finished.push({ externalId: n.externalId, void: true, winningRole: null });
    }
  }
  return finished;
}
