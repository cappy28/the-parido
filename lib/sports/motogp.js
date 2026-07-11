// Adaptateur MotoGP via l'API "cachée" de motogp.com (api.motogp.pulselive.com).
// GRATUITE, SANS clé, mais NON OFFICIELLE et non documentée par Dorna — comme pour
// PandaScore (voir pandascore.js), c'est un tiers non garanti dans le temps.
// Doc communautaire (reverse-engineering) : https://github.com/robschmitt/MotoGP-API
//
// ⚠️ Cet adaptateur n'a pas pu être testé contre l'API en direct (le bac à sable
// dans lequel il a été écrit n'a pas d'accès réseau sortant). La forme des
// réponses suit fidèlement la doc ci-dessus, mais si `/api/cron/sync-fixtures`
// échoue avec une erreur venant de ce fichier une fois en prod, envoie-moi le
// message d'erreur exact et je corrige.
//
// Le champ `competitionId` du formulaire sert ici à choisir la catégorie :
// "motogp" (défaut), "moto2", "moto3" ou "motoe". `season` = l'année (ex: "2026").

const BASE_URL = 'https://api.motogp.pulselive.com/motogp/v1';

async function request(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`API MotoGP a répondu ${res.status}`);
  return res.json();
}

function resolveCategoryName(competitionId) {
  const raw = (competitionId || 'motogp').trim().toLowerCase();
  if (raw.includes('moto2')) return 'moto2';
  if (raw.includes('moto3')) return 'moto3';
  if (raw.includes('motoe')) return 'motoe';
  return 'motogp';
}

// "MotoGP™" -> "motogp" pour pouvoir comparer sans se soucier du symbole ™.
function normalizeCategoryLabel(name) {
  return name.replace(/[™©]/g, '').trim().toLowerCase();
}

async function resolveSeasonUuid(season) {
  const seasons = await request('/results/seasons');
  const year = season && String(season).trim() ? parseInt(season, 10) : new Date().getUTCFullYear();
  const match = seasons.find((s) => s.year === year) || seasons.find((s) => s.current);
  if (!match) throw new Error(`Saison MotoGP introuvable pour ${year}.`);
  return match.id;
}

async function resolveCategoryUuid(seasonUuid, competitionId) {
  const wanted = resolveCategoryName(competitionId);
  const categories = await request(`/results/categories?seasonUuid=${seasonUuid}`);
  const match = categories.find((c) => normalizeCategoryLabel(c.name) === wanted);
  if (!match) throw new Error(`Catégorie "${wanted}" introuvable pour cette saison MotoGP.`);
  return { categoryUuid: match.id, categoryLabel: match.name.replace(/[™©]/g, '') };
}

// Trouve la session "course" (type RAC) d'un event pour une catégorie donnée.
async function findRaceSession(eventUuid, categoryUuid) {
  const sessions = await request(`/results/sessions?eventUuid=${eventUuid}&categoryUuid=${categoryUuid}`);
  return sessions.find((s) => s.type === 'RAC') || null;
}

export async function getUpcomingFixtures({ competitionId, season, days = 21 }) {
  const seasonUuid = await resolveSeasonUuid(season);
  const { categoryUuid, categoryLabel } = await resolveCategoryUuid(seasonUuid, competitionId);

  const events = await request(`/results/events?seasonUuid=${seasonUuid}&isFinished=false`);
  const now = Date.now();
  const horizon = now + days * 86400000;

  const fixtures = [];
  for (const event of events) {
    const eventUuid = event.id;
    if (!eventUuid) continue;

    let raceSession;
    try {
      raceSession = await findRaceSession(eventUuid, categoryUuid);
    } catch {
      continue; // event sans sessions publiées pour l'instant -> ignoré ce passage-ci
    }
    if (!raceSession) continue;

    const t = new Date(raceSession.date).getTime();
    if (!(t > now && t <= horizon)) continue;

    let entry;
    try {
      entry = await request(`/event/${eventUuid}/entry?categoryUuid=${categoryUuid}`);
    } catch {
      continue; // liste des pilotes pas encore publiée -> retenté au prochain passage
    }
    const riders = entry?.entry || [];
    if (riders.length === 0) continue;

    const eventName = (event.sponsored_name || event.circuit?.name || 'Grand Prix').replace(/[™©]/g, '');

    fixtures.push({
      externalId: raceSession.id,
      startTime: new Date(raceSession.date).toISOString(),
      title: `${eventName} — ${categoryLabel} — vainqueur`,
      options: riders.map((r) => ({
        label: r.rider?.full_name || `#${r.number}`,
        externalRole: r.rider?.id,
      })).filter((o) => o.externalRole),
    });
  }
  return fixtures;
}

export async function getFinishedFixtures({ competitionId, season, sinceDays = 5 }) {
  const seasonUuid = await resolveSeasonUuid(season);
  const { categoryUuid } = await resolveCategoryUuid(seasonUuid, competitionId);

  const events = await request(`/results/events?seasonUuid=${seasonUuid}&isFinished=true`);
  const now = Date.now();
  const since = now - sinceDays * 86400000;

  const finished = [];
  for (const event of events) {
    const eventUuid = event.id;
    if (!eventUuid) continue;

    let raceSession;
    try {
      raceSession = await findRaceSession(eventUuid, categoryUuid);
    } catch {
      continue;
    }
    if (!raceSession) continue;

    const t = new Date(raceSession.date).getTime();
    if (!(t <= now && t >= since)) continue;

    try {
      const data = await request(`/results/session/${raceSession.id}/classification`);
      const winner = (data?.classification || []).find((c) => c.position === 1);
      if (winner?.rider?.id) {
        finished.push({ externalId: raceSession.id, void: false, winningRole: winner.rider.id });
      }
      // Pas encore de classification publiée -> on ne renvoie rien, retenté demain.
    } catch {
      // échec ponctuel -> ignoré, retenté au prochain passage du cron
    }
  }
  return finished;
}
