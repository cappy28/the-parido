// Remplace l'ancien adaptateur api-football.com (qui nécessitait une clé).
// Voir thesportsdb.js pour les détails et limites de ce fournisseur.
import { buildAdapter } from './thesportsdb.js';

const adapter = buildAdapter('football');
export const getUpcomingFixtures = adapter.getUpcomingFixtures;
export const getFinishedFixtures = adapter.getFinishedFixtures;
