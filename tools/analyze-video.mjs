#!/usr/bin/env node
/* ============================================================
   تحليل فيديو مرجعي — يستخرج المعلومات التي نحتاجها لإعادة البناء
   Reference-video inspector

   الاستخدام:
     node tools/analyze-video.mjs reference/reference.mp4

   الناتج:
     docs/video-analysis/frames/*.jpg   إطارات موزّعة على الفيديو
     docs/video-analysis/report.json    بيانات تقنية
     docs/video-analysis/notes.md       قالب ملاحظات جاهز
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const input = process.argv[2];
if (!input) {
  console.error('الاستخدام: node tools/analyze-video.mjs <video.mp4>');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`✖ الملف غير موجود: ${input}`);
  process.exit(1);
}

const OUT_DIR = path.resolve('docs/video-analysis');
const FRAMES = path.join(OUT_DIR, 'frames');
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const ffmpeg = (() => {
  const local = path.resolve('tools/bin/ffmpeg');
  if (fs.existsSync(local)) return local;
  try {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
  } catch { return 'ffmpeg'; }
})();

/* ---------- ١. المعلومات التقنية (ffmpeg يطبعها على stderr) ---------- */
function probe(file) {
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (e) {
    return (e.stderr || '').toString();
  }
}

const info = probe(input);
const duration = (info.match(/Duration:\s*([\d:.]+)/) || [])[1] || 'unknown';
const video = (info.match(/Video:\s*([^,\n]+),.*?(\d{2,5}x\d{2,5})/) || []);
const fps = (info.match(/([\d.]+)\s*fps/) || [])[1] || 'unknown';
const hasAudio = /Stream #\S+.*?Audio:/.test(info);

const secs = duration.includes(':')
  ? duration.split(':').reduce((acc, v, i, a) => acc + Number(v) * Math.pow(60, a.length - i - 1), 0)
  : Number(duration) || 10;

console.log('المدة:', duration, '| الأبعاد:', video[2] || '?', '| FPS:', fps, '| صوت:', hasAudio ? 'نعم' : 'لا');

/* ---------- ٢. استخراج إطارات موزّعة (بحد أقصى 48) ---------- */
const every = Math.max(1, secs / 48);
execFileSync(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', input,
  '-vf', `fps=1/${every.toFixed(3)},scale=540:-2`,
  '-q:v', '4',
  path.join(FRAMES, 'f_%03d.jpg')
], { stdio: 'inherit' });

const frameCount = fs.readdirSync(FRAMES).filter((f) => f.endsWith('.jpg')).length;
console.log('الإطارات المستخرجة:', frameCount);

/* ---------- ٣. التقاط الصوت (لمقارنة الموسيقى لاحقاً) ---------- */
let audioFile = null;
if (hasAudio) {
  audioFile = path.join(OUT_DIR, 'audio-preview.mp3');
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-b:a', '96k', audioFile], { stdio: 'inherit' });
  } catch { audioFile = null; }
}

/* ---------- ٤. المخرجات ---------- */
const report = {
  file: path.basename(input),
  sizeMB: +(fs.statSync(input).size / 1024 / 1024).toFixed(2),
  duration,
  seconds: +secs.toFixed(2),
  resolution: video[2] || null,
  codec: (video[1] || '').trim(),
  fps: Number(fps) || fps,
  hasAudio,
  audioPreview: audioFile ? path.relative(process.cwd(), audioFile) : null,
  framesExtracted: frameCount,
  framesDir: path.relative(process.cwd(), FRAMES),
  nextSteps: [
    'راجع الإطارات وحدّد الخطوط والألوان ومراحل الحركة',
    'أكمل docs/video-analysis/notes.md',
    'حدّث assets/js/config.js ليطابق الأسلوب'
  ]
};

fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

fs.writeFileSync(path.join(OUT_DIR, 'notes.md'), [
  '# ملاحظات تحليل الفيديو المرجعي',
  '',
  `**الملف:** \`${report.file}\` — ${report.sizeMB}MB — ${report.duration} — ${report.resolution || '?'} — ${report.fps}fps`,
  '',
  '## ١. الأسلوب العام',
  '- [ ] النوع: كلاسيكي / مودرن / مينيمال / فاخر',
  '- [ ] الإيقاع: بطيء هادئ أم سريع؟',
  `- [ ] طول الفيديو: ${report.seconds} ثانية`,
  '',
  '## ٢. الألوان',
  '- الخلفية: `#______`',
  '- الأساسي (ذهبي/نحاسي): `#______`',
  '- الثانوي: `#______`',
  '',
  '## ٣. الخطوط',
  '- عنوان الأسماء: ______',
  '- النصوص: ______',
  '- الأرقام/التواريخ: ______',
  '',
  '## ٤. مشهد بمشهد',
  '| # | الوقت | المشهد | الحركة |',
  '|---|-------|--------|--------|',
  '| ١ | 0:00 | | |',
  '',
  '## ٥. عناصر يجب إضافتها للموقع',
  '- [ ]',
  ''
].join('\n'));

console.log('\n✔ الناتج في:', path.relative(process.cwd(), OUT_DIR));
console.log('  - report.json');
console.log('  - notes.md   ← اكتب التحليل هنا');
console.log('  - frames/    ←', frameCount, 'إطار');
if (audioFile) console.log('  - audio-preview.mp3');
