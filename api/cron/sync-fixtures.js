import { prisma } from '../../lib/db.js';
import { requireCronSecret } from '../../lib/cronAuth.js';
import { getAdapter, getEmoji } from '../../lib/sports/index.js';

export default async function handler(req, res) {
  if (!requireCronSecret(req, res)) return;

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
