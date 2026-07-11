// src/lib/innertube.js
//
// Innertube(youtubei.js)のシングルトンインスタンス管理。
// server.js起動時に initInnertube() を1回呼び、以降は getInnertube() で使い回す。

import { Innertube } from 'youtubei.js';

let instance = null;

export async function initInnertube() {
  instance = await Innertube.create();
  return instance;
}

export function getInnertube() {
  if (!instance) {
    throw new Error('Innertubeが初期化されていません(initInnertube()を先に呼んでください)');
  }
  return instance;
}
