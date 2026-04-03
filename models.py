"""
Pydantic モデル定義
"""

from pydantic import BaseModel
from typing import Optional


# ─── 動画 ─────────────────────────────────────────────────────────────────

class FormatInfo(BaseModel):
    format_id: str
    ext: str
    resolution: Optional[str] = None
    fps: Optional[float] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    filesize: Optional[int] = None
    url: Optional[str] = None
    tbr: Optional[float] = None  # 合計ビットレート (kbps)


class VideoInfo(BaseModel):
    id: str
    title: str
    description: str
    channel: str
    channel_id: str
    duration: Optional[int] = None       # 秒
    view_count: Optional[int] = None
    like_count: Optional[int] = None
    upload_date: Optional[str] = None    # YYYYMMDD
    thumbnail: Optional[str] = None
    is_live: bool = False
    is_short: bool = False
    tags: list[str] = []
    categories: list[str] = []
    formats: list[FormatInfo] = []


class StreamInfo(BaseModel):
    id: str
    title: str
    url: str
    ext: str
    format_id: str
    resolution: Optional[str] = None
    duration: Optional[int] = None
    is_live: bool = False


class AudioStreamInfo(BaseModel):
    id: str
    title: str
    url: str
    ext: str
    format_id: str
    acodec: Optional[str] = None
    abr: Optional[float] = None          # 音声ビットレート (kbps)
    asr: Optional[int] = None            # サンプリングレート (Hz)
    filesize: Optional[int] = None
    duration: Optional[int] = None
    thumbnail: Optional[str] = None
    channel: Optional[str] = None
    # YouTube Music 向け
    artist: Optional[str] = None
    album: Optional[str] = None
    track: Optional[str] = None


class LiveStreamInfo(BaseModel):
    id: str
    title: str
    url: str                             # 最善のストリームURL
    hls_url: Optional[str] = None       # HLS (m3u8) URL
    dash_url: Optional[str] = None      # DASH マニフェスト URL
    channel: str
    channel_id: str
    thumbnail: Optional[str] = None
    concurrent_view_count: Optional[int] = None
    is_live: bool = True


# ─── 検索 ─────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    id: str
    title: str
    url: str
    channel: Optional[str] = None
    channel_id: Optional[str] = None
    duration: Optional[int] = None
    view_count: Optional[int] = None
    thumbnail: Optional[str] = None
    description: Optional[str] = None
    upload_date: Optional[str] = None


# ─── チャンネル ────────────────────────────────────────────────────────────

class ChannelInfo(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    url: str
    subscriber_count: Optional[int] = None
    thumbnail: Optional[str] = None
    banner: Optional[str] = None
    video_count: Optional[int] = None
    recent_videos: list[SearchResult] = []


# ─── トランスクリプト ──────────────────────────────────────────────────────

class TranscriptSegment(BaseModel):
    text: str
    start: float    # 秒
    duration: float # 秒


class TranscriptInfo(BaseModel):
    video_id: str
    language: str
    language_code: str
    is_generated: bool
    is_translatable: bool
    segments: list[TranscriptSegment]
    full_text: str


# ─── APIレスポンス共通 ─────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
