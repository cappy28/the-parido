import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireApprovedMember, requireGroupAdmin } from '../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  const { groupId } = req.query;

  if (req.method === 'GET') {
    const me = await requireApprovedMember(groupId, req.userId);
    if (!me) return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });

    const items = await prisma.shopItem.findMany({
      where: me.role === 'ADMIN' ? { groupId } : { groupId, active: true },
      orderBy: [{ active: 'desc' }, { cost: 'asc' }],
    });
    return res.status(200).json({ items, myBalance: me.balance });
  }

  if (req.method === 'POST') {
    const admin = await requireGroupAdmin(groupId, req.userId);
    if (!admin) return res.status(403).json({ error: 'Seul un admin peut ajouter un article à la boutique.' });

    const { name, description, cost, stock, emoji } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis.' });
    if (!Number.isInteger(cost) || cost <= 0) return res.status(400).json({ error: 'cost doit être un entier positif.' });
    if (stock !== undefined && stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      return res.status(400).json({ error: 'stock doit être un entier positif, ou vide pour illimité.' });
    }

    const item = await prisma.shopItem.create({
      data: {
        groupId,
        name: name.trim(),
        description: description?.trim() || null,
        cost,
        stock: stock ?? null,
        emoji: emoji?.trim() || '🎁',
      },
    });
    return res.status(201).json({ item });
  }

  return methodGuard(req, res, ['GET', 'POST']);
});
