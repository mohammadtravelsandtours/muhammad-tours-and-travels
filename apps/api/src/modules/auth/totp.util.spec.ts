import { base32Decode, base32Encode, buildOtpAuthUri, generateBackupCodes, generateTotp, generateTotpSecret, verifyTotp } from './totp.util';

/**
 * generateTotp/verifyTotp are hand-implemented (RFC 4226/6238) rather
 * than from a library — see totp.util.ts's doc comment for why (no
 * network access to install one). This spec checks the implementation
 * against the RFC's own published test vectors (Appendix B) first, so
 * any future edit that breaks interoperability with a real
 * authenticator app fails loudly here rather than being discovered at
 * an operator's next login.
 */
const RFC_SECRET_BASE32 = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('totp.util', () => {
  it('matches the RFC 6238 Appendix B vector at T=59s (8-digit code)', () => {
    expect(generateTotp(RFC_SECRET_BASE32, { digits: 8, timestampMs: 59 * 1000 })).toBe('94287082');
  });

  it('matches the RFC 6238 Appendix B vector at T=1111111109s (8-digit code)', () => {
    expect(generateTotp(RFC_SECRET_BASE32, { digits: 8, timestampMs: 1111111109 * 1000 })).toBe('07081804');
  });

  it('base32Decode(base32Encode(x)) round-trips arbitrary bytes exactly', () => {
    const original = Buffer.from('a real 20-byte-ish secret!!', 'utf8');
    expect(base32Decode(base32Encode(original)).toString('utf8')).toBe(original.toString('utf8'));
  });

  it('verifyTotp accepts the correct current code', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotp(secret, { timestampMs: now });
    expect(verifyTotp(secret, code, { timestampMs: now })).toBe(true);
  });

  it('verifyTotp accepts a code from one time-step of clock drift (±30s)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const codeOneStepAgo = generateTotp(secret, { timestampMs: now - 30_000 });
    expect(verifyTotp(secret, codeOneStepAgo, { timestampMs: now })).toBe(true);
  });

  it('verifyTotp rejects a code from two time-steps of drift (outside the default ±1 window)', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const codeTwoStepsAgo = generateTotp(secret, { timestampMs: now - 60_000 });
    expect(verifyTotp(secret, codeTwoStepsAgo, { timestampMs: now })).toBe(false);
  });

  it('verifyTotp rejects an outright wrong code', () => {
    expect(verifyTotp(generateTotpSecret(), '000000', { timestampMs: Date.now() })).toBe(false);
  });

  it('verifyTotp rejects non-numeric input without throwing', () => {
    expect(verifyTotp(generateTotpSecret(), 'not-a-code')).toBe(false);
  });

  it('buildOtpAuthUri embeds the secret, issuer, and account label for a QR/manual-entry setup screen', () => {
    const uri = buildOtpAuthUri('JBSWY3DPEHPK3PXP', 'ops@example.com', 'Test Co');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri.includes('secret=JBSWY3DPEHPK3PXP')).toBe(true);
    expect(uri.includes(encodeURIComponent('Test Co:ops@example.com'))).toBe(true);
  });

  it('generateBackupCodes returns the requested count of distinct, correctly formatted codes', () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes.every((c) => /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{2}$/.test(c))).toBe(true);
  });
});
