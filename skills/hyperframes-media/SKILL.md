---
name: hyperframes-media
description: Asset preprocessing for HyperFrames compositions — text-to-speech narration (Kokoro), audio/video transcription (Whisper), and background removal for transparent overlays (u2net). Use when generating voiceover from text, transcribing speech for captions, removing the background from a video or image to use as a transparent overlay, choosing a TTS voice or whisper model, or chaining these (TTS → transcribe → captions). Each command downloads its own model on first run.
---

# HyperFrames Media Preprocessing

Three CLI commands that produce assets for compositions: `tts` (speech), `transcribe` (timestamps), and `remove-background` (transparent video). Each downloads a model on first run and caches it under `~/.cache/hyperframes/`.

Run them before composing — drop the output file into the project, then reference it from the composition HTML.

## Text-to-Speech (`tts`)

Generate speech audio locally with Kokoro-82M. No API key.

```bash
npx hyperframes tts "Text here" --voice af_nova --output narration.wav
npx hyperframes tts script.txt --voice bf_emma --output narration.wav
npx hyperframes tts --list                       # all 54 voices
```

### Voice Selection

Match voice to content. Default is `af_heart`.

| Content type      | Voice                 | Why                           |
| ----------------- | --------------------- | ----------------------------- |
| Product demo      | `af_heart`/`af_nova`  | Warm, professional            |
| Tutorial / how-to | `am_adam`/`bf_emma`   | Neutral, easy to follow       |
| Marketing / promo | `af_sky`/`am_michael` | Energetic or authoritative    |
| Documentation     | `bf_emma`/`bm_george` | Clear British English, formal |
| Casual / social   | `af_heart`/`af_sky`   | Approachable, natural         |

8 languages supported: EN, JP, ZH, KO, FR, DE, IT, PT. Run `--list` for the full set.

### Speed

- `0.7-0.8` — tutorial, complex content, accessibility
- `1.0` — natural pace (default)
- `1.1-1.2` — intros, transitions, upbeat content
- `1.5+` — rarely appropriate; test carefully

### Long Scripts

For more than a few paragraphs, write to a `.txt` file and pass the path. Inputs over ~5 minutes of speech may benefit from splitting into segments.

### Use in a Composition

Reference the generated audio as a standard `<audio>` track:

```html
<audio
  id="narration"
  data-start="0"
  data-duration="auto"
  data-track-index="2"
  src="narration.wav"
  data-volume="1"
></audio>
```

### Requirements

Python 3.8+ with `kokoro-onnx` and `soundfile` (`pip install kokoro-onnx soundfile`). Model downloads automatically on first use (~311 MB + ~27 MB voices, cached in `~/.cache/hyperframes/tts/`).

## Transcription (`transcribe`)

Produce a normalized `transcript.json` with word-level timestamps.

```bash
npx hyperframes transcribe audio.mp3
npx hyperframes transcribe video.mp4 --model small --language es
npx hyperframes transcribe subtitles.srt          # import existing
npx hyperframes transcribe subtitles.vtt
npx hyperframes transcribe openai-response.json   # import OpenAI output
```

### Language Rule (Non-Negotiable)

**Never use `.en` models unless the user explicitly states the audio is English.** `.en` models (`small.en`, `medium.en`) **translate** non-English audio into English instead of transcribing it. This silently destroys the original language.

1. Language known and non-English → `--model small --language <code>` (no `.en` suffix)
2. Language known and English → `--model small.en`
3. Language unknown → `--model small` (no `.en`, no `--language`) — whisper auto-detects

**Default model is `small`, not `small.en`.**

### Output Shape

The composition consumes a flat array of word objects:

```json
[
  { "text": "Hello", "start": 0.0, "end": 0.5 },
  { "text": "world.", "start": 0.6, "end": 1.2 }
]
```

For caption rendering, styling, and per-word effects, invoke the `hyperframes` skill (composition authoring).

## Background Removal (`remove-background`)

Remove the background from a video or image so it can sit as a transparent overlay in a composition (e.g. an avatar floating on a background plate).

```bash
npx hyperframes remove-background avatar.mp4 -o transparent.webm  # default: VP9 alpha WebM
npx hyperframes remove-background avatar.mp4 -o transparent.mov   # ProRes 4444 (editing)
npx hyperframes remove-background portrait.jpg -o cutout.png      # single-image cutout
npx hyperframes remove-background avatar.mp4 -o transparent.webm --device cpu
npx hyperframes remove-background --info                          # detected providers
```

Uses `u2net_human_seg` (MIT). First run downloads ~168 MB of weights to `~/.cache/hyperframes/background-removal/models/`.

### Output Format Choice

| Format                | When                                                          |
| --------------------- | ------------------------------------------------------------- |
| `.webm` (VP9 + alpha) | Default. Compositions consume this directly via `<video>`.    |
| `.mov` (ProRes 4444)  | Editing in DaVinci/Premiere/FCP. Large files.                 |
| `.png`                | Single-image cutout (still subject, layered over a backdrop). |

### Use in a Composition

Drop the `.webm` into the project, then play it like any other video — Chrome decodes VP9 alpha natively:

```html
<video src="transparent.webm" autoplay muted loop></video>
```

## TTS → Transcribe → Captions

Chain the commands when you don't have a pre-recorded voiceover:

```bash
# 1. Generate speech
npx hyperframes tts script.txt --voice af_heart --output narration.wav

# 2. Transcribe back for word-level timestamps
npx hyperframes transcribe narration.wav

# 3. narration.wav + transcript.json are ready for captions
```

Whisper extracts precise word boundaries from the generated audio, so caption timing matches delivery without hand-tuning.

For caption rendering, styling, and timeline integration, see the `hyperframes` skill.
