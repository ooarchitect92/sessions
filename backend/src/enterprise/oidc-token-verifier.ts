import { createPublicKey, verify } from 'node:crypto';

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
export type OidcClaims = Record<string, unknown> & {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
};

export interface JsonWebKeySet {
  keys: JsonWebKey[];
}

export function verifyOidcIdToken(input: {
  token: string;
  jwks: JsonWebKeySet;
  issuer: string;
  clientId: string;
  nonceDigest: string;
  digest: (value: string) => string;
  nowSeconds?: number;
}): OidcClaims {
  const parts = input.token.split('.');
  if (parts.length !== 3) throw new Error('oidc_id_token_malformed');
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [
    string,
    string,
    string,
  ];
  const header = parseJson<JwtHeader>(encodedHeader);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('oidc_id_token_algorithm_not_allowed');
  }
  const jwk = input.jwks.keys.find(
    (candidate) =>
      candidate.kid === header.kid &&
      candidate.kty === 'RSA' &&
      (!candidate.use || candidate.use === 'sig'),
  );
  if (!jwk) throw new Error('oidc_jwk_not_found');

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const valid = verify(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(encodedSignature, 'base64url'),
  );
  if (!valid) throw new Error('oidc_id_token_signature_invalid');

  const claims = parseJson<OidcClaims>(encodedPayload);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== input.issuer) throw new Error('oidc_issuer_mismatch');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(input.clientId)) throw new Error('oidc_audience_mismatch');
  if (!Number.isFinite(claims.exp) || claims.exp < now - 60) {
    throw new Error('oidc_id_token_expired');
  }
  if (claims.iat !== undefined && claims.iat > now + 60) {
    throw new Error('oidc_id_token_issued_in_future');
  }
  if (
    typeof claims.sub !== 'string' ||
    !claims.sub ||
    typeof claims.nonce !== 'string' ||
    input.digest(claims.nonce) !== input.nonceDigest
  ) {
    throw new Error('oidc_nonce_or_subject_invalid');
  }
  return claims;
}

function parseJson<T>(encoded: string): T {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    throw new Error('oidc_id_token_json_invalid');
  }
}
