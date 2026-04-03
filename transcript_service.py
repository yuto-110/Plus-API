"""
Transcript Service
youtube-transcript-api を使って字幕・トランスクリプトを取得する
"""

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from models import TranscriptSegment, TranscriptInfo


def get_transcript(
    video_id: str,
    languages: list[str] | None = None,
    preserve_formatting: bool = False,
) -> TranscriptInfo:
    """
    指定言語の字幕を取得する。
    languages 未指定の場合は利用可能な最初の字幕を取得。
    """
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        if languages:
            try:
                transcript = transcript_list.find_transcript(languages)
            except NoTranscriptFound:
                # 自動生成字幕を翻訳して取得
                transcript = transcript_list.find_generated_transcript(["en", "ja"]).translate(languages[0])
        else:
            # 優先順位: 手動 ja → 手動 en → 自動生成 ja → 自動生成 en → 何でも最初
            transcript = _pick_best_transcript(transcript_list)

        raw = transcript.fetch()

        segments = [
            TranscriptSegment(
                text=getattr(seg, "text", seg.get("text", "") if isinstance(seg, dict) else ""),
                start=getattr(seg, "start", seg.get("start", 0.0) if isinstance(seg, dict) else 0.0),
                duration=getattr(seg, "duration", seg.get("duration", 0.0) if isinstance(seg, dict) else 0.0),
            )
            for seg in raw
        ]

        full_text = " ".join(seg.text for seg in segments)

        return TranscriptInfo(
            video_id=video_id,
            language=transcript.language,
            language_code=transcript.language_code,
            is_generated=transcript.is_generated,
            is_translatable=transcript.is_translatable,
            segments=segments,
            full_text=full_text,
        )

    except TranscriptsDisabled:
        raise ValueError(f"Transcripts are disabled for video: {video_id}")
    except NoTranscriptFound:
        raise ValueError(f"No transcript found for video: {video_id}")


def list_available_transcripts(video_id: str) -> list[dict]:
    """利用可能な字幕の一覧を返す"""
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        result = []
        for t in transcript_list:
            result.append({
                "language": t.language,
                "language_code": t.language_code,
                "is_generated": t.is_generated,
                "is_translatable": t.is_translatable,
                "translation_languages": [
                    {"language": tl["language"], "language_code": tl["language_code"]}
                    for tl in t.translation_languages[:10]  # 多すぎるので上限
                ],
            })
        return result
    except TranscriptsDisabled:
        raise ValueError(f"Transcripts are disabled for video: {video_id}")


def _pick_best_transcript(transcript_list):
    """最適な字幕を優先順で選択"""
    # 手動作成の優先言語
    for lang in ["ja", "en"]:
        try:
            return transcript_list.find_manually_created_transcript([lang])
        except NoTranscriptFound:
            pass
    # 自動生成
    for lang in ["ja", "en"]:
        try:
            return transcript_list.find_generated_transcript([lang])
        except NoTranscriptFound:
            pass
    # 何でも最初
    for t in transcript_list:
        return t
    raise NoTranscriptFound(None, None)
