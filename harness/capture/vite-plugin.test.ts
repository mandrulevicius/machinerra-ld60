import { describe, expect, it } from 'vitest';
import { captureFile } from './vite-plugin';

const root = process.cwd();
const ok = (p: string) => expect(captureFile(root, p), p).not.toBeNull();
const no = (p: string) => expect(captureFile(root, p), p).toBeNull();

describe('capture save paths', () => {
  it('allows the known shapes', () => {
    ok('games/g/capture/shot.png');
    ok('games/g/capture/clip.frames/0001.png');
    ok('games/g/capture/bugs/20260101-1.json');
    ok('games/g/public/previews/Kit.webp');
    ok('games/g/capture/matrix/Title/titleLayout=left__theme=clean.png');
    ok('games/g/capture/matrix/Title/theme=pixel.png');
    ok('games/g/capture/matrix/Title/index.png');
  });

  it('refuses anything else', () => {
    no('games/g/capture/matrix/Title/../../../x.png');
    no('games/g/capture/matrix/../x=y.png');
    no('games/g/capture/matrix/Title/a=b/c=d.png');
    no('games/g/capture/matrix/Title/a=b.webm');
    no('games/g/capture/matrix/Title/=b.png');
    no('games/g/capture/matrix/x=y.png');
    no('games/../capture/matrix/T/a=b.png');
    no('harness/capture/matrix/T/a=b.png');
    no('games/g/capture/a=b.png');
  });
});
