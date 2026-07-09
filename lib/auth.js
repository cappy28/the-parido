import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '30d';

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET manquant dans les variables d\'environnement');
  return jwt.sign({ sub: user.id, pseudo: user.pseudo }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

// Retourne l'id utilisateur si le token est valide, sinon null (ne lève pas).
export function getUserIdFromRequest(req) {
  const token = getBearerToken(req);
  if (!token || !JWT_SECRET) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.sub;
  } catch {
    return null;
  }
}

// Wrapper pour protéger un handler d'API. Injecte req.userId.
export function requireAuth(handler) {
  return async (req, res) => {
    const userId = getUserIdFromRequest(req);
    if (!userId) {
      res.status(401).json({ error: 'Non authentifié. Connecte-toi à nouveau.' });
      return;
    }
    req.userId = userId;
    return handler(req, res);
  };
}

export function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    res.status(405).json({ error: `Méthode ${req.method} non autorisée.` });
    return false;
  }
  return true;
}
