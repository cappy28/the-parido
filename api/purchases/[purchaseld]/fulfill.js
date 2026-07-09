import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireGroupAdmin } from '../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { purchaseId } = req.query;
  const { action } = req.body || {};

  if (!['fulfill', 'cancel'].includes(action)) {
    return res.status(400).json({ error: "action doit être 'fulfill' ou 'cancel'." });
  }

  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) return res.status(404).json({ error: 'Achat introuvable.' });

  const admin = await requireGroupAdmin(purchase.groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut gérer les commandes.' });

  if (purchase.status !== 'PENDING') {
    return res.status(400).json({ error: 'Cette commande est déjà clôturée.' });
  }

  if (action === 'fulfill') {
    const updated = await prisma.purchase.update({
      where: { id: purchaseId },
      data: { status: 'FULFILLED', fulfilledAt: new Date() },
    });
    return res.status(200).json({ purchase: updated });
  }

  // cancel — remboursement intégral + restock si applicable
  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: purchase.membershipId },
      data: { balance: { increment: purchase.costPaid } },
    });
    await tx.walletTransaction.create({
      data: {
        membershipId: purchase.membershipId,
        type: 'REFUND',
        amount: purchase.costPaid,
        description: `Remboursement — commande annulée (${purchase.itemName})`,
      },
    });
    const item = await tx.shopItem.findUnique({ where: { id: purchase.shopItemId } });
    if (item && item.stock !== null) {
      await tx.shopItem.update({ where: { id: item.id }, data: { stock: { increment: 1 } } });
    }
    await tx.purchase.update({ where: { id: purchaseId }, data: { status: 'CANCELLED' } });
  });

  return res.status(200).json({ message: 'Commande annulée, points remboursés.' });
});
