// src/lib/invidious.js
//
// 複数のInvidiousインスタンスへ並列にリクエストし、最速で成功した結果を返すクライアント。
// 落ちてるインスタンスは一時的にブラックリスト入りさせて無駄な待ちを減らす。

// 生きていそうなインスタンス一覧。稼働状況は https://api.invidious.io/ で確認できるので
// 定期的に見直すこと。先頭に近いものほど優先的に試される。
export const INVIDIOUS_INSTANCES = [
  "https://invidious.ritoge.com",
  "https://yt.omada.cafe",
  "https://invidious.darkness.services",
  "https://invidious.f5.si",
  "https://invidious.ducks.party",
  "https://y.com.sb",
  "https://super8.absturztau.be",
  "https://inv.zoomerville.com",
  "https://invidious.nerdvpn.de",
  "https://inv.thepixora.com",
];

const REQUEST_TIMEOUT_MS = 6000;
const BLACKLIST_MS = 120_000;

const blacklist = new Map(); // base -> 復帰時刻(epoch ms)

function aliveInstances() {
  const now = Date.now();
  const alive = INVIDIOUS_INSTANCES.filter((base) => (blacklist.get(base) ?? 0) < now);
  return alive.length > 0 ? alive : INVIDIOUS_INSTANCES; // 全滅時も諦めず全部試す
}

function markDead(base) {
  blacklist.set(base, Date.now() + BLACKLIST_MS);
}

async function fetchOne(base, path, params, signal) {
  const url = new URL(`${base}/api/v1${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${base}`);
  }
  return res.json();
}

/**
 * 複数インスタンスに並列リクエストし、最初に成功したレスポンスを返す。
 * @param {string} path - 例: '/search', '/videos/xxxx'
 * @param {Record<string, any>} [params] - クエリパラメータ
 * @returns {Promise<any>}
 */
export async function raceRequest(path, params = {}) {
  const candidates = aliveInstances();

  return new Promise((resolve, reject) => {
    let remaining = candidates.length;
    let settled = false;
    const controllers = [];

    if (remaining === 0) {
      reject(new Error('利用可能なInvidiousインスタンスがありません'));
      return;
    }

    for (const base of candidates) {
      const controller = new AbortController();
      controllers.push(controller);
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      fetchOne(base, path, params, controller.signal)
        .then((data) => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            // 他の進行中リクエストは全部キャンセル
            for (const c of controllers) {
              if (c !== controller) c.abort();
            }
            resolve(data);
          }
        })
        .catch(() => {
          clearTimeout(timer);
          markDead(base);
          remaining -= 1;
          if (remaining === 0 && !settled) {
            reject(new Error('全てのInvidiousインスタンスへの接続に失敗しました'));
          }
        });
    }
  });
}
