"""
YouTube Service
yt-dlp を使って動画・音楽・ライブ・ショートなどの情報とストリームURLを取得する
"""

import yt_dlp
from typing import Optional
from models import (
    VideoInfo, StreamInfo, SearchResult, ChannelInfo,
    AudioStreamInfo, LiveStreamInfo, FormatInfo
)


# ─── 共通 yt-dlp オプション ────────────────────────────────────────────────

BASE_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "extract_flat": False,
    "nocheckcertificate": True,
}


def _build_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def _extract_info(url: str, opts: dict) -> dict:
    merged = {**BASE_OPTS, **opts}
    with yt_dlp.YoutubeDL(merged) as ydl:
        return ydl.extract_info(url, download=False)


# ─── 動画情報取得 ──────────────────────────────────────────────────────────

def get_video_info(video_id: str) -> VideoInfo:
    url = _build_url(video_id)
    info = _extract_info(url, {})

    formats = [
        FormatInfo(
            format_id=f.get("format_id", ""),
            ext=f.get("ext", ""),
            resolution=f.get("resolution") or f.get("format_note", ""),
            fps=f.get("fps"),
            vcodec=f.get("vcodec"),
            acodec=f.get("acodec"),
            filesize=f.get("filesize") or f.get("filesize_approx"),
            url=f.get("url"),
            tbr=f.get("tbr"),
        )
        for f in info.get("formats", [])
    ]

    return VideoInfo(
        id=info.get("id", video_id),
        title=info.get("title", ""),
        description=info.get("description", ""),
        channel=info.get("channel", ""),
        channel_id=info.get("channel_id", ""),
        duration=info.get("duration"),
        view_count=info.get("view_count"),
        like_count=info.get("like_count"),
        upload_date=info.get("upload_date"),
        thumbnail=info.get("thumbnail"),
        is_live=info.get("is_live", False),
        is_short=_is_short(info),
        tags=info.get("tags", []),
        categories=info.get("categories", []),
        formats=formats,
    )


def _is_short(info: dict) -> bool:
    """ショート動画かどうかを判定"""
    duration = info.get("duration") or 0
    webpage_url = info.get("webpage_url", "")
    original_url = info.get("original_url", "")
    return (
        "/shorts/" in webpage_url
        or "/shorts/" in original_url
        or (duration > 0 and duration <= 60)
    )


# ─── ストリームURL取得（動画） ──────────────────────────────────────────────

def get_stream_url(
    video_id: str,
    quality: str = "best",
    ext: Optional[str] = None,
) -> StreamInfo:
    url = _build_url(video_id)

    # フォーマット指定
    if ext:
        fmt = f"bestvideo[ext={ext}]+bestaudio[ext={ext}]/best[ext={ext}]/best"
    elif quality == "best":
        fmt = "bestvideo+bestaudio/best"
    elif quality == "worst":
        fmt = "worstvideo+worstaudio/worst"
    else:
        fmt = quality  # 例: "137+140", "22" など直指定も可

    info = _extract_info(url, {"format": fmt})

    # マージ後URLまたはフォールバック
    stream_url = info.get("url") or _pick_url_from_formats(info)

    return StreamInfo(
        id=info.get("id", video_id),
        title=info.get("title", ""),
        url=stream_url,
        ext=info.get("ext", ""),
        format_id=info.get("format_id", ""),
        resolution=info.get("resolution") or info.get("format_note", ""),
        duration=info.get("duration"),
        is_live=info.get("is_live", False),
    )


def _pick_url_from_formats(info: dict) -> str:
    """フォーマットリストから最善のURLを選ぶ"""
    formats = info.get("formats", [])
    if not formats:
        return ""
    # 最後（通常 best）のフォーマットのURLを返す
    return formats[-1].get("url", "")


# ─── 音声ストリームURL取得（YouTube Music / 音楽動画） ─────────────────────

def get_audio_stream(
    video_id: str,
    fmt: str = "m4a",
) -> AudioStreamInfo:
    url = _build_url(video_id)

    # m4a 優先、なければ bestaudio
    if fmt == "m4a":
        format_str = "bestaudio[ext=m4a]/bestaudio/best"
    elif fmt == "mp3":
        format_str = "bestaudio/best"
    else:
        format_str = f"bestaudio[ext={fmt}]/bestaudio/best"

    info = _extract_info(url, {"format": format_str})

    # 選択されたフォーマットの情報
    selected = _get_selected_format(info, format_str)

    return AudioStreamInfo(
        id=info.get("id", video_id),
        title=info.get("title", ""),
        url=selected.get("url") or info.get("url", ""),
        ext=selected.get("ext", fmt),
        format_id=selected.get("format_id", ""),
        acodec=selected.get("acodec", ""),
        abr=selected.get("abr"),
        asr=selected.get("asr"),
        filesize=selected.get("filesize") or selected.get("filesize_approx"),
        duration=info.get("duration"),
        thumbnail=info.get("thumbnail"),
        channel=info.get("channel", ""),
        artist=info.get("artist") or info.get("creator"),
        album=info.get("album"),
        track=info.get("track"),
    )


def _get_selected_format(info: dict, format_str: str) -> dict:
    """選択されたフォーマットの詳細を取得"""
    requested_fmt_id = info.get("format_id", "")
    for f in info.get("formats", []):
        if f.get("format_id") == requested_fmt_id:
            return f
    # フォールバック: 最後のフォーマット
    formats = info.get("formats", [])
    return formats[-1] if formats else {}


# ─── ライブストリーム取得 ──────────────────────────────────────────────────

def get_live_stream(video_id: str) -> LiveStreamInfo:
    url = _build_url(video_id)
    info = _extract_info(url, {
        "format": "best[protocol=m3u8]/best",
    })

    if not info.get("is_live"):
        raise ValueError(f"Video {video_id} is not a live stream")

    # HLS/DASH マニフェストURLを探す
    hls_url = None
    dash_url = None
    for f in info.get("formats", []):
        proto = f.get("protocol", "")
        if "m3u8" in proto and not hls_url:
            hls_url = f.get("url")
        if "dash" in proto and not dash_url:
            dash_url = f.get("url")

    stream_url = hls_url or dash_url or info.get("url", "")

    return LiveStreamInfo(
        id=info.get("id", video_id),
        title=info.get("title", ""),
        url=stream_url,
        hls_url=hls_url,
        dash_url=dash_url,
        channel=info.get("channel", ""),
        channel_id=info.get("channel_id", ""),
        thumbnail=info.get("thumbnail"),
        concurrent_view_count=info.get("concurrent_view_count"),
        is_live=True,
    )


# ─── 検索 ─────────────────────────────────────────────────────────────────

def search_videos(
    query: str,
    max_results: int = 10,
    search_type: str = "video",  # video | channel | playlist
) -> list[SearchResult]:
    type_map = {
        "video": "ytsearch",
        "channel": "ytsearchtype:channel",
        "playlist": "ytsearchtype:playlist",
    }
    prefix = type_map.get(search_type, "ytsearch")
    search_url = f"{prefix}{max_results}:{query}"

    info = _extract_info(search_url, {
        "extract_flat": True,
        "skip_download": True,
    })

    results = []
    for entry in info.get("entries", []) or []:
        results.append(SearchResult(
            id=entry.get("id", ""),
            title=entry.get("title", ""),
            url=entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
            channel=entry.get("channel") or entry.get("uploader", ""),
            channel_id=entry.get("channel_id") or entry.get("uploader_id", ""),
            duration=entry.get("duration"),
            view_count=entry.get("view_count"),
            thumbnail=entry.get("thumbnail"),
            description=entry.get("description"),
            upload_date=entry.get("upload_date"),
        ))
    return results


# ─── チャンネル情報 ────────────────────────────────────────────────────────

def get_channel_info(channel_id: str, include_videos: bool = False, max_videos: int = 20) -> ChannelInfo:
    # channel_id は @handle または UCxxx 形式
    if channel_id.startswith("UC") or channel_id.startswith("@"):
        url = f"https://www.youtube.com/{channel_id}" if channel_id.startswith("@") else \
              f"https://www.youtube.com/channel/{channel_id}"
    else:
        url = f"https://www.youtube.com/@{channel_id}"

    opts = {
        "extract_flat": not include_videos,
        "skip_download": True,
    }
    if include_videos:
        opts["playlistend"] = max_videos

    info = _extract_info(url, opts)

    recent_videos = []
    if include_videos:
        for entry in (info.get("entries") or [])[:max_videos]:
            recent_videos.append(SearchResult(
                id=entry.get("id", ""),
                title=entry.get("title", ""),
                url=entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                channel=info.get("channel", ""),
                channel_id=info.get("channel_id", ""),
                duration=entry.get("duration"),
                view_count=entry.get("view_count"),
                thumbnail=entry.get("thumbnail"),
                upload_date=entry.get("upload_date"),
            ))

    return ChannelInfo(
        id=info.get("channel_id") or info.get("id", ""),
        name=info.get("channel") or info.get("title", ""),
        description=info.get("description", ""),
        url=info.get("webpage_url") or url,
        subscriber_count=info.get("channel_follower_count"),
        thumbnail=info.get("thumbnails", [{}])[-1].get("url") if info.get("thumbnails") else None,
        banner=info.get("header_images", [{}])[0].get("url") if info.get("header_images") else None,
        video_count=info.get("playlist_count"),
        recent_videos=recent_videos if include_videos else [],
    )


# ─── フォーマット一覧取得 ──────────────────────────────────────────────────

def list_formats(video_id: str) -> list[FormatInfo]:
    url = _build_url(video_id)
    info = _extract_info(url, {"listformats": False})

    return [
        FormatInfo(
            format_id=f.get("format_id", ""),
            ext=f.get("ext", ""),
            resolution=f.get("resolution") or f.get("format_note", ""),
            fps=f.get("fps"),
            vcodec=f.get("vcodec"),
            acodec=f.get("acodec"),
            filesize=f.get("filesize") or f.get("filesize_approx"),
            url=f.get("url"),
            tbr=f.get("tbr"),
        )
        for f in info.get("formats", [])
    ]
