# Haraheta Update Announcer

Agent otomatis yang mengumumkan update fitur Haraheta ke **X** dan **channel Telegram**, dipicu oleh GitHub webhook. Jalan 100% di Cloudflare Workers — tanpa VPS, tanpa server yang harus dinyalain terus.

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
3. Kalau layak → Gemini bikin copywriting Bahasa Indonesia
4. Publish ke Telegram + X (paralel, saling gak nge-block)
5. Tandai commit itu "sudah diumumkan" di KV (anti dobel-post)
```

**Penting:** yang menentukan "ini layak diumumkan atau tidak" adalah aturan di `src/config.js`, **bukan AI**. AI (Gemini) cuma dipanggil untuk mengubah commit yang sudah lolos filter menjadi kalimat promosi. Ini sesuai requirement kamu: GitHub/webhook yang mendeteksi perubahan, AI cuma tugas memahami & menulis copy.

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
```bash
wrangler kv namespace create ANNOUNCED_KV
```
Copy `id` yang muncul ke `wrangler.toml`.

### 2. Set secrets
```bash
wrangler secret put GITHUB_WEBHOOK_SECRET
wrangler secret put AI_API_KEY
wrangler secret put AI_BASE_URL
wrangler secret put AI_MODEL
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHANNEL_ID
wrangler secret put TWITTER_CONSUMER_KEY
wrangler secret put TWITTER_CONSUMER_SECRET
wrangler secret put TWITTER_ACCESS_TOKEN
wrangler secret put TWITTER_ACCESS_SECRET
```

- `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`: kredensial router AI kamu. `src/lib/ai.js` ditulis generik pakai format "OpenAI-compatible chat completions" (`POST {AI_BASE_URL}/chat/completions`), format yang dipakai hampir semua router (OpenRouter, Groq, Together, dst) termasuk yang dijual per-API-key di Telegram. **Ganti router nanti = cukup ganti 3 secret ini, gak perlu ubah kode.**
  - Contoh kalau pakai OpenRouter: `AI_BASE_URL=https://openrouter.ai/api/v1`, `AI_MODEL=openai/gpt-4o-mini` (atau model lain yang didukung).
  - Kalau router kamu ternyata gak pakai path `/chat/completions` atau field response-nya beda struktur, kabarin nanti — tinggal sesuaikan bagian `url` dan parsing `json?.choices?.[0]?.message?.content` di `src/lib/ai.js`.
- `TELEGRAM_CHANNEL_ID`: username channel (`@haraheta_updates`) atau numeric chat_id. Bot harus sudah jadi admin di channel itu.
- 4 credential Twitter: dari [X Developer Portal](https://developer.x.com), App dengan permission **Read and Write**, generate Access Token & Secret untuk akun @Haraheta sendiri (bukan App-only Bearer token — itu read-only).

### 3. Deploy
```bash
npm install
npm run deploy
```
Worker kamu akan punya URL seperti `https://haraheta-update-announcer.<subdomain>.workers.dev`.

### 4. Pasang webhook di GitHub
Repo Haraheta → **Settings → Webhooks → Add webhook**:
- Payload URL: `https://haraheta-update-announcer.<subdomain>.workers.dev/webhook/github`
- Content type: `application/json`
- Secret: sama persis dengan `GITHUB_WEBHOOK_SECRET`
- Events: pilih **"Just the push event"**

Selesai — tiap push ke `main`/`master` otomatis dicek dan diumumkan kalau layak.

## Batasan versi ini (bahan diskusi besok)

- Konteks AI saat ini cuma dari commit message + nama file yang berubah, belum baca isi diff/changelog secara mendalam.
- Belum ada notifikasi ke admin kalau posting ke X/Telegram gagal (sekarang cuma balik di response JSON webhook).
- Belum bahas biaya: tier X API (Free tier `POST /2/tweets` ada limit bulanan), Cloudflare Workers (free tier cukup untuk kebutuhan ini), Gemini API (gemini-3.6-flash murah per-request).
- Belum ada rate-limit/anti-spam kalau 1 push punya banyak commit sekaligus.
