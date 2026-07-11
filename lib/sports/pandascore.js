// Adaptateur PandaScore (esports — LoL, CS2, Dota 2, Valorant, R6...).
// ⚠️ Lis le README avant d'activer ce fournisseur : le plan gratuit de PandaScore
// est réservé à un "usage non lié aux paris" d'après leurs propres CGU
// (pandascore.co/pricing). Même en points virtuels, vérifie leurs conditions
// actuelles ou contacte leur support avant de t'appuyer dessus en production.

const BASE_URL = 'https://api.pandascore.co';
const FINISHED_STATUSES = ['finished'];
const VOID_STATUSES = ['canceled', 'forfeit'];

async function request(path, params) {
  const token = process.env.PANDASCORE_TOKEN;
  if (!token) throw new Error('PANDASCORE_TOKEN manquant dans les variables d\'environnement.');

  const url = new URL(BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });
  url.searchParams.set('page[size]', '50');

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`PandaScore a répondu ${res.status}`);
  return res.json();
}

function isoRange(days) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  return `${now.toISOString()},${end.toISOString()}`;
}

function isoRangePast(days) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 86400000);
  return `${start.toISOString()},${now.toISOString()}`;
}

export async function getUpcomingFixtures({ competitionId, days = 7 }) {
  const matches = await request('/matches/upcoming', {
    'filter[league_id]': competitionId,
    'range[begin_at]': isoRange(days),
    sort: 'begin_at',
  });

  return matches
    .filter((m) => Array.isArray(m.opponents) && m.opponents.length === 2)
    .map((m) => {
      const a = m.opponents[0]?.opponent?.name || 'Équipe A';
      const b = m.opponents[1]?.opponent?.name || 'Équipe B';
      return {
        externalId: String(m.id),
        startTime: m.begin_at,
        title: m.name || `${a} vs ${b}`,
        allowDraw: false,
        options: [
          { label: a, externalRole: 'HOME' },
          { label: b, externalRole: 'AWAY' },
        ],
      };
    });
}

export async function getFinishedFixtures({ competitionId, sinceDays = 3 }) {
  const matches = await request('/matches/past', {
    'filter[league_id]': competitionId,
    'range[end_at]': isoRangePast(sinceDays),
  });

  const finished = [];
  for (const m of matches) {
    if (!Array.isArray(m.opponents) || m.opponents.length !== 2) continue;
    if (FINISHED_STATUSES.includes(m.status)) {
      const homeId = m.opponents[0]?.opponent?.id;
      const awayId = m.opponents[1]?.opponent?.id;
      let winningRole = null;
      if (m.winner_id === homeId) winningRole = 'HOME';
      else if (m.winner_id === awayId) winningRole = 'AWAY';
      finished.push({ externalId: String(m.id), void: false, winningRole });
    } else if (VOID_STATUSES.includes(m.status)) {
      finished.push({ externalId: String(m.id), void: true, winningRole: null });
    }
  }
  return finished;
}
