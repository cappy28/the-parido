import { prisma } from '../../lib/db.js';
import { verifyPassword, signToken, methodGuard } from '../../lib/auth.js';

export default async function handler(req, res) {
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
