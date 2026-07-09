import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';

export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { betId } = req.query;
  const { optionId, amount } = req.body || {};

  const amountInt = Number.isInteger(amount) ? amount : parseInt(amount, 10);
  if (!optionId || !Number.isInteger(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: "optionId et amount (entier positif) sont requis." });
  }

  const event = await prisma.betEvent.findUnique({
    where: { id: betId },
    include: { options: true },
  });
  if (!event) return res.status(404).json({ error: 'Pari introuvable.' });
  if (event.status !== 'OPEN') {
    return res.status(400).json({ error: 'Ce pari n\'accepte plus de mises.' });
  }
  if (event.closesAt && new Date(event.closesAt) < new Date()) {
    return res.status(400).json({ error: 'Le délai pour miser sur ce pari est dépassé.' });
  }
  const option = event.options.find((o) => o.id === optionId);
  if (!option) {
    return res.status(400).json({ error: 'Cette option n\'existe pas pour ce pari.' });
  }

  try {
    const wager = await prisma.$transaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { groupId_userId: { groupId: event.groupId, userId: req.userId } },
      });
      if (!membership || membership.status !== 'APPROVED') {
        throw new HttpError400("Tu n'es pas membre approuvé de ce groupe.");
      }
      if (membership.balance < amountInt) {
        throw new HttpError400(`Solde insuffisant (tu as ${membership.balance} points).`);
      }

      await tx.membership.update({
        where: { id: membership.id },
        data: { balance: { decrement: amountInt } },
      });

      await tx.walletTransaction.create({
        data: {
          membershipId: membership.id,
          type: 'WAGER',
          amount: -amountInt,
          description: `Mise sur "${event.title}" — ${option.label}`,
        },
      });

      return tx.wager.create({
        data: {
          betEventId: event.id,
          optionId,
          membershipId: membership.id,
          userId: req.userId,
          amount: amountInt,
        },
      });
    });

    return res.status(201).json({ wager });
  } catch (err) {
    if (err instanceof HttpError400) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});

// Petite erreur locale pour remonter un message 400 depuis la transaction Prisma.
class HttpError400 extends Error {}
