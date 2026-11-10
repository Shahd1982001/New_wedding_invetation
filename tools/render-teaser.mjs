#!/usr/bin/env node
/* ============================================================
   تحويل دعوة الويب إلى فيديو عمودي (Reels / TikTok / WhatsApp)
   Website → vertical video renderer

   الاستخدام:
     node tools/render-teaser.mjs --url http://localhost:8080 \
                                 --out preview/teaser.mp4 \
                                 [--seconds 30] [--size 1080x1920]

   الفكرة: نفتح الصفحة بمتصفح headless، نسجّل الشاشة عبر CDP
   (Page.startScreencast) أثناء تنقّل آلي، ثم نجمع الإطارات
   بـ ffmpeg إلى MP4.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/* ---------- ١. قراءة الوسائط ---------- */
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const URL_TARGET = arg('url', 'http://localhost:8080');
const OUT = arg('out', 'preview/teaser.mp4');
const [W, H] = arg('size', '1080x1920').split('x').map(Number);
const DPR = 2;
const CSS_W = W / DPR;
const CSS_H = H / DPR;
const FPS_TARGET = Number(arg('fps', 30));
const HOLD = Number(arg('hold', 2200)); // مدة الوقوف على كل قسم (ms)

/* ---------- ٢. أدوات مساعدة ---------- */
const log = (...a) => console.log('▸', ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function ffmpegPath() {
  const local = path.resolve('tools/bin/ffmpeg');
  if (fs.existsSync(local)) return local;
  try {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
  } catch { /* ignore */ }
  return 'ffmpeg';
}

/* ---------- ٣. التسجيل ---------- */
const FRAMES_DIR = path.resolve('tools/.frames');
fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

log('تشغيل المتصفح…');
const browser = await puppeteer.launch({
  args: [...chromium.args, '--force-color-profile=srgb', '--font-render-hinting=none'],
  executablePath: await chromium.executablePath(),
  headless: true,
  defaultViewport: { width: CSS_W, height: CSS_H, deviceScaleFactor: DPR, isMobile: true, hasTouch: true }
});

const page = await browser.newPage();
page.on('pageerror', (e) => console.warn('  ⚠ خطأ في الصفحة:', e.message));
await page.goto(URL_TARGET, { waitUntil: 'networkidle0', timeout: 60000 });
await page.evaluateHandle('document.fonts.ready');

const client = await page.createCDPSession();
let n = 0, firstTs = null, lastTs = null;

client.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  n += 1;
  if (firstTs === null) firstTs = metadata.timestamp;
  lastTs = metadata.timestamp;
  fs.writeFileSync(path.join(FRAMES_DIR, `f_${String(n).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
  await client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

log('بدء التسجيل…');
await client.send('Page.startScreencast', {
  format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1
});

await wait(3800);                                             // شاشة الافتتاح
await page.click('#openBtn');                                  // فتح الدعوة
await wait(3000);                                              // ظهور الغلاف

const scrollTo = async (sel, offset = 0) => {
  await page.evaluate((s, o) => {
    const el = document.querySelector(s);
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - o, behavior: 'smooth' });
  }, sel, offset);
  await wait(HOLD);
};

for (const [sel, off] of [['#story', 0], ['.countdown', 0], ['#program', 60], ['#venue', 60], ['#rsvp', 40], ['.outro', -60]]) {
  await scrollTo(sel, off);
}
await wait(1200);

await client.send('Page.stopScreencast').catch(() => {});
await browser.close();

const duration = lastTs - firstTs;
const fps = n / duration;
log(`إطارات: ${n} — مدة: ${duration.toFixed(2)}s — معدل: ${fps.toFixed(2)} fps`);

/* ---------- ٤. التجميع بـ ffmpeg ---------- */
const FF = ffmpegPath();
const outPath = path.resolve(OUT);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const fadeOutStart = Math.max(0, duration - 1.4);
const vf = [
  `scale=${W}:${H}:flags=lanczos`,
  'format=yuv420p',
  'fade=t=in:st=0:d=0.6',
  `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=1.3`
].join(',');

log('تجميع الفيديو…');
execFileSync(FF, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-framerate', fps.toFixed(4),
  '-i', path.join(FRAMES_DIR, 'f_%05d.jpg'),
  '-vf', vf,
  '-c:v', 'libx264', '-crf', '21', '-preset', 'medium',
  '-profile:v', 'high', '-level', '4.1',
  '-r', String(FPS_TARGET),
  '-movflags', '+faststart',
  outPath
], { stdio: 'inherit' });

const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
log(`✔ تم: ${OUT} (${mb} MB)`);

if (process.env.KEEP_FRAMES !== '1') {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
}
