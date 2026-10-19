#!/usr/bin/env node
// Generates the three admin secrets: ADMIN_PATH, ADMIN_PASSWORD_HASH, TOTP_SECRET.
//
//   npm run setup-admin              → asks for a password, prints a QR for your
//                                      authenticator app and the wrangler commands
//                                      to store the secrets in production.
//   npm run setup-admin -- --local   → same, but writes .dev.vars for local dev.
//
// The hash format must match src/lib/password.ts.
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import qrcode from "qrcode-terminal";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32 = (bytes) => {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};
const b64 = (bytes) => Buffer.from(bytes).toString("base64");

async function hashPassword(password) {
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(question); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

const local = process.argv.includes("--local");

const password = await askHidden("Admin password (12+ characters): ");
if (password.length < 12) {
  console.error("Password too short.");
  process.exit(1);
}
if ((await askHidden("Repeat password: ")) !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}

const adminPath = "/k-" + base32(crypto.getRandomValues(new Uint8Array(10))).toLowerCase();
const passwordHash = await hashPassword(password);
const totpSecret = base32(crypto.getRandomValues(new Uint8Array(20)));
const label = local ? "math-path (local)" : "math-path";
const otpauth = `otpauth://totp/${encodeURIComponent(label)}?secret=${totpSecret}&issuer=${encodeURIComponent(label)}&digits=6&period=30`;

console.log("\nScan this with your authenticator app (1Password, Google Authenticator, Authy…):\n");
qrcode.generate(otpauth, { small: true });
console.log(`Or enter the key manually: ${totpSecret}\n`);
console.log(`Your secret admin URL path: ${adminPath}\n(bookmark it on your devices — it's the only way in)\n`);

if (local) {
  writeFileSync(".dev.vars", `ADMIN_PATH=${adminPath}\nADMIN_PASSWORD_HASH=${passwordHash}\nTOTP_SECRET=${totpSecret}\n`);
  console.log("Wrote .dev.vars");
} else {
  console.log("Store them in Cloudflare (paste each value when asked):\n");
  console.log(`  npx wrangler secret put ADMIN_PATH            # ${adminPath}`);
  console.log(`  npx wrangler secret put ADMIN_PASSWORD_HASH   # ${passwordHash}`);
  console.log(`  npx wrangler secret put TOTP_SECRET           # ${totpSecret}`);
}
