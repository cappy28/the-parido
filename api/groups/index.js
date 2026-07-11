import crypto from 'crypto';
import { prisma } from '../../lib/db.js';
import { requireAuth, methodGuard } from '../../lib/auth.js';
import { DEFAULT_SHOP_ITEMS } from '../../lib/defaultShopItems.js';

const STARTING_BALANCE = 1000;

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Route exacte /api/groups (0 segment). Séparée de [...segments].js car le
// catch-all optionnel ([[...]]) n'existe pas dans le routage Vercel "brut"
// (hors Next.js) — seul le catch-all obligatoire ([...]) est supporté, qui
// exige au moins 1 segment. D'où ce fichier dédié pour le cas "0 segment".
export default requireAuth(async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;

  if (req.method === 'GET') {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.userId, status: 'APPROVED' },
      include: {
        group: {
          select: {
            id: true, name: true, description: true, inviteCode: true, createdAt: true,
            _count: { select: { members: true, bets: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    const groups = memberships.map((m) => ({
      ...m.group,
      myRole: m.role,
      myBalance: m.balance,
      memberCount: m.group._count.members,
      betCount: m.group._count.bets,
    }));

    return res.status(200).json({ groups });
  }

  // POST — créer un groupe (classe). Le créateur devient admin, approuvé d'office.
  const { name, description } = req.body || {};
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Le nom du groupe doit contenir au moins 2 caractères.' });
  }

  let inviteCode = generateInviteCode();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.group.findUnique({ where: { inviteCode } });
    if (!clash) break;
    inviteCode = generateInviteCode();
  }

  const group = await prisma.group.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      inviteCode,
      creatorId: req.userId,
      members: {
        create: {
          userId: req.userId,
          role: 'ADMIN',
          status: 'APPROVED',
          balance: STARTING_BALANCE,
          transactions: {
            create: {
              type: 'BONUS',
              amount: STARTING_BALANCE,
              description: 'Solde de départ (création du groupe)',
            },
          },
        },
      },
      shopItems: { create: DEFAULT_SHOP_ITEMS.map((it) => ({ ...it })) },
    },
  });

  return res.status(201).json({ group });
});
