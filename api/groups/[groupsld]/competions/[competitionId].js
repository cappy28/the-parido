import { prisma } from '../../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../../lib/auth.js';
import { requireGroupAdmin } from '../../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['PATCH', 'DELETE'])) return;
  const { groupId, competitionId } = req.query;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut modifier le suivi automatique.' });

  const existing = await prisma.groupCompetition.findUnique({ where: { id: competitionId } });
  if (!existing || existing.groupId !== groupId) {
    return res.status(404).json({ error: 'Compétition suivie introuvable.' });
  }

  if (req.method === 'DELETE') {
    await prisma.groupCompetition.delete({ where: { id: competitionId } });
    return res.status(200).json({ message: 'Suivi supprimé (les paris déjà créés restent).' });
  }

  // PATCH — activer/désactiver
  const { enabled } = req.body || {};
  const updated = await prisma.groupCompetition.update({
    where: { id: competitionId },
    data: { enabled: Boolean(enabled) },
  });
  return res.status(200).json({ competition: updated });
});
