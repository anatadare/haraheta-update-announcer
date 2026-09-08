// src/lib/verify.js
//
// Verifikasi header `X-Hub-Signature-256` yang dikirim GitHub, supaya
// endpoint ini gak bisa dipicu orang lain yang asal nembak POST request.
// WAJIB diset "Secret" yang SAMA di GitHub repo settings > Webhooks
// dan di worker secret GITHUB_WEBHOOK_SECRET.

export async function verifyGithubSignature(secret, rawBody, signatureHeader) {
  if (!secret || !signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sigBuffer), (b) => b.toString(16).padStart(2, "0")).join("");
  const expectedHex = signatureHeader.slice("sha256=".length);

  // Bandingin per-karakter (bukan langsung ===) biar gak gampang kena
  // timing attack.
  if (computedHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}
