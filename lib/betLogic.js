import { prisma } from './db.js';

export class BetLogicError extends Error {}

// Résout un pari : les gagnants se partagent la cagnotte au prorata de leur mise
// (pari mutuel, comme le tiercé). Si personne n'a misé sur l'issue gagnante,
// tout le monde est remboursé. Utilisé par l'admin (résolution manuelle) ET par
// le cron de résolution automatique — un seul et même calcul, pas de duplication.
export async function resolveBetEvent({ eventId, winningOptionId }) {
  const event = await prisma.betEvent.findUnique({
    where: { id: eventId },
    include: { options: true, wagers: true },
  });
  if (!event) throw new BetLogicError('Pari introuvable.');
  if (event.status === 'RESOLVED' || event.status === 'CANCELLED') {
    throw new BetLogicError('Ce pari est déjà clôturé.');
  }
  if (!event.options.some((o) => o.id === winningOptionId)) {
    throw new BetLogicError('winningOptionId invalide pour ce pari.');
  }

  const totalPool = event.wagers.reduce((s, w) => s + w.amount, 0);
  const winningWagers = event.wagers.filter((w) => w.optionId === winningOptionId);
  const winningPool = winningWagers.reduce((s, w) => s + w.amount, 0);

  await prisma.$transaction(async (tx) => {
    if (winningPool === 0) {
      for (const w of event.wagers) {
        await tx.membership.update({ where: { id: w.membershipId }, data: { balance: { increment: w.amount } } });
        await tx.walletTransaction.create({
          data: { membershipId: w.membershipId, type: 'REFUND', amount: w.amount, description: `Remboursement — "${event.title}" (aucun gagnant)` },
        });
        await tx.wager.update({ where: { id: w.id }, data: { payout: w.amount } });
      }
    } else {
      for (const w of winningWagers) {
        const payout = Math.round(w.amount * (totalPool / winningPool));
        await tx.membership.update({ where: { id: w.membershipId }, data: { balance: { increment: payout } } });
        await tx.walletTransaction.create({
          data: { membershipId: w.membershipId, type: 'PAYOUT', amount: payout, description: `Gain — "${event.title}"` },
        });
        await tx.wager.update({ where: { id: w.id }, data: { payout } });
      }
      const losingWagers = event.wagers.filter((w) => w.optionId !== winningOptionId);
      for (const w of losingWagers) {
        await tx.wager.update({ where: { id: w.id }, data: { payout: 0 } });
      }
    }

    await tx.betEvent.update({
      where: { id: event.id },
      data: { status: 'RESOLVED', resolvedOptionId: winningOptionId, resolvedAt: new Date() },
    });
  });
}

// Annule un pari et rembourse toutes les mises intégralement.
export async function cancelBetEvent({ eventId, reason }) {
  const event = await prisma.betEvent.findUnique({ where: { id: eventId }, include: { wagers: true } });
  if (!event) throw new BetLogicError('Pari introuvable.');
  if (event.status === 'RESOLVED' || event.status === 'CANCELLED') {
    throw new BetLogicError('Ce pari est déjà clôturé.');
  }

  await prisma.$transaction(async (tx) => {
    for (const w of event.wagers) {
      await tx.membership.update({ where: { id: w.membershipId }, data: { balance: { increment: w.amount } } });
      await tx.walletTransaction.create({
        data: { membershipId: w.membershipId, type: 'REFUND', amount: w.amount, description: `Remboursement — "${event.title}" (${reason || 'pari annulé'})` },
      });
      await tx.wager.update({ where: { id: w.id }, data: { payout: w.amount } });
    }
    await tx.betEvent.update({ where: { id: event.id }, data: { status: 'CANCELLED' } });
  });
}
