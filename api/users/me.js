import { prisma } from '../../lib/db.js';
import { requireAuth, methodGuard } from '../../lib/auth.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true, pseudo: true, avatarUrl: true, createdAt: true,
      memberships: {
        where: { status: 'APPROVED' },
        select: {
          balance: true, role: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
  });
  return res.status(200).json({ user });
});
