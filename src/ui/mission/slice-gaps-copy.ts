/**
 * The page copy of the slice gaps this build shows (docs/plan/p3/01/spec.md: 缺省清单, 标注规则; docs/plan/p3/04/spec.md:
 * 缺省与标注, AC-19; docs/plan/p3/10/spec.md: 缺省与标注; docs/plan/p3/11/spec.md: 缺省与标注, 结果页、重试与返回). Each G
 * item's text lives here only, keyed by its G ID, so an audit finds it by ID; the pages only place it. Project text in
 * the app's language, not original text: the result page's summary is the only imported text, resolved at run time.
 */
import type { EndingGap, MessageIdentity, PlayerLoss, ResultReason } from '../../core/world/world-state.ts';

/**
 * The G items this build marks in its pages. G-02/10 has no placeholder: medals are not decided, so the result page
 * discloses it. G-03's message summaries are drawn by the cockpit (P3-13) and shown on the base page.
 */
export type SliceGapId =
  | 'G-01' | 'G-02/1' | 'G-02/2' | 'G-02/3' | 'G-02/4' | 'G-02/5' | 'G-02/6' | 'G-02/7' | 'G-02/8' | 'G-02/9' | 'G-02/10'
  | 'G-03' | 'G-04' | 'G-05' | 'G-06' | 'G-07' | 'G-08' | 'G-09' | 'G-10';

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
    'Rescue cut-scenes missing (destroyed)',
    'After your craft is destroyed and its escape pod has drifted for a few seconds, the original plays a group of rescue '
      + 'cut-scenes, in which a rescue ship picks you up. This build shows one project placeholder for the whole group: '
      + 'skipping ends all of it at once, not clip by clip. The rescue ship exists only in those cut-scenes, so none appears '
      + 'in flight; the explosion, the escape pod and the wait are still part of the mission. The rescue has already happened '
      + 'by the rules: the mission holds after the rescue tick until the placeholder ends, no time passes for the missing '
      + 'cut-scenes, and it then continues with your craft repaired, near a base while one remains. It ends after 3 seconds '
      + 'of visible time or when you skip it.',
  ),
  'G-02/6': gap(
    'Rescue cut-scenes missing (out of energy)',
    'After your craft runs out of energy and its beacon has called for 15 seconds, the original plays a group of rescue '
      + 'cut-scenes, in which a rescue ship picks you up. This build shows one project placeholder for the whole group: '
      + 'skipping ends all of it at once, not clip by clip. The rescue ship exists only in those cut-scenes, so none appears '
      + 'in flight; the beacon wait is still part of the mission. The rescue has already happened by the rules: the mission '
      + 'holds after the rescue tick until the placeholder ends, no time passes for the missing cut-scenes, and it then '
      + 'continues with your craft repaired, near a base while one remains. It ends after 3 seconds of visible time or when '
      + 'you skip it.',
  ),
  'G-02/7': gap(
    'Mission failure cut-scenes missing',
    'When the mission fails, the original plays a group of failure cut-scenes whose first clip has two variants, for a craft '
      + 'destroyed or out of energy. This build shows one project placeholder for the group, naming that variant. The mission '
      + 'has already ended by the rules and nothing resumes; the results page follows. It ends after 3 seconds of visible time '
      + 'or when you skip it.',
  ),
  'G-02/8': gap(
    'Return cut-scene missing',
    'When the mission succeeds, the original plays a return cut-scene, one variant when your wingman is still flying at the '
      + 'end and another without. This build shows a project placeholder instead, naming the variant. The mission has already '
      + 'ended by the rules and nothing resumes. It ends after 3 seconds of visible time or when you skip it.',
  ),
  'G-02/9': gap(
    'Mission cut-scene missing',
    'After a success whose mission summary selects it, the original plays a cut-scene of this mission\'s own. This build '
      + 'shows a project placeholder instead, naming the row the summary selected. The mission has already ended by the rules '
      + 'and nothing resumes. It ends after 3 seconds of visible time or when you skip it.',
  ),
  'G-02/10': gap(
    'Medal cut-scene not shown',
    'The original can award a medal after a successful mission and play its ceremony. This build does not decide medals, so '
      + 'that cut-scene never shows; medals belong to P4.',
  ),
  'G-03': gap(
    'Communications portraits and animations missing',
    'The original shows each radio message as a speaking portrait animation with voice. This build keeps what those messages '
      + 'do in the rules (which message is chosen, when it shows and ends, and what follows it) and describes each one in project '
      + 'words instead of the original picture, voice and text: the cockpit\'s left display shows a short project label where '
      + 'the portrait would be, and the message line and the base page show the full project summary.',
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
    'Original results pages and campaign restart not reproduced',
    'When a mission ends, a project results page replaces the original statistics page, its choice to replay or go on, the '
      + 'high-score list, promotions and medals (P4). It shows the result, the rule that decided it, the rescues used and your '
      + 'kills as a project summary of this attempt, and after a success the mission summary from your imported data. Restart '
      + 'begins a new instance of this mission at its introduction, with the same content and difficulty and a newly drawn '
      + 'seed; only the wingman choice carries over. It does not reproduce the campaign state the original keeps when it '
      + 'restarts a mission.',
  ),
  'G-07': gap(
    'Original menus and campaign settings missing',
    'Project pages replace the original main menu, options and campaign settings: the main menu\'s mission entry, the mission '
      + 'start page and the pausing mission menu. Difficulty is fixed at raw value 19; there is no difficulty setting.',
  ),
  'G-08': gap(
    'Additional cockpit views missing',
    'This build provides only the forward cockpit view. F1 and its aliases (the Up arrow, and keypad 8 when it acts as Up) '
      + 'keep that view, and a press changes nothing now; in the original it also redraws the whole cockpit. Their Core '
      + 'rule arrives with the other views in P4. The original\'s other views, including cursor and keypad view aliases, '
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
 * the original briefing (reviewed by P3-11, which implements these rules). Sources (the page names them too):
 * - success, its waiting period and the state-5 failure race:
 *   ../../../docs/original/formats/executable.md#mission-result-success-path-and-campaign-restart-p3-0104 and
 *   ../../../docs/original/formats/executable.md#state-5-failure-in-normal-play-p3-1101
 * - loss, rescue and failure: ../../../docs/original/formats/executable.md#mission-failure-player-loss-and-rescue-p3-0105
 * - normal-play reachability: ../../../docs/original/behavior/B-003-campaign-flow.md#成功结局与手册p3-11 and
 *   ../../../docs/original/behavior/B-005-campaign-rescue.md#所选任务的失败路径高概率
 * The page decides no result; Core does.
 */
export const MISSION_OBJECTIVES = Object.freeze({
  gap: 'G-04' satisfies SliceGapId,
  title: 'Objectives and limits (project text)',
  objective:
    'Objective: the mission succeeds once every enemy craft it schedules, including those it brings in later, has been '
    + 'destroyed or has left the mission area. Destroying the last enemy does not end the mission at once: a waiting period '
    + 'of 5 seconds follows, extended while you are in warp, then the completion message and 15 more seconds before the '
    + 'result. In the rare case that a scheduled enemy group was due in the same moment the last enemy went, the mission '
    + 'fails at the end of that wait instead, as in the original.',
  limits:
    'Limits: losing your craft, by destruction or by running out of energy, brings a rescue the first two times in one '
    + 'attempt, and the mission continues; the third loss in the same attempt fails the mission. A loss once the waiting '
    + 'period has begun neither rescues nor fails. Losing bases or your wingman, and the time taken, do not fail the mission.',
  status: 'Core decides the result by these rules; this page only describes them.',
  sources: Object.freeze([
    'Code evidence, Confirmed: docs/original/formats/executable.md, sections "Mission result, success path and campaign '
      + 'restart (P3-01/04)", "State-5 failure in normal play (P3-11/01)" and "Mission failure, player loss and rescue (P3-01/05)".',
    'Reaching these in normal play, Likely: docs/original/behavior/B-003-campaign-flow.md and '
      + 'docs/original/behavior/B-005-campaign-rescue.md.',
  ]),
});

/** The G-02 items a placeholder page stands for; G-02/10 has none. */
export type PlaceholderGap = Exclude<Extract<SliceGapId, `G-02/${string}`>, 'G-02/10'>;

/** A G-02 placeholder page's name, by G ID, and the variant it names (P3-04 衔接占位; P3-11 缺省与标注). */
export const PLACEHOLDER_PAGES = Object.freeze({
  title: Object.freeze({
    'G-02/1': 'Introduction', 'G-02/2': 'Departure', 'G-02/3': 'Docking', 'G-02/4': 'Launch',
    'G-02/5': 'Rescue after destruction', 'G-02/6': 'Rescue after running out of energy', 'G-02/7': 'Mission failure',
    'G-02/8': 'Return', 'G-02/9': 'Mission cut-scene',
  } satisfies Record<PlaceholderGap, string>),
  departure: Object.freeze({ solo: 'Departure without a wingman.', wingman: 'Departure with a wingman.' }),
  /** G-02/7 by the loss; a failed settlement takes the destruction variant, as the original does. */
  failure: Object.freeze({
    destroyed: 'Variant: the destruction cut-scene. A failed settlement also takes this variant, as in the original, though '
      + 'no craft was lost.',
    energy: 'Variant: craft out of energy.',
  } satisfies Record<PlayerLoss, string>),
  /** G-02/8 by the wingman at the end. */
  return: Object.freeze({ solo: 'Variant: return without a wingman.', wingman: 'Variant: return with your wingman.' }),
  /** G-02/9 by the cut-scene row the summary selected. */
  missionCutscene: (row: number): string => `Variant: the mission's cut-scene row ${row}.`,
  sequence: (index: number, count: number): string => `Transition ${index + 1} of ${count} from the same tick.`,
  ending: (index: number, count: number): string => `Ending ${index + 1} of ${count}; the results page follows the last.`,
});

/** The variant line of an ending placeholder. */
export function endingVariant(item: EndingGap): string {
  switch (item.gap) {
    case 'G-02/7':
      return PLACEHOLDER_PAGES.failure[item.variant];
    case 'G-02/8':
      return PLACEHOLDER_PAGES.return[item.variant];
    case 'G-02/9':
      return PLACEHOLDER_PAGES.missionCutscene(item.row);
  }
}

/**
 * G-06: the project result page's words (docs/plan/p3/11/spec.md: 结果页、重试与返回, 勋章、统计与战役进度). The reasons are
 * the rule that latched the result; the counts are this attempt's project summary, not the original's statistics.
 */
export const RESULT_PAGE = Object.freeze({
  gap: 'G-06' satisfies SliceGapId,
  title: 'Mission result',
  outcome: Object.freeze({ success: 'Success', failure: 'Failure' }),
  /** A mark that repeats the outcome in text, so it does not rest on colour. */
  mark: Object.freeze({ success: '✓', failure: '✗' }),
  reasonLabel: 'Why',
  reason: Object.freeze({
    'all-clear': 'Every enemy craft the mission scheduled was destroyed or left the area, and the waiting period passed.',
    'third-loss': Object.freeze({
      destroyed: 'Third loss in this attempt: your craft was destroyed after both rescues had been used.',
      energy: 'Third loss in this attempt: your craft ran out of energy after both rescues had been used.',
    } satisfies Record<PlayerLoss, string>),
    'settlement-failed': 'When the waiting period began, a scheduled enemy group was still due: it arrived in the same moment '
      + 'the last enemy went. The original fails the mission in this rare case too.',
  }),
  attempt: Object.freeze({
    title: 'This attempt (project summary)',
    note: 'Counted by this build for this attempt only; not the original statistics page or its scoring.',
    rescues: 'Rescues used',
    rescuesOf: (used: number): string => `${used} of 2`,
    kills: 'Enemies you destroyed',
  }),
  summary: Object.freeze({
    title: 'Mission summary (from your imported data)',
    source: 'The original shows this summary on the first page of the next mission\'s departure; this build has no next '
      + 'mission, so it shows it here.',
    empty: 'The selected summary has no text: the imported mission gives this result an empty summary.',
    none: 'This result matched none of the mission\'s summary ranges, so there is no summary to show.',
    failure: 'A failed mission has no summary.',
    failed: 'The summary could not be read from the imported data:',
    mismatch: 'it belongs to another mission Asset than the one this run was started from.',
    outOfRange: (field: 'trigger' | 'range', index: number, count: number): string =>
      `its ${field} ${index} lies outside the mission's ${count} ${field === 'trigger' ? 'triggers' : 'ranges'}.`,
    content: 'the mission Asset of the bound package is missing or does not decode.',
  }),
  /** Shown while the session has not published the frozen result to this page. */
  pending: 'The result is not available yet.',
  restart: 'Restart mission',
  return: 'Return to main menu',
  disclosures: Object.freeze(['G-06', 'G-02/10'] as const satisfies readonly SliceGapId[]),
});

/** The result page's reason text. */
export const resultReason = (reason: ResultReason): string =>
  (reason.type === 'third-loss' ? RESULT_PAGE.reason['third-loss'][reason.loss] : RESULT_PAGE.reason[reason.type]);

/** What a radio message tells in the rules, by its identity (G-03). */
export type MessageSummaryKind =
  | 'docking-reply' | 'base-status-clear' | 'base-status-threat' | 'base-enemy-near' | 'base-thanks'
  | 'craft-status-clear' | 'craft-status-threat' | 'craft-thanks'
  | 'friendly-under-attack' | 'friendly-under-attack-follow-up' | 'friendly-destroyed'
  | 'player-hit-friendly' | 'player-destroyed-friendly' | 'wingman-lost'
  | 'wingman-low-hull' | 'wingman-kill' | 'wingman-enemy-appears' | 'wingman-enemy-on-tail' | 'wingman-friendly-lost'
  | 'wingman-order-unable' | 'wingman-order-acknowledged' | 'wingman-status-high' | 'wingman-status-medium' | 'wingman-status-low'
  | 'wingman-formation' | 'wingman-attack' | 'wingman-engage' | 'wingman-move' | 'wingman-move-unable';

/** The second line of every page-5 label: the label is project text standing for the missing portrait (G-03). */
const LABEL_MARK = 'G-03 PROJECT';
const label = (subject: string): readonly string[] => Object.freeze([subject, LABEL_MARK]);

/**
 * G-03: each radio message's project summary and page-5 label, by the rule that queues it, so the replies, the statuses
 * and the reports stay distinct without the original portraits, voice and text. They describe the rule in project words;
 * none is an original line. The original has no refusal message for docking: a docking request that fails gets no
 * reply, and its three cancellations have no feedback (docs/plan/p3/10/spec.md, D-01 item 2 ⑤), so none is summarized.
 * The wingman's command replies follow the line each consumed command asks for.
 *
 * The cockpit (P3-13) takes them through the app's assembly, which checks them before a run starts
 * (docs/plan/p3/13/spec.md, D-01 定稿 DC-07): a summary is 1–58 bytes of 0x20–0x7E without `{`, each byte in fonts/0's
 * character map, drawn in full on the message line and shown on the base page; a label is 1–2 lines of at most 16 bytes
 * in fonts/1's map (drawn upper-cased) in page 5's 96 × 96 frame area. A message no summary covers shows `uncovered`.
 *
 * Sources (Confirmed, code and data): ../../../docs/original/formats/executable.md, "RQ1. Base and friendly replies",
 * "RX1. Helpers" to "RX3", the messages table after them, and the wingman replies "WB3. Active consumer" to "WB5".
 */
export const MESSAGE_SUMMARIES = Object.freeze({
  gap: 'G-03' satisfies SliceGapId,
  title: 'Radio message (project summary)',
  text: Object.freeze({
    'docking-reply': 'The base answers your docking request: countdown to dock.',
    'base-status-clear': 'Status reply: the base reports no threat.',
    'base-status-threat': 'Status reply: the base reports that it is threatened.',
    'base-enemy-near': 'The base reports enemy craft moving close to it.',
    'base-thanks': 'The base thanks you: the threat to it is gone.',
    'craft-status-clear': 'Status reply: the friendly craft reports no threat.',
    'craft-status-threat': 'Status reply: the friendly craft reports a threat.',
    'craft-thanks': 'The friendly craft thanks you: the threat to it is gone.',
    'friendly-under-attack': 'A friendly reports that it is under attack.',
    'friendly-under-attack-follow-up': 'A further call about the friendly under attack.',
    'friendly-destroyed': 'A friendly has been destroyed.',
    'player-hit-friendly': 'Warning: you hit a friendly.',
    'player-destroyed-friendly': 'Warning: you destroyed a friendly or your wingman.',
    'wingman-lost': 'Your wingman has been lost.',
    'wingman-low-hull': 'Your wingman reports heavy damage.',
    'wingman-kill': 'Your wingman reports destroying an enemy.',
    'wingman-enemy-appears': 'Your wingman reports an enemy appearing nearby.',
    'wingman-enemy-on-tail': 'Your wingman warns of an enemy on your tail.',
    'wingman-friendly-lost': 'Your wingman reports a friendly lost nearby.',
    'wingman-order-unable': 'Wingman reply: it cannot carry out that order.',
    'wingman-order-acknowledged': 'Wingman reply: it acknowledges your order.',
    'wingman-status-high': 'Wingman status reply: hull at 80% or more.',
    'wingman-status-medium': 'Wingman status reply: hull from 50% to under 80%.',
    'wingman-status-low': 'Wingman status reply: hull under 50%.',
    'wingman-formation': 'Wingman reply: it rejoins formation with you.',
    'wingman-attack': 'Wingman reply: it attacks your target.',
    'wingman-engage': 'Wingman reply: it engages hostile craft.',
    'wingman-move': 'Wingman reply: it heads for a base or your destination.',
    'wingman-move-unable': 'Wingman reply: it cannot go to your map destination.',
  } satisfies Record<MessageSummaryKind, string>),
  label: Object.freeze({
    'docking-reply': label('DOCKING REPLY'),
    'base-status-clear': label('BASE: NO THREAT'),
    'base-status-threat': label('BASE THREATENED'),
    'base-enemy-near': label('BASE: ENEMY NEAR'),
    'base-thanks': label('BASE THANKS YOU'),
    'craft-status-clear': label('CRAFT: NO THREAT'),
    'craft-status-threat': label('CRAFT THREATENED'),
    'craft-thanks': label('CRAFT THANKS YOU'),
    'friendly-under-attack': label('ALLY UNDER FIRE'),
    'friendly-under-attack-follow-up': label('ALLY CALLS AGAIN'),
    'friendly-destroyed': label('ALLY DESTROYED'),
    'player-hit-friendly': label('YOU HIT AN ALLY'),
    'player-destroyed-friendly': label('YOU DOWNED ALLY'),
    'wingman-lost': label('WINGMAN LOST'),
    'wingman-low-hull': label('WINGMAN DAMAGED'),
    'wingman-kill': label('WINGMAN KILL'),
    'wingman-enemy-appears': label('ENEMY APPEARS'),
    'wingman-enemy-on-tail': label('ENEMY ON TAIL'),
    'wingman-friendly-lost': label('ALLY LOST NEAR'),
    'wingman-order-unable': label('ORDER: UNABLE'),
    'wingman-order-acknowledged': label('ORDER RECEIVED'),
    'wingman-status-high': label('WINGMAN 80%+'),
    'wingman-status-medium': label('WINGMAN 50-79%'),
    'wingman-status-low': label('WINGMAN <50%'),
    'wingman-formation': label('TO FORMATION'),
    'wingman-attack': label('ATTACKING TARGET'),
    'wingman-engage': label('ENGAGING'),
    'wingman-move': label('MOVING OUT'),
    'wingman-move-unable': label('CANNOT GO THERE'),
  } satisfies Record<MessageSummaryKind, readonly string[]>),
  /** Shown instead of a missing summary or label: the gap stays visible and no answer is invented. */
  uncovered: Object.freeze({
    summary: 'No project summary covers this message yet (G-03).',
    label: label('NOT COVERED'),
  }),
});

/** Whether `index` lies in [first, first + count). */
const within = (index: number, first: number, count: number): boolean => index >= first && index < first + count;

/** The name lists that index the named messages: COMM TABL 2001 has 20 names and TABL 2011 19 (RX1, data). */
const NAMES_2001 = 20;
const NAMES_2011 = 19;

/**
 * 20985 by index below the name offsets: the line types of `0x38d54` with its draws (RX1, WB5). Type 0 draws 0–2, the
 * refusal; 3 draws 3–4, the acknowledgement of code 2 and of unknown codes; 7 draws 5–7, the kill report (`0x38bf8`,
 * whose type-5 branch is dead code, so no caller asks for type 5: P3-13/25); 8 draws 8–9; 0xB–0xD are the status
 * replies by hull; 0xE draws 0xE–0xF, the formation (active code 3, parked 3 and 4); 0x10 draws 0x10–0x11, attacking
 * the player's target (code 1); 0x12 is codes 5 and 6 applied; 0x13 the low hull; 0x14 code 4; 0x15 code 6's failure
 * (WB3, WB4).
 */
const WINGMAN_LINES: readonly MessageSummaryKind[] = Object.freeze([
  'wingman-order-unable', 'wingman-order-unable', 'wingman-order-unable',
  'wingman-order-acknowledged', 'wingman-order-acknowledged',
  'wingman-kill', 'wingman-kill', 'wingman-kill',
  'wingman-enemy-appears', 'wingman-enemy-appears',
  'wingman-enemy-on-tail',
  'wingman-status-high', 'wingman-status-medium', 'wingman-status-low',
  'wingman-formation', 'wingman-formation',
  'wingman-attack', 'wingman-attack',
  'wingman-move',
  'wingman-low-hull',
  'wingman-engage',
  'wingman-move-unable',
]);

/**
 * The summary kind of a message, or null when no summary covers it: 20011 is a base speaking (RQ1, RX3, RX6), 20019 a
 * friendly craft speaking (RQ1, RX2, RX3), 20983 the direct list (RX2–RX3, the wingman-lost timer) whose named entries
 * are a 2011 or 2001 position plus an offset, and 20985 the wingman's lines (`WINGMAN_LINES`, then the friendly lost
 * near the wingman at a 2011 position + 0x16 or a 2001 position + 0x29).
 */
export function messageSummaryKind({ table, index }: MessageIdentity): MessageSummaryKind | null {
  switch (table) {
    case 20011:
      return ([
        'docking-reply', 'base-status-clear', 'base-enemy-near', 'base-thanks', 'base-status-threat',
      ] as const)[index] ?? null;
    case 20019:
      if (index <= 2) return (['craft-status-clear', 'craft-status-threat', 'craft-thanks'] as const)[index] ?? null;
      return within(index, 3, NAMES_2011) ? 'friendly-under-attack' : null;
    case 20983:
      if (index <= 3) return index >= 0 ? 'friendly-under-attack-follow-up' : null;
      if (index <= 6) return (['player-hit-friendly', 'player-destroyed-friendly', 'wingman-lost'] as const)[index - 4];
      if (within(index, 7, NAMES_2011) || within(index, 0x1a, NAMES_2001)) return 'friendly-under-attack';
      return within(index, 0x2e, NAMES_2011) || within(index, 0x41, NAMES_2001) ? 'friendly-destroyed' : null;
    case 20985:
      if (index >= 0 && index < WINGMAN_LINES.length) return WINGMAN_LINES[index];
      return within(index, 0x16, NAMES_2011) || within(index, 0x29, NAMES_2001) ? 'wingman-friendly-lost' : null;
  }
}

/** A message's project summary text (G-03), or null when none covers it. */
export function messageSummary(message: MessageIdentity): string | null {
  const kind = messageSummaryKind(message);
  return kind === null ? null : MESSAGE_SUMMARIES.text[kind];
}

/** A message's page-5 label lines (G-03), or null when none covers it. */
export function messageLabel(message: MessageIdentity): readonly string[] | null {
  const kind = messageSummaryKind(message);
  return kind === null ? null : MESSAGE_SUMMARIES.label[kind];
}

/**
 * The strategic map's project marker for a Warp cost that cannot be computed (`percent: null`, zero energy capacity;
 * docs/plan/p3/02/spec.md MW-12, docs/plan/p3/13/spec.md DC-09 and Δ-06). A project hint, not original text: the original's
 * division by zero gives no meaningful percentage there. 1–5 bytes within fonts/1's map, checked before a run starts.
 */
export const MAP_COST_UNAVAILABLE = 'N/A';

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
  /**
   * The cockpit message line's head and the incoming message, the same items the cockpit shows (P3-13 DC-07): imported
   * text is labelled as such, a G-03 summary as project text, and a missing summary names the message it stands for.
   */
  messages: Object.freeze({
    title: 'Radio messages',
    line: 'Message line',
    incoming: 'Incoming message',
    none: 'none',
    origin: Object.freeze({ original: 'from your imported data', project: 'project summary, not the original line' }),
    uncovered: ({ table, face, index }: MessageIdentity): string =>
      `Not covered: table ${table}${face === null ? '' : `, face ${face}`}, message ${index}.`,
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
