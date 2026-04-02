import express from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import { Innertube } from 'youtubei.js';
import YTDlpWrap from 'yt-dlp-wrap';

const app = express();
const cache = new NodeCache({ stdTTL: 300 });

app.use(cors());
app.use(express.json());

const yt = await Innertube.create({
  lang: 'ja',
  location: 'JP'
});

const ytdlp = new YTDlpWrap();

async function getStreamInfo(id) {
  const cached = cache.get(`stream:${id}`);
  if (cached) return cached;

  try {
    const args = [
      `https://www.youtube.com/watch?v=${id}`,
      '--dump-single-json',
      '--no-warnings',
      '--skip-download'
    ];

    if (process.env.YOUTUBE_COOKIE) {
      args.push('--add-header');
      args.push(`Cookie: ${process.env.YOUTUBE_COOKIE}`);
    }

    const raw = await ytdlp.execPromise(args);
    const data = JSON.parse(raw);

    const formats = data.formats || [];

    const result = {
      playability: {
        status: data.availability || 'OK'
      },
      muxed: formats
        .filter(v => v.vcodec !== 'none' && v.acodec !== 'none')
        .map(v => ({
          itag: v.format_id,
          quality: v.format_note || v.height + 'p',
          ext: v.ext,
          url: v.url
        })),
      adaptive: formats.map(v => ({
        itag: v.format_id,
        quality: v.format_note || (v.height ? `${v.height}p` : 'audio'),
        videoOnly: v.vcodec !== 'none' && v.acodec === 'none',
        audioOnly: v.vcodec === 'none',
        ext: v.ext,
        bitrate: v.tbr,
        url: v.url
      })),
      hls: data.hls_manifest_url || null,
      dash: data.manifest_url || null
    };

    cache.set(`stream:${id}`, result, 120);
    return result;
  } catch (e) {
    return {
      error: true,
      message: e.message
    };
  }
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    endpoints: [
      '/video/:id',
      '/stream/:id',
      '/channel/:id',
      '/channel/:id/videos',
      '/search?q=',
      '/comments/:id',
      '/captions/:id',
      '/live/:id'
    ]
  });
});

app.get('/video/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const info = await yt.getInfo(id);
    const basic = info.basic_info;
    const stream = await getStreamInfo(id);

    res.json({
      id,
      title: basic.title,
      description: basic.short_description,
      duration: basic.duration,
      views: basic.view_count,
      likes: basic.like_count,
      channel: {
        id: basic.channel?.id,
        name: basic.channel?.name,
        url: basic.channel?.url
      },
      thumbnails: basic.thumbnail,
      tags: basic.keywords,
      isLive: basic.is_live,
      uploadDate: basic.publish_date,
      recommended: info.watch_next_feed?.videos?.slice(0, 10)?.map(v => ({
        id: v.id,
        title: v.title?.text,
        channel: v.author?.name,
        thumbnail: v.thumbnails?.[0]?.url
      })) || [],
      streams: stream
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    });
  }
});

app.get('/stream/:id', async (req, res) => {
  const data = await getStreamInfo(req.params.id);
  res.json(data);
});

app.get('/channel/:id', async (req, res) => {
  try {
    const channel = await yt.getChannel(req.params.id);

    res.json({
      id: channel.metadata?.external_id,
      name: channel.metadata?.title,
      description: channel.metadata?.description,
      subscribers: channel.metadata?.subscriber_count,
      avatar: channel.metadata?.avatar?.[0]?.url,
      banner: channel.metadata?.banner?.[0]?.url,
      verified: channel.metadata?.is_verified
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/channel/:id/videos', async (req, res) => {
  try {
    const channel = await yt.getChannel(req.params.id);
    const videos = await channel.getVideos();

    res.json({
      items: videos.videos.map(v => ({
        id: v.id,
        title: v.title?.text,
        views: v.view_count?.text,
        duration: v.duration?.text,
        thumbnail: v.thumbnails?.[0]?.url
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/search', async (req, res) => {
  try {
    const q = req.query.q;
    const search = await yt.search(q);

    res.json({
      query: q,
      items: search.videos.map(v => ({
        id: v.id,
        title: v.title?.text,
        channel: v.author?.name,
        duration: v.duration?.text,
        views: v.view_count?.text,
        thumbnail: v.thumbnails?.[0]?.url
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/comments/:id', async (req, res) => {
  try {
    const info = await yt.getInfo(req.params.id);
    const comments = await info.getComments();

    res.json({
      comments: comments.contents.slice(0, 20).map(c => ({
        author: c.author?.name,
        text: c.content?.text,
        likes: c.like_count,
        replies: c.reply_count
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/captions/:id', async (req, res) => {
  try {
    const info = await yt.getInfo(req.params.id);

    res.json({
      tracks: info.captions?.caption_tracks?.map(c => ({
        language: c.language_name?.text,
        code: c.language_code,
        url: c.base_url
      })) || []
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/live/:id', async (req, res) => {
  try {
    const info = await yt.getInfo(req.params.id);
    const stream = await getStreamInfo(req.params.id);

    res.json({
      id: req.params.id,
      title: info.basic_info.title,
      isLive: info.basic_info.is_live,
      viewers: info.basic_info.view_count,
      hls: stream.hls,
      dash: stream.dash
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 10000, () => {
  console.log('YouTube API running');
});
