export function distributeParticipants(
  userIds: string[],
  roomIds: string[],
): Map<string, string[]> {
  const distribution = new Map(roomIds.map((roomId) => [roomId, [] as string[]]));
  if (!roomIds.length) return distribution;

  userIds.forEach((userId, index) => {
    const roomId = roomIds[index % roomIds.length];
    if (!roomId) return;
    distribution.get(roomId)?.push(userId);
  });
  return distribution;
}
