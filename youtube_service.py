"""
YouTube Service
yt-dlp を使って動画・音楽・ライブ・ショートなどの情報とストリームURLを取得する
"""

import os
import tempfile
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
    "nocheckcertificate": True,
    "ignore_no_formats_error": True,
}


def _build_url(video_id: str, music: bool = False) -> str:
    if music:
        return f"https://music.youtube.com/watch?v={video_id}"
    return f"https://www.youtube.com/watch?v={video_id}"


def _extract_info(url: str, opts: dict) -> dict:
    merged = {**BASE_OPTS, **opts}
    cookies = os.environ.get("YOUTUBE_COOKIES")
    if cookies:
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
        if not cookies.strip().startswith("# Netscape HTTP Cookie File"):
            cookies = "# Netscape HTTP Cookie File\n" + cookies
        tmp.write(cookies)
        tmp.flush()
        tmp.close()
        merged["cookiefile"] = tmp.name
    with yt_dlp.YoutubeDL(merged) as ydl:
        return ydl.extract_info(url, download=False)

def _has_av_formats(info: dict) -> bool:
    """映像か音声のフォーマットが存在するか確認"""
    return any(
        f.get("vcodec", "none") != "none" or f.get("acodec", "none") != "none"
        for f in (info.get("formats") or [])
    )


def _best_av_url(info: dict) -> str:
    """映像か音声があるフォーマットの中で最後（best）のURLを返す"""
    valid = [
        f for f in (info.get("formats") or [])
        if f.get("vcodec", "none") != "none" or f.get("acodec", "none") != "none"
    ]
    if not valid:
        return ""
    return valid[-1].get("url", "")


# ─── 動画情報取得 ──────────────────────────────────────────────────────────

def get_video_info(video_id: str) -> VideoInfo:
    url = _build_url(video_id)
    # フォーマット指定なしで全フォーマット取得
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
        tags=info.get("tags") or [],
        categories=info.get("categories") or [],
        formats=formats,
    )


def _is_short(info: dict) -> bool:
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

    if ext:
        fmt = f"bestvideo[ext={ext}]+bestaudio[ext={ext}]/best[ext={ext}]/best"
    elif quality == "best":
        fmt = "bestvideo+bestaudio/best"
    elif quality == "worst":
        fmt = "worstvideo+worstaudio/worst"
    else:
        fmt = quality

    info = _extract_info(url, {"format": fmt})
    # まずフォーマット一覧から映像/音声URLを取得
    stream_url = _best_av_url(info)

    # フォールバック: YouTube Music URLで再試行
    if not stream_url:
        url_music = _build_url(video_id, music=True)
        info = _extract_info(url_music, {"format": fmt})
        stream_url = _best_av_url(info)

    # フォールバック: info.url
    if not stream_url:
        stream_url = info.get("url", "")

    # URLに使ったフォーマット情報を取得
    valid_formats = [
        f for f in (info.get("formats") or [])
        if f.get("vcodec", "none") != "none" or f.get("acodec", "none") != "none"
    ]
    best_fmt = valid_formats[-1] if valid_formats else {}

    return StreamInfo(
        id=info.get("id", video_id),
        title=info.get("title", ""),
        url=stream_url,
        ext=best_fmt.get("ext") or info.get("ext", ""),
        format_id=best_fmt.get("format_id") or info.get("format_id", ""),
        resolution=best_fmt.get("resolution") or best_fmt.get("format_note") or info.get("resolution", ""),
        duration=info.get("duration"),
        is_live=info.get("is_live", False),
    )


# ─── 音声ストリームURL取得（YouTube Music / 音楽動画） ─────────────────────

def get_audio_stream(
    video_id: str,
    fmt: str = "m4a",
) -> AudioStreamInfo:
    # YouTube Music URLを優先
    url = _build_url(video_id, music=True)

    if fmt == "m4a":
        format_str = "bestaudio[ext=m4a]/bestaudio/best"
    elif fmt == "mp3":
        format_str = "bestaudio/best"
    else:
        format_str = f"bestaudio[ext={fmt}]/bestaudio/best"

    info = _extract_info(url, {"format": format_str})
    # 音声フォーマットを探す
    audio_formats = [
        f for f in (info.get("formats") or [])
        if f.get("acodec", "none") != "none" and f.get("vcodec", "none") == "none"
    ]
    # なければ映像込みでも可
    if not audio_formats:
        audio_formats = [
            f for f in (info.get("formats") or [])
            if f.get("acodec", "none") != "none"
        ]

    selected = audio_formats[-1] if audio_formats else {}
    stream_url = selected.get("url") or info.get("url", "")

    # YouTube Music URLで取れなければ通常URLで再試行
    if not stream_url:
        url_yt = _build_url(video_id)
        info = _extract_info(url_yt, {"format": format_str})
        audio_formats = [
            f for f in (info.get("formats") or [])
            if f.get("acodec", "none") != "none"
        ]
        selected = audio_formats[-1] if audio_formats else {}
        stream_url = selected.get("url") or info.get("url", "")

    return AudioStreamInfo(
        id=info.get("id", video_id),
        title=info.get("title", ""),
        url=stream_url,
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


# ─── ライブストリーム取得 ──────────────────────────────────────────────────

def get_live_stream(video_id: str) -> LiveStreamInfo:
    url = _build_url(video_id)
    info = _extract_info(url, {
        "format": "best[protocol=m3u8]/best",
        "skip_download": True,
    })

    if not info.get("is_live"):
        raise ValueError(f"Video {video_id} is not a live stream")

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
    search_type: str = "video",
) -> list[SearchResult]:
    # チャンネル・プレイリストもytsearchで代用（yt-dlpの互換性のため）
    search_url = f"ytsearch{max_results}:{query}"

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
    if channel_id.startswith("UC") or channel_id.startswith("@"):
        url = f"https://www.youtube.com/{channel_id}" if channel_id.startswith("@") else \
              f"https://www.youtube.com/channel/{channel_id}"
    else:
        url = f"https://www.youtube.com/@{channel_id}"

    opts = {
        "extract_flat": True,
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
    info = _extract_info(url, {})

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
