import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireApprovedMember, requireGroupAdmin } from '../../../lib/groupAccess.js';
import { PROVIDERS } from '../../../lib/sports/index.js';

export default requireAuth(async function handler(req, res) {
  const { groupId } = req.query;

  if (req.method === 'GET') {
    const me = await requireApprovedMember(groupId, req.userId);
    if (!me) return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });

    const competitions = await prisma.groupCompetition.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ competitions, providers: Object.keys(PROVIDERS) });
  }

  if (req.method === 'POST') {
    const admin = await requireGroupAdmin(groupId, req.userId);
    if (!admin) return res.status(403).json({ error: 'Seul un admin peut configurer le suivi automatique.' });

    const { provider, competitionId, season, label, daysAhead } = req.body || {};
    if (!provider || !PROVIDERS[provider]) {
      return res.status(400).json({ error: `provider invalide. Options : ${Object.keys(PROVIDERS).join(', ')}` });
    }
    if (!competitionId || !String(competitionId).trim()) {
      return res.status(400).json({ error: "competitionId requis (l'id de la ligue chez le fournisseur — voir README)." });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'label requis (nom affiché, ex: "Ligue 1").' });
    }

    try {
      const competition = await prisma.groupCompetition.create({
        data: {
          groupId,
          provider,
          sport: PROVIDERS[provider].sport,
          competitionId: String(competitionId).trim(),
          season: season ? String(season).trim() : null,
          label: label.trim(),
          daysAhead: Number.isInteger(daysAhead) && daysAhead > 0 ? daysAhead : 7,
        },
      });
      return res.status(201).json({ competition });
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Cette compétition est déjà suivie par ce groupe.' });
      }
      throw err;
    }
  }

  return methodGuard(req, res, ['GET', 'POST']);
});
