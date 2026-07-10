import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireGroupAdmin } from '../../../lib/groupAccess.js';
import { resolveBetEvent, cancelBetEvent, BetLogicError } from '../../../lib/betLogic.js';

// Regroupe /api/bets/:betId/wager, /status et /resolve.
// NB: le dossier s'appelait auparavant [betld] (l minuscule au lieu de I),
// ce qui faisait que req.query.betId valait toujours undefined. Corrigé ici.
export default requireAuth(async function handler(req, res) {
  const { betId, action } = req.query;

  if (action === 'wager') return wager(req, res, betId);
  if (action === 'status') return status(req, res, betId);
  if (action === 'resolve') return resolve(req, res, betId);
  return res.status(404).json({ error: 'Route introuvable.' });
});

class HttpError400 extends Error {}

async function wager(req, res, betId) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { optionId, amount } = req.body || {};

  const amountInt = Number.isInteger(amount) ? amount : parseInt(amount, 10);
  if (!optionId || !Number.isInteger(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'optionId et amount (entier positif) sont requis.' });
  }

  const event = await prisma.betEvent.findUnique({
    where: { id: betId },
    include: { options: true },
  });
  if (!event) return res.status(404).json({ error: 'Pari introuvable.' });
  if (event.status !== 'OPEN') {
    return res.status(400).json({ error: "Ce pari n'accepte plus de mises." });
  }
  if (event.closesAt && new Date(event.closesAt) < new Date()) {
    return res.status(400).json({ error: 'Le délai pour miser sur ce pari est dépassé.' });
  }
  const option = event.options.find((o) => o.id === optionId);
  if (!option) {
    return res.status(400).json({ error: "Cette option n'existe pas pour ce pari." });
  }

  try {
    const wagerRecord = await prisma.$transaction(async (tx) => {
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

    return res.status(201).json({ wager: wagerRecord });
  } catch (err) {
    if (err instanceof HttpError400) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}

async function status(req, res, betId) {
  if (!methodGuard(req, res, ['POST'])) return;
  const { action: statusAction } = req.body || {};

  if (!['close', 'cancel'].includes(statusAction)) {
    return res.status(400).json({ error: "action doit être 'close' ou 'cancel'." });
  }

  const event = await prisma.betEvent.findUnique({ where: { id: betId } });
  if (!event) return res.status(404).json({ error: 'Pari introuvable.' });

  const admin = await requireGroupAdmin(event.groupId, req.userId);
  if (!admin) {
    return res.status(403).json({ error: 'Seul un admin du groupe peut gérer ce pari.' });
  }

  if (statusAction === 'close') {
    if (event.status !== 'OPEN') {
      return res.status(400).json({ error: "Ce pari n'est pas ouvert." });
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
}

async function resolve(req, res, betId) {
  if (!methodGuard(req, res, ['POST'])) return;
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
}
