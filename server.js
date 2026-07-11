import express from 'express';
import { router as invidiousRouter } from './src/routes/invidious.js';
import { createLegacyRouter } from './src/routes/legacy.js';
import { initInnertube } from './src/lib/innertube.js';

const app = express();
const port = process.env.PORT || 3000;

app.use('/api', invidiousRouter);
app.use('/api', createLegacyRouter());

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'YouTube Plus API is running' });
});

initInnertube().then(() => {
  app.listen(port, () => {
    console.log(`YouTube API server running at http://localhost:${port}`);
  });
});
