import express from 'express';
import { Innertube } from 'youtubei.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const app = express();
const port = process.env.PORT || 3000;

// Denoのパスを設定
const DENO_PATH = '/home/ubuntu/.deno/bin';
const ENV_WITH_DENO = { ...process.env, PATH: `${DENO_PATH}:${process.env.PATH}` };

let yt;
async function initYT() {
  yt = await Innertube.create();
}

// 動画の基本情報を取得 (YouTube.jsを使用)
app.get('/api/info', async (req, res) => {
  const { url, id } = req.query;
  const videoId = id || (url ? extractVideoId(url) : null);

  if (!videoId) {
    return res.status(400).json({ error: 'Video ID or URL is required' });
  }

  try {
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

// ストリームURLを取得 (yt-dlpを使用)
app.get('/api/stream', async (req, res) => {
  const { url, id } = req.query;
  const target = url || (id ? `https://www.youtube.com/watch?v=${id}` : null);

  if (!target) {
    return res.status(400).json({ error: 'Video ID or URL is required' });
  }

  try {
    const { stdout } = await execPromise(`yt-dlp -g "${target}" --format "best" --js-runtime deno`, { env: ENV_WITH_DENO });
    const streamUrl = stdout.trim();
    res.json({ stream_url: streamUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ライブ配信のHLS (m3u8) URLを取得
app.get('/api/live', async (req, res) => {
  const { url, id } = req.query;
  const target = url || (id ? `https://www.youtube.com/watch?v=${id}` : null);

  if (!target) {
    return res.status(400).json({ error: 'Video ID or URL is required' });
  }

  try {
    const { stdout } = await execPromise(`yt-dlp -g "${target}" --js-runtime deno`, { env: ENV_WITH_DENO });
    const urls = stdout.trim().split('\n');
    res.json({ 
        hls_url: urls[0],
        all_urls: urls 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 検索結果を取得 (yt-dlpを使用)
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Search query is required' });
  try {
    const { stdout } = await execPromise(`yt-dlp "ytsearch10:${q}" --dump-json --flat-playlist --js-runtime deno`, { env: ENV_WITH_DENO });
    const lines = stdout.trim().split('\n');
    const results = lines.map(line => {
        const data = JSON.parse(line);
        return {
            id: data.id,
            title: data.title,
            author: data.uploader,
            thumbnails: [{ url: `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg` }],
            duration: data.duration_string,
            is_live: data.is_live || false
        };
    });
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function extractVideoId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

initYT().then(() => {
  app.listen(port, () => {
    console.log(`YouTube API server running at http://localhost:${port}`);
  });
});
