import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireApprovedMember } from '../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;
  const { groupId } = req.query;

  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  const approved = await prisma.membership.findMany({
    where: { groupId, status: 'APPROVED' },
    select: {
      id: true, role: true, balance: true, joinedAt: true,
      user: { select: { id: true, pseudo: true, avatarUrl: true } },
    },
    orderBy: { balance: 'desc' },
  });

  const payload = { members: approved };

  if (me.role === 'ADMIN') {
    const pending = await prisma.membership.findMany({
      where: { groupId, status: 'PENDING' },
      select: {
        id: true, joinedAt: true,
        user: { select: { id: true, pseudo: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    payload.pending = pending;
  }

  return res.status(200).json(payload);
});
