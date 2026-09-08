# Haraheta Update Announcer

Agent otomatis yang mengumumkan update fitur Haraheta ke **channel Telegram**, dipicu oleh GitHub webhook, plus menyiapkan draft teks siap-pakai untuk **X** yang tinggal di-copy manual. Jalan 100% di Cloudflare Workers — tanpa VPS, tanpa server yang harus dinyalain terus.

> Kenapa X gak auto-post? Sejak 2026 posting lewat X API berbayar per-post (gak ada tier gratis lagi buat developer baru). Jadi biar gak nambah biaya, agent ini cuma auto-post ke Telegram (gratis) dan menyiapkan draft teks X di pesan Telegram yang sama — tinggal kamu copy-paste manual ke X.

## Alur

```
push ke GitHub (branch main)
        │
        ▼
GitHub Webhook ──POST──▶ Cloudflare Worker (/webhook/github)
        │
        ▼
1. Verifikasi signature (pastikan beneran dari GitHub)
2. Loop tiap commit → klasifikasi (ATURAN TETAP, bukan AI):
     - layak diumumkan? (public/internal)
     - kategori apa? (fitur baru / bug / keamanan / maintenance / update besar)
3. Kalau layak → AI (router kamu) bikin 2 draft copywriting Bahasa Indonesia:
     - versi Telegram (auto-post)
     - versi X (disertakan di pesan Telegram yang sama, buat di-copy manual)
4. Publish ke Telegram
5. Tandai commit itu "sudah diumumkan" di KV (anti dobel-post)
```

**Penting:** yang menentukan "ini layak diumumkan atau tidak" adalah aturan di `src/config.js`, **bukan AI**. AI cuma dipanggil untuk mengubah commit yang sudah lolos filter menjadi kalimat promosi. Ini sesuai requirement kamu: GitHub/webhook yang mendeteksi perubahan, AI cuma tugas memahami & menulis copy.

## Cara developer mengontrol pengumuman

Ikuti [conventional commits](https://www.conventionalcommits.org/) di commit message:

| Commit message | Diumumkan? | Kategori |
|---|---|---|
| `feat: tambah sistem deposit` | ✅ Ya | Fitur Baru |
| `fix: perbaiki bug saldo tidak update` | ✅ Ya | Perbaikan Bug |
| `security: patch celah OTP` | ✅ Ya | Keamanan |
| `perf: optimasi query wallet` | ✅ Ya | Maintenance |
| `chore: update dependency` | ❌ Tidak | — |
| `feat!: rombak total sistem poin` (breaking) | ✅ Ya | Update Besar |

**Override manual** (taruh di mana saja dalam commit message):
- `[internal]` → paksa **jangan** diumumkan, walaupun type-nya `feat`/`fix`. Pakai ini untuk perubahan sensitif/rahasia.
- `[announce]` → paksa **diumumkan**, walaupun type-nya biasanya di-skip (misal `chore`).

Contoh commit yang tetap rahasia walau fitur baru:
```
feat: tambah sistem deteksi fraud internal [internal]
```

Semua aturan ini bisa kamu ubah di `src/config.js` tanpa sentuh logic lain.

## Setup

### 1. Buat KV namespace
Lewat dashboard Cloudflare (Storage & Databases → KV → Create a namespace) atau CLI:
```bash
wrangler kv namespace create ANNOUNCED_KV
```
Copy `id` yang muncul ke `wrangler.toml`.

### 2. Set secrets
Lewat dashboard (Worker → Settings → Variables and Secrets) atau CLI:
```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put AI_API_KEY
wrangler secret put AI_BASE_URL
wrangler secret put AI_MODEL
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHANNEL_ID
```

- `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`: kredensial router AI kamu. `src/lib/ai.js` ditulis generik pakai format "OpenAI-compatible chat completions" (`POST {AI_BASE_URL}/chat/completions`), format yang dipakai hampir semua router (OpenRouter, Groq, Together, dst) termasuk yang dijual per-API-key di Telegram. **Ganti router nanti = cukup ganti 3 secret ini, gak perlu ubah kode.**
  - Kalau router kamu ternyata gak pakai path `/chat/completions` atau field response-nya beda struktur, kabarin nanti — tinggal sesuaikan bagian `url` dan parsing `json?.choices?.[0]?.message?.content` di `src/lib/ai.js`.
- `TELEGRAM_CHANNEL_ID`: username channel (`@haraheta_updates`) atau numeric chat_id. Bot harus sudah jadi admin di channel itu dengan izin post message.

### 3. Deploy
```bash
npm install
npm run deploy
```
Worker kamu akan punya URL seperti `https://haraheta-update-announcer.<subdomain>.workers.dev`.

### 4. Pasang webhook di GitHub
Repo Haraheta (repo lama, bukan repo agent ini) → **Settings → Webhooks → Add webhook**:
- Payload URL: `https://haraheta-update-announcer.<subdomain>.workers.dev/webhook/github`
- Content type: `application/json`
- Secret: sama persis dengan `GITHUB_WEBHOOK_SECRET`
- Events: pilih **"Just the push event"**

Selesai — tiap push ke `main`/`master` otomatis dicek, diumumkan ke Telegram kalau layak, dan draft teks X-nya ikut nongol di pesan yang sama.

## Kalau nanti mau balikin auto-post ke X

Aturan/keputusan publik-privat sudah siap; tinggal tambah lagi 1 file kecil (`src/lib/twitter.js`, signing OAuth1.0a ke `POST /2/tweets`) dan panggil di `src/index.js` — versi sebelumnya sudah pernah dibuat, tinggal diaktifkan lagi kalau kamu siap dengan biaya pay-per-use-nya X.

## Batasan versi ini (bahan diskusi besok)

- Konteks AI saat ini cuma dari commit message + nama file yang berubah, belum baca isi diff/changelog secara mendalam.
- Belum ada notifikasi ke admin kalau posting ke Telegram gagal (sekarang cuma balik di response JSON webhook).
- Belum bahas biaya: Cloudflare Workers (free tier cukup untuk kebutuhan ini), biaya per-request router AI kamu.
- Belum ada rate-limit/anti-spam kalau 1 push punya banyak commit sekaligus.
