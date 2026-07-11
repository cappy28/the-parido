// Vercel envoie automatiquement `Authorization: Bearer <CRON_SECRET>` quand il
// déclenche un Cron Job, si la variable d'env CRON_SECRET est définie sur le projet.
// Ça empêche n'importe qui de déclencher tes crons en devinant l'URL.
export function requireCronSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'CRON_SECRET manquant côté serveur.' });
    return false;
  }
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Non autorisé.' });
    return false;
  }
  return true;
}
