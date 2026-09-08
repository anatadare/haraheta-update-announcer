// src/lib/twitter.js
//
// Posting ke X (Twitter) API v2 (`POST /2/tweets`) butuh OAuth 1.0a User
// Context (Bearer token App-only itu READ-ONLY, gak bisa dipakai nge-tweet).
// Signing HMAC-SHA1 ditulis manual pakai Web Crypto API (tersedia native
// di Cloudflare Workers) — sengaja TANPA library eksternal biar Worker-nya
// ringan & gak butuh bundler ribet.
//
// 4 credential yang dibutuhkan (dari X Developer Portal, App dengan
// permission "Read and Write"):
//   TWITTER_CONSUMER_KEY / TWITTER_CONSUMER_SECRET  -> punya App
//   TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_SECRET    -> punya akun @Haraheta
//   yang sudah authorize App itu (generate dari Developer Portal > Keys and Tokens)

const TWEET_URL = "https://api.twitter.com/2/tweets";

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1Base64(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildOAuthHeader({ consumerKey, consumerSecret, accessToken, accessSecret, method, url }) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // POST /2/tweets gak punya query param, jadi base string cukup dari
  // oauth params doang — body JSON-nya TIDAK ikut di-sign (beda dari
  // endpoint lama yang form-urlencoded).
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessSecret)}`;
  const signature = await hmacSha1Base64(signingKey, baseString);

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return "OAuth " + Object.keys(headerParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(headerParams[k])}"`)
    .join(", ");
}

export async function postToX(creds, text) {
  const authHeader = await buildOAuthHeader({
    consumerKey: creds.consumerKey,
    consumerSecret: creds.consumerSecret,
    accessToken: creds.accessToken,
    accessSecret: creds.accessSecret,
    method: "POST",
    url: TWEET_URL,
  });

  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`twitter_post_failed: ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}
