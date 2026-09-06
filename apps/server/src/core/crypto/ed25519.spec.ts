import { describe, expect, it } from 'vitest';
import {
  ed25519Sign,
  ed25519Verify,
  generateEd25519KeyPair,
  privateKeyFromDer,
  publicKeyFromBase64,
} from './ed25519.js';

describe('ed25519 helpers (unit)', () => {
  it('generates a keypair with a 32-byte raw public key', () => {
    const { publicKeyBase64, privateKeyDer } = generateEd25519KeyPair();
    expect(Buffer.from(publicKeyBase64, 'base64')).toHaveLength(32);
    expect(privateKeyDer.length).toBeGreaterThan(32);
  });

  it('signs and verifies through the stored formats', () => {
    const { publicKeyBase64, privateKeyDer } = generateEd25519KeyPair();
    const message = Buffer.from('federated request body');

    const signature = ed25519Sign(privateKeyFromDer(privateKeyDer), message);
    expect(signature).toHaveLength(64);
    expect(ed25519Verify(publicKeyFromBase64(publicKeyBase64), message, signature)).toBe(true);
  });

  it('rejects a signature over different bytes', () => {
    const { publicKeyBase64, privateKeyDer } = generateEd25519KeyPair();
    const signature = ed25519Sign(privateKeyFromDer(privateKeyDer), Buffer.from('a'));
    expect(ed25519Verify(publicKeyFromBase64(publicKeyBase64), Buffer.from('b'), signature)).toBe(
      false,
    );
  });

  it('rejects a signature from a different key', () => {
    const a = generateEd25519KeyPair();
    const b = generateEd25519KeyPair();
    const message = Buffer.from('m');
    const signature = ed25519Sign(privateKeyFromDer(a.privateKeyDer), message);
    expect(ed25519Verify(publicKeyFromBase64(b.publicKeyBase64), message, signature)).toBe(false);
  });
});
