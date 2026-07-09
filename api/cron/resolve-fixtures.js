import { prisma } from '../../lib/db.js';
import { requireCronSecret } from '../../lib/cronAuth.js';
import { getAdapter } from '../../lib/sports/index.js';
import { resolveBetEvent, cancelBetEvent, BetLogicError } from '../../lib/betLogic.js';

export default async function handler(req, res) {
  if (!requireCronSecret(req, res)) return;

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
        if (!fx.winningRole) { skipped++; continue; } // résultat indisponible/ambigu, on réessaiera au prochain passage

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
