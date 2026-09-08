// src/index.js
//
// Entry point Cloudflare Worker. Alurnya:
//   1. GitHub kirim webhook event "push" tiap ada push ke branch production.
//   2. Verifikasi signature-nya (lib/verify.js) — tolak kalau bukan dari GitHub.
//   3. Loop tiap commit di payload, klasifikasi (lib/classify.js) — ini
//      yang nentuin "layak diumumkan atau enggak" & kategorinya lewat
//      ATURAN TETAP, BUKAN AI (sesuai requirement kamu).
//   4. Kalau layak & belum pernah diumumkan (lib/kv.js), generate
//      copywriting Bahasa Indonesia (lib/ai.js) — 2 versi: versi Telegram
//      & versi X.
//   5. Auto-publish ke Telegram (lib/telegram.js). Versi X-nya SENGAJA
//      TIDAK di-post otomatis (posting X API sekarang berbayar per-post) —
//      draft teksnya disertakan di pesan Telegram yang sama, tinggal
//      di-copy manual buat di-post ke X.
//
// Semua langkah "best effort per commit": 1 commit gagal diproses (misal
// AI error) gak bikin commit lain di push yang sama ikut gagal.

import { ANNOUNCE_BRANCHES, CATEGORY_META, APP_NAME } from "./config.js";
import { classifyCommit } from "./lib/classify.js";
import { verifyGithubSignature } from "./lib/verify.js";
import { generateAnnouncementCopy } from "./lib/ai.js";
import { postToTelegram } from "./lib/telegram.js";
import { alreadyAnnounced, markAnnounced } from "./lib/kv.js";

async function processCommit(commit, env) {
  const sha = commit.id;

  if (await alreadyAnnounced(env.ANNOUNCED_KV, sha)) {
    return { sha, ok: true, skipped: "already_announced" };
  }

  const info = classifyCommit(commit.message);
  if (!info.isPublic) {
    return { sha, ok: true, skipped: "not_public", type: info.type };
  }

  const categoryMeta = CATEGORY_META[info.category] || CATEGORY_META.maintenance;
  const filesChanged = [
    ...(commit.added || []),
    ...(commit.modified || []),
    ...(commit.removed || []),
  ];

  const copy = await generateAnnouncementCopy(env, {
    appName: APP_NAME,
    categoryTitle: categoryMeta.title,
    description: info.description,
    scope: info.scope,
    filesChanged,
  });

  // Pesan Telegram berisi 2 bagian: pengumuman resmi (auto-post ke
  // channel) + draft khusus buat X yang tinggal di-copy-paste manual.
  const finalTelegram = [
    `${categoryMeta.emoji} *${APP_NAME} - ${categoryMeta.title}*`,
    "",
    copy.text_telegram,
    "",
    "—",
    "_Draft untuk X (copy-paste manual):_",
    copy.text_x,
  ].join("\n");

  let telegramStatus = "fulfilled";
  let telegramError;
  try {
    await postToTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHANNEL_ID, finalTelegram);
  } catch (err) {
    telegramStatus = "rejected";
    telegramError = String(err?.message || err);
  }

  if (telegramStatus === "fulfilled") {
    await markAnnounced(env.ANNOUNCED_KV, sha);
  }

  return {
    sha,
    ok: true,
    category: info.category,
    telegram: telegramStatus,
    telegramError,
  };
}

async function handleGithubWebhook(request, env) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Hub-Signature-256");

  const isValid = await verifyGithubSignature(env.GITHUB_WEBHOOK_SECRET, rawBody, signature);
  if (!isValid) {
    return new Response("invalid signature", { status: 401 });
  }

  const event = request.headers.get("X-GitHub-Event");
  if (event !== "push") {
    // Event lain (PR, issue, star, dll) sengaja diabaikan — cuma "push"
    // yang relevan buat pengumuman fitur. Balikin 200 biar GitHub gak retry.
    return new Response("event ignored", { status: 200 });
  }

  const payload = JSON.parse(rawBody);

  if (!ANNOUNCE_BRANCHES.includes(payload.ref)) {
    return new Response("branch ignored", { status: 200 });
  }

  const commits = Array.isArray(payload.commits) ? payload.commits : [];
  const results = [];

  for (const commit of commits) {
    try {
      results.push(await processCommit(commit, env));
    } catch (err) {
      results.push({ sha: commit.id, ok: false, error: String(err?.message || err) });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook/github") {
      return handleGithubWebhook(request, env);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    return new Response("not found", { status: 404 });
  },
};
