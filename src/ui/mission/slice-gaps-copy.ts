/**
 * The page copy of the slice gaps this build shows (docs/plan/p3/01/spec.md: 缺省清单, 标注规则; docs/plan/p3/04/spec.md:
 * 缺省与标注, AC-19). Each G item's text lives here only, keyed by its G ID, so an audit finds it by ID; the pages only
 * place it. Project text in the app's language, not original text.
 */

/** The G items this build marks in its pages; G-06 only for restart and return, whose results page belongs to P3-11. */
export type SliceGapId = 'G-01' | 'G-02/1' | 'G-02/2' | 'G-04' | 'G-06' | 'G-07';

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
  'G-04': gap(
    'Original briefing and wingman pages missing',
    'This project start page replaces the original briefing, wingman files and wingman selection page. It keeps the objectives, '
      + 'limits and wingman choice the mission needs, as project text; the original briefing text and portraits are not shown.',
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
