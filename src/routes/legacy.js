// src/routes/legacy.js
//
// 元のserver.jsにあった /api/info, /api/stream, /api/live を復元。
// ただし exec() への文字列展開(コマンドインジェクションの原因)は
// execFile + 引数配列(src/lib/ytdlp.js)に置き換えて安全化した。
//
// 元の /api/search は削除し、より堅牢な /api/search (src/routes/invidious.js,
// 複数Invidiousインスタンスへの並列問い合わせ + yt-dlpフォールバック) に統合した。

import { Router } from 'express';
import { getBestStreamUrl, getAllStreamUrls, isValidVideoId, buildWatchUrl } from '../lib/ytdlp.js';

export function createLegacyRouter(getYt) {
  const router = Router();

  function resolveTarget(req, res) {
    const { url, id } = req.query;
    if (url) {
      // 外部から渡された任意のURLをそのままyt-dlpに渡すのは
      // 実質的に「YouTubeの動画URLである」ことを期待した設計のため、
      // 最低限 youtube.com / youtu.be ドメインかだけ検証する。
      try {
        const parsed = new URL(url);
        const allowedHosts = ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'];
        if (!allowedHosts.includes(parsed.hostname)) {
          res.status(400).json({ error: 'YouTubeのURLのみ受け付けます' });
          return null;
        }
        return url;
      } catch {
        res.status(400).json({ error: '不正なURLです' });
        return null;
      }
    }
    if (id) {
      if (!isValidVideoId(id)) {
        res.status(400).json({ error: '不正な動画IDです' });
        return null;
      }
      return buildWatchUrl(id);
    }
    res.status(400).json({ error: 'Video ID or URL is required' });
    return null;
  }

  // 動画の基本情報 (youtubei.js)
  router.get('/info', async (req, res) => {
    const { url, id } = req.query;
    const videoId = id || (url ? extractVideoId(url) : null);
    if (!videoId || !isValidVideoId(videoId)) {
      return res.status(400).json({ error: 'Video ID or URL is required' });
    }
    try {
      const yt = getYt();
      const info = await yt.getInfo(videoId);
      res.json({
        id: info.basic_info.id,
        title: info.basic_info.title,
        description: info.basic_info.description,
        author: info.basic_info.author,
        view_count: info.basic_info.view_count,
        thumbnails: info.basic_info.thumbnail,
        duration: info.basic_info.duration,
        is_live: info.basic_info.is_live || false,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // 通常動画のストリームURL (yt-dlp, 安全化済み)
  router.get('/stream', async (req, res) => {
    const target = resolveTarget(req, res);
    if (!target) return;
    try {
      const streamUrl = await getBestStreamUrl(target);
      res.json({ stream_url: streamUrl });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ライブ配信のHLS(m3u8)URL (yt-dlp, 安全化済み)
  // より詳細な情報(視聴者数など)が欲しい場合は /api/videos/:id/live を使う。
  router.get('/live', async (req, res) => {
    const target = resolveTarget(req, res);
    if (!target) return;
    try {
      const urls = await getAllStreamUrls(target);
      res.json({ hls_url: urls[0], all_urls: urls });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

function extractVideoId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}
