// src/lib/telegram.js
//
// Kirim 1 pesan pengumuman ke channel Telegram via Bot API. Bot-nya harus
// sudah jadi admin di channel target (Haraheta Announcement) dan punya
// izin "Post Messages".

export async function postToTelegram(botToken, channelId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: channelId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json?.ok) {
    throw new Error(`telegram_post_failed: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.result;
}
