import { prisma } from './db.js';

export async function getMembership(groupId, userId) {
  return prisma.membership.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
}

// Retourne la membership si l'utilisateur est membre APPROVED du groupe, sinon null.
export async function requireApprovedMember(groupId, userId) {
  const membership = await getMembership(groupId, userId);
  if (!membership || membership.status !== 'APPROVED') return null;
  return membership;
}

// Retourne la membership si l'utilisateur est ADMIN approuvé du groupe, sinon null.
export async function requireGroupAdmin(groupId, userId) {
  const membership = await getMembership(groupId, userId);
  if (!membership || membership.status !== 'APPROVED' || membership.role !== 'ADMIN') return null;
  return membership;
}
