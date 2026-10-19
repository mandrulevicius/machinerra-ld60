import { describe, expect, it } from 'vitest';
import { Conversation, DONE, apply, freshTalk, holds, kindOf, validate, weigh, type Flags, type Script, type Talk } from './dialog';
import { QUESTS, SCRIPTS, unscripted } from './talk';

const quests = { q: { title: 'Q', kind: 'main' as const, steps: ['a', 'b'] } };

describe('conditions', () => {
  const t: Talk = { flags: { met: 1, coins: 3 }, quests: { q: 2, old: DONE } };
  it('read flags, facts and numbers', () => {
    expect(holds(t, {}, { has: 'met' })).toBe(true);
    expect(holds(t, {}, { has: 'nope' })).toBe(false);
    expect(holds(t, { gold: 1 }, { has: 'gold' })).toBe(true);
    expect(holds(t, {}, { not: 'nope' })).toBe(true);
    expect(holds(t, {}, { min: ['coins', 3] })).toBe(true);
    expect(holds(t, {}, { min: ['coins', 4] })).toBe(false);
    expect(holds(t, {}, undefined)).toBe(true);
  });
  it('a saved flag wins over a fact', () => {
    expect(holds({ flags: { scrap: 0 }, quests: {} }, { scrap: 500 }, { has: 'scrap' })).toBe(false);
  });
  it('read a quest by step, active, done or none; a list needs all', () => {
    expect(holds(t, {}, { quest: 'q', step: 2 })).toBe(true);
    expect(holds(t, {}, { quest: 'q', step: 1 })).toBe(false);
    expect(holds(t, {}, { quest: 'q' })).toBe(true);
    expect(holds(t, {}, { quest: 'old', step: 'done' })).toBe(true);
    expect(holds(t, {}, { quest: 'old', step: 'active' })).toBe(false);
    expect(holds(t, {}, { quest: 'new', step: 'none' })).toBe(true);
    expect(holds(t, {}, [{ has: 'met' }, { quest: 'q', step: 1 }])).toBe(false);
  });
});

describe('effects', () => {
  it('set, add and move quests without touching the original', () => {
    const t = freshTalk();
    const r = apply(t, [{ set: 'a' }, { set: 'b', to: 5 }, { add: 'n' }, { add: 'n', by: 2 }, { quest: 'q', step: 1 }]);
    expect(r.talk.flags).toEqual({ a: 1, b: 5, n: 3 });
    expect(r.talk.quests).toEqual({ q: 1 });
    expect(t).toEqual(freshTalk());
  });
  it('hand the scene what it must do, and report a quest only when it moves', () => {
    const r = apply({ flags: {}, quests: { q: 1 } }, [{ quest: 'q', step: 1 }, { quest: 'q', step: 'done' }, { give: { scrap: 5 } }, { open: 'station' }, { banner: 'Hi' }]);
    expect(r.out).toEqual([{ kind: 'quest', id: 'q', step: DONE }, { kind: 'give', reward: { scrap: 5 }  }, { kind: 'open', panel: 'station' }, { kind: 'banner', text: 'Hi' }]);
  });
});

const script: Script = {
  entry: [{ if: { has: 'hero' }, go: 'hero' }, { if: { not: 'seen.n.hello' }, go: 'hello' }, { go: 'idle' }],
  nodes: {
    hello: { say: ['Hello!', { t: 'Welcome.', act: 'wave' }], go: 'menu' },
    idle: { cycle: [['One.'], ['Two.'], ['Three.']], go: 'menu' },
    hero: { say: ['Hero!'], do: [{ set: 'cheered' }] },
    menu: {
      choices: [
        { text: 'Ask', do: [{ set: 'asked' }], go: 'answer' },
        { text: 'Secret', if: { has: 'asked' }, go: 'secret' },
        { text: 'Bye' },
      ],
    },
    answer: { say: ['It is so.'], go: 'menu' },
    secret: { say: ['Shh.'], do: [{ give: { scrap: 9 } }] },
  },
};
const open = (talk: Talk = freshTalk(), facts: Flags = {}) => new Conversation('n', script, talk, facts);

describe('a conversation', () => {
  it('starts at the first entry that holds, counting the talk', () => {
    const c = open();
    expect(c.node).toBe('hello');
    expect(c.talk.flags['talked.n']).toBe(1);
    expect(open({ flags: { hero: 1 }, quests: {} }).node).toBe('hero');
  });
  it('speaks its lines in turn, then offers the levers', () => {
    const c = open();
    expect([c.phase, c.line?.t, c.act]).toEqual(['line', 'Hello!', 'hop']);
    c.next();
    expect([c.phase, c.line?.t, c.act]).toEqual(['line', 'Welcome.', 'wave']);
    c.next();
    expect(c.phase).toBe('choose');
    expect(c.choices.map((x) => x.text)).toEqual(['Ask', 'Bye']); // Secret waits for the flag
  });
  it('runs a lever\'s effects, follows it, and the lever list changes with the flags', () => {
    const c = open();
    c.next(); c.next();
    c.pick(0);
    expect([c.phase, c.line?.t, c.talk.flags.asked]).toEqual(['line', 'It is so.', 1]);
    c.next();
    expect(c.choices.map((x) => x.text)).toEqual(['Ask', 'Secret', 'Bye']);
    c.pick(1);
    c.next();
    expect(c.phase).toBe('end');
    expect(c.out).toEqual([{ kind: 'give', reward: { scrap: 9 } }]);
  });
  it('ends on a lever with no go, and when leaving mid-line', () => {
    const c = open();
    c.next(); c.next();
    c.pick(1);
    expect(c.phase).toBe('end');
    const d = open();
    d.leave();
    expect(d.phase).toBe('end');
  });
  it('runs a node\'s own effects on entering it', () => {
    const c = open({ flags: { hero: 1 }, quests: {} });
    expect(c.talk.flags.cheered).toBe(1);
    c.next();
    expect(c.phase).toBe('end');
  });
  it('moves through a cycle one set of lines per visit, and wraps', () => {
    let talk = open().talk;
    const said: string[] = [];
    for (let i = 0; i < 4; i++) {
      const c = open(talk);
      said.push(c.line!.t);
      talk = c.talk;
    }
    expect(said).toEqual(['One.', 'Two.', 'Three.', 'One.']);
  });
  it('ignores pick and next out of turn, and a loop of empty nodes ends', () => {
    const c = open();
    c.pick(0);
    expect(c.node).toBe('hello');
    const loop: Script = { entry: [{ go: 'a' }], nodes: { a: { go: 'b' }, b: { go: 'a' } } };
    expect(new Conversation('x', loop, freshTalk()).phase).toBe('end');
  });
});

describe('validate', () => {
  it('finds dangling targets, a missing fallback and bad quests', () => {
    const bad: Script = {
      entry: [{ if: { has: 'x' }, go: 'a' }, { if: { has: 'y' }, go: 'nowhere' }],
      nodes: { a: { say: ['hi'], go: 'gone', do: [{ quest: 'q', step: 3 }, { quest: 'zzz', step: 1 }], choices: [{ text: 't', go: 'missing' }] }, b: {} },
    };
    const errs = validate('bad', bad, quests).join('\n');
    expect(errs).toContain('unknown node "nowhere"');
    expect(errs).toContain('no entry without an "if"');
    expect(errs).toContain('bad.a: goes to unknown node "gone"');
    expect(errs).toContain('lever 0 goes to unknown node "missing"');
    expect(errs).toContain('quest "q" has no step 3');
    expect(errs).toContain('unknown quest "zzz"');
    expect(errs).toContain('bad.b: says nothing');
  });
});

describe('the shipped scripts', () => {
  it('are sound, and every NPC has one', () => {
    for (const [id, s] of Object.entries(SCRIPTS)) expect(validate(id, s, QUESTS), id).toEqual([]);
    expect(unscripted()).toEqual([]);
  });

  /** Talk to `npc` and pull the levers named in `picks` (in order), reading every line; returns the talk and what came out. */
  function talkTo(npc: string, talk: Talk, facts: Flags, ...picks: string[]) {
    const c = new Conversation(npc, SCRIPTS[npc], talk, facts);
    const said: string[] = [];
    let n = 0;
    while (c.phase !== 'end' && n++ < 80) {
      if (c.phase === 'line') {
        said.push(c.line!.t);
        c.next();
      } else {
        const want = picks.shift();
        const i = c.choices.findIndex((x) => x.text === want);
        c.pick(i < 0 ? c.choices.length - 1 : i); // no named lever: the last, the way out
      }
    }
    return { talk: c.talk, out: c.out, said };
  }



  it('take what a hand-in step asks for when it is done', () => {
    const t = talkTo('trader', freshTalk(), { built: 1 }, 'Any work for me?').talk;
    const done = talkTo('trader', t, { built: 1, 'goal.trader': 3 });
    expect(done.out).toContainEqual({ kind: 'give', reward: { perk: 'snacks', take: { parts: 3 } } });
    expect(done.talk.quests.trader).toBe(2);
  });

});

describe('lever weights (P33)', () => {
  const none = freshTalk();
  const script: Script = {
    entry: [{ go: 'menu' }],
    nodes: {
      menu: { choices: [] },
      start: { say: ['Go.'], do: [{ quest: 'q', step: 1 }] },
      see: { say: ['Heresy.'], go: 'menu' },
    },
  };
  const w = (c: Parameters<typeof weigh>[2], t: Talk = none) => weigh(script, 'o', c, t);
  it('a lever that moves a quest, hands something over or opens the story panel is the story', () => {
    expect(w({ text: 'Listen', do: [{ quest: 'q', step: 1 }], go: 'menu' })).toBe('story');
    expect(w({ text: 'Take', do: [{ give: { scrap: 5 } }] })).toBe('story');
    expect(w({ text: 'Lots', do: [{ open: 'house' }] })).toBe('story');
    expect(w({ text: 'Shop', do: [{ open: 'station' }] })).toBe('side');
  });
  it('a lever leading to a node that moves a quest on is the story too', () => {
    expect(w({ text: 'Ready', go: 'start' })).toBe('story');
  });
  it('a lever that only ends the talk is a leave', () => {
    expect(w({ text: 'Bye' })).toBe('leave');
    expect(w({ text: 'Bye', go: 'end' })).toBe('leave');
  });
  it('a question is a side lever until its answer has been heard, then it is heard', () => {
    const q = { text: 'What do you see?', go: 'see' };
    expect(w(q)).toBe('side');
    expect(w(q, { flags: { 'seen.o.see': 1 }, quests: {} })).toBe('heard');
    expect(w(q, { flags: { 'seen.p.see': 1 }, quests: {} })).toBe('side');
  });
  it('a lever with effects is never quieted by having been heard', () => {
    expect(w({ text: 'Flag it', do: [{ set: 'f' }], go: 'see' }, { flags: { 'seen.o.see': 1 }, quests: {} })).toBe('side');
  });
  it('a conversation weighs the levers it shows, in order', () => {
    const c = new Conversation('highPriest', SCRIPTS.highPriest, freshTalk());
    for (let i = 0; i < 6 && c.phase === 'line'; i++) c.next();
    expect(c.phase).toBe('choose');
    expect(c.weights).toEqual(['story', 'side', 'leave']);
    c.pick(1);
    for (let i = 0; i < 6 && c.phase === 'line'; i++) c.next();
    expect(c.weights).toEqual(['story', 'heard', 'leave']);
  });
});

describe('lever kinds', () => {
  const script: Script = {
    entry: [{ go: 'menu' }],
    nodes: {
      menu: { choices: [] },
      start: { say: ['Go.'], do: [{ quest: 'q', step: 1 }] },
      shop: { do: [{ open: 'station' }] },
      see: { say: ['Heresy.'], go: 'menu' },
    },
  };
  const k = (c: Parameters<typeof kindOf>[1]) => kindOf(script, c);
  it('a quest lever moves a quest, hands something over, opens a story panel or asks after an active quest', () => {
    expect(k({ text: 'Ready', go: 'start' })).toBe('quest');
    expect(k({ text: 'Take', do: [{ give: { scrap: 5 } }] })).toBe('quest');
    expect(k({ text: 'Lots', do: [{ open: 'house' }] })).toBe('quest');
    expect(k({ text: 'About it', if: { quest: 'q', step: 1 }, go: 'see' })).toBe('quest');
    expect(k({ text: 'Any work?', if: { quest: 'q', step: 'none' }, go: 'see' })).toBe('talk');
  });
  it('an action lever opens a panel, by itself or through its node', () => {
    expect(k({ text: 'Shop', do: [{ open: 'station' }] })).toBe('action');
    expect(k({ text: 'Shop', go: 'shop' })).toBe('action');
    expect(k({ text: 'Hear', do: [{ banner: 'Hi' }] })).toBe('action');
  });
  it('a talk lever leads on; an exit leaves, even when it only sets a flag', () => {
    expect(k({ text: 'What?', go: 'see' })).toBe('talk');
    expect(k({ text: 'Bye' })).toBe('exit');
    expect(k({ text: 'Bye', do: [{ set: 'f' }], go: 'end' })).toBe('exit');
  });
  it('a conversation lists the exits last', () => {
    const c = new Conversation('highPriest', SCRIPTS.highPriest, freshTalk());
    for (let i = 0; i < 6 && c.phase === 'line'; i++) c.next();
    expect(c.kinds).toEqual(['quest', 'talk', 'exit']);
  });
});
