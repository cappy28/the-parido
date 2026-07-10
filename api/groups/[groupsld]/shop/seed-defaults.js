import { prisma } from '../../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../../lib/auth.js';
import { requireGroupAdmin } from '../../../../lib/groupAccess.js';
import { DEFAULT_SHOP_ITEMS } from '../../../../lib/defaultShopItems.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { groupId } = req.query;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut charger les articles par défaut.' });

  const existingNames = new Set(
    (await prisma.shopItem.findMany({ where: { groupId }, select: { name: true } })).map((i) => i.name)
  );
  const toCreate = DEFAULT_SHOP_ITEMS.filter((it) => !existingNames.has(it.name));

  if (toCreate.length === 0) {
    return res.status(200).json({ created: 0, message: 'Tous les articles par défaut sont déjà présents.' });
  }

  await prisma.shopItem.createMany({ data: toCreate.map((it) => ({ ...it, groupId })) });

  return res.status(201).json({ created: toCreate.length });
});
