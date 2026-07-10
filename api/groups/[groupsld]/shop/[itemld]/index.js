import { prisma } from '../../../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../../../lib/auth.js';
import { requireGroupAdmin } from '../../../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['PATCH', 'DELETE'])) return;
  const { groupId, itemId } = req.query;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut modifier la boutique.' });

  const existing = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.groupId !== groupId) {
    return res.status(404).json({ error: 'Article introuvable.' });
  }

  if (req.method === 'DELETE') {
    const purchaseCount = await prisma.purchase.count({ where: { shopItemId: itemId } });
    if (purchaseCount > 0) {
      return res.status(400).json({ error: 'Cet article a déjà été acheté au moins une fois — désactive-le plutôt que de le supprimer.' });
    }
    await prisma.shopItem.delete({ where: { id: itemId } });
    return res.status(200).json({ message: 'Article supprimé.' });
  }

  const { name, description, cost, stock, emoji, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (cost !== undefined) {
    if (!Number.isInteger(cost) || cost <= 0) return res.status(400).json({ error: 'cost doit être un entier positif.' });
    data.cost = cost;
  }
  if (stock !== undefined) data.stock = stock === null ? null : stock;
  if (emoji !== undefined) data.emoji = String(emoji).trim() || '🎁';
  if (active !== undefined) data.active = Boolean(active);

  const item = await prisma.shopItem.update({ where: { id: itemId }, data });
  return res.status(200).json({ item });
});
