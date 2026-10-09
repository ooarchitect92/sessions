import {
  createSign,
  generateKeyPairSync,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyOidcIdToken } from './oidc-token-verifier';

describe('OIDC ID token verification', () => {
  it('verifies RS256 signature, issuer, audience, expiry and nonce', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: 'jwk' });
    const header = base64url({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
    const nonce = 'nonce-value';
    const digest = (value: string) =>
      Buffer.from(value).toString('base64url');
    const payload = base64url({
      iss: 'https://idp.example.com',
      sub: 'subject-1',
      aud: 'sessions-client',
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce,
      email: 'person@example.com',
    });
    const signingInput = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(privateKey)
      .toString('base64url');
    const token = `${signingInput}.${signature}`;

    const claims = verifyOidcIdToken({
      token,
      jwks: {
        keys: [{ ...jwk, kid: 'test-key', use: 'sig' }],
      },
      issuer: 'https://idp.example.com',
      clientId: 'sessions-client',
      nonceDigest: digest(nonce),
      digest,
    });
    expect(claims.sub).toBe('subject-1');
  });

  it('rejects the wrong nonce', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: 'jwk' });
    const header = base64url({ alg: 'RS256', kid: 'test-key' });
    const payload = base64url({
      iss: 'https://idp.example.com',
      sub: 'subject-1',
      aud: 'sessions-client',
      exp: Math.floor(Date.now() / 1000) + 300,
      nonce: 'actual',
    });
    const signingInput = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(privateKey)
      .toString('base64url');

    expect(() =>
      verifyOidcIdToken({
        token: `${signingInput}.${signature}`,
        jwks: { keys: [{ ...jwk, kid: 'test-key', use: 'sig' }] },
        issuer: 'https://idp.example.com',
        clientId: 'sessions-client',
        nonceDigest: 'expected',
        digest: (value) => value,
      }),
    ).toThrow('oidc_nonce_or_subject_invalid');
  });
});

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
