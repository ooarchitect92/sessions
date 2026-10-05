export function distributeParticipants(
  userIds: string[],
  roomIds: string[],
): Map<string, string[]> {
  const distribution = new Map(roomIds.map((roomId) => [roomId, [] as string[]]));
  if (!roomIds.length) return distribution;

  userIds.forEach((userId, index) => {
    distribution.get(roomIds[index % roomIds.length])?.push(userId);
  });
  return distribution;
}
