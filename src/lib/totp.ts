import { base32Decode, base32Encode } from "./encoding";

const STEP = 30;
const DIGITS = 6;

export async function hotp(secret: Uint8Array<ArrayBuffer>, counter: number): Promise<string> {
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    (((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]) %
    10 ** DIGITS;
  return code.toString().padStart(DIGITS, "0");
}

export function totpAt(secretB32: string, unixSeconds: number): Promise<string> {
  return hotp(base32Decode(secretB32), Math.floor(unixSeconds / STEP));
}

/** Accepts the current code and one step either side (clock drift). */
export async function verifyTotp(secretB32: string, code: string, unixSeconds = Date.now() / 1000): Promise<boolean> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(unixSeconds / STEP);
  for (const delta of [-1, 0, 1]) {
    if ((await hotp(secret, counter + delta)) === clean) return true;
  }
  return false;
}

export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}
