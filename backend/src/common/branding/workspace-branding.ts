import { BadRequestException } from '@nestjs/common';

export interface WorkspaceBranding {
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  waitingRoomImageUrl: string | null;
  hideSessionsBranding: boolean;
}

const DEFAULT_BRANDING: WorkspaceBranding = {
  brandName: null,
  logoUrl: null,
  primaryColor: '#183f38',
  accentColor: '#d9efe7',
  fontFamily: 'Inter',
  waitingRoomImageUrl: null,
  hideSessionsBranding: false,
};

const ALLOWED_FONTS = new Set([
  'Inter',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Trebuchet MS',
  'system-ui',
]);

function optionalHttpsUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a URL`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException(`${field} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException(`${field} must use HTTPS`);
  }
  return parsed.toString();
}

function color(value: unknown, field: string, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new BadRequestException(`${field} must use a six-digit hex color`);
  }
  return value.toLowerCase();
}

export function normalizeWorkspaceBranding(value: unknown): WorkspaceBranding {
  if (value === undefined || value === null) return { ...DEFAULT_BRANDING };
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('branding must be an object');
  }
  const input = value as Record<string, unknown>;
  const brandName =
    input.brandName === undefined || input.brandName === null || input.brandName === ''
      ? null
      : typeof input.brandName === 'string' && input.brandName.trim().length <= 160
        ? input.brandName.trim()
        : (() => {
            throw new BadRequestException('brandName must be 160 characters or fewer');
          })();
  const fontFamily =
    typeof input.fontFamily === 'string' && input.fontFamily.trim()
      ? input.fontFamily.trim()
      : DEFAULT_BRANDING.fontFamily;
  if (!ALLOWED_FONTS.has(fontFamily)) {
    throw new BadRequestException('fontFamily is not supported');
  }

  return {
    brandName,
    logoUrl: optionalHttpsUrl(input.logoUrl, 'logoUrl'),
    primaryColor: color(input.primaryColor, 'primaryColor', DEFAULT_BRANDING.primaryColor),
    accentColor: color(input.accentColor, 'accentColor', DEFAULT_BRANDING.accentColor),
    fontFamily,
    waitingRoomImageUrl: optionalHttpsUrl(
      input.waitingRoomImageUrl,
      'waitingRoomImageUrl',
    ),
    hideSessionsBranding: input.hideSessionsBranding === true,
  };
}

export function publicWorkspaceBranding(
  settings: unknown,
  workspaceName: string,
): WorkspaceBranding {
  const object =
    settings && typeof settings === 'object' && !Array.isArray(settings)
      ? (settings as Record<string, unknown>)
      : {};
  try {
    const branding = normalizeWorkspaceBranding(object.branding);
    return {
      ...branding,
      brandName: branding.brandName || workspaceName,
    };
  } catch {
    return { ...DEFAULT_BRANDING, brandName: workspaceName };
  }
}
