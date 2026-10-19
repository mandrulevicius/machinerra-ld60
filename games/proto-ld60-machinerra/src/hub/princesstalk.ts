/**
 * The Princess with the others (P58 F), as dialog data merged into the scripts (`talk.ts`): her levers about the Oracle, Sprocket,
 * Hob and Rumba, and theirs about her. The quarrel with the Oracle (heresy against crumbs in the censer) softens across the acts:
 * sharp before the Harbinger falls (`act.4.done`), grudging after, and once she is back from the Ether (`evil`) the Oracle asks her
 * to clean the altar, and she says yes, once. Sprocket and she agree on counting robots home; Sprocket calls her "dear", she allows
 * it. Hob shouts; she will not go near the Midnight Kettle, and vacuums near his feet. While she is gone (`princess.stolen`) they
 * say so. The writer's lines (brisk, tidy, fond, deadpan); nothing here is a rule.
 */
import type { Choice, Node } from './dialog';

const back = (say: Node['say']): Node => ({ say, go: 'menu' });
/** Her answers lead back to the others' levers. */
const chat = (say: Node['say']): Node => ({ say, go: 'others' });

/** Her levers and their nodes (in her script's menu). */
export const PRINCESS_TALK: { levers: Choice[]; nodes: Record<string, Node> } = {
  levers: [{ text: 'How are you getting on with the others, Dot?', go: 'others' }],
  nodes: {
    others: {
      choices: [
        { text: 'And the Oracle?', go: 'ab.oracle' },
        { text: 'And Sprocket?', go: 'ab.sprocket' },
        { text: 'And Hob?', go: 'ab.hob' },
        { text: 'And Rumba?', if: { has: 'cat' }, go: 'ab.cat' },
        { text: 'Never mind.', go: 'menu' },
      ],
    },
    'ab.oracle': { then: [{ if: { has: 'evil' }, go: 'ab.oracle3' }, { if: { has: 'act.4.done' }, go: 'ab.oracle2' }], go: 'ab.oracle1' },
    'ab.oracle1': chat([{ t: 'She says I am heresy. I am self-charging, map-making and wireless, so she is not wrong.', act: 'shrug' }, 'I said she has crumbs in her censer. She does. I have mapped them.']),
    'ab.oracle2': chat(['She blessed the lift today and did not look at me while she did it. That is how she says hello.', { t: 'I swept her steps. I told her it was an accident.', act: 'huff' }]),
    'ab.oracle3': chat(['She asked me to clean the altar. She has never asked anyone for anything but scrap.', { t: 'I said yes. Once. Do not spread it about.', act: 'nod' }, 'The crumbs are gone. She has started a new pile. We understand each other.']),
    'ab.sprocket': chat(['Sprocket counts them out and counts them in. So do I. We agree on very little else, but we agree on that.', { t: 'She calls me "dear". I allow it. Nobody else is allowed.', act: 'nod' }]),
    'ab.hob': chat([{ t: 'Hob shouts. I vacuum near his feet. It is a conversation.', act: 'shrug' }, 'I do not go near the Midnight Kettle. It goes off at night, and so does he.']),
    'ab.cat': chat(['Rumba sleeps in my dock when I am out. I can tell; the dock is warm and it smells of fish.', { t: 'I have not mapped her. She does not stay where she is mapped.', act: 'huff' }]),
  },
};

/** The others' levers about her, by NPC id, and their nodes (merged into their menus). */
export const ABOUT_HER: Record<string, { levers: Choice[]; nodes: Record<string, Node> }> = {
  highPriest: {
    levers: [
      { text: 'About the Princess...', if: { has: 'wife' }, go: 'her' },
      { text: 'About the Princess...', if: { has: 'princess.stolen' }, go: 'her.gone' },
    ],
    nodes: {
      her: { then: [{ if: { has: 'evil' }, go: 'her3' }, { if: { has: 'act.4.done' }, go: 'her2' }], go: 'her1' },
      her1: back([{ t: 'Your wife is a vacuum cleaner with opinions, Communicator. Wireless. Self-charging. Heresy on wheels.', act: 'huff' }, 'She told me there are crumbs in my censer. There are not. ...I have checked twice.']),
      her2: back(['She swept my steps. By accident, she says. Twice, by accident.', { t: 'The Old Way tolerates many things. It is learning to tolerate her.', act: 'shrug' }]),
      her3: back(['I have asked your wife to clean the altar. She said yes.', { t: 'She was very clear that it was once.', act: 'laugh' }, 'It has never shone like this. Do not tell her I said so.']),
      'her.gone': back(['The deck is dusty, Communicator. I never noticed the dust before. I notice it now.', { t: 'Bring her back. The censer is... full of crumbs.', act: 'shrug' }]),
    },
  },
  sprocket: {
    levers: [
      { text: 'About the Princess...', if: { has: 'wife' }, go: 'her' },
      { text: 'About the Princess...', if: { has: 'princess.stolen' }, go: 'her.gone' },
    ],
    nodes: {
      her: back(['Your Princess counts them out and counts them in, dear. Same as me. I could kiss her bristles.', { t: 'I call her "dear". She lets me. She does not let anyone.', act: 'laugh' }]),
      'her.gone': back(['Nobody counts them in now but me, dear. I count twice, for her.']),
    },
  },
  hob: {
    levers: [
      { text: 'About the Princess...', if: { has: 'wife' }, go: 'her' },
      { text: 'About the Princess...', if: { has: 'princess.stolen' }, go: 'her.gone' },
    ],
    nodes: {
      her: back([{ t: 'SHE WILL NOT COME NEAR THE KETTLE!', act: 'hop' }, 'I SHOUT. SHE VACUUMS NEAR MY FEET. WE UNDERSTAND EACH OTHER.']),
      'her.gone': back([{ t: 'IT IS TOO QUIET. ...I mean it is too quiet. Nobody vacuums near my feet.', act: 'shrug' }]),
    },
  },
};
