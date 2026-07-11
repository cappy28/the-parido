import { prisma } from '../../lib/db.js';
import { requireAuth, methodGuard } from '../../lib/auth.js';
import { uploadImage, deleteImage } from '../../lib/blobImage.js';

// Regroupe /api/users/me et /api/users/avatar dans une seule fonction serverless.
export default requireAuth(async function handler(req, res) {
  const { action } = req.query;

  if (action === 'me') return me(req, res);
  if (action === 'avatar') return avatar(req, res);
  return res.status(404).json({ error: 'Route introuvable.' });
});

async function me(req, res) {
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
}

async function avatar(req, res) {
  if (!methodGuard(req, res, ['POST', 'DELETE'])) return;

  const current = await prisma.user.findUnique({ where: { id: req.userId }, select: { avatarUrl: true } });

  if (req.method === 'DELETE') {
    await deleteImage(current?.avatarUrl);
    const user = await prisma.user.update({ where: { id: req.userId }, data: { avatarUrl: null } });
    return res.status(200).json({ user: { id: user.id, pseudo: user.pseudo, avatarUrl: user.avatarUrl } });
  }

  const { imageBase64 } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 requis.' });
  }

  try {
    const avatarUrl = await uploadImage({ folder: 'avatars', id: req.userId, dataUrl: imageBase64, previousUrl: current?.avatarUrl });
    const user = await prisma.user.update({ where: { id: req.userId }, data: { avatarUrl } });
    return res.status(200).json({ user: { id: user.id, pseudo: user.pseudo, avatarUrl: user.avatarUrl } });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
