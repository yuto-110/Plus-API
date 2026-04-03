# YouTube REST API

FastAPI + yt-dlp + youtube-transcript-api で構築した YouTube データ取得 API。

---

## セットアップ

```bash
pip install -r requirements.txt
```

### サーバー起動

```bash
python main.py
# または
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

起動後は http://localhost:8000/docs でSwagger UIが確認できる。

---

## エンドポイント一覧

### ヘルスチェック

| Method | Path | 説明 |
|--------|------|------|
| GET | `/` | 起動確認 |
| GET | `/health` | ヘルスチェック |

---

### 動画情報

#### `GET /video/{video_id}`
動画の詳細情報を取得する。ショート・通常動画両対応。

```bash
curl http://localhost:8000/video/dQw4w9WgXcQ
```

**レスポンス例:**
```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "description": "...",
  "channel": "Rick Astley",
  "channel_id": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "duration": 212,
  "view_count": 1400000000,
  "like_count": 15000000,
  "upload_date": "20091025",
  "thumbnail": "https://...",
  "is_live": false,
  "is_short": false,
  "tags": [...],
  "formats": [...]
}
```

#### `GET /video/{video_id}/formats`
利用可能な全フォーマット（解像度・コーデック・ビットレートなど）を返す。

```bash
curl http://localhost:8000/video/dQw4w9WgXcQ/formats
```

---

### ストリームURL

#### `GET /video/{video_id}/stream`
動画の直接ストリームURLを返す。

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `quality` | `best` | `best` / `worst` / yt-dlpフォーマット文字列（例: `137+140`） |
| `ext` | なし | `mp4` / `webm` など拡張子で絞る |

```bash
# 最高画質
curl "http://localhost:8000/video/dQw4w9WgXcQ/stream"

# MP4限定
curl "http://localhost:8000/video/dQw4w9WgXcQ/stream?ext=mp4"

# フォーマット直指定
curl "http://localhost:8000/video/dQw4w9WgXcQ/stream?quality=137%2B140"
```

> ⚠️ 返されるURLは期限付き（数時間）。取得後すぐに使用すること。

---

#### `GET /video/{video_id}/audio`
音声のみのストリームURLを返す。**YouTube Music の楽曲対応**。
アーティスト・アルバム・トラック名などのメタデータも含む。

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `fmt` | `m4a` | `m4a` / `webm` / `mp3` |

```bash
# m4a（YouTube Music向け）
curl "http://localhost:8000/video/VIDEO_ID/audio?fmt=m4a"

# webm
curl "http://localhost:8000/video/VIDEO_ID/audio?fmt=webm"
```

**レスポンス例（YouTube Music）:**
```json
{
  "id": "...",
  "title": "Bohemian Rhapsody",
  "url": "https://...",
  "ext": "m4a",
  "acodec": "mp4a.40.2",
  "abr": 128.0,
  "asr": 44100,
  "artist": "Queen",
  "album": "A Night at the Opera",
  "track": "Bohemian Rhapsody"
}
```

---

#### `GET /video/{video_id}/live`
ライブ配信の HLS / DASH ストリームURLを返す。

```bash
curl http://localhost:8000/video/LIVE_VIDEO_ID/live
```

**レスポンス例:**
```json
{
  "id": "...",
  "title": "LIVE配信タイトル",
  "url": "https://....m3u8",
  "hls_url": "https://....m3u8",
  "dash_url": "https://....mpd",
  "channel": "チャンネル名",
  "concurrent_view_count": 12345,
  "is_live": true
}
```

ライブ配信でない動画に対しては `400 Bad Request` を返す。

---

### 検索

#### `GET /search`

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `q` | 必須 | 検索キーワード |
| `max_results` | `10` | 最大件数（1〜50） |
| `type` | `video` | `video` / `channel` / `playlist` |

```bash
# 動画検索
curl "http://localhost:8000/search?q=lofi+hip+hop&max_results=5"

# チャンネル検索
curl "http://localhost:8000/search?q=NHK&type=channel"
```

---

### チャンネル

#### `GET /channel/{channel_id}`

`channel_id` に指定できる形式:
- `UCxxxxxxxx...`（チャンネルID）
- `@handle`（ハンドル、@付き）
- `handle`（ハンドル、@なし）

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `include_videos` | `false` | 直近の動画一覧を含める |
| `max_videos` | `20` | 最大動画件数（1〜50） |

```bash
# 基本情報
curl "http://localhost:8000/channel/@Google"

# 動画一覧込み
curl "http://localhost:8000/channel/UCVHFbw7woebKtRhjObAJtMg?include_videos=true&max_videos=10"
```

---

### 字幕・トランスクリプト

#### `GET /video/{video_id}/transcript`

| パラメータ | デフォルト | 説明 |
|-----------|-----------|------|
| `languages` | 自動 | カンマ区切りの言語コード（例: `ja,en`） |

```bash
# 自動選択
curl "http://localhost:8000/video/dQw4w9WgXcQ/transcript"

# 日本語優先、なければ英語
curl "http://localhost:8000/video/dQw4w9WgXcQ/transcript?languages=ja,en"
```

**レスポンス例:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "language": "English",
  "language_code": "en",
  "is_generated": false,
  "is_translatable": true,
  "full_text": "We're no strangers to love...",
  "segments": [
    { "text": "We're no strangers to love", "start": 18.3, "duration": 2.5 },
    ...
  ]
}
```

#### `GET /video/{video_id}/transcript/languages`
利用可能な字幕言語の一覧と翻訳可能言語を返す。

```bash
curl "http://localhost:8000/video/dQw4w9WgXcQ/transcript/languages"
```

---

## ファイル構成

```
youtube-api/
├── main.py               # FastAPIサーバー・エンドポイント定義
├── models.py             # Pydanticモデル定義
├── youtube_service.py    # yt-dlpラッパー（動画・ストリーム・検索・チャンネル）
├── transcript_service.py # 字幕・トランスクリプト取得
├── requirements.txt      # 依存パッケージ
└── README.md             # このファイル
```

---

## 注意事項

- ストリームURLは YouTube が発行する一時的なURLのため、**取得後数時間で期限切れ**になる。
- YouTube の利用規約に従って使用すること。
- yt-dlp はYouTubeの変更に合わせて頻繁にアップデートされるので、定期的に `pip install -U yt-dlp` を実行することを推奨。
- `youtube-transcript-api` は YouTube の字幕APIに依存しているため、字幕が無効化されている動画では取得不可。
