// Usage: npm run capture -- <command> ...   (details: harness/capture/README.md)
//   gif    <in> [--width 480] [--fps 12] [--src-fps 30] [--out f.gif]   (--src-fps: rate of a .frames folder)
//   mp4    <in> [--width N] [--fps N] [--out f.mp4]
//   trim   <in> <start-seconds> <seconds> [--out f.mp4]
//   card   "Title" <seconds> --out f.mp4 [--sub "Subtitle"] [--bg 1d2330] [--fg ffffff]
//   concat <out.mp4> <in>...                       joins clips, scaled and padded to --size
//   music  <video> <audio> [--out f.mp4]           adds a soundtrack, cut at the video's end, fades out
// <in> is a .webm/.mp4/.png, or a `<name>.frames` folder from __game.capture.render (give it --fps).
// Shared flags: --size 1280x720 (card, concat, default frame size), --fps (default 30).
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FFMPEG_DIR = 'C:/Programs/ffmpeg-8.0-full_build/bin/';
const FONT = 'C\\:/Windows/Fonts/arial.ttf'; // drawtext needs a font file; escaped for the filter syntax

const [cmd, ...rest] = process.argv.slice(2);
const flags = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i];
  else args.push(rest[i]);
}
const [W, H] = (flags.size ?? '1280x720').split('x').map(Number);
const fps = Number(flags.fps ?? 30);

/** ffmpeg/ffprobe: on PATH, else the install in FFMPEG_DIR. */
const tool = (name) => (spawnSync(name, ['-version']).error ? FFMPEG_DIR + name + '.exe' : name);
function ffmpeg(a) {
  const r = spawnSync(tool('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status ?? r.error})`);
}

/** ffmpeg input args for a clip, still, or frames folder. */
function input(p, rate = fps) {
  if (!existsSync(p)) throw new Error(`no such file: ${p}`);
  return statSync(p).isDirectory() ? ['-framerate', String(rate), '-i', join(p, '%04d.png')] : ['-i', p];
}

const stem = (p) => p.replace(/\.frames\/?$/, '').replace(/\.[^./\\]+$/, '');
const out = (p, ext) => flags.out ?? `${stem(p)}.${ext}`;
const done = (f) => console.log(`${f}  ${(statSync(f).size / 1e6).toFixed(2)} MB`);
const even = (w) => `scale=${w ? `${Math.round(w / 2) * 2}` : '-2'}:-2:flags=lanczos`;

const commands = {
  gif([src]) {
    const f = out(src, 'gif');
    const vf = `fps=${flags.fps ?? 12},scale=${flags.width ?? 480}:-1:flags=lanczos`;
    ffmpeg([...input(src, flags['src-fps'] ?? 30), '-vf', `${vf},split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, f]);
    done(f);
  },
  mp4([src]) {
    const f = out(src, 'mp4');
    const vf = [flags.width ? even(flags.width) : 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p'];
    ffmpeg([...input(src), '-vf', vf.join(','), '-r', String(fps), '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', f]);
    done(f);
  },
  trim([src, start, seconds]) {
    const f = out(src, 'trim.mp4');
    ffmpeg(['-ss', start, '-t', seconds, ...input(src), '-vf', 'format=yuv420p', '-r', String(fps), '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', f]);
    done(f);
  },
  card([text, seconds]) {
    if (!flags.out) throw new Error('card needs --out');
    // The text goes through files: quoting it into a filter string is where drawtext breaks.
    const dir = mkdtempSync(join(tmpdir(), 'card-'));
    const draw = (name, txt, size, y, color) => {
      const file = join(dir, name);
      writeFileSync(file, txt);
      return `drawtext=fontfile='${FONT}':textfile='${file.replace(/\\/g, '/').replace(':', '\\:')}':fontsize=${size}:fontcolor=0x${color}:x=(w-text_w)/2:y=${y}`;
    };
    const vf = [draw('t.txt', text, Math.round(H / 8), '(h/2)-text_h', flags.fg ?? 'ffffff')];
    if (flags.sub) vf.push(draw('s.txt', flags.sub, Math.round(H / 18), '(h/2)+text_h', flags.fg ?? 'ffffff'));
    try {
      ffmpeg(['-f', 'lavfi', '-i', `color=c=0x${flags.bg ?? '1d2330'}:s=${W}x${H}:r=${fps}:d=${seconds}`, '-vf', [...vf, 'format=yuv420p'].join(','), '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', flags.out]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    done(flags.out);
  },
  concat([dest, ...clips]) {
    if (!clips.length) throw new Error('concat <out.mp4> <in>...');
    const inputs = clips.flatMap((c) => input(c));
    const norm = clips.map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`);
    const join_ = clips.map((_, i) => `[v${i}]`).join('') + `concat=n=${clips.length}:v=1:a=0[v]`;
    ffmpeg([...inputs, '-filter_complex', [...norm, join_].join(';'), '-map', '[v]', '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', dest]);
    done(dest);
  },
  music([video, audio]) {
    const f = out(video, 'music.mp4');
    const probe = spawnSync(tool('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
    const len = Number(probe.stdout);
    ffmpeg(['-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-af', `afade=t=out:st=${Math.max(0, len - 1.5)}:d=1.5`, '-t', String(len), f]);
    done(f);
  },
};

if (!commands[cmd]) {
  console.error(`usage: npm run capture -- <${Object.keys(commands).join('|')}> ...  (see harness/capture/README.md)`);
  process.exit(1);
}
try {
  commands[cmd](args);
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(1);
}
