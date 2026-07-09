import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { getMembership } from '../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;
  const { groupId } = req.query;

  const membership = await getMembership(groupId, req.userId);
  if (!membership || membership.status !== 'APPROVED') {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true, name: true, description: true, inviteCode: true, createdAt: true,
      _count: { select: { members: true, bets: true } },
    },
  });
  if (!group) return res.status(404).json({ error: 'Groupe introuvable.' });

  return res.status(200).json({
    group: {
      ...group,
      memberCount: group._count.members,
      betCount: group._count.bets,
      myRole: membership.role,
      myBalance: membership.balance,
    },
  });
});
