#!/usr/bin/env bash
# ============================================================
# إعداد بيئة تحويل الموقع إلى فيديو (مرة واحدة فقط)
# يثبّت: Chromium headless + ffmpeg + حزم npm اللازمة
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

echo "▸ تثبيت حزم Node…"
npm --version >/dev/null 2>&1 || { echo "✖ npm غير مثبّت"; exit 1; }

if [ ! -f package.json ]; then
  cat > package.json <<'JSON'
{
  "name": "wedding-invitation",
  "version": "1.0.0",
  "private": true,
  "description": "Arabic wedding invitation website + video renderer",
  "scripts": {
    "serve": "python3 -m http.server 8080",
    "render": "node tools/render-teaser.mjs"
  },
  "dependencies": {
    "@sparticuz/chromium": "^131.0.0",
    "puppeteer-core": "^23.0.0"
  }
}
JSON
fi

npm install --no-audit --no-fund

echo "▸ تحميل ffmpeg…"
if ! command -v ffmpeg >/dev/null 2>&1; then
  python3 -m pip install --break-system-packages --quiet imageio-ffmpeg 2>/dev/null \
    || python3 -m pip install --quiet --user imageio-ffmpeg
  FF=$(python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
  mkdir -p "$ROOT/tools/bin"
  ln -sf "$FF" "$ROOT/tools/bin/ffmpeg"
  echo "  ffmpeg → $ROOT/tools/bin/ffmpeg"
else
  echo "  ffmpeg موجود بالفعل: $(command -v ffmpeg)"
fi

echo ""
echo "✔ جاهز. شغّل الموقع في نافذة أخرى:"
echo "    npm run serve"
echo "ثم:"
echo "    npm run render -- --url http://localhost:8080 --out preview/teaser.mp4"
