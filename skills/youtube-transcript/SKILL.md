---
name: youtube-transcript
description: Fetch transcripts from YouTube videos for summarization and analysis.
---

# YouTube Transcript

Fetch transcripts from YouTube videos using `yt-dlp`.

## Usage

```bash
yt-dlp --get-subs --write-auto-subs --skip-download --sub-format "vtt/srv1/srv2/srv3/ttml" --sub-langs "en.*" -o - "<url>"
```

Or simplified via bash if you have a script.

## Notes

- Requires `yt-dlp` installed.
- Requires captions/transcripts to be available on the video.
