// Interface commune à tous les adaptateurs (documentation) :
//
//   async getUpcomingFixtures({ competitionId, season, days }) -> [{
//     externalId, startTime, title,
//     options: [{ label, externalRole: string unique par option }, ...]
//   }]
//
//   async getFinishedFixtures({ competitionId, season, sinceDays }) -> [{
//     externalId, void: boolean, winningRole: string|null
//   }]
//
// Ajouter un nouveau fournisseur = ajouter un fichier qui respecte cette forme,
// puis l'enregistrer ci-dessous. Le reste du système (cron, DB, UI) n'a rien à savoir
// des détails de chaque API. Les champs `competitionIdHint`/`seasonHint`/`defaultCompetitionId`
// pilotent l'aide affichée dans le formulaire "Suivre une compétition" (onglet Auto) —
// ajoutés pour que la liste des fournisseurs et leurs indications ne soient plus
// codées en dur côté frontend (elles l'étaient avant, ce qui obligeait à modifier
// 2 fichiers à chaque nouveau fournisseur et désynchronisait facilement les deux).

import * as thesportsdbFootball from './thesportsdbFootball.js';
import * as thesportsdbBasketball from './thesportsdbBasketball.js';
import * as pandascore from './pandascore.js';
import * as f1 from './f1.js';
import * as motogp from './motogp.js';

export const PROVIDERS = {
  'api-football': {
    adapter: thesportsdbFootball, sport: 'FOOTBALL', emoji: '⚽', label: 'Football — TheSportsDB, sans clé',
    competitionIdHint: "Id numérique de la ligue chez TheSportsDB (cherche via thesportsdb.com/sport/leagues, ex: 4334 pour la Ligue 1).",
    seasonHint: 'Non utilisé pour ce fournisseur.', seasonRequired: false,
  },
  'api-basketball': {
    adapter: thesportsdbBasketball, sport: 'BASKETBALL', emoji: '🏀', label: 'Basketball — TheSportsDB, sans clé',
    competitionIdHint: "Id numérique de la ligue chez TheSportsDB (cherche via thesportsdb.com/sport/leagues, ex: 4387 pour la NBA).",
    seasonHint: 'Non utilisé pour ce fournisseur.', seasonRequired: false,
  },
  'pandascore': {
    adapter: pandascore, sport: 'ESPORTS', emoji: '🎮', label: 'E-sport — pandascore.co',
    competitionIdHint: "Id de la ligue chez PandaScore (ex: recherche via leur API).",
    seasonHint: 'Non utilisé pour ce fournisseur.', seasonRequired: false,
  },
  'f1': {
    adapter: f1, sport: 'F1', emoji: '🏎️', label: 'Formule 1 — jolpica (ex-Ergast), sans clé',
    competitionIdHint: "Pas utilisé pour la F1 (il n'y a qu'une seule compétition) — laisse la valeur pré-remplie.",
    seasonHint: "Année de la saison, ex: 2026.", seasonRequired: true, defaultCompetitionId: 'f1',
  },
  'motogp': {
    adapter: motogp, sport: 'MOTORSPORT', emoji: '🏍️', label: 'MotoGP — API non-officielle motogp.com, sans clé',
    competitionIdHint: "Catégorie : motogp, moto2, moto3 ou motoe.",
    seasonHint: "Année de la saison, ex: 2026.", seasonRequired: true, defaultCompetitionId: 'motogp',
  },
};

export function getAdapter(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) throw new Error(`Fournisseur inconnu : "${provider}". Options : ${Object.keys(PROVIDERS).join(', ')}`);
  return entry.adapter;
}

export function getEmoji(provider) {
  return PROVIDERS[provider]?.emoji || '🎲';
}

// Métadonnées consommées par le formulaire "Suivre une compétition" — évite de
// dupliquer la liste des fournisseurs et leurs indications côté frontend.
export function listProviders() {
  return Object.entries(PROVIDERS).map(([key, p]) => ({
    key,
    label: p.label,
    emoji: p.emoji,
    competitionIdHint: p.competitionIdHint,
    seasonHint: p.seasonHint,
    seasonRequired: !!p.seasonRequired,
    defaultCompetitionId: p.defaultCompetitionId || '',
  }));
}

