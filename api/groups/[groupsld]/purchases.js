import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireApprovedMember } from '../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;
  const { groupId } = req.query;

  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });

  const purchases = await prisma.purchase.findMany({
    where: me.role === 'ADMIN' ? { groupId } : { groupId, userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { pseudo: true, avatarUrl: true } } },
  });

  return res.status(200).json({ purchases });
});
