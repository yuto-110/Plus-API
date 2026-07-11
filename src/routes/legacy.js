// src/routes/legacy.js
import { Router } from 'express';
import { getBestStreamUrl, getAllStreamUrls, isValidVideoId, buildWatchUrl } from '../lib/ytdlp.js';
import { getInnertube } from '../lib/innertube.js';

export function createLegacyRouter() {
  const router = Router();

  function resolveTarget(req, res) {
    const { url, id } = req.query;
    if (url) {
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

  router.get('/info', async (req, res) => {
    const { url, id } = req.query;
    const videoId = id || (url ? extractVideoId(url) : null);
    if (!videoId || !isValidVideoId(videoId)) {
      return res.status(400).json({ error: 'Video ID or URL is required' });
    }
    try {
      const yt = getInnertube();
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
