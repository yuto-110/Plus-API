"""
YouTube REST API Server
FastAPI + yt-dlp + youtube-transcript-api
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Optional
import youtube_service as yt
import transcript_service as ts
from models import ErrorResponse

app = FastAPI(
    title="YouTube API",
    description="YouTube の動画情報・ストリーム・字幕・検索・チャンネル情報を取得するAPI",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


# ─── ユーティリティ ────────────────────────────────────────────────────────

def _handle_error(e: Exception, status_code: int = 500):
    raise HTTPException(status_code=status_code, detail=str(e))


# ─── ヘルスチェック ────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "YouTube API is running 🎬"}


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


# ─── 動画情報 ──────────────────────────────────────────────────────────────

@app.get(
    "/video/{video_id}",
    tags=["Video"],
    summary="動画情報取得",
    description="タイトル・説明・再生数・いいね数・サムネイル・フォーマット一覧などを返す。ショート・通常動画両対応。",
)
def get_video_info(video_id: str):
    try:
        return yt.get_video_info(video_id)
    except Exception as e:
        _handle_error(e)


@app.get(
    "/video/{video_id}/formats",
    tags=["Video"],
    summary="利用可能フォーマット一覧",
    description="動画の全フォーマット（解像度・コーデック・ファイルサイズなど）を一覧で返す。",
)
def list_formats(video_id: str):
    try:
        return yt.list_formats(video_id)
    except Exception as e:
        _handle_error(e)


# ─── ストリームURL ─────────────────────────────────────────────────────────

@app.get(
    "/video/{video_id}/stream",
    tags=["Stream"],
    summary="動画ストリームURL取得",
    description="""
動画の直接ストリームURLを返す。

- `quality`: `best`（デフォルト）/ `worst` / yt-dlpのフォーマット文字列（例: `137+140`）
- `ext`: 特定の拡張子に絞る（例: `mp4`, `webm`）

返されたURLは一時的なものなので、取得後すぐに使用すること。
""",
)
def get_stream(
    video_id: str,
    quality: str = Query("best", description="best / worst / yt-dlpフォーマット文字列"),
    ext: Optional[str] = Query(None, description="mp4 / webm など"),
):
    try:
        return yt.get_stream_url(video_id, quality=quality, ext=ext)
    except Exception as e:
        _handle_error(e)


@app.get(
    "/video/{video_id}/audio",
    tags=["Stream"],
    summary="音声ストリームURL取得（YouTube Music対応）",
    description="""
音声のみのストリームURLを返す。YouTube Music の楽曲にも対応。

- `fmt`: `m4a`（デフォルト）/ `webm` / `mp3`（再エンコード不要の場合）
- アーティスト・アルバム・トラック名などのメタデータも含む（YouTube Musicの場合）。
""",
)
def get_audio_stream(
    video_id: str,
    fmt: str = Query("m4a", description="m4a / webm / mp3"),
):
    try:
        return yt.get_audio_stream(video_id, fmt=fmt)
    except Exception as e:
        _handle_error(e)


@app.get(
    "/video/{video_id}/live",
    tags=["Stream"],
    summary="ライブストリームURL取得",
    description="""
ライブ配信の HLS (m3u8) / DASH マニフェスト URL を返す。

ライブ配信ではない動画に対して呼ぶと 400 エラーを返す。
""",
)
def get_live_stream(video_id: str):
    try:
        return yt.get_live_stream(video_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _handle_error(e)


# ─── 検索 ─────────────────────────────────────────────────────────────────

@app.get(
    "/search",
    tags=["Search"],
    summary="YouTube 検索",
    description="""
キーワードで動画・チャンネル・プレイリストを検索する。

- `q`: 検索クエリ
- `max_results`: 最大取得件数（デフォルト 10、最大 50）
- `type`: `video`（デフォルト）/ `channel` / `playlist`
""",
)
def search(
    q: str = Query(..., description="検索キーワード"),
    max_results: int = Query(10, ge=1, le=50, description="最大取得件数"),
    type: str = Query("video", description="video / channel / playlist"),
):
    try:
        return yt.search_videos(q, max_results=max_results, search_type=type)
    except Exception as e:
        _handle_error(e)


# ─── チャンネル ────────────────────────────────────────────────────────────

@app.get(
    "/channel/{channel_id}",
    tags=["Channel"],
    summary="チャンネル情報取得",
    description="""
チャンネルの情報を取得する。`channel_id` は以下の形式に対応:

- `UCxxxxxxxx...`（チャンネルID）
- `@handle`（ハンドル名、@ 付き）
- `handle`（ハンドル名、@ なし）

`include_videos=true` にすると直近の動画一覧も含む。
""",
)
def get_channel(
    channel_id: str,
    include_videos: bool = Query(False, description="直近の動画一覧を含めるか"),
    max_videos: int = Query(20, ge=1, le=50, description="取得する動画の最大件数"),
):
    try:
        return yt.get_channel_info(channel_id, include_videos=include_videos, max_videos=max_videos)
    except Exception as e:
        _handle_error(e)


# ─── 字幕・トランスクリプト ────────────────────────────────────────────────

@app.get(
    "/video/{video_id}/transcript",
    tags=["Transcript"],
    summary="字幕・トランスクリプト取得",
    description="""
動画の字幕をセグメント単位と全文テキストで返す。

- `languages`: カンマ区切りの言語コード優先順（例: `ja,en`）。省略時は自動選択。
- 手動作成字幕 → 自動生成字幕 の優先順で取得。
""",
)
def get_transcript(
    video_id: str,
    languages: Optional[str] = Query(
        None,
        description="カンマ区切りの言語コード（例: ja,en）",
    ),
):
    langs = [l.strip() for l in languages.split(",")] if languages else None
    try:
        return ts.get_transcript(video_id, languages=langs)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _handle_error(e)


@app.get(
    "/video/{video_id}/transcript/languages",
    tags=["Transcript"],
    summary="利用可能な字幕言語一覧",
    description="動画で利用可能な字幕の言語一覧と翻訳可能言語を返す。",
)
def list_transcript_languages(video_id: str):
    try:
        return ts.list_available_transcripts(video_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _handle_error(e)


# ─── エラーハンドラ ────────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "detail": str(exc)},
    )


# ─── 起動 ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
