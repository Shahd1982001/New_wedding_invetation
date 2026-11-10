#!/usr/bin/env node
/* ============================================================
   تحليل فيديو مرجعي مقسّم إلى عدة مقاطع
   Multi-part reference video analyzer

   الاستخدام:
     node tools/analyze-video.mjs reference/            # كل المقاطع في المجلد
     node tools/analyze-video.mjs reference/part-01.mp4 # مقطع واحد
     node tools/analyze-video.mjs reference/*.mp4 --merge

   المزايا:
     • يقرأ كل المقاطع بالترتيب (part-01, part-02, segment_1 …)
     • يستخرج إطارات من كل مقطع مع تسمية واضحة
     • يحسب التوقيت التراكمي (المكان الحقيقي في الفيديو الكامل)
     • يوحّد المخرجات في تقرير واحد يقرأ الفيديو كقصة كاملة
     • يستخرج الصوت لكل مقطع (لمقارنة الموسيقى)
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/* ---------- ١. الوسائط ---------- */
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const target = args[0];

if (!target) {
  console.error('الاستخدام: node tools/analyze-video.mjs <مجلد أو ملف>');
  process.exit(1);
}
if (!fs.existsSync(target)) {
  console.error(`✖ غير موجود: ${target}`);
  process.exit(1);
}

const OUT_DIR = path.resolve('docs/video-analysis');
const FRAMES = path.join(OUT_DIR, 'frames');
const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi|m4v|MP4|MOV|WEBM|MKV|AVI)$/;

/* ---------- ٢. ترتيب طبيعي للملفات (part-2 قبل part-10) ---------- */
const naturalSort = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function collectFiles(p) {
  const stat = fs.statSync(p);
  if (stat.isFile()) return VIDEO_EXT.test(p) ? [p] : [];
  return fs.readdirSync(p)
    .filter((f) => VIDEO_EXT.test(f))
    .map((f) => path.join(p, f))
    .sort(naturalSort);
}

const files = collectFiles(target);
if (!files.length) {
  console.error('✖ لم أجد أي ملف فيديو في:', target);
  console.error('  الصيغ المدعومة: mp4, mov, webm, mkv, avi, m4v');
  process.exit(1);
}

/* ---------- ٣. ffmpeg ---------- */
const ffmpeg = (() => {
  const local = path.resolve('tools/bin/ffmpeg');
  if (fs.existsSync(local)) return local;
  try {
    return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
  } catch { return 'ffmpeg'; }
})();

/* ---------- ٤. قراءة بيانات مقطع ---------- */
function probe(file) {
  let info = '';
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    info = (e.stderr || '').toString();
  }

  const durStr = (info.match(/Duration:\s*([\d:.]+)/) || [])[1] || '0:00:00';
  const [hh, mm, ss] = durStr.split(':').map(Number);
  const seconds = (hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0);

  const res = (info.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/) || []);
  const fps = (info.match(/([\d.]+)\s*fps/) || [])[1] || 'unknown';
  const codec = (info.match(/Video:\s*([^,\n]+)/) || [])[1] || 'unknown';
  const hasAudio = /Stream #\S+.*?Audio:/.test(info);

  return {
    durationText: durStr,
    seconds: +seconds.toFixed(2),
    width: res[1] ? +res[1] : null,
    height: res[2] ? +res[2] : null,
    fps: Number(fps) || fps,
    codec: codec.trim(),
    hasAudio
  };
}

/* ---------- ٥. التنفيذ ---------- */
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

console.log(`\n🎬 عدد المقاطع: ${files.length}\n`);

const parts = [];
let cursor = 0;        // التوقيت التراكمي بالثواني
let globalFrame = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const idx = String(i + 1).padStart(2, '0');
  const info = probe(file);
  const sizeMB = +(fs.statSync(file).size / 1024 / 1024).toFixed(2);

  console.log(`▸ [${idx}/${String(files.length).padStart(2, '0')}] ${path.basename(file)}`);
  console.log(`    ${info.durationText} — ${info.width}x${info.height} — ${info.fps}fps — ${sizeMB}MB — صوت: ${info.hasAudio ? 'نعم' : 'لا'}`);

  // إطارات: إطار كل ~1.2 ثانية (حرج لقراءة الخطوط والحركة)، بحد أقصى 24 لكل مقطع
  const wanted = Math.min(24, Math.max(2, Math.round(info.seconds / 1.2)));
  const every = info.seconds > 0 ? Math.max(0.4, info.seconds / wanted) : 1;
  const partDir = path.join(FRAMES, `part-${idx}`);
  fs.mkdirSync(partDir, { recursive: true });

  if (info.seconds > 0) {
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', file,
      '-vf', `fps=1/${every.toFixed(2)},scale=720:-2`,
      '-q:v', '4',
      path.join(partDir, 'f_%02d.jpg')
    ], { stdio: 'inherit' });
  }

  const extracted = fs.readdirSync(partDir).filter((f) => f.endsWith('.jpg'));
  globalFrame += extracted.length;

  // جدول الإطارات مع التوقيت التراكمي (المكان الحقيقي في الفيديو الكامل)
  const frames = extracted.map((f, k) => {
    const localT = Math.min(info.seconds, k * every);
    return {
      index: `part-${idx}/${f}`,
      localTime: `+${localT.toFixed(1)}s`,
      globalTime: formatTime(cursor + localT)
    };
  });

  // الصوت
  let audio = null;
  if (info.hasAudio) {
    audio = path.join(OUT_DIR, `audio-part-${idx}.mp3`);
    try {
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vn', '-ac', '1', '-b:a', '80k', '-t', '60', audio], { stdio: 'inherit' });
      audio = path.relative(process.cwd(), audio);
    } catch { audio = null; }
  }

  parts.push({
    order: i + 1,
    file: path.relative(process.cwd(), file),
    name: path.basename(file),
    ...info,
    sizeMB,
    startsAt: formatTime(cursor),
    endsAt: formatTime(cursor + info.seconds),
    frames,
    audioPreview: audio
  });

  cursor += info.seconds;
}

function formatTime(s) {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/* ---------- ٦. التقرير الموحّد ---------- */
const resolutions = [...new Set(parts.map((p) => p.width && p.height ? `${p.width}x${p.height}` : null).filter(Boolean))];
const totalSec = cursor;

const report = {
  analyzedAt: new Date().toISOString(),
  source: target,
  partsCount: parts.length,
  totalDuration: formatTime(totalSec),
  totalSeconds: +totalSec.toFixed(2),
  resolutions,
  resolutionsMatch: resolutions.length === 1,
  hasAudio: parts.some((p) => p.hasAudio),
  framesExtracted: globalFrame,
  framesDir: path.relative(process.cwd(), FRAMES),
  parts
};

fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

/* ---------- ٧. ملاحظات جاهزة (تقرأ الفيديو كقصة) ---------- */
const timelineRows = parts.map((p) =>
  `| ${p.order} | \`${p.name}\` | ${p.startsAt} → ${p.endsAt} | ${p.durationText} | ${p.width}x${p.height} |`
).join('\n');

const sceneRows = parts.map((p) => `| ${p.order} | ${p.startsAt} | | |`).join('\n');

const notes = [
  '# تحليل الفيديو المرجعي',
  '',
  '**المصدر:** ' + target,
  '**عدد المقاطع:** ' + parts.length,
  '**المدة الإجمالية:** ' + formatTime(totalSec),
  '**الدقة:** ' + (resolutions.join(' / ') || '?') + (resolutions.length > 1 ? ' ⚠️ المقاطع بدقات مختلفة' : ' ✅'),
  '**صوت:** ' + (report.hasAudio ? 'نعم' : 'لا'),
  '**إطارات مستخرجة:** ' + globalFrame,
  '',
  '---',
  '',
  '## ١. خريطة المقاطع',
  '',
  '| # | الملف | المكان في الفيديو | المدة | الدقة |',
  '|---|-------|------------------|-------|-------|',
  timelineRows,
  '',
  '---',
  '',
  '## ٢. الأسلوب العام',
  '',
  '- [ ] النوع: كلاسيكي / مودرن / مينيمال / فاخر',
  '- [ ] الإيقاع: بطيء هادئ أم سريع؟',
  '- [ ] هل المقاطع متسلسلة أم كل مقطع مشهد مستقل؟',
  '',
  '## ٣. الألوان',
  '',
  '- الخلفية: #______',
  '- الأساسي (ذهبي/نحاسي): #______',
  '- الثانوي: #______',
  '',
  '## ٤. الخطوط',
  '',
  '- عنوان الأسماء: ______',
  '- النصوص: ______',
  '- الأرقام/التواريخ: ______',
  '',
  '## ٥. مشهد بمشهد (عبر كل المقاطع)',
  '',
  '| # | التوقيت | المقطع | المشهد / الحركة |',
  '|---|---------|--------|-----------------|',
  sceneRows,
  '',
  '## ٦. العناصر المطلوب إضافتها للموقع',
  '',
  '- [ ]',
  '',
  '## ٧. ملاحظات إضافية',
  ''
].join('\n');

fs.writeFileSync(path.join(OUT_DIR, 'notes.md'), notes);

/* ---------- ٨. الطباعة ---------- */
console.log('\n' + '─'.repeat(52));
console.log(`✔ المدة الإجمالية: ${formatTime(totalSec)} في ${parts.length} مقاطع`);
console.log(`✔ إطارات: ${globalFrame}`);
if (!report.resolutionsMatch) console.log('⚠️ المقاطع بدقات مختلفة — راجعها');
console.log('\nالمخرجات:');
console.log(`  ${path.relative(process.cwd(), path.join(OUT_DIR, 'report.json'))}`);
console.log(`  ${path.relative(process.cwd(), path.join(OUT_DIR, 'notes.md'))}`);
console.log(`  ${path.relative(process.cwd(), FRAMES)}/part-XX/`);
