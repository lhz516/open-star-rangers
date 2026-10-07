/**
 * The viewer's audition (P2-11 S-08): the held package's sounds with play and stop buttons, the audio status and voices,
 * and why playing failed. A click on Play is the trusted gesture that unlocks audio; the sound plays once the
 * controller runs. Without audio the rest of the viewer is unaffected.
 */
import { useState, useSyncExternalStore } from 'react';
import type { AuditionResult, ViewerAudio, ViewerAudioSnapshot } from '../../app/viewer/viewer-audio.ts';

const NO_AUDIO = Object.freeze({ subscribe: () => () => {}, getSnapshot: (): ViewerAudioSnapshot | null => null });

const STATUS_TEXT: Readonly<Record<ViewerAudioSnapshot['status'], string>> = Object.freeze({
  idle: 'Audio is ready; it starts with the first click on Play.',
  locked: 'Audio is waiting for a click to start.',
  running: 'Audio is running.',
  suspended: 'Audio is suspended while the page is hidden.',
  unavailable: 'Audio is unavailable in this browser.',
  failed: 'Audio failed and stopped.',
  disposed: 'Audio was released.',
});

export function ViewerAudioPanel({ audio }: { readonly audio: ViewerAudio | null }) {
  const source = audio ?? NO_AUDIO;
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [result, setResult] = useState<{ readonly id: string; readonly result: AuditionResult } | null>(null);
  const failed = snapshot !== null && (snapshot.status === 'unavailable' || snapshot.status === 'failed');
  return (
    <section aria-labelledby="viewer-audio-heading">
      <h3 id="viewer-audio-heading">Sounds</h3>
      {snapshot === null
        ? <p role="status" data-testid="viewer-audio-status">Preparing audio…</p>
        : (
          <>
            <p role={failed ? 'alert' : 'status'} data-testid="viewer-audio-status" data-status={snapshot.status}>
              {STATUS_TEXT[snapshot.status]} <span data-testid="viewer-voices">{snapshot.voices}</span> playing.
            </p>
            {snapshot.load?.status === 'failed' && (
              <p role="alert" data-testid="viewer-audio-load-failure">
                {`The sounds could not be loaded (${snapshot.load.code}${snapshot.load.assetId ? `, ${snapshot.load.assetId}` : ''}).`}
              </p>
            )}
            {result?.result.status === 'rejected' && (
              <p role="alert" data-testid="viewer-audition-failure">{`${result.id} could not be played (${result.result.code}).`}</p>
            )}
            {snapshot.sounds.length === 0
              ? <p>The package holds no sounds.</p>
              : (
                <ul data-testid="viewer-sounds">
                  {snapshot.sounds.map(({ id, role }) => (
                    <li key={id}>
                      {`${id} (${role}) `}
                      <button type="button" aria-label={`Play ${id}`} onClick={() => { setResult({ id, result: audio!.audition(id) }); }}>Play</button>
                      {' '}
                      <button type="button" aria-label={`Stop ${id}`} onClick={() => { audio!.stop(id); }}>Stop</button>
                    </li>
                  ))}
                </ul>
              )}
            <button type="button" onClick={() => { audio!.stopAll(); }}>Stop all sounds</button>
          </>
        )}
    </section>
  );
}
