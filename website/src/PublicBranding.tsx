import type { CSSProperties } from 'react';

export interface PublicBranding {
  brandName: string | null;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  waitingRoomImageUrl: string | null;
  hideSessionsBranding: boolean;
}

export function publicBrandStyle(branding: PublicBranding): CSSProperties {
  return {
    '--public-primary': branding.primaryColor,
    '--public-accent': branding.accentColor,
    '--public-font': branding.fontFamily,
    ...(branding.waitingRoomImageUrl
      ? { '--public-hero-image': `url("${branding.waitingRoomImageUrl}")` }
      : {}),
  } as CSSProperties;
}

export function PublicWordmark({ branding }: { branding: PublicBranding }) {
  const name = branding.brandName || 'Sessions';
  return (
    <a className="public-wordmark" href="/">
      {branding.logoUrl ? (
        <img alt="" src={branding.logoUrl} />
      ) : (
        <span>{name.slice(0, 1).toUpperCase()}</span>
      )}
      <strong>{name}</strong>
      {!branding.hideSessionsBranding && name !== 'Sessions' ? (
        <small>Powered by Sessions</small>
      ) : null}
    </a>
  );
}
