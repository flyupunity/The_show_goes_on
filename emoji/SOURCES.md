# Emoji assets

Standard PNG images are the images referenced by Telegram's public message previews at `https://telegram.org/img/emoji/40/`.

Custom emoji identifiers come from `tg-emoji` elements in the saved public previews. Their images and animations are retrieved through the public `https://t.me/i/emoji/<id>.json` endpoint used by Telegram's embed renderer. CDN URLs are not required at runtime; all files are local. Emoji artwork remains the work of its respective authors.

`manifest.json` records the local image paths and source endpoints. `data/emoji_entities.json` records source text fingerprints and positions, so a changed message cannot silently reuse old custom emoji positions.

Lottie Web 5.13.0 (SVG light player) is used to display TGS animations. Its MIT license is included in `LOTTIE-LICENSE.md`.

Regenerate the local assets with `python -m scripts.download_telegram_emoji` and rebuild the report. Regular Unicode text is retained for copying, accessibility and search.
