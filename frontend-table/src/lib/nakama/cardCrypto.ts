// Per-session hole-card decryption (WebCrypto AES-256-GCM).
//
// The server issues a per-session key on join (OpSessionKey) and encrypts each
// player's own hole cards (OpDealPrivate `enc`) so the raw WebSocket frame never
// carries plaintext card codes. This decrypts them in memory before rendering.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Import a base64 32-byte key as an AES-GCM CryptoKey. */
export async function importSessionKey(base64Key: string): Promise<CryptoKey> {
  const raw = b64ToBytes(base64Key);
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["decrypt"]);
}

/** Decrypt base64(nonce(12) || ciphertext) → the plaintext JSON string. */
export async function decryptCards(key: CryptoKey, encB64: string): Promise<string> {
  const buf = b64ToBytes(encB64);
  const nonce = buf.slice(0, 12) as BufferSource;
  const ct = buf.slice(12) as BufferSource;
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ct);
  return new TextDecoder().decode(plain);
}
