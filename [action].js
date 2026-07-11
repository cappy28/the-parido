import { prisma } from '../../lib/db.js';
import { hashPassword, verifyPassword, signToken, methodGuard } from '../../lib/auth.js';
import { uploadImage } from '../../lib/blobImage.js';

// Regroupe /api/auth/login et /api/auth/register dans une seule fonction serverless
// (limite de 12 fonctions sur le plan Hobby de Vercel).
export default async function handler(req, res) {
  const { action } = req.query;

  if (action === 'login') return login(req, res);
  if (action === 'register') return register(req, res);
  return res.status(404).json({ error: 'Route introuvable.' });
}

async function login(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const { pseudo, password } = req.body || {};
  if (!pseudo || !password) {
    return res.status(400).json({ error: 'Pseudo et mot de passe requis.' });
  }

  const user = await prisma.user.findUnique({ where: { pseudo: pseudo.trim() } });
  if (!user) {
    return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
  }

  const token = signToken(user);

  return res.status(200).json({
    token,
    user: { id: user.id, pseudo: user.pseudo, avatarUrl: user.avatarUrl },
  });
}

async function register(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;

  const { pseudo, password, avatarBase64 } = req.body || {};

  if (!pseudo || typeof pseudo !== 'string' || pseudo.trim().length < 3) {
    return res.status(400).json({ error: 'Le pseudo doit contenir au moins 3 caractères.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }

  const cleanPseudo = pseudo.trim();

  const existing = await prisma.user.findUnique({ where: { pseudo: cleanPseudo } });
  if (existing) {
    return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
  }

  const passwordHash = await hashPassword(password);

  let user = await prisma.user.create({
    data: { pseudo: cleanPseudo, passwordHash },
  });

  if (avatarBase64) {
    try {
      const avatarUrl = await uploadImage({ folder: 'avatars', id: user.id, dataUrl: avatarBase64 });
      user = await prisma.user.update({ where: { id: user.id }, data: { avatarUrl } });
    } catch {
      // On ne bloque pas la création du compte pour un problème de photo — elle pourra
      // la (re)mettre depuis son profil ensuite.
    }
  }

  const token = signToken(user);

  return res.status(201).json({
    token,
    user: { id: user.id, pseudo: user.pseudo, avatarUrl: user.avatarUrl },
  });
}
