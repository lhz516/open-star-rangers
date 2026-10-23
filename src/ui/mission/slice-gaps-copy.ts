/**
 * The page copy of the slice gaps this build shows (docs/plan/p3/01/spec.md: 缺省清单, 标注规则; docs/plan/p3/04/spec.md:
 * 缺省与标注, AC-19; docs/plan/p3/10/spec.md: 缺省与标注). Each G item's text lives here only, keyed by its G ID, so an
 * audit finds it by ID; the pages only place it. Project text in the app's language, not original text.
 */
import type { MessageIdentity } from '../../core/world/world-state.ts';

/**
 * The G items this build marks in its pages; G-06 only for restart and return, whose results page belongs to P3-11.
 * G-03 has no page here: its message summaries are for the cockpit display P3-13 draws.
 */
export type SliceGapId =
  | 'G-01' | 'G-02/1' | 'G-02/2' | 'G-02/3' | 'G-02/4' | 'G-02/5' | 'G-02/6' | 'G-03' | 'G-04' | 'G-05' | 'G-06' | 'G-07' | 'G-08' | 'G-09' | 'G-10';

export interface SliceGapCopy {
  /** What is missing or replaced, short enough for a status bar. */
  readonly title: string;
  /** What the project shows instead. */
  readonly text: string;
}

const gap = (title: string, text: string): SliceGapCopy => Object.freeze({ title, text });

export const SLICE_GAPS: Readonly<Record<SliceGapId, SliceGapCopy>> = Object.freeze({
  'G-01': gap('No music', 'This build plays no music.'),
  'G-02/1': gap(
    'Introduction cut-scene missing',
    'The original plays an introduction cut-scene before the first mission. This build shows a project placeholder instead, '
      + 'at every start and restart. It ends after 3 seconds of visible time, a project choice rather than the original length, '
      + 'or when you skip it.',
  ),
  'G-02/2': gap(
    'Departure cut-scene missing',
    'The original plays a departure cut-scene, one variant without a wingman and another with one. This build shows a project '
      + 'placeholder instead, naming the variant of this run, and holds the mission at tick 0 until it ends: no time passes for '
      + 'the missing cut-scene, and skipping it changes no rule. It ends after 3 seconds of visible time or when you skip it.',
  ),
  'G-02/3': gap(
    'Docking cut-scene missing',
    'The original plays a docking cut-scene when you dock at a base. This build shows a project placeholder instead and holds '
      + 'the mission after the tick you docked in until it ends: no time passes for the missing cut-scene, and skipping it skips '
      + 'no rule; the base service then runs in mission time. It ends after 3 seconds of visible time or when you skip it.',
  ),
  'G-02/4': gap(
    'Launch cut-scene missing',
    'The original plays a launch cut-scene when you leave a base. This build shows a project placeholder instead and holds the '
      + 'mission after the tick you launched in until it ends: no time passes for the missing cut-scene, and skipping it skips no '
      + 'rule. It ends after 3 seconds of visible time or when you skip it.',
  ),
  'G-02/5': gap(
    'Rescue cut-scene missing (destroyed)',
    'The original plays a rescue cut-scene after your craft is destroyed. This build shows a project placeholder instead and '
      + 'holds the mission after the rescue tick until it ends: the rescue already happened by the rules. It ends after 3 '
      + 'seconds of visible time or when you skip it.',
  ),
  'G-02/6': gap(
    'Rescue cut-scene missing (out of energy)',
    'The original plays a rescue cut-scene after your craft runs out of energy. This build shows a project placeholder instead '
      + 'and holds the mission after the rescue tick until it ends: the rescue already happened by the rules. It ends after 3 '
      + 'seconds of visible time or when you skip it.',
  ),
  'G-03': gap(
    'Communications portraits and animations missing',
    'The original shows each radio message as a speaking portrait animation with voice. This build keeps what those messages '
      + 'do in the rules (which message is chosen, when it shows and ends, and what follows it) and describes each one in project '
      + 'words instead of the original picture, voice and text. The cockpit display that shows them arrives with P3-13.',
  ),
  'G-04': gap(
    'Original briefing and wingman pages missing',
    'This project start page replaces the original briefing, wingman files and wingman selection page. It keeps the objectives, '
      + 'limits and wingman choice the mission needs, as project text; the original briefing text and portraits are not shown.',
  ),
  'G-05': gap(
    'Original base interior screen missing',
    'The original shows its own base interior screen. This project page lists the base\'s service items in their service order '
      + 'with each item\'s state, the selection and the readings the rules give. Item names are project names for the subsystem '
      + 'each item services, Likely from how the game uses those subsystems; an item whose subsystem is unknown shows its number. '
      + 'The original pictures and text are not shown, and no countdown is shown, as the page has no reading of the service timing.',
  ),
  'G-06': gap(
    'Original campaign restart not reproduced',
    'Restart begins a new instance of this mission at its introduction, with the same content and difficulty and a newly drawn '
      + 'seed; only the wingman choice carries over. It does not reproduce the campaign state the original keeps when it restarts '
      + 'a mission, and there is no results page yet.',
  ),
  'G-07': gap(
    'Original menus and campaign settings missing',
    'Project pages replace the original main menu, options and campaign settings: the main menu\'s mission entry, the mission '
      + 'start page and the pausing mission menu. Difficulty is fixed at raw value 19; there is no difficulty setting.',
  ),
  'G-08': gap(
    'Additional cockpit views missing',
    'This build provides only the forward cockpit view. The original\'s other views, including cursor and keypad view aliases, '
      + 'are not implemented; P4 is responsible for them.',
  ),
  'G-09': gap(
    'Autopilot missing',
    'This build does not implement the original autopilot and provides no autopilot command; P4 is responsible for implementing it.',
  ),
  'G-10': gap(
    'In-flight sensitivity switching missing',
    'Control sensitivity is fixed at Medium in this build; in-flight sensitivity switching is not implemented and is assigned to P4.',
  ),
});

/**
 * G-04: the objectives and limits the start page keeps, summarized in project words from the confirmed code facts, not
 * the original briefing. Sources (the page names them too):
 * - success and its waiting period: ../../../docs/original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104
 * - loss, rescue and failure: ../../../docs/original/formats/executable.md#mission-failure-player-loss-and-rescue-p3-0105
 * - normal-play reachability: ../../../docs/original/behavior/B-003-campaign-flow.md#成功条件与本次观察的对应p3-0104 and
 *   ../../../docs/original/behavior/B-005-campaign-rescue.md#所选任务的失败路径高概率
 * P3-11 reviews this text when it implements the rules; the page decides no result.
 */
export const MISSION_OBJECTIVES = Object.freeze({
  gap: 'G-04' satisfies SliceGapId,
  title: 'Objectives and limits (project text)',
  objective:
    'Objective: the mission succeeds once every enemy craft it schedules, including those it brings in later, has been '
    + 'destroyed or has left the mission area. The result then follows after a waiting period, and only while you are not in '
    + 'warp; destroying the last enemy does not end the mission at once.',
  limits:
    'Limits: losing your craft, by destruction or by running out of energy, brings a rescue the first two times in one '
    + 'attempt, and the mission continues; the third loss in the same attempt fails the mission. A loss after the last enemy '
    + 'is gone neither rescues nor fails.',
  status: 'This build does not implement these rules yet, so nothing here decides success or failure.',
  sources: Object.freeze([
    'Code evidence, Confirmed: docs/original/formats/executable.md, sections "Mission result, success path and campaign '
      + 'restart (P3-01/04)" and "Mission failure, player loss and rescue (P3-01/05)".',
    'Reaching these in normal play, Likely: docs/original/behavior/B-003-campaign-flow.md and '
      + 'docs/original/behavior/B-005-campaign-rescue.md.',
  ]),
});

/** What a radio message tells in the rules, by its identity (G-03). */
export type MessageSummaryKind =
  | 'docking-reply' | 'base-status-clear' | 'base-status-threat' | 'base-enemy-near' | 'base-thanks'
  | 'craft-status-clear' | 'craft-status-threat' | 'craft-thanks'
  | 'friendly-under-attack' | 'friendly-under-attack-follow-up' | 'friendly-destroyed'
  | 'player-hit-friendly' | 'player-destroyed-friendly' | 'wingman-lost'
  | 'wingman-low-hull' | 'wingman-kill' | 'wingman-kill-or-other' | 'wingman-enemy-appears' | 'wingman-enemy-on-tail'
  | 'wingman-friendly-lost' | 'unidentified';

/**
 * G-03: each radio message's project summary, by the rule that queues it, so the replies, the statuses and the reports
 * stay distinct without the original portraits, voice and text. The original has no refusal message: a docking request
 * that fails gets no reply, and its three cancellations have no feedback (docs/plan/p3/10/spec.md, D-01 item 2 ⑤), so
 * none is summarized. P3-13 shows these through the app's assembly; P3-08 identifies the wingman lines it adds.
 * Sources (Confirmed, code and data): ../../../docs/original/formats/executable.md, "RQ1. Base and friendly replies",
 * "RX1. Helpers" to "RX3" and the messages table after them.
 */
export const MESSAGE_SUMMARIES = Object.freeze({
  gap: 'G-03' satisfies SliceGapId,
  title: 'Radio message (project summary)',
  text: Object.freeze({
    'docking-reply': 'The base answers your docking request: docking follows after a countdown if the docking checks still pass.',
    'base-status-clear': 'Status reply: the base reports no threat.',
    'base-status-threat': 'Status reply: the base reports that it is threatened.',
    'base-enemy-near': 'The base reports enemy craft moving close to it.',
    'base-thanks': 'The base thanks you: the enemies that threatened it are gone.',
    'craft-status-clear': 'Status reply: the friendly craft reports no threat.',
    'craft-status-threat': 'Status reply: the friendly craft reports that it is threatened.',
    'craft-thanks': 'The friendly craft thanks you: the enemies that threatened it are gone.',
    'friendly-under-attack': 'A friendly reports that it is under attack.',
    'friendly-under-attack-follow-up': 'A further call about the friendly under attack.',
    'friendly-destroyed': 'A friendly has been destroyed.',
    'player-hit-friendly': 'Warning: you hit a friendly.',
    'player-destroyed-friendly': 'Warning: you destroyed a friendly or your wingman.',
    'wingman-lost': 'Your wingman has been lost.',
    'wingman-low-hull': 'Your wingman reports heavy damage.',
    'wingman-kill': 'Your wingman reports destroying an enemy.',
    'wingman-kill-or-other': 'Your wingman reports destroying an enemy, or another wingman line this build does not identify yet.',
    'wingman-enemy-appears': 'Your wingman reports an enemy appearing nearby.',
    'wingman-enemy-on-tail': 'Your wingman warns of an enemy on your tail.',
    'wingman-friendly-lost': 'Your wingman reports a friendly lost nearby.',
    unidentified: 'A message this build does not identify yet.',
  } satisfies Record<MessageSummaryKind, string>),
});

/** Whether `index` lies in [first, first + count). */
const within = (index: number, first: number, count: number): boolean => index >= first && index < first + count;

/** The name lists that index the named messages: COMM TABL 2001 has 20 names and TABL 2011 19 (RX1, data). */
const NAMES_2001 = 20;
const NAMES_2011 = 19;

/**
 * The summary kind of a message: 20011 is a base speaking (RQ1, RX3, RX6), 20019 a friendly craft speaking (RQ1, RX2,
 * RX3), 20983 the direct list (RX2–RX3, the wingman-lost timer) whose named entries are a 2011 or 2001 position plus an
 * offset, and 20985 the wingman's lines by line type (RX1–RX3, RX5). 20985 indices 5 and 6 are also type 5's lines,
 * which P3-08 identifies.
 */
export function messageSummaryKind({ table, index }: MessageIdentity): MessageSummaryKind {
  switch (table) {
    case 20011:
      return ([
        'docking-reply', 'base-status-clear', 'base-enemy-near', 'base-thanks', 'base-status-threat',
      ] as const)[index] ?? 'unidentified';
    case 20019:
      if (index <= 2) return (['craft-status-clear', 'craft-status-threat', 'craft-thanks'] as const)[index] ?? 'unidentified';
      return within(index, 3, NAMES_2011) ? 'friendly-under-attack' : 'unidentified';
    case 20983:
      if (index <= 3) return index >= 0 ? 'friendly-under-attack-follow-up' : 'unidentified';
      if (index <= 6) return (['player-hit-friendly', 'player-destroyed-friendly', 'wingman-lost'] as const)[index - 4];
      if (within(index, 7, NAMES_2011) || within(index, 0x1a, NAMES_2001)) return 'friendly-under-attack';
      return within(index, 0x2e, NAMES_2011) || within(index, 0x41, NAMES_2001) ? 'friendly-destroyed' : 'unidentified';
    case 20985:
      if (index === 5 || index === 6) return 'wingman-kill-or-other';
      if (index === 7) return 'wingman-kill';
      if (index === 8 || index === 9) return 'wingman-enemy-appears';
      if (index === 0xa) return 'wingman-enemy-on-tail';
      if (index === 0x13) return 'wingman-low-hull';
      return within(index, 0x16, NAMES_2011) || within(index, 0x29, NAMES_2001) ? 'wingman-friendly-lost' : 'unidentified';
  }
}

/** A message's project summary text (G-03). */
export const messageSummary = (message: MessageIdentity): string => MESSAGE_SUMMARIES.text[messageSummaryKind(message)];

/** How the G-05 page shows a base key: wired to a rule command, a project control, or awaiting a later task. */
export type BaseKeyStatus = 'wired' | 'project' | 'later';

/**
 * G-05: the base page's words. Item names follow the subsystem each selector services, with the confidence of the
 * subsystem meanings (Likely, from their consumers): ../../../docs/original/formats/executable.md, "D6. Two-bit subsystem
 * fields", and ../../../docs/original/formats/hud.md, "TABL 10165 in the base service". Selectors whose subsystem is
 * unknown are named by number. The keys are the base context's bindings (docs/original/input/key-map.md, 基地).
 */
export const BASE_PAGE = Object.freeze({
  gap: 'G-05' satisfies SliceGapId,
  title: 'Base service',
  namesNote: 'Item names are project names (Likely), not the original screen\'s.',
  /** Project names by selector; any other selector is a single unknown subsystem field. */
  itemNames: Object.freeze({
    0: 'Power generator',
    1: 'Hull systems',
    2: 'Engines',
    3: 'Targeting computer',
    4: 'Shield generator',
    5: 'Missile mounts',
    7: 'Steering',
    8: 'Guns',
    0x21: 'Corner gauges (subsystems 15–18)',
    0x22: 'Displays, radar and communications (subsystems 10–14)',
  } satisfies Readonly<Record<number, string>>),
  unknownItem: (selector: number): string => `Subsystem ${selector} (unknown)`,
  state: (state: number): string => (state === 0 ? 'No service needed' : `Needs service (state ${state})`),
  columns: Object.freeze({ row: 'Row', item: 'Item', state: 'State', service: 'Service', selection: 'Selection' }),
  inService: 'Being serviced',
  selected: 'Selected',
  yes: 'Yes',
  no: 'No',
  noProgress: 'Service order: the top row is serviced first; a finished item moves to the bottom. No countdown is shown.',
  flags: Object.freeze({
    repairsComplete: 'Repairs complete',
    energyAndMissilesFull: 'Energy and missiles full',
    hullFull: 'Hull full',
  }),
  readings: Object.freeze({
    title: 'Readings',
    energy: 'Energy',
    hull: 'Hull',
    missiles: 'Missiles (selected mount)',
    unavailable: 'Not available',
  }),
  lastCommand: 'Last base command',
  noCommand: 'none yet',
  sendFailed: (operation: string): string => `Sending ${operation} failed.`,
  keyStatus: Object.freeze({ wired: 'available', project: 'project control', later: 'not in this build yet' } satisfies Record<BaseKeyStatus, string>),
  keys: Object.freeze([
    Object.freeze({ keys: 'Up, Down', status: 'wired', text: 'Move the selection.' }),
    Object.freeze({ keys: 'Enter', status: 'wired', text: 'Move the selected item to the top of the service order if it still needs service.' }),
    Object.freeze({ keys: 'L', status: 'wired', text: 'Launch.' }),
    Object.freeze({ keys: 'M', status: 'wired', text: 'Open the strategic map; M or Esc in the map closes it back into the base.' }),
    Object.freeze({ keys: 'P', status: 'project', text: 'Pause or resume.' }),
    Object.freeze({ keys: 'Esc', status: 'project', text: 'Mission menu, in place of the original options page (G-07).' }),
  ] satisfies readonly { readonly keys: string; readonly status: BaseKeyStatus; readonly text: string }[]),
});
