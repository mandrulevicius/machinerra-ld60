import { describe, expect, it } from 'vitest';
import { KICK_ANIM, KICK_TIME, POSE_ANIM, animTime, footAt, kickPose, twoBone } from './kick';

describe('the kick pose', () => {
  it('chambers, snaps out, holds, then comes home, and is over after its time', () => {
    const { wind, snap, hold } = KICK_ANIM;
    expect(kickPose(0)).toMatchObject({ cham: 0, ext: 0 });
    expect(kickPose(wind - 1e-6)!.cham).toBeCloseTo(1, 3);
    expect(kickPose(wind + snap + 1e-6)!.ext).toBeCloseTo(1, 3);
    expect(kickPose(wind + snap + hold / 2)).toEqual({ cham: 0, ext: 1, lean: 1 });
    expect(kickPose(KICK_TIME - 1e-6)!.ext).toBeLessThan(0.01);
    expect(kickPose(KICK_TIME)).toBeNull();
    expect(kickPose(-0.1)).toBeNull();
  });
  it('leans back in the chamber and forward at the snap, and the snap is quick', () => {
    expect(kickPose(KICK_ANIM.wind - 1e-6)!.lean).toBeCloseTo(-1, 3);
    expect(kickPose(KICK_ANIM.wind + KICK_ANIM.snap + 1e-6)!.lean).toBeCloseTo(1, 3);
    // Most of the extension is done in the first half of the snap.
    expect(kickPose(KICK_ANIM.wind + KICK_ANIM.snap / 2)!.ext).toBeGreaterThan(0.8);
  });
  it('never goes outside 0..1 for the leg', () => {
    for (let t = 0; t < KICK_TIME; t += 0.005) {
      const p = kickPose(t)!;
      expect(p.cham).toBeGreaterThanOrEqual(0);
      expect(p.cham).toBeLessThanOrEqual(1.0001);
      expect(p.ext).toBeGreaterThanOrEqual(0);
      expect(p.ext).toBeLessThanOrEqual(1.0001);
    }
  });
});

describe('the pose look\'s curve', () => {
  it('has no chamber: the leg is nearly out within a frame or two of the press, held, then home', () => {
    expect(POSE_ANIM.wind).toBe(0);
    expect(kickPose(0.02, POSE_ANIM)!.ext).toBeGreaterThan(0.8);
    expect(kickPose(POSE_ANIM.snap + POSE_ANIM.hold / 2, POSE_ANIM)).toMatchObject({ cham: 0, ext: 1 });
    const end = animTime(POSE_ANIM);
    expect(kickPose(end - 1e-6, POSE_ANIM)!.ext).toBeLessThan(0.01);
    expect(kickPose(end, POSE_ANIM)).toBeNull();
    expect(end).toBeLessThan(KICK_TIME);
  });
});

describe('the leg', () => {
  const H = 30, l = 0.47 * H;
  const bones = { ks: 0, kz: 0, as: 0, az: 0 };
  const foot = { s: 0, z: 0 };

  it('keeps both bones their length whatever the pose', () => {
    for (let t = 0; t < KICK_TIME; t += 0.01) {
      footAt(kickPose(t)!, H, 27, foot);
      twoBone(H, foot.s, foot.z, l, l, bones);
      expect(Math.hypot(bones.ks, bones.kz - H)).toBeCloseTo(l, 5);
      expect(Math.hypot(bones.as - bones.ks, bones.az - bones.kz)).toBeCloseTo(l, 3);
    }
  });
  it('stands with the foot under the hip, a boot off the ground, and reaches out at the snap', () => {
    footAt({ cham: 0, ext: 0, lean: 0 }, H, 27, foot);
    expect(foot.s).toBe(0);
    expect(foot.z).toBeCloseTo(0.09 * H);
    footAt({ cham: 0, ext: 1, lean: 1 }, H, 27, foot);
    twoBone(H, foot.s, foot.z, l, l, bones);
    expect(bones.as).toBeGreaterThan(24);
    expect(bones.az).toBeGreaterThan(H * 0.6);
  });
  it('bends the knee forward and up, and pulls an unreachable ankle in', () => {
    twoBone(H, 0, 0.1 * H, l, l, bones);
    expect(bones.ks).toBeGreaterThan(0);
    twoBone(H, 90, H, l, l, bones);
    expect(bones.as).toBeCloseTo(2 * l * 0.999, 3);
  });
});
