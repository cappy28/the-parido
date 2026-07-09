import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireApprovedMember } from '../../../lib/groupAccess.js';

const STARTING_BALANCE = 1000;

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;
  const { groupId } = req.query;

  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  const members = await prisma.membership.findMany({
    where: { groupId, status: 'APPROVED' },
    select: {
      balance: true,
      user: { select: { id: true, pseudo: true, avatarUrl: true } },
    },
    orderBy: { balance: 'desc' },
  });

  const leaderboard = members.map((m, i) => ({
    rank: i + 1,
    pseudo: m.user.pseudo,
    avatarUrl: m.user.avatarUrl,
    balance: m.balance,
    net: m.balance - STARTING_BALANCE,
  }));

  return res.status(200).json({ leaderboard });
});
