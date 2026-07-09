import { prisma } from '../../../lib/db.js';
import { requireAuth, methodGuard } from '../../../lib/auth.js';
import { requireApprovedMember } from '../../../lib/groupAccess.js';

export default requireAuth(async function handler(req, res) {
  const { groupId } = req.query;

  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  if (req.method === 'GET') {
    return listBets(req, res, groupId);
  }
  if (req.method === 'POST') {
    return createBet(req, res, groupId, me);
  }
  return methodGuard(req, res, ['GET', 'POST']);
});

async function listBets(req, res, groupId) {
  const events = await prisma.betEvent.findMany({
    where: { groupId },
    orderBy: { createdAt: 'desc' },
    include: {
      creator: { select: { pseudo: true } },
      options: {
        include: { wagers: { select: { amount: true, userId: true, optionId: true } } },
      },
    },
  });

  const shaped = events.map((e) => {
    const options = e.options.map((o) => ({
      id: o.id,
      label: o.label,
      pool: o.wagers.reduce((s, w) => s + w.amount, 0),
      myStake: o.wagers.filter((w) => w.userId === req.userId).reduce((s, w) => s + w.amount, 0),
    }));
    const totalPool = options.reduce((s, o) => s + o.pool, 0);
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      status: e.status,
      source: e.source,
      closesAt: e.closesAt,
      resolvedOptionId: e.resolvedOptionId,
      createdBy: e.creator.pseudo,
      createdAt: e.createdAt,
      totalPool,
      options: options.map((o) => ({
        ...o,
        odds: totalPool > 0 && o.pool > 0 ? +(totalPool / o.pool).toFixed(2) : null,
      })),
    };
  });

  return res.status(200).json({ bets: shaped });
}

async function createBet(req, res, groupId, membership) {
  const { title, description, options, closesAt } = req.body || {};

  if (!title || typeof title !== 'string' || title.trim().length < 3) {
    return res.status(400).json({ error: 'Le titre du pari doit contenir au moins 3 caractères.' });
  }
  if (!Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Il faut au moins 2 options (ex: "Oui" / "Non").' });
  }
  const cleanOptions = options.map((o) => String(o).trim()).filter(Boolean);
  if (cleanOptions.length < 2) {
    return res.status(400).json({ error: 'Il faut au moins 2 options valides.' });
  }

  const event = await prisma.betEvent.create({
    data: {
      groupId,
      creatorId: req.userId,
      title: title.trim(),
      description: description?.trim() || null,
      closesAt: closesAt ? new Date(closesAt) : null,
      options: { create: cleanOptions.map((label) => ({ label })) },
    },
    include: { options: true },
  });

  return res.status(201).json({ bet: event });
}
