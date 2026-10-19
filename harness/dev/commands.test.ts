import { afterEach, describe, expect, it } from 'vitest';
import { command, commands, complete, helpText, parseLine, runLine, setGameGroup } from './commands';

const off: (() => void)[] = [];
const add = (...a: Parameters<typeof command>) => off.push(command(...a));
afterEach(() => off.splice(0).forEach((f) => f()));

describe('parseLine', () => {
  it('splits on spaces and keeps quoted words together', () => {
    expect(parseLine('  goto   Play ')).toEqual(['goto', 'Play']);
    expect(parseLine(`say "hi there" 'a b' c`)).toEqual(['say', 'hi there', 'a b', 'c']);
    expect(parseLine('')).toEqual([]);
  });
});

describe('runLine', () => {
  it('runs a command with its arguments and shows the result', async () => {
    add('t-echo', (a) => a.join('+'));
    add('t-none', () => undefined);
    add('t-obj', () => ({ n: 1 }));
    add('t-async', async () => 'later');
    expect(await runLine('t-echo a "b c"')).toEqual({ ok: true, text: 'a+b c' });
    expect((await runLine('t-none')).text).toBe('ok');
    expect((await runLine('t-obj')).text).toBe('{\n  "n": 1\n}');
    expect((await runLine('t-async')).text).toBe('later');
  });

  it('reports unknown commands and throws as errors, never throwing itself', async () => {
    add('t-boom', () => { throw new Error('nope'); });
    expect(await runLine('t-missing')).toMatchObject({ ok: false, text: expect.stringContaining('unknown command "t-missing"') });
    expect(await runLine('t-boom')).toEqual({ ok: false, text: 'error: nope' });
    expect(await runLine('   ')).toEqual({ ok: true, text: '' });
  });

  it('turns "> text" into a report note', async () => {
    let got: string[] = [];
    add('report', (a) => { got = a; return 'saved'; }, '', { group: 'dev' });
    expect((await runLine('>  it sticks to the wall')).text).toBe('saved');
    expect(got).toEqual(['it sticks to the wall']);
  });
});

describe('registry', () => {
  it('replaces a name, and the returned function removes only its own registration', () => {
    const a = command('t-x', () => 1, 'first');
    command('t-x', () => 2, 'second');
    a();
    expect(commands().filter((c) => c.name === 't-x').map((c) => c.help)).toEqual(['second']);
    off.push(command('t-x', () => 3));
    expect(() => command('bad name', () => 0)).toThrow();
    expect(() => command('>x', () => 0)).toThrow();
    expect(() => command('a.b', () => 0)).toThrow();
    expect(() => command('ok', () => 0, '', { group: 'bad.group' })).toThrow();
  });
});

describe('groups', () => {
  it('puts a command in the game group by default, or in the one given, and accepts the old args form', () => {
    setGameGroup('t-game');
    add('t-a', () => 0, 'help a', () => ['x']);
    add('t-b', () => 0, 'help b', { group: 't-units', args: () => ['y'] });
    expect(commands().filter((c) => c.name.startsWith('t-')).map((c) => [c.name, c.group, c.args?.()])).toEqual([
      ['t-a', 't-game', ['x']],
      ['t-b', 't-units', ['y']],
    ]);
  });

  it('runs a clashing bare name only qualified, and says how', async () => {
    add('t-spawn', () => 'one', '', { group: 't-g1' });
    add('t-spawn', () => 'two', '', { group: 't-g2' });
    expect(await runLine('t-spawn')).toEqual({ ok: false, text: 'error: "t-spawn" is in several groups; use t-g1.t-spawn or t-g2.t-spawn' });
    expect(await runLine('t-g1.t-spawn')).toEqual({ ok: true, text: 'one' });
    expect(await runLine('t-g2.t-spawn')).toEqual({ ok: true, text: 'two' });
    expect(await runLine('t-g3.t-spawn')).toMatchObject({ ok: false });
  });

  it('removes only its own registration when the same name is in two groups', () => {
    const a = command('t-same', () => 1, '', { group: 't-g1' });
    command('t-same', () => 2, '', { group: 't-g2' });
    a();
    expect(commands().filter((c) => c.name === 't-same').map((c) => c.group)).toEqual(['t-g2']);
    off.push(command('t-same', () => 2, '', { group: 't-g2' }));
  });
});

describe('help', () => {
  const setup = () => {
    add('t-spawn', () => 0, 't-spawn <kind>: a unit', { group: 't-units' });
    add('t-warp', () => 0, 't-warp x y: move', { group: 't-units' });
    add('t-res', () => 0, 't-res [n]: set resources', { group: 't-world' });
    add('t-dev', () => 0, 't-dev: a built-in', { group: 'dev' });
    add('t-time', () => 0, 't-time <phase>: jump', { group: 't-time' });
  };
  const lines = (t: string) => t.split('\n').filter((l) => /^(t-|dev:)/.test(l));

  it('lists one line per group, game groups before the built-ins', () => {
    setup();
    const out = helpText();
    expect(lines(out)).toEqual(['t-time: t-time', 't-units: t-spawn t-warp', 't-world: t-res', 'dev: t-dev']);
    expect(out.endsWith('help <group> or help <command> shows usage')).toBe(true);
  });

  it('shows a clashing name qualified in the list', () => {
    setup();
    add('t-spawn', () => 0, '', { group: 't-world' });
    expect(lines(helpText())).toContain('t-units: t-units.t-spawn t-warp');
    expect(lines(helpText())).toContain('t-world: t-res t-world.t-spawn');
  });

  it('shows the usage of a group, of a command, and of both when a name is both', () => {
    setup();
    expect(helpText('t-units')).toBe('t-spawn <kind>: a unit\nt-warp x y: move');
    expect(helpText('t-warp')).toBe('t-warp x y: move');
    expect(helpText('t-units.t-warp')).toBe('t-warp x y: move');
    expect(helpText('t-time')).toBe('t-time <phase>: jump'); // group and command of one name: shown once
    add('t-units', () => 0, 't-units: a command named like a group', { group: 't-world' });
    expect(helpText('t-units')).toBe('t-spawn <kind>: a unit\nt-warp x y: move\n\nt-units: a command named like a group');
  });

  it('throws for an unknown topic and for an ambiguous command', async () => {
    setup();
    add('t-spawn', () => 0, '', { group: 't-world' });
    expect(() => helpText('t-nope')).toThrow('no command or group "t-nope"');
    expect(() => helpText('t-spawn')).toThrow('several groups');
    add('help', (a) => helpText(a[0]), '', { group: 'dev' });
    expect(await runLine('help t-nope')).toMatchObject({ ok: false, text: expect.stringContaining('error: no command or group') });
    expect(await runLine('help t-warp')).toEqual({ ok: true, text: 't-warp x y: move' });
  });
});

describe('complete', () => {
  it('completes a command name, to the common prefix when several match', () => {
    add('t-alpha', () => 0);
    add('t-alps', () => 0);
    add('t-beta', () => 0);
    expect(complete('t-be')).toEqual({ line: 't-beta ', options: ['t-beta'] });
    expect(complete('t-al')).toEqual({ line: 't-alp', options: ['t-alpha', 't-alps'] });
    expect(complete('t-alp')).toEqual({ line: 't-alp', options: ['t-alpha', 't-alps'] });
    expect(complete('zzz')).toEqual({ line: 'zzz', options: [] });
  });

  it('completes the first argument from the command\'s candidates', () => {
    add('t-go', () => 0, '', () => ['Menu', 'Play', 'Playground']);
    expect(complete('t-go M')).toEqual({ line: 't-go Menu ', options: ['Menu'] });
    expect(complete('t-go Pl')).toEqual({ line: 't-go Play', options: ['Play', 'Playground'] });
    expect(complete('t-go Play x')).toEqual({ line: 't-go Play x', options: [] });
  });

  it('completes across groups, qualifies only clashing names, and completes `group.`', () => {
    add('t-spawn', () => 0, '', { group: 't-g1' });
    add('t-spawn', () => 0, '', { group: 't-g2' });
    add('t-warp', () => 0, '', { group: 't-g1' });
    expect(complete('t-wa')).toEqual({ line: 't-warp ', options: ['t-warp'] });
    expect(complete('t-sp')).toEqual({ line: 't-sp', options: [] });
    expect(complete('t-g1.')).toEqual({ line: 't-g1.t-', options: ['t-g1.t-spawn', 't-g1.t-warp'] });
    expect(complete('t-g2.t-s')).toEqual({ line: 't-g2.t-spawn ', options: ['t-g2.t-spawn'] });
  });

  it('completes the first argument of a command given qualified', () => {
    add('t-go', () => 0, '', { group: 't-g1', args: () => ['Menu'] });
    expect(complete('t-g1.t-go M')).toEqual({ line: 't-g1.t-go Menu ', options: ['Menu'] });
  });
});
