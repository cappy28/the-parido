import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireGroupAdmin } from '../../../lib/groupAccess.js';
import { resolveBetEvent, BetLogicError } from '../../../lib/betLogic.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { betId } = req.query;
  const { winningOptionId } = req.body || {};

  const event = await prisma.betEvent.findUnique({ where: { id: betId } });
  if (!event) return res.status(404).json({ error: 'Pari introuvable.' });

  const admin = await requireGroupAdmin(event.groupId, req.userId);
  if (!admin) {
    return res.status(403).json({ error: 'Seul un admin du groupe peut résoudre un pari.' });
  }

  try {
    await resolveBetEvent({ eventId: betId, winningOptionId });
  } catch (err) {
    if (err instanceof BetLogicError) return res.status(400).json({ error: err.message });
    throw err;
  }

  return res.status(200).json({ message: 'Pari résolu.' });
});
