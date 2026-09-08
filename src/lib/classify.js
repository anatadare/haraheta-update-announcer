// src/lib/classify.js
//
// Ubah 1 commit mentah dari payload GitHub jadi keputusan: perlu diumumkan
// atau tidak, dan kalau iya masuk kategori apa. Ini yang menjawab
// requirement "GitHub/webhook yang mendeteksi update, bukan AI, dan harus
// ada sistem public supaya internal gak ikut diumumkan" — keputusannya
// aturan tetap (deterministic), BUKAN AI. AI di lib/gemini.js cuma tugas
// bikin copywriting dari commit yang SUDAH lolos di sini.

import {
  SKIP_MARKER,
  FORCE_PUBLIC_MARKER,
  BREAKING_MARKER,
  COMMIT_TYPE_RULES,
  UNKNOWN_TYPE_RULE,
} from "../config.js";

// Cocokin format conventional commit: "type(scope)!: deskripsi" atau "type: deskripsi"
const CONVENTIONAL_RE = /^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/s;

export function classifyCommit(commitMessage) {
  const fullMessage = commitMessage || "";
  const firstLine = fullMessage.split("\n")[0].trim();

  const forceSkip = fullMessage.includes(SKIP_MARKER);
  const forcePublic = fullMessage.includes(FORCE_PUBLIC_MARKER);
  const isBreaking = fullMessage.includes(BREAKING_MARKER) || /^\w+(\([^)]*\))?!:/.test(firstLine);

  const match = firstLine.match(CONVENTIONAL_RE);
  const type = match ? match[1].toLowerCase() : null;
  const scope = match ? (match[2] || "").replace(/[()]/g, "") : "";
  const description = match ? match[4].trim() : firstLine;

  const rule = (type && COMMIT_TYPE_RULES[type]) || UNKNOWN_TYPE_RULE;

  let category = rule.label;
  let isPublic = rule.defaultPublic;

  // Breaking change / major update selalu naik jadi kategori "update_besar"
  // kalau memang akan diumumkan.
  if (isBreaking) category = "update_besar";

  if (forceSkip) isPublic = false;
  else if (forcePublic) isPublic = true;

  // Bersihin marker dari teks yang bakal dikirim ke AI, biar gak ikut
  // "bocor" ke hasil copywriting.
  const cleanMessage = fullMessage
    .replaceAll(SKIP_MARKER, "")
    .replaceAll(FORCE_PUBLIC_MARKER, "")
    .trim();

  return {
    type: type || "unknown",
    scope,
    description,
    category,
    isPublic,
    isBreaking,
    cleanMessage,
  };
}
