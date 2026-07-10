import { prisma } from '../../../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../../../lib/auth.js';
import { requireGroupAdmin } from '../../../../../lib/groupAccess.js';
import { uploadImage, deleteImage } from '../../../../../lib/blobImage.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST', 'DELETE'])) return;
  const { groupId, itemId } = req.query;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut modifier la boutique.' });

  const item = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!item || item.groupId !== groupId) {
    return res.status(404).json({ error: 'Article introuvable.' });
  }

  if (req.method === 'DELETE') {
    await deleteImage(item.imageUrl);
    const updated = await prisma.shopItem.update({ where: { id: itemId }, data: { imageUrl: null } });
    return res.status(200).json({ item: updated });
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 requis.' });

  try {
    const imageUrl = await uploadImage({ folder: 'shop-items', id: itemId, dataUrl: imageBase64, previousUrl: item.imageUrl });
    const updated = await prisma.shopItem.update({ where: { id: itemId }, data: { imageUrl } });
    return res.status(200).json({ item: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});
