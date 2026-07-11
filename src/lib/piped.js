// src/lib/piped.js
//
// Pipedの複数インスタンスへ並列リクエストするクライアント。
// 構造はsrc/lib/invidious.jsと全く同じ(レースして最速の成功を採用)。
// Pipedの /streams/:id は、ライブ配信時に "hls" フィールドへm3u8 URLを入れて返す。

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.privacy.com.de',
];

const REQUEST_TIMEOUT_MS = 6000;
const BLACKLIST_MS = 120_000;

const blacklist = new Map();

function aliveInstances() {
  const now = Date.now();
  const alive = PIPED_INSTANCES.filter((base) => (blacklist.get(base) ?? 0) < now);
  return alive.length > 0 ? alive : PIPED_INSTANCES;
}

function markDead(base) {
  blacklist.set(base, Date.now() + BLACKLIST_MS);
}

async function fetchOne(base, videoId, signal) {
  const res = await fetch(`${base}/streams/${videoId}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${base}`);
  return res.json();
}

/**
 * Pipedの /streams/:id を複数インスタンスへレースして取得する。
 */
export async function getPipedStreamInfo(videoId) {
  const candidates = aliveInstances();

  return new Promise((resolve, reject) => {
    let remaining = candidates.length;
    let settled = false;
    const controllers = [];

    for (const base of candidates) {
      const controller = new AbortController();
      controllers.push(controller);
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      fetchOne(base, videoId, controller.signal)
        .then((data) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            for (const c of controllers) if (c !== controller) c.abort();
            resolve(data);
          }
        })
        .catch(() => {
          clearTimeout(timer);
          markDead(base);
          remaining -= 1;
          if (remaining === 0 && !settled) {
            reject(new Error('全てのPipedインスタンスへの接続に失敗しました'));
          }
        });
    }
  });
}
