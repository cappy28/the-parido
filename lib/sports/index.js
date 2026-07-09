// Interface commune à tous les adaptateurs (documentation) :
//
//   async getUpcomingFixtures({ competitionId, season, days }) -> [{
//     externalId, startTime, title, allowDraw,
//     options: [{ label, externalRole: 'HOME'|'AWAY'|'DRAW' }, ...]
//   }]
//
//   async getFinishedFixtures({ competitionId, season, sinceDays }) -> [{
//     externalId, void: boolean, winningRole: 'HOME'|'AWAY'|'DRAW'|null
//   }]
//
// Ajouter un nouveau fournisseur = ajouter un fichier qui respecte cette forme,
// puis l'enregistrer ci-dessous. Le reste du système (cron, DB, UI) n'a rien à savoir
// des détails de chaque API.

import * as apiFootball from './apiFootball.js';
import * as apiBasketball from './apiBasketball.js';
import * as pandascore from './pandascore.js';

export const PROVIDERS = {
  'api-football': { adapter: apiFootball, sport: 'FOOTBALL', emoji: '⚽' },
  'api-basketball': { adapter: apiBasketball, sport: 'BASKETBALL', emoji: '🏀' },
  'pandascore': { adapter: pandascore, sport: 'ESPORTS', emoji: '🎮' },
};

export function getAdapter(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) throw new Error(`Fournisseur inconnu : "${provider}". Options : ${Object.keys(PROVIDERS).join(', ')}`);
  return entry.adapter;
}

export function getEmoji(provider) {
  return PROVIDERS[provider]?.emoji || '🎲';
}
