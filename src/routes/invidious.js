// src/routes/invidious.js
//
// 送ってもらったAPIドキュメントに載っていたエンドポイント群を、
// Invidiousの /api/v1 をバックエンドにして丸ごと再現したルーター。
// パターンは全部同じ: raceRequest(invidiousのパス, クエリパラメータ) をそのまま返すだけ。

import { Router } from 'express';
import { raceRequest } from '../lib/invidious.js';
import { isValidVideoId } from '../lib/ytdlp.js';
import { getInnertube } from '../lib/innertube.js';
import { getPipedStreamInfo } from '../lib/piped.js';

export const router = Router();

// 共通: Invidiousへの問い合わせが失敗したら502で返す小ヘルパー
async function proxy(res, path, params) {
  try {
    const data = await raceRequest(path, params);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}

// ---------------------------------------------------------------------------
// 検索系
// ---------------------------------------------------------------------------

// GET /api/search
router.get('/search', async (req, res) => {
  const { q, page, sort_by, date, duration, type, features, region } = req.query;
  if (!q) return res.status(400).json({ error: 'q は必須です' });

  try {
    const data = await raceRequest('/search', {
      q, page, sort_by, date, duration, type, features, region,
    });
    return res.json(data);
  } catch (err) {
    // Invidiousが全滅した場合のみ yt-dlp 検索にフォールバック
    try {
      const results = await searchViaYtdlp(q);
      return res.json({ results, source: 'yt-dlp-fallback' });
    } catch (fallbackErr) {
      return res.status(502).json({ error: `検索に失敗しました: ${fallbackErr.message}` });
    }
  }
});

// GET /api/search/suggestions
router.get('/search/suggestions', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q は必須です' });
  return proxy(res, '/search/suggestions', { q });
});

// GET /api/search/filters (静的な値なのでInvidiousを叩かずローカルで返す)
router.get('/search/filters', (req, res) => {
  res.json({
    sort_by: ['relevance', 'rating', 'upload_date', 'view_count'],
    date: ['hour', 'today', 'week', 'month', 'year'],
    duration: ['short', 'medium', 'long'],
    type: ['video', 'playlist', 'channel', 'movie', 'show', 'all'],
    features: ['hd', 'subtitles', 'creative_commons', '3d', 'live', '4k', '360', 'hdr', 'vr180'],
  });
});

// ---------------------------------------------------------------------------
// 動画系
// ---------------------------------------------------------------------------

// GET /api/videos/:id
router.get('/videos/:id', (req, res) => proxy(res, `/videos/${req.params.id}`));

// GET /api/videos/:id/live
// ライブ配信中かどうかとHLS(m3u8)を返す。youtubei.js(TVクライアント)のみ使用。
// TVクライアントはシグネチャ復号(JS実行)が不要なため、yt-dlpよりbot判定に引っかかりにくい。
router.get('/videos/:id/live', async (req, res) => {
  const { id } = req.params;

  if (!isValidVideoId(id)) {
    return res.status(400).json({ error: '不正な動画IDです' });
  }

  try {
    const yt = getInnertube();
    const info = await yt.getInfo(id, { client: 'TV' });

    if (!info.basic_info.is_live) {
      return res.json({ videoId: id, isLive: false });
    }

    const hlsUrl = info.streaming_data?.hls_manifest_url;
    if (!hlsUrl) {
      return res.status(502).json({
        error: 'ライブですが、HLSマニフェストURLを取得できませんでした',
        detail: 'streaming_data.hls_manifest_url が空でした',
      });
    }

    return res.json({
      videoId: id,
      title: info.basic_info.title,
      channel: info.basic_info.author,
      isLive: true,
      hlsUrl,
      viewers: info.basic_info.view_count,
      source: 'youtubei.js',
    });
  } catch (err) {
    return res.status(502).json({
      error: 'ライブ情報の取得に失敗しました',
      detail: err.message,
    });
  }
});


// GET /api/comments/:id
router.get('/comments/:id', (req, res) => {
  const { continuation, sort_by, source } = req.query;
  return proxy(res, `/comments/${req.params.id}`, { continuation, sort_by, source });
});

// GET /api/captions/:id
router.get('/captions/:id', (req, res) => {
  const { label, lang } = req.query;
  return proxy(res, `/captions/${req.params.id}`, { label, lang });
});

// GET /api/transcripts/:id
router.get('/transcripts/:id', (req, res) => {
  const { lang } = req.query;
  return proxy(res, `/transcripts/${req.params.id}`, { lang });
});

// GET /api/annotations/:id (Invidiousエコシステムで現状working instance 0件だが、経路だけ用意)
router.get('/annotations/:id', (req, res) => proxy(res, `/annotations/${req.params.id}`));

// ---------------------------------------------------------------------------
// チャンネル系
// ---------------------------------------------------------------------------

router.get('/channels/:id', (req, res) => proxy(res, `/channels/${req.params.id}`));

router.get('/channels/:id/videos', (req, res) => {
  const { page, sort_by } = req.query;
  return proxy(res, `/channels/${req.params.id}/videos`, { page, sort_by });
});

router.get('/channels/:id/shorts', (req, res) => {
  const { page } = req.query;
  return proxy(res, `/channels/${req.params.id}/shorts`, { page });
});

// チャンネルのライブ配信一覧(過去・現在)。各アイテムのliveNowで「今配信中か」判定できる。
router.get('/channels/:id/streams', (req, res) => {
  const { page } = req.query;
  return proxy(res, `/channels/${req.params.id}/streams`, { page });
});

router.get('/channels/:id/playlists', (req, res) => {
  const { page } = req.query;
  return proxy(res, `/channels/${req.params.id}/playlists`, { page });
});

router.get('/channels/:id/search', (req, res) => {
  const { q, page } = req.query;
  if (!q) return res.status(400).json({ error: 'q は必須です' });
  return proxy(res, `/channels/${req.params.id}/search`, { q, page });
});

router.get('/channels/:id/comments', (req, res) => proxy(res, `/channels/${req.params.id}/comments`));

router.get('/channels/:id/latest', (req, res) => proxy(res, `/channels/${req.params.id}/latest`));

// ---------------------------------------------------------------------------
// トレンド系
// ---------------------------------------------------------------------------

router.get('/trending', (req, res) => {
  const { region, type } = req.query;
  return proxy(res, '/trending', { region, type });
});

router.get('/trending/music', (req, res) => proxy(res, '/trending', { region: req.query.region, type: 'music' }));
router.get('/trending/gaming', (req, res) => proxy(res, '/trending', { region: req.query.region, type: 'gaming' }));
router.get('/trending/news', (req, res) => proxy(res, '/trending', { region: req.query.region, type: 'news' }));
router.get('/trending/movies', (req, res) => proxy(res, '/trending', { region: req.query.region, type: 'movies' }));

// ---------------------------------------------------------------------------
// その他
// ---------------------------------------------------------------------------

router.get('/playlists/:id', (req, res) => {
  const { page } = req.query;
  return proxy(res, `/playlists/${req.params.id}`, { page });
});

router.get('/mixes/:rdid', (req, res) => proxy(res, `/mixes/${req.params.rdid}`));

router.get('/clips/:id', (req, res) => proxy(res, `/clips/${req.params.id}`));

router.get('/hashtag/:tag', (req, res) => {
  const { page } = req.query;
  return proxy(res, `/hashtag/${req.params.tag}`, { page });
});

router.get('/resolveurl', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url は必須です' });
  return proxy(res, '/resolveurl', { url });
});

router.get('/stats', (req, res) => proxy(res, '/stats'));
