// Remplace l'ancien adaptateur api-basketball.com (qui nécessitait une clé).
// Voir thesportsdb.js pour les détails et limites de ce fournisseur.
import { buildAdapter } from './thesportsdb.js';

const adapter = buildAdapter('basketball');
export const getUpcomingFixtures = adapter.getUpcomingFixtures;
export const getFinishedFixtures = adapter.getFinishedFixtures;
