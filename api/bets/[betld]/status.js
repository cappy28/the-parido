import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireGroupAdmin } from '../../../lib/groupAccess.js';
import { cancelBetEvent, BetLogicError } from '../../../lib/betLogic.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { betId } = req.query;
  const { action } = req.body || {};

  if (!['close', 'cancel'].includes(action)) {
    return res.status(400).json({ error: "action doit être 'close' ou 'cancel'." });
  }

  const event = await prisma.betEvent.findUnique({ where: { id: betId } });
  if (!event) return res.status(404).json({ error: 'Pari introuvable.' });

  const admin = await requireGroupAdmin(event.groupId, req.userId);
  if (!admin) {
    return res.status(403).json({ error: 'Seul un admin du groupe peut gérer ce pari.' });
  }

  if (action === 'close') {
    if (event.status !== 'OPEN') {
      return res.status(400).json({ error: 'Ce pari n\'est pas ouvert.' });
    }
    await prisma.betEvent.update({ where: { id: event.id }, data: { status: 'CLOSED' } });
    return res.status(200).json({ message: 'Mises fermées. Tu peux maintenant résoudre le pari.' });
  }

  try {
    await cancelBetEvent({ eventId: betId, reason: 'pari annulé par un admin' });
  } catch (err) {
    if (err instanceof BetLogicError) return res.status(400).json({ error: err.message });
    throw err;
  }
  return res.status(200).json({ message: 'Pari annulé, tout le monde est remboursé.' });
});
