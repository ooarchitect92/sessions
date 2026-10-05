import { BadRequestException } from '@nestjs/common';
import { AgendaItemType, Prisma } from '@prisma/client';

type AgendaContent = Record<string, unknown>;

export function normalizeAgendaContent(
  type: AgendaItemType,
  input: AgendaContent,
): Prisma.InputJsonValue {
  const content: AgendaContent = { ...input };

  if (
    type === AgendaItemType.WEBSITE ||
    type === AgendaItemType.PRESENTATION ||
    type === AgendaItemType.VIDEO
  ) {
    const rawUrl = typeof content.url === 'string' ? content.url.trim() : '';
    if (!rawUrl) {
      throw new BadRequestException(
        `${type.toLowerCase()} agenda items require a URL`,
      );
    }
    content.url = normalizeExternalUrl(rawUrl);
  }

  if (type === AgendaItemType.TEXT) {
    if (content.text !== undefined && typeof content.text !== 'string') {
      throw new BadRequestException('Text agenda content must be a string');
    }
    if (typeof content.text === 'string') {
      content.text = content.text.trim().slice(0, 20_000);
    }
  }

  return content as Prisma.InputJsonValue;
}

export function normalizeExternalUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Agenda content URL is invalid');
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException('Agenda content URL must use HTTPS');
  }
  if (url.username || url.password) {
    throw new BadRequestException('Agenda content URL cannot contain credentials');
  }

  return url.toString();
}
