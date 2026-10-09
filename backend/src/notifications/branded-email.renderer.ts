export interface WorkspaceEmailBrand {
  workspaceName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value
    : fallback;
}

export function workspaceEmailBrand(
  workspace: { name: string; settings: unknown } | null,
): WorkspaceEmailBrand {
  const settings =
    workspace?.settings && typeof workspace.settings === 'object' && !Array.isArray(workspace.settings)
      ? (workspace.settings as Record<string, unknown>)
      : {};
  const branding =
    settings.branding && typeof settings.branding === 'object' && !Array.isArray(settings.branding)
      ? (settings.branding as Record<string, unknown>)
      : {};
  const logoUrl =
    typeof branding.logoUrl === 'string' && branding.logoUrl.startsWith('https://')
      ? branding.logoUrl
      : null;
  return {
    workspaceName: workspace?.name ?? 'Sessions',
    logoUrl,
    primaryColor: safeColor(branding.primaryColor, '#183f38'),
    accentColor: safeColor(branding.accentColor, '#dcefe8'),
  };
}

export function renderBrandedEmailHtml(input: {
  brand: WorkspaceEmailBrand;
  heading: string;
  text: string;
}): string {
  const body = escapeHtml(input.text).replace(/\r?\n/g, '<br>');
  const heading = escapeHtml(input.heading);
  const workspaceName = escapeHtml(input.brand.workspaceName);
  const logo = input.brand.logoUrl
    ? `<img src="${escapeHtml(input.brand.logoUrl)}" alt="${workspaceName}" width="44" height="44" style="display:block;max-width:44px;max-height:44px;object-fit:contain;border-radius:10px;background:#ffffff;">`
    : `<div style="width:44px;height:44px;border-radius:10px;background:${input.brand.primaryColor};color:#ffffff;font:700 20px Arial,sans-serif;line-height:44px;text-align:center;">${workspaceName.charAt(0).toUpperCase()}</div>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f3;font-family:Arial,sans-serif;color:#23302c;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f3;padding:32px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e5e1;border-radius:16px;overflow:hidden;"><tr><td style="padding:22px 24px;background:${input.brand.accentColor};"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px;">${logo}</td><td><div style="font-size:12px;font-weight:700;color:${input.brand.primaryColor};letter-spacing:.04em;text-transform:uppercase;">${workspaceName}</div><div style="margin-top:4px;font-size:22px;font-weight:700;color:${input.brand.primaryColor};">${heading}</div></td></tr></table></td></tr><tr><td style="padding:28px 24px;font-size:15px;line-height:1.65;color:#33423d;">${body}</td></tr><tr><td style="padding:16px 24px;border-top:1px solid #ecefeb;font-size:12px;color:#7d8884;">Sent by ${workspaceName}</td></tr></table></td></tr></table></body></html>`;
}