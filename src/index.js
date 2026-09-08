// src/index.js
//
// Entry point Cloudflare Worker. Alurnya:
//   1. GitHub kirim webhook event "push" tiap ada push ke branch production.
//   2. Verifikasi signature-nya (lib/verify.js) — tolak kalau bukan dari GitHub.
//   3. Loop tiap commit di payload, klasifikasi (lib/classify.js) — ini
//      yang nentuin "layak diumumkan atau enggak" & kategorinya lewat
//      ATURAN TETAP, BUKAN AI (sesuai requirement kamu).
//   4. Kalau layak & belum pernah diumumkan (lib/kv.js), generate
//      copywriting Bahasa Indonesia (lib/gemini.js).
//   5. Publish ke Telegram (lib/telegram.js) + X (lib/twitter.js).
//
// Semua langkah "best effort per commit": 1 commit gagal diproses (misal
// AI error) gak bikin commit lain di push yang sama ikut gagal.

import { ANNOUNCE_BRANCHES, CATEGORY_META, APP_NAME } from "./config.js";
import { classifyCommit } from "./lib/classify.js";
import { verifyGithubSignature } from "./lib/verify.js";
import { generateAnnouncementCopy } from "./lib/ai.js";
import { postToTelegram } from "./lib/telegram.js";
import { postToX } from "./lib/twitter.js";
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

  const finalX = `${categoryMeta.emoji} ${copy.text_x}`;
  const finalTelegram = `${categoryMeta.emoji} *${APP_NAME} - ${categoryMeta.title}*\n\n${copy.text_telegram}`;

  const [telegramResult, twitterResult] = await Promise.allSettled([
    postToTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHANNEL_ID, finalTelegram),
    postToX(
      {
        consumerKey: env.TWITTER_CONSUMER_KEY,
        consumerSecret: env.TWITTER_CONSUMER_SECRET,
        accessToken: env.TWITTER_ACCESS_TOKEN,
        accessSecret: env.TWITTER_ACCESS_SECRET,
      },
      finalX
    ),
  ]);

  // Ditandai "sudah diumumkan" begitu MINIMAL SATU platform berhasil —
  // supaya kalau 1 platform gagal (misal X kena rate-limit), retry manual
  // gak bikin dobel-post di platform yang tadi udah sukses.
  if (telegramResult.status === "fulfilled" || twitterResult.status === "fulfilled") {
    await markAnnounced(env.ANNOUNCED_KV, sha);
  }

  return {
    sha,
    ok: true,
    category: info.category,
    telegram: telegramResult.status,
    twitter: twitterResult.status,
    telegramError: telegramResult.status === "rejected" ? String(telegramResult.reason) : undefined,
    twitterError: twitterResult.status === "rejected" ? String(twitterResult.reason) : undefined,
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
