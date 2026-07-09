import { prisma } from '../../../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../../../lib/auth.js';
import { requireGroupAdmin, getMembership } from '../../../../../lib/groupAccess.js';

const STARTING_BALANCE = 1000;

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { groupId, userId } = req.query;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) {
    return res.status(403).json({ error: 'Seul un admin du groupe peut valider les membres.' });
  }

  const { action } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "action doit être 'approve' ou 'reject'." });
  }

  const target = await getMembership(groupId, userId);
  if (!target || target.status !== 'PENDING') {
    return res.status(404).json({ error: 'Aucune demande en attente pour cet utilisateur.' });
  }

  if (action === 'reject') {
    const membership = await prisma.membership.update({
      where: { id: target.id },
      data: { status: 'REJECTED' },
    });
    return res.status(200).json({ membership });
  }

  const membership = await prisma.membership.update({
    where: { id: target.id },
    data: {
      status: 'APPROVED',
      balance: STARTING_BALANCE,
      transactions: {
        create: {
          type: 'BONUS',
          amount: STARTING_BALANCE,
          description: "Solde de départ (rejoint le groupe)",
        },
      },
    },
  });

  return res.status(200).json({ membership });
});
