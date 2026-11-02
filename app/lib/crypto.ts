import crypto from "node:crypto";

/**
 * Symmetric encryption for secrets at rest (e.g. users' Groq API keys).
 *
 * Uses AES-256-GCM, which is authenticated — decryption fails loudly if the
 * ciphertext was tampered with. The 256-bit key is derived from the
 * `ENCRYPTION_SECRET` environment variable via SHA-256, so the secret can be
 * any length. This secret is server-only and must NEVER reach the client.
 *
 * Stored format: `v1:<iv>:<authTag>:<ciphertext>` (each part base64).
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("ENCRYPTION_SECRET is not set on the server.");
  }
  // Derive a fixed 32-byte key from an arbitrary-length secret.
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12); // 96-bit nonce, recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Reverses {@link encrypt}. For backward compatibility with keys saved before
 * encryption was introduced, any value that isn't in our `v1:` format is
 * assumed to be legacy plaintext and returned unchanged.
 */
export function decrypt(stored: string): string {
  if (!stored.startsWith(`${VERSION}:`)) {
    return stored; // legacy plaintext — will be re-encrypted on next save
  }

  const [, ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted value.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
