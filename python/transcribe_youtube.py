#!/usr/bin/env python3
"""
Video Transcription Script Test
===============================

Fetches transcript/captions from YouTube videos using the YouTube Transcript API.

Usage:
    python transcribe_youtube.py <youtube_url>
    python transcribe_youtube.py https://www.youtube.com/watch?v=VIDEO_ID

Features:
    - Supports multiple URL formats (watch, embed, short URLs)
    - Prioritizes manual transcripts over auto-generated
    - Falls back to translation if English not available
    - Outputs timestamped and full-text formats
    - Saves transcriptions to transcriptions/ directory
"""

import sys
import os
import ssl
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

# Disable SSL verification for environments with certificate issues
ssl._create_default_https_context = ssl._create_unverified_context


def extract_video_id(youtube_url: str) -> str:
    """Extract video ID from various YouTube URL formats."""
    # Handle youtu.be short URLs
    if "youtu.be" in youtube_url:
        path = urlparse(youtube_url).path
        return path.strip("/")

    # Handle youtube.com URLs
    parsed = urlparse(youtube_url)
    if "youtube.com" in parsed.netloc:
        if "/watch" in parsed.path:
            query = parse_qs(parsed.query)
            return query.get("v", [None])[0]
        elif "/embed/" in parsed.path or "/v/" in parsed.path:
            return parsed.path.split("/")[-1]

    # Assume it's already a video ID
    return youtube_url


def format_timestamp(seconds: float) -> str:
    """Format seconds as HH:MM:SS or MM:SS."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def get_transcript(video_id: str, languages: list = None) -> tuple:
    """
    Fetch transcript from YouTube.
    Returns (transcript_list, language_code, transcript_type).
    """
    if languages is None:
        languages = ["en", "en-US", "en-GB"]

    # Create API instance
    ytt_api = YouTubeTranscriptApi()

    try:
        # Try to get transcript in preferred languages
        transcript_list = ytt_api.list(video_id)

        # First try to get manually created transcript
        try:
            transcript = transcript_list.find_manually_created_transcript(languages)
            return transcript.fetch(), transcript.language_code, "manual"
        except NoTranscriptFound:
            pass

        # Then try auto-generated transcript
        try:
            transcript = transcript_list.find_generated_transcript(languages)
            return transcript.fetch(), transcript.language_code, "auto-generated"
        except NoTranscriptFound:
            pass

        # Get any available transcript and translate if needed
        for transcript in transcript_list:
            try:
                if transcript.language_code.startswith("en"):
                    transcript_type = "auto-generated" if transcript.is_generated else "manual"
                    return transcript.fetch(), transcript.language_code, transcript_type
                # Try to translate to English
                translated = transcript.translate("en")
                return translated.fetch(), f"en (translated from {transcript.language_code})", "translated"
            except Exception:
                continue

        # Just get the first available transcript
        transcript = next(iter(transcript_list))
        transcript_type = "auto-generated" if transcript.is_generated else "manual"
        return transcript.fetch(), transcript.language_code, transcript_type

    except TranscriptsDisabled:
        raise Exception("Transcripts are disabled for this video")
    except VideoUnavailable:
        raise Exception("Video is unavailable")
    except NoTranscriptFound:
        raise Exception("No transcript found for this video")


def main():
    if len(sys.argv) < 2:
        print("Usage: python transcribe_youtube.py <youtube_url>")
        print("Example: python transcribe_youtube.py https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        sys.exit(1)

    youtube_url = sys.argv[1]
    video_id = extract_video_id(youtube_url)

    if not video_id:
        print("Error: Could not extract video ID from URL")
        sys.exit(1)

    print(f"YouTube URL: {youtube_url}")
    print(f"Video ID: {video_id}")
    print("\nFetching transcript...")

    try:
        transcript, language, transcript_type = get_transcript(video_id)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    print(f"Language: {language} ({transcript_type})")
    print(f"Found {len(transcript)} segments")

    # Output transcription
    print("\n" + "=" * 80)
    print("TIMESTAMPED TRANSCRIPTION")
    print("=" * 80 + "\n")

    full_text = []
    for segment in transcript:
        start = segment.start
        duration = segment.duration
        end = start + duration
        text = segment.text

        timestamp = f"[{format_timestamp(start)} -> {format_timestamp(end)}]"
        print(f"{timestamp} {text}")
        full_text.append(text)

    print("\n" + "=" * 80)
    print("FULL TEXT")
    print("=" * 80 + "\n")

    full_text_combined = " ".join(full_text)
    print(full_text_combined)

    # Save transcription to file
    # Sanitize video ID for filename
    safe_filename = re.sub(r'[^\w\-]', '_', video_id)
    output_file = Path(__file__).parent / "transcriptions" / f"{safe_filename}.txt"
    output_file.parent.mkdir(exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(f"Video ID: {video_id}\n")
        f.write(f"URL: {youtube_url}\n")
        f.write(f"Language: {language} ({transcript_type})\n")
        f.write("=" * 80 + "\n\n")
        f.write("TIMESTAMPED TRANSCRIPTION:\n\n")
        for segment in transcript:
            start = segment.start
            duration = segment.duration
            end = start + duration
            text = segment.text
            timestamp = f"[{format_timestamp(start)} -> {format_timestamp(end)}]"
            f.write(f"{timestamp} {text}\n")
        f.write("\n" + "=" * 80 + "\n")
        f.write("FULL TEXT:\n\n")
        f.write(full_text_combined)

    print(f"\nTranscription saved to: {output_file}")


if __name__ == "__main__":
    main()
