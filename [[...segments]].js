import crypto from 'crypto';
import { prisma } from '../../lib/db.js';
import { requireAuth, methodGuard } from '../../lib/auth.js';
import { requireApprovedMember, requireGroupAdmin, getMembership } from '../../lib/groupAccess.js';
import { uploadImage, deleteImage } from '../../lib/blobImage.js';
import { DEFAULT_SHOP_ITEMS } from '../../lib/defaultShopItems.js';
import { PROVIDERS } from '../../lib/sports/index.js';

const STARTING_BALANCE = 1000;

// Regroupe TOUTES les routes /api/groups/... dans une seule fonction serverless,
// via une route catch-all optionnelle ([[...segments]].js). C'est ce qui fait
// gagner le plus de fonctions par rapport à la limite de 12 du plan Hobby.
//
// NB bug corrigé au passage : les dossiers dynamiques s'appelaient [groupsld],
// [itemld], [userld] (l minuscule au lieu de I) — req.query.groupId valait donc
// toujours undefined. Le dossier "competions" était aussi mal orthographié par
// rapport à ce que le frontend appelle ("competitions") → 404 systématique.
// Les deux sont corrigés ici puisqu'on route désormais nous-mêmes les segments.
export default requireAuth(async function handler(req, res) {
  const segments = Array.isArray(req.query.segments)
    ? req.query.segments
    : req.query.segments
      ? [req.query.segments]
      : [];

  // /api/groups
  if (segments.length === 0) return groupsRoot(req, res);
  // /api/groups/join
  if (segments.length === 1 && segments[0] === 'join') return joinGroup(req, res);

  const [groupId, ...rest] = segments;

  // /api/groups/:groupId
  if (rest.length === 0) return groupDetail(req, res, groupId);
  // /api/groups/:groupId/bets
  if (rest.length === 1 && rest[0] === 'bets') return bets(req, res, groupId);
  // /api/groups/:groupId/leaderboard
  if (rest.length === 1 && rest[0] === 'leaderboard') return leaderboard(req, res, groupId);
  // /api/groups/:groupId/purchases
  if (rest.length === 1 && rest[0] === 'purchases') return purchasesList(req, res, groupId);
  // /api/groups/:groupId/members
  if (rest.length === 1 && rest[0] === 'members') return membersList(req, res, groupId);
  // /api/groups/:groupId/members/:userId/approve
  if (rest.length === 3 && rest[0] === 'members' && rest[2] === 'approve') {
    return memberApprove(req, res, groupId, rest[1]);
  }
  // /api/groups/:groupId/shop...
  if (rest[0] === 'shop') {
    if (rest.length === 1) return shopRoot(req, res, groupId);
    if (rest.length === 2 && rest[1] === 'seed-defaults') return shopSeedDefaults(req, res, groupId);
    if (rest.length === 2) return shopItemDetail(req, res, groupId, rest[1]);
    if (rest.length === 3 && rest[2] === 'image') return shopItemImage(req, res, groupId, rest[1]);
  }
  // /api/groups/:groupId/competitions...
  if (rest[0] === 'competitions') {
    if (rest.length === 1) return competitionsRoot(req, res, groupId);
    if (rest.length === 2) return competitionDetail(req, res, groupId, rest[1]);
  }

  return res.status(404).json({ error: 'Route introuvable.' });
});

// ---------- /api/groups ----------

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function groupsRoot(req, res) {
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
}

// ---------- /api/groups/join ----------

async function joinGroup(req, res) {
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
}

// ---------- /api/groups/:groupId ----------

async function groupDetail(req, res, groupId) {
  if (!methodGuard(req, res, ['GET'])) return;

  const membership = await getMembership(groupId, req.userId);
  if (!membership || membership.status !== 'APPROVED') {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      id: true, name: true, description: true, inviteCode: true, createdAt: true,
      _count: { select: { members: true, bets: true } },
    },
  });
  if (!group) return res.status(404).json({ error: 'Groupe introuvable.' });

  return res.status(200).json({
    group: {
      ...group,
      memberCount: group._count.members,
      betCount: group._count.bets,
      myRole: membership.role,
      myBalance: membership.balance,
    },
  });
}

// ---------- /api/groups/:groupId/bets ----------

async function bets(req, res, groupId) {
  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  if (req.method === 'GET') return listBets(req, res, groupId);
  if (req.method === 'POST') return createBet(req, res, groupId, me);
  return methodGuard(req, res, ['GET', 'POST']);
}

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

// ---------- /api/groups/:groupId/leaderboard ----------

async function leaderboard(req, res, groupId) {
  if (!methodGuard(req, res, ['GET'])) return;

  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  const members = await prisma.membership.findMany({
    where: { groupId, status: 'APPROVED' },
    select: {
      balance: true,
      user: { select: { id: true, pseudo: true, avatarUrl: true } },
    },
    orderBy: { balance: 'desc' },
  });

  const board = members.map((m, i) => ({
    rank: i + 1,
    pseudo: m.user.pseudo,
    avatarUrl: m.user.avatarUrl,
    balance: m.balance,
    net: m.balance - STARTING_BALANCE,
  }));

  return res.status(200).json({ leaderboard: board });
}

// ---------- /api/groups/:groupId/purchases ----------

async function purchasesList(req, res, groupId) {
  if (!methodGuard(req, res, ['GET'])) return;

  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });

  const purchases = await prisma.purchase.findMany({
    where: me.role === 'ADMIN' ? { groupId } : { groupId, userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { pseudo: true, avatarUrl: true } } },
  });

  return res.status(200).json({ purchases });
}

// ---------- /api/groups/:groupId/members ----------

async function membersList(req, res, groupId) {
  if (!methodGuard(req, res, ['GET'])) return;

  const me = await requireApprovedMember(groupId, req.userId);
  if (!me) {
    return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });
  }

  const approved = await prisma.membership.findMany({
    where: { groupId, status: 'APPROVED' },
    select: {
      id: true, role: true, balance: true, joinedAt: true,
      user: { select: { id: true, pseudo: true, avatarUrl: true } },
    },
    orderBy: { balance: 'desc' },
  });

  const payload = { members: approved };

  if (me.role === 'ADMIN') {
    const pending = await prisma.membership.findMany({
      where: { groupId, status: 'PENDING' },
      select: {
        id: true, joinedAt: true,
        user: { select: { id: true, pseudo: true, avatarUrl: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
    payload.pending = pending;
  }

  return res.status(200).json(payload);
}

// ---------- /api/groups/:groupId/members/:userId/approve ----------

async function memberApprove(req, res, groupId, userId) {
  if (!methodGuard(req, res, ['POST'])) return;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) {
    return res.status(403).json({ error: 'Seul un admin du groupe peut valider les membres.' });
  }

  const { action } = req.body || {};
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: "action doit être 'approve' ou 'reject'." });
  }

  const target = await getMembership(groupId, userId);
  if (!target || target.status !== 'PENDING') {
    return res.status(404).json({ error: 'Aucune demande en attente pour cet utilisateur.' });
  }

  if (action === 'reject') {
    const membership = await prisma.membership.update({
      where: { id: target.id },
      data: { status: 'REJECTED' },
    });
    return res.status(200).json({ membership });
  }

  const membership = await prisma.membership.update({
    where: { id: target.id },
    data: {
      status: 'APPROVED',
      balance: STARTING_BALANCE,
      transactions: {
        create: {
          type: 'BONUS',
          amount: STARTING_BALANCE,
          description: 'Solde de départ (rejoint le groupe)',
        },
      },
    },
  });

  return res.status(200).json({ membership });
}

// ---------- /api/groups/:groupId/shop ----------

async function shopRoot(req, res, groupId) {
  if (req.method === 'GET') {
    const me = await requireApprovedMember(groupId, req.userId);
    if (!me) return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });

    const items = await prisma.shopItem.findMany({
      where: me.role === 'ADMIN' ? { groupId } : { groupId, active: true },
      orderBy: [{ active: 'desc' }, { cost: 'asc' }],
    });
    return res.status(200).json({ items, myBalance: me.balance });
  }

  if (req.method === 'POST') {
    const admin = await requireGroupAdmin(groupId, req.userId);
    if (!admin) return res.status(403).json({ error: 'Seul un admin peut ajouter un article à la boutique.' });

    const { name, description, cost, stock, emoji, imageBase64 } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nom requis.' });
    if (!Number.isInteger(cost) || cost <= 0) return res.status(400).json({ error: 'cost doit être un entier positif.' });
    if (stock !== undefined && stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      return res.status(400).json({ error: 'stock doit être un entier positif, ou vide pour illimité.' });
    }

    let item = await prisma.shopItem.create({
      data: {
        groupId,
        name: name.trim(),
        description: description?.trim() || null,
        cost,
        stock: stock ?? null,
        emoji: emoji?.trim() || '🎁',
      },
    });

    if (imageBase64) {
      try {
        const imageUrl = await uploadImage({ folder: 'shop-items', id: item.id, dataUrl: imageBase64 });
        item = await prisma.shopItem.update({ where: { id: item.id }, data: { imageUrl } });
      } catch {
        // L'article existe déjà sans photo — l'admin pourra en ajouter une depuis la boutique.
      }
    }

    return res.status(201).json({ item });
  }

  return methodGuard(req, res, ['GET', 'POST']);
}

// ---------- /api/groups/:groupId/shop/seed-defaults ----------

async function shopSeedDefaults(req, res, groupId) {
  if (!methodGuard(req, res, ['POST'])) return;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut charger les articles par défaut.' });

  const existingNames = new Set(
    (await prisma.shopItem.findMany({ where: { groupId }, select: { name: true } })).map((i) => i.name)
  );
  const toCreate = DEFAULT_SHOP_ITEMS.filter((it) => !existingNames.has(it.name));

  if (toCreate.length === 0) {
    return res.status(200).json({ created: 0, message: 'Tous les articles par défaut sont déjà présents.' });
  }

  await prisma.shopItem.createMany({ data: toCreate.map((it) => ({ ...it, groupId })) });

  return res.status(201).json({ created: toCreate.length });
}

// ---------- /api/groups/:groupId/shop/:itemId ----------

async function shopItemDetail(req, res, groupId, itemId) {
  if (!methodGuard(req, res, ['PATCH', 'DELETE'])) return;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut modifier la boutique.' });

  const existing = await prisma.shopItem.findUnique({ where: { id: itemId } });
  if (!existing || existing.groupId !== groupId) {
    return res.status(404).json({ error: 'Article introuvable.' });
  }

  if (req.method === 'DELETE') {
    const purchaseCount = await prisma.purchase.count({ where: { shopItemId: itemId } });
    if (purchaseCount > 0) {
      return res.status(400).json({ error: 'Cet article a déjà été acheté au moins une fois — désactive-le plutôt que de le supprimer.' });
    }
    await prisma.shopItem.delete({ where: { id: itemId } });
    return res.status(200).json({ message: 'Article supprimé.' });
  }

  const { name, description, cost, stock, emoji, active } = req.body || {};
  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (description !== undefined) data.description = description ? String(description).trim() : null;
  if (cost !== undefined) {
    if (!Number.isInteger(cost) || cost <= 0) return res.status(400).json({ error: 'cost doit être un entier positif.' });
    data.cost = cost;
  }
  if (stock !== undefined) data.stock = stock === null ? null : stock;
  if (emoji !== undefined) data.emoji = String(emoji).trim() || '🎁';
  if (active !== undefined) data.active = Boolean(active);

  const item = await prisma.shopItem.update({ where: { id: itemId }, data });
  return res.status(200).json({ item });
}

// ---------- /api/groups/:groupId/shop/:itemId/image ----------

async function shopItemImage(req, res, groupId, itemId) {
  if (!methodGuard(req, res, ['POST', 'DELETE'])) return;

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
}

// ---------- /api/groups/:groupId/competitions ----------

async function competitionsRoot(req, res, groupId) {
  if (req.method === 'GET') {
    const me = await requireApprovedMember(groupId, req.userId);
    if (!me) return res.status(403).json({ error: "Tu n'es pas membre approuvé de ce groupe." });

    const competitions = await prisma.groupCompetition.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ competitions, providers: Object.keys(PROVIDERS) });
  }

  if (req.method === 'POST') {
    const admin = await requireGroupAdmin(groupId, req.userId);
    if (!admin) return res.status(403).json({ error: 'Seul un admin peut configurer le suivi automatique.' });

    const { provider, competitionId, season, label, daysAhead } = req.body || {};
    if (!provider || !PROVIDERS[provider]) {
      return res.status(400).json({ error: `provider invalide. Options : ${Object.keys(PROVIDERS).join(', ')}` });
    }
    if (!competitionId || !String(competitionId).trim()) {
      return res.status(400).json({ error: "competitionId requis (l'id de la ligue chez le fournisseur — voir README)." });
    }
    if (!label || !label.trim()) {
      return res.status(400).json({ error: 'label requis (nom affiché, ex: "Ligue 1").' });
    }

    try {
      const competition = await prisma.groupCompetition.create({
        data: {
          groupId,
          provider,
          sport: PROVIDERS[provider].sport,
          competitionId: String(competitionId).trim(),
          season: season ? String(season).trim() : null,
          label: label.trim(),
          daysAhead: Number.isInteger(daysAhead) && daysAhead > 0 ? daysAhead : 7,
        },
      });
      return res.status(201).json({ competition });
    } catch (err) {
      if (err.code === 'P2002') {
        return res.status(409).json({ error: 'Cette compétition est déjà suivie par ce groupe.' });
      }
      throw err;
    }
  }

  return methodGuard(req, res, ['GET', 'POST']);
}

// ---------- /api/groups/:groupId/competitions/:competitionId ----------

async function competitionDetail(req, res, groupId, competitionId) {
  if (!methodGuard(req, res, ['PATCH', 'DELETE'])) return;

  const admin = await requireGroupAdmin(groupId, req.userId);
  if (!admin) return res.status(403).json({ error: 'Seul un admin peut modifier le suivi automatique.' });

  const existing = await prisma.groupCompetition.findUnique({ where: { id: competitionId } });
  if (!existing || existing.groupId !== groupId) {
    return res.status(404).json({ error: 'Compétition suivie introuvable.' });
  }

  if (req.method === 'DELETE') {
    await prisma.groupCompetition.delete({ where: { id: competitionId } });
    return res.status(200).json({ message: 'Suivi supprimé (les paris déjà créés restent).' });
  }

  const { enabled } = req.body || {};
  const updated = await prisma.groupCompetition.update({
    where: { id: competitionId },
    data: { enabled: Boolean(enabled) },
  });
  return res.status(200).json({ competition: updated });
}
