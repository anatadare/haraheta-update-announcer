// src/lib/kv.js
//
// Cegah 1 commit ke-post dobel (misal GitHub retry webhook yang gagal,
// atau kamu re-run manual). Simpan SHA commit yang SUDAH diumumkan ke
// Workers KV, TTL 30 hari cukup panjang buat kasus retry wajar.

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 hari

export async function alreadyAnnounced(kv, sha) {
  const val = await kv.get(`announced:${sha}`);
  return val !== null;
}

export async function markAnnounced(kv, sha) {
  await kv.put(`announced:${sha}`, "1", { expirationTtl: TTL_SECONDS });
}
