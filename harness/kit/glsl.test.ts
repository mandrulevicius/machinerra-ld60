import { describe, expect, it } from 'vitest';
import { declaredUniforms, pointerUv, prepareFragment, unknownUniforms } from './glsl';

describe('prepareFragment', () => {
  it('adds the name pragma first and a precision line', () => {
    const out = prepareFragment('void main(){}', 'shader').split('\n');
    expect(out[0]).toBe('#pragma phaserTemplate(shaderName)');
    expect(out[1]).toBe('precision mediump float;');
    expect(out.join('\n')).not.toContain('fragmentHeader');
  });

  it('puts the filter header after the last uniform/varying, before main', () => {
    const src = 'uniform sampler2D uMainSampler;\nuniform float uA;\nvarying vec2 outTexCoord;\nfloat f(){return 1.0;}\nvoid main(){}';
    const out = prepareFragment(src, 'filter');
    const lines = out.split('\n');
    const header = lines.indexOf('#pragma phaserTemplate(fragmentHeader)');
    expect(header).toBe(lines.indexOf('varying vec2 outTexCoord;') + 1);
    expect(header).toBeLessThan(lines.indexOf('float f(){return 1.0;}'));
  });

  it('keeps pragmas and precision the author already wrote', () => {
    const src = '#pragma phaserTemplate(shaderName)\nprecision highp float;\nuniform float u;\n#pragma phaserTemplate(fragmentHeader)\nvoid main(){}';
    expect(prepareFragment(src, 'filter')).toBe(src);
  });
});

describe('uniforms', () => {
  const src = 'uniform float uA, uB; // uC\n/* uniform float uD; */ uniform highp vec2 uE;\nuniform sampler2D tex[2];';
  it('parses declarations, ignoring comments', () => {
    expect([...declaredUniforms(src)].sort()).toEqual(['tex', 'uA', 'uB', 'uE']);
  });
  it('flags undeclared names but not builtins', () => {
    expect(unknownUniforms(src, ['uA', 'uTime', 'uPointer', 'uAmout'])).toEqual(['uAmout']);
  });
});

it('pointerUv flips y', () => {
  expect(pointerUv(320, 180, 1280, 720)).toEqual([0.25, 0.75]);
});
