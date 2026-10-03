import { BadRequestException, Injectable } from '@nestjs/common';
import { AgendaItemType, Prisma } from '@prisma/client';
import { isIP } from 'node:net';

type AgendaContent = Record<string, unknown>;

@Injectable()
export class AgendaContentPolicyService {
  normalize(type: AgendaItemType, content: AgendaContent): Prisma.InputJsonObject {
    if (type === AgendaItemType.TEXT) {
      const text = typeof content.text === 'string' ? content.text.trim() : '';
      return text ? { text: text.slice(0, 20_000) } : {};
    }

    if (
      type !== AgendaItemType.WEBSITE &&
      type !== AgendaItemType.PRESENTATION &&
      type !== AgendaItemType.VIDEO
    ) {
      return this.jsonObject(content);
    }

    const rawUrl = typeof content.url === 'string' ? content.url.trim() : '';
    if (!rawUrl) {
      throw new BadRequestException(
        `${type.toLowerCase()} agenda items require a content URL`,
      );
    }

    const url = this.safeHttpsUrl(rawUrl);
    const resolved = this.resolveEmbed(url, type);
    return {
      url: url.toString(),
      embedUrl: resolved.embedUrl,
      provider: resolved.provider,
      renderMode: resolved.renderMode,
    };
  }

  private resolveEmbed(
    url: URL,
    type: AgendaItemType,
  ): { embedUrl: string; provider: string; renderMode: string } {
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      if (!videoId) throw new BadRequestException('Invalid YouTube URL');
      return {
        embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
        provider: 'youtube',
        renderMode: 'iframe',
      };
    }

    if (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'm.youtube.com'
    ) {
      const videoId =
        url.searchParams.get('v') ??
        (url.pathname.startsWith('/embed/')
          ? url.pathname.split('/').filter(Boolean)[1]
          : null);
      if (!videoId) throw new BadRequestException('Invalid YouTube URL');
      return {
        embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
        provider: 'youtube',
        renderMode: 'iframe',
      };
    }

    if (hostname === 'vimeo.com' || hostname === 'www.vimeo.com') {
      const videoId = url.pathname.split('/').filter(Boolean)[0];
      if (!videoId || !/^\d+$/.test(videoId)) {
        throw new BadRequestException('Invalid Vimeo URL');
      }
      return {
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        provider: 'vimeo',
        renderMode: 'iframe',
      };
    }

    if (
      type === AgendaItemType.VIDEO &&
      /\.(mp4|webm|ogg)(?:$|[?#])/i.test(url.toString())
    ) {
      return {
        embedUrl: url.toString(),
        provider: 'direct-video',
        renderMode: 'video',
      };
    }

    return {
      embedUrl: url.toString(),
      provider: 'web',
      renderMode: 'iframe',
    };
  }

  private safeHttpsUrl(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('Content URL is invalid');
    }

    if (url.protocol !== 'https:') {
      throw new BadRequestException('Content URL must use HTTPS');
    }
    if (url.username || url.password) {
      throw new BadRequestException('Content URL must not contain credentials');
    }

    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname === '0.0.0.0'
    ) {
      throw new BadRequestException('Local-network content URLs are not allowed');
    }

    if (isIP(hostname) === 4 && this.isPrivateIpv4(hostname)) {
      throw new BadRequestException('Private-network content URLs are not allowed');
    }
    if (isIP(hostname) === 6 && this.isPrivateIpv6(hostname)) {
      throw new BadRequestException('Private-network content URLs are not allowed');
    }

    url.hash = '';
    return url;
  }

  private isPrivateIpv4(hostname: string): boolean {
    const [a = 0, b = 0] = hostname.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }

  private isPrivateIpv6(hostname: string): boolean {
    const normalized = hostname.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }

  private jsonObject(value: AgendaContent): Prisma.InputJsonObject {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
  }
}
