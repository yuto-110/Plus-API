import express from 'express';
import { Innertube } from 'youtubei.js';
import { router as invidiousRouter } from './src/routes/invidious.js';
import { createLegacyRouter } from './src/routes/legacy.js';

const app = express();
const port = process.env.PORT || 3000;

let yt;
async function initYT() {
  yt = await Innertube.create();
}
function getYt() {
  return yt;
}

// --- ルーター登録 -----------------------------------------------------------
// invidiousRouter: 検索/動画/チャンネル/トレンド/プレイリストなど、
//                  複数Invidiousインスタンスをバックエンドにした一式(/api/... )
// legacyRouter:    元々あった /api/info, /api/stream, /api/live
//                  (youtubei.js / yt-dlp直叩き、execFileで安全化済み)
app.use('/api', invidiousRouter);
app.use('/api', createLegacyRouter(getYt));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'YouTube Plus API is running' });
});

initYT().then(() => {
  app.listen(port, () => {
    console.log(`YouTube API server running at http://localhost:${port}`);
  });
});
