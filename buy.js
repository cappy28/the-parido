import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';

// NB: le dossier s'appelait auparavant [itemld] (l minuscule au lieu de I),
// ce qui faisait que req.query.itemId valait toujours undefined. Corrigé ici.
export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { itemId } = req.query;

  const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!item || !item.active) {
    return res.status(404).json({ error: "Cet article n'est plus disponible." });
  }

  try {
    const purchase = await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { groupId_userId: { groupId: item.groupId, userId: req.userId } },
      });
      if (!membership || membership.status !== 'APPROVED') {
        throw new ShopError("Tu n'es pas membre approuvé de ce groupe.");
      }
      if (membership.balance < item.cost) {
        throw new ShopError(`Solde insuffisant (tu as ${membership.balance} points, il en faut ${item.cost}).`);
      }

      // Reverifie le stock à l'intérieur de la transaction pour éviter une survente en cas d'achats simultanés.
      const fresh = await tx.shopItem.findUnique({ where: { id: itemId } });
      if (!fresh.active) throw new ShopError("Cet article n'est plus disponible.");
      if (fresh.stock !== null && fresh.stock <= 0) throw new ShopError('Rupture de stock.');

      await tx.membership.update({ where: { id: membership.id }, data: { balance: { decrement: item.cost } } });
      await tx.walletTransaction.create({
        data: { membershipId: membership.id, type: 'PURCHASE', amount: -item.cost, description: `Achat — ${item.emoji} ${item.name}` },
      });
      if (fresh.stock !== null) {
        await tx.shopItem.update({ where: { id: itemId }, data: { stock: { decrement: 1 } } });
      }

      return tx.purchase.create({
        data: {
          shopItemId: item.id,
          membershipId: membership.id,
          userId: req.userId,
          groupId: item.groupId,
          itemName: item.name,
          costPaid: item.cost,
        },
      });
    });

    return res.status(201).json({ purchase });
  } catch (err) {
    if (err instanceof ShopError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

class ShopError extends Error {}
