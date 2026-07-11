import { prisma } from '../../lib/db.js';
import { requireCronSecret } from '../../lib/cronAuth.js';
import { getAdapter, getEmoji } from '../../lib/sports/index.js';
import { resolveBetEvent, cancelBetEvent, BetLogicError } from '../../lib/betLogic.js';

// Regroupe /api/cron/sync-fixtures et /api/cron/resolve-fixtures. Les URL déclarées
// dans vercel.json ne changent pas (le segment dynamique [job] capture le nom exact).
export default async function handler(req, res) {
  if (!requireCronSecret(req, res)) return;

  const { job } = req.query;
  if (job === 'sync-fixtures') return syncFixtures(req, res);
  if (job === 'resolve-fixtures') return resolveFixtures(req, res);
  return res.status(404).json({ error: 'Tâche cron inconnue.' });
}

async function syncFixtures(req, res) {
  const competitions = await prisma.groupCompetition.findMany({
    where: { enabled: true },
    include: { group: { select: { creatorId: true } } },
  });

  const results = [];

  for (const comp of competitions) {
    try {
      const adapter = getAdapter(comp.provider);
      const emoji = getEmoji(comp.provider);
      const fixtures = await adapter.getUpcomingFixtures({
        competitionId: comp.competitionId,
        season: comp.season,
        days: comp.daysAhead,
      });

      let created = 0;
      for (const fx of fixtures) {
        const exists = await prisma.betEvent.findFirst({
          where: { groupId: comp.groupId, provider: comp.provider, externalId: fx.externalId },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.betEvent.create({
          data: {
            groupId: comp.groupId,
            creatorId: comp.group.creatorId,
            title: `${emoji} ${fx.title}`,
            description: `${comp.label} · généré automatiquement`,
            closesAt: new Date(fx.startTime),
            source: 'AUTO',
            provider: comp.provider,
            externalId: fx.externalId,
            options: { create: fx.options.map((o) => ({ label: o.label, externalRole: o.externalRole })) },
          },
        });
        created++;
      }

      await prisma.groupCompetition.update({ where: { id: comp.id }, data: { lastSyncAt: new Date() } });
      results.push({ competition: comp.label, groupId: comp.groupId, created });
    } catch (err) {
      results.push({ competition: comp.label, groupId: comp.groupId, error: err.message });
    }
  }

  return res.status(200).json({ processed: competitions.length, results });
}

async function resolveFixtures(req, res) {
  const competitions = await prisma.groupCompetition.findMany({ where: { enabled: true } });
  const results = [];

  for (const comp of competitions) {
    try {
      const adapter = getAdapter(comp.provider);
      const finishedFixtures = await adapter.getFinishedFixtures({
        competitionId: comp.competitionId,
        season: comp.season,
        sinceDays: 3,
      });

      let resolved = 0, cancelled = 0, skipped = 0;

      for (const fx of finishedFixtures) {
        const event = await prisma.betEvent.findFirst({
          where: {
            groupId: comp.groupId, provider: comp.provider, externalId: fx.externalId,
            status: { in: ['OPEN', 'CLOSED'] },
          },
          include: { options: true },
        });
        if (!event) { skipped++; continue; }

        if (fx.void) {
          await cancelBetEvent({ eventId: event.id, reason: 'match reporté ou annulé' });
          cancelled++;
          continue;
        }
        if (!fx.winningRole) { skipped++; continue; }

        const winningOption = event.options.find((o) => o.externalRole === fx.winningRole);
        if (!winningOption) { skipped++; continue; }

        await resolveBetEvent({ eventId: event.id, winningOptionId: winningOption.id });
        resolved++;
      }

      results.push({ competition: comp.label, groupId: comp.groupId, resolved, cancelled, skipped });
    } catch (err) {
      results.push({ competition: comp.label, groupId: comp.groupId, error: err.message });
    }
  }

  return res.status(200).json({ processed: competitions.length, results });
}
