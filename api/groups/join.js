import { prisma } from '../../lib/db.js';
import { requireAuth, methodGuard } from '../../lib/auth.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const { inviteCode } = req.body || {};
  if (!inviteCode || typeof inviteCode !== 'string') {
    return res.status(400).json({ error: "Code d'invitation requis." });
  }

  const group = await prisma.group.findUnique({
    where: { inviteCode: inviteCode.trim().toUpperCase() },
  });
  if (!group) {
    return res.status(404).json({ error: "Aucun groupe ne correspond à ce code d'invitation." });
  }

  const existing = await prisma.membership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: req.userId } },
  });

  if (existing) {
    if (existing.status === 'APPROVED') {
      return res.status(409).json({ error: 'Tu es déjà membre de ce groupe.' });
    }
    if (existing.status === 'PENDING') {
      return res.status(409).json({ error: "Ta demande est déjà en attente de validation par l'admin." });
    }
    // Était REJECTED — on relance une demande.
    const membership = await prisma.membership.update({
      where: { id: existing.id },
      data: { status: 'PENDING' },
    });
    return res.status(200).json({ membership, group: { id: group.id, name: group.name } });
  }

  const membership = await prisma.membership.create({
    data: { groupId: group.id, userId: req.userId, status: 'PENDING' },
  });

  return res.status(201).json({
    membership,
    group: { id: group.id, name: group.name },
    message: "Demande envoyée. Un admin du groupe doit l'approuver.",
  });
});
