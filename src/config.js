// src/config.js
//
// Pusat aturan: commit jenis apa yang boleh diumumkan, dan masuk kategori
// apa. Ubah file ini kalau mau nambah/ganti aturan — jangan ubah logic
// parsing di lib/classify.js.

// Marker eksplisit yang bisa ditaruh developer di commit message.
// Prioritas: SKIP_MARKER > FORCE_PUBLIC_MARKER > aturan default per type.
export const SKIP_MARKER = "[internal]";          // paksa JANGAN diumumkan
export const FORCE_PUBLIC_MARKER = "[announce]";  // paksa diumumkan walau type-nya biasanya di-skip
export const BREAKING_MARKER = "BREAKING CHANGE";

// Push ke branch selain ini TIDAK memicu pengumuman (dev/staging/feature
// branch aman, gak akan ke-post ke publik).
export const ANNOUNCE_BRANCHES = ["refs/heads/main", "refs/heads/master"];

// Mapping conventional-commit type -> kategori pengumuman + apakah
// default-nya publik atau tidak.
// defaultPublic:false artinya commit jenis ini TIDAK diumumkan kecuali
// developer nambahin FORCE_PUBLIC_MARKER di commit message-nya.
export const COMMIT_TYPE_RULES = {
  feat:     { label: "fitur_baru",    defaultPublic: true },
  fix:      { label: "perbaikan_bug", defaultPublic: true },
  security: { label: "keamanan",      defaultPublic: true },
  perf:     { label: "maintenance",   defaultPublic: true },
  chore:    { label: "maintenance",   defaultPublic: false },
  refactor: { label: "maintenance",   defaultPublic: false },
  docs:     { label: "maintenance",   defaultPublic: false },
  style:    { label: "maintenance",   defaultPublic: false },
  test:     { label: "maintenance",   defaultPublic: false },
  ci:       { label: "maintenance",   defaultPublic: false },
  build:    { label: "maintenance",   defaultPublic: false },
  revert:   { label: "maintenance",   defaultPublic: false },
};

// Commit yang gak ikutin format conventional commit ("type: pesan") sama
// sekali -> anggap TIDAK diumumkan by default (fail closed / aman),
// kecuali dipaksa pakai FORCE_PUBLIC_MARKER.
export const UNKNOWN_TYPE_RULE = { label: "maintenance", defaultPublic: false };

// Kategori final yang dipakai buat prompt AI + emoji per kategori.
export const CATEGORY_META = {
  fitur_baru:    { title: "Fitur Baru",    emoji: "🚀" },
  perbaikan_bug: { title: "Perbaikan Bug", emoji: "🛠️" },
  keamanan:      { title: "Keamanan",      emoji: "🔒" },
  maintenance:   { title: "Maintenance",   emoji: "🧹" },
  update_besar:  { title: "Update Besar",  emoji: "🎉" },
};

export const APP_NAME = "Haraheta";
