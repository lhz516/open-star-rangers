import {
  createAudioController, type AudioCapability, type AudioContextPort, type AudioController, type PageLifecycleHost,
} from './audio-controller.ts';

// Browser capabilities for the DOM-free audio controller: a real AudioContext with voices playing into its destination,
// AudioBuffer construction without a context, and the document and window lifecycle events. Nothing runs on import.

function contextPort(context: AudioContext): AudioContextPort {
  return {
    get state() { return context.state; },
    get currentTime() { return context.currentTime; },
    onStateChange(listener) {
      context.addEventListener('statechange', listener);
      return () => context.removeEventListener('statechange', listener);
    },
    resume: () => context.resume(),
    suspend: () => context.suspend(),
    close: () => context.close(),
    createVoice(buffer, loop) {
      const node = context.createBufferSource();
      node.buffer = buffer as AudioBuffer;
      node.loop = loop;
      node.connect(context.destination);
      return {
        start: when => node.start(when),
        stop: when => node.stop(when),
        disconnect: () => node.disconnect(),
        onEnded(listener) {
          node.addEventListener('ended', listener);
          return () => node.removeEventListener('ended', listener);
        },
      };
    },
  };
}

/** Web Audio: a context per controller and buffers without one. */
export const BROWSER_AUDIO: AudioCapability = Object.freeze<AudioCapability>({
  // A missing constructor throws here, which the controller reports as unavailable.
  createContext: () => contextPort(new AudioContext()),
  createBuffer(channels, sampleRate) {
    const buffer = new AudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate });
    channels.forEach((data, channel) => buffer.getChannelData(channel).set(data));
    return buffer;
  },
});

/** The document's visibility and the window's page lifecycle events. */
export const BROWSER_PAGE_LIFECYCLE: PageLifecycleHost = Object.freeze<PageLifecycleHost>({
  visible: () => document.visibilityState === 'visible',
  listen(type, listener) {
    const target = type === 'visibilitychange' ? document : window;
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
  },
});

/** The production audio controller: call `unlock()` from a user gesture handler and `dispose()` with the session. */
export function createBrowserAudioController({ reportError }: { readonly reportError: (error: unknown) => void }): AudioController {
  return createAudioController({ audio: BROWSER_AUDIO, lifecycle: BROWSER_PAGE_LIFECYCLE, reportError });
}
