// src/lib/ytdlp.js
//
// yt-dlp呼び出しを execFile + 引数配列 に統一。
// 旧実装は exec() にURLを文字列展開していたためコマンドインジェクションが可能だった。
// (例: id=`"; rm -rf ~ #` のような入力が来ると任意コマンド実行につながる)
// execFile は shell を経由しないので、引数はそのままプロセスに渡り、シェル解釈されない。

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

const DENO_PATH = '/home/ubuntu/.deno/bin';
const ENV_WITH_DENO = { ...process.env, PATH: `${DENO_PATH}:${process.env.PATH}` };

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * YouTube動画IDとして安全な形式かを検証する。
 * execFileを使う以上コマンドインジェクションのリスクは無いが、
 * 明らかに不正な入力は早期に弾いて無駄なプロセス起動を避ける。
 */
export function isValidVideoId(id) {
  return typeof id === 'string' && VIDEO_ID_RE.test(id);
}

export function buildWatchUrl(id) {
  if (!isValidVideoId(id)) {
    throw new Error('不正な動画IDです');
  }
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * 指定URLの最良フォーマットの直リンクを取得する。
 */
export async function getBestStreamUrl(targetUrl) {
  const { stdout } = await execFilePromise(
    'yt-dlp',
    ['-g', targetUrl, '--format', 'best', '--js-runtime', 'deno'],
    { env: ENV_WITH_DENO, timeout: 20_000 }
  );
  return stdout.trim();
}

/**
 * ライブ配信のHLS(m3u8)含む全フォーマットURLを取得する。
 */
export async function getAllStreamUrls(targetUrl) {
  const { stdout } = await execFilePromise(
    'yt-dlp',
    ['-g', targetUrl, '--js-runtime', 'deno'],
    { env: ENV_WITH_DENO, timeout: 20_000 }
  );
  return stdout.trim().split('\n').filter(Boolean);
}

/**
 * 動画がライブ配信中かどうか、is_liveやconcurrent_view_countなどの詳細を取得する。
 */
export async function getLiveInfo(targetUrl) {
  const { stdout } = await execFilePromise(
    'yt-dlp',
    ['-j', targetUrl, '--no-warnings', '--js-runtime', 'deno'],
    { env: ENV_WITH_DENO, timeout: 20_000 }
  );
  return JSON.parse(stdout.trim());
}

/**
 * キーワード検索(yt-dlpのytsearch)。Invidiousが全滅した場合のフォールバック用。
 */
export async function searchViaYtdlp(query, limit = 10) {
  const n = Math.max(1, Math.min(limit, 30));
  const { stdout } = await execFilePromise(
    'yt-dlp',
    [`ytsearch${n}:${query}`, '--dump-json', '--flat-playlist', '--js-runtime', 'deno'],
    { env: ENV_WITH_DENO, timeout: 20_000 }
  );
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const data = JSON.parse(line);
      return {
        id: data.id,
        title: data.title,
        author: data.uploader,
        thumbnails: [{ url: `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg` }],
        duration: data.duration_string,
        is_live: data.is_live || false,
      };
    });
}
