// Cœur partagé pour 2 fournisseurs (foot + basket) — voir thesportsdbFootball.js
// et thesportsdbBasketball.js pour les points d'entrée réellement enregistrés.
//
// TheSportsDB (thesportsdb.com) est une base sportive communautaire (façon
// Wikipedia), GRATUITE et SANS INSCRIPTION grâce à sa clé de test publique
// "123" — documentée officiellement ici : https://www.thesportsdb.com/free_sports_api
// Ce n'est pas une clé personnelle à obtenir, c'est une clé PARTAGÉE par tout
// le monde et publiée par TheSportsDB lui-même : rien à créer, rien à coller
// dans les variables d'environnement.
//
// ⚠️ Contreparties réelles par rapport à api-football/api-basketball (à
// connaître avant de basculer dessus) :
// - Base communautaire : une petite ligue ou un club peu suivi peut avoir des
//   données manquantes ou en retard. Les grandes ligues (Ligue 1, Premier
//   League, NBA...) sont bien couvertes.
// - Le plan gratuit limite `eventsday.php` à 3 événements par jour interrogé.
//   L'adaptateur interroge donc jour par jour (au lieu d'un seul appel
//   "prochains matchs") pour limiter la perte de données, mais une ligue qui
//   joue plus de 3 matchs LE MÊME JOUR peut quand même en perdre quelques-uns
//   (rare : la plupart des championnats n'alignent qu'une affiche par équipe
//   et par journée, mais ça peut arriver lors d'un multiplex).
// - Débit : 30 requêtes/minute sur la clé gratuite.

const BASE_URL = 'https://www.thesportsdb.com/api/v1/json/123';

async function request(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`TheSportsDB a répondu ${res.status}`);
  return res.json();
}

function toISO(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr || '00:00:00'}Z`).toISOString();
}

function dayString(offsetDays) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function buildOptions(event, sport) {
  const home = { label: event.strHomeTeam, externalRole: 'HOME' };
  const away = { label: event.strAwayTeam, externalRole: 'AWAY' };
  return sport === 'football' ? [home, away, { label: 'Match nul', externalRole: 'DRAW' }] : [home, away];
}

// Renvoie 'HOME' | 'AWAY' | 'DRAW' | null (null = pas encore joué)
function computeWinningRole(event) {
  const h = parseInt(event.intHomeScore, 10);
  const a = parseInt(event.intAwayScore, 10);
  if (Number.isNaN(h) || Number.isNaN(a)) return null;
  if (h > a) return 'HOME';
  if (a > h) return 'AWAY';
  return 'DRAW';
}

export function buildAdapter(sport) {
  return {
    async getUpcomingFixtures({ competitionId, days = 10 }) {
      if (!competitionId) return [];
      const fixtures = [];
      const seen = new Set();

      for (let i = 0; i <= days; i++) {
        let data;
        try {
          data = await request(`/eventsday.php?d=${dayString(i)}&l=${competitionId}`);
        } catch {
          continue; // cette journée a échoué -> on continue avec les suivantes
        }
        for (const ev of data?.events || []) {
          if (!ev.strHomeTeam || !ev.strAwayTeam || seen.has(ev.idEvent)) continue;
          seen.add(ev.idEvent);
          fixtures.push({
            externalId: ev.idEvent,
            startTime: toISO(ev.dateEvent, ev.strTime),
            title: `${ev.strHomeTeam} vs ${ev.strAwayTeam}`,
            options: buildOptions(ev, sport),
          });
        }
      }
      return fixtures;
    },

    async getFinishedFixtures({ competitionId, sinceDays = 3 }) {
      if (!competitionId) return [];
      const finished = [];
      const seen = new Set();

      for (let i = 0; i <= sinceDays; i++) {
        let data;
        try {
          data = await request(`/eventsday.php?d=${dayString(-i)}&l=${competitionId}`);
        } catch {
          continue;
        }
        for (const ev of data?.events || []) {
          if (seen.has(ev.idEvent)) continue;
          const role = computeWinningRole(ev);
          if (!role) continue; // pas encore de score -> pas fini, retenté au prochain passage
          seen.add(ev.idEvent);
          finished.push({ externalId: ev.idEvent, void: false, winningRole: role });
        }
      }
      return finished;
    },
  };
}
