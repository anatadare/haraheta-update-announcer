// src/lib/ai.js
//
// Ubah 1 commit (yang sudah lolos filter "layak diumumkan" di
// classify.js) jadi 2 draft teks: satu buat X (batas keras 280 karakter),
// satu buat Telegram (boleh sedikit lebih naratif). AI CUMA nulis
// copywriting — kategori dan keputusan publik/privat sudah ditentukan
// sebelumnya oleh aturan tetap, bukan oleh AI.
//
// Pakai format "Anthropic Messages API" (`POST {AI_BASE_URL}/v1/messages`,
// header `x-api-key` + `anthropic-version`), format yang dipakai router
// custom kayak jerouter (dan juga API Claude asli). BUKAN format
// OpenAI-compatible (`/chat/completions` + `Authorization: Bearer`).
//
// Kalau nanti ganti router yang formatnya sama (masih Anthropic-style),
// CUKUP ganti 3 secret ini (gak perlu sentuh kode sama sekali):
//   AI_BASE_URL -> contoh: https://je.jerouter.web.id  (JANGAN pakai "/v1" di akhir, itu udah ditambahin di kode)
//   AI_API_KEY  -> api key dari router-nya (dikirim lewat header x-api-key)
//   AI_MODEL    -> nama model sesuai router-nya, contoh: "big-pickle"
//
// Kalau nanti pindah ke router yang formatnya OpenAI-compatible
// (OpenRouter/Groq/Together/dll), kode di bawah PERLU diubah lagi
// (endpoint, header auth, dan cara ambil teks dari response beda).

function buildPrompt({ appName, categoryTitle, description, scope, filesChanged }) {
  return [
    `Kamu adalah copywriter media sosial untuk aplikasi "${appName}".`,
    "Ubah 1 catatan perubahan teknis di bawah ini menjadi pengumuman Bahasa Indonesia yang santai, jelas, dan mudah dipahami pengguna awam (BUKAN developer).",
    "",
    `Kategori perubahan: ${categoryTitle}`,
    `Ringkasan teknis dari developer: ${description}`,
    scope ? `Bagian terkait: ${scope}` : "",
    filesChanged?.length
      ? `File yang berubah (HANYA konteks buatmu, JANGAN pernah disebut di teks hasil): ${filesChanged.slice(0, 15).join(", ")}`
      : "",
    "",
    "Aturan WAJIB:",
    "- JANGAN mengarang detail/angka/klaim yang tidak ada di ringkasan teknis.",
    "- JANGAN menyebut kata 'commit', 'repo', 'push', 'branch', nama file, atau istilah git lain.",
    "- Gunakan bahasa yang hangat dan mudah dimengerti, bukan bahasa teknis.",
    "- Sertakan 1 emoji relevan di awal, secukupnya saja.",
    "- 'text_x' WAJIB di bawah 260 karakter (termasuk emoji), padat dan langsung ke inti.",
    "- 'text_telegram' boleh 2-4 kalimat pendek, boleh sedikit lebih naratif dari versi X.",
    "",
    "Balas HANYA dengan JSON valid, PERSIS format ini, tanpa teks lain, tanpa markdown code block:",
    '{"text_x": "...", "text_telegram": "..."}',
  ].filter(Boolean).join("\n");
}

// Beberapa model/router suka "bandel" nambahin ```json ... ``` di sekitar
// output walau udah diminta jangan. Bersihin dulu sebelum di-parse.
function stripCodeFence(raw) {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

export async function generateAnnouncementCopy(env, params) {
  const apiKey = env.AI_API_KEY;
  const baseUrl = env.AI_BASE_URL;
  const model = env.AI_MODEL;

  if (!apiKey) throw new Error("ai_api_key_missing");
  if (!baseUrl) throw new Error("ai_base_url_missing");
  if (!model) throw new Error("ai_model_missing");

  const body = {
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: buildPrompt(params) }],
    temperature: 0.7,
  };

  const url = `${baseUrl.replace(/\/$/, "")}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(`ai_http_error: ${res.status} ${json ? JSON.stringify(json).slice(0, 500) : ""}`);
  }

  // Response Anthropic Messages API: { content: [{ type: "text", text: "..." }, ...] }
  const rawText = Array.isArray(json?.content)
    ? json.content
        .filter((block) => block?.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n")
        .trim()
    : "";

  if (!rawText) {
    throw new Error(`ai_empty_response: ${JSON.stringify(json).slice(0, 300)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    throw new Error(`ai_invalid_json_output: ${rawText.slice(0, 200)}`);
  }

  if (!parsed.text_x || !parsed.text_telegram) {
    throw new Error("ai_missing_fields");
  }

  // Jaga-jaga kalau AI tetap kelewat batas — potong paksa biar gak
  // ditolak API X (limit keras 280 char untuk tweet teks biasa).
  if (parsed.text_x.length > 280) {
    parsed.text_x = parsed.text_x.slice(0, 277) + "...";
  }

  return parsed;
}
