import {
  createAudioController, type AudioCapability, type AudioContextPort, type AudioController, type AudioVoicePort,
  type PageLifecycleHost, type VoiceNodeParameters,
} from './audio-controller.ts';

// Browser capabilities for the DOM-free audio controller: a real AudioContext with voices playing into its destination
// (through parameter nodes when a voice has parameters), AudioBuffer construction without a context, and the document
// and window lifecycle events. Nothing runs on import.

/**
 * A parameterised voice's nodes: source → volume gain → one gain per output channel → merger → output, set to `initial`
 * before any of them is connected, so before the source can start. A mono source feeds both channel gains; a stereo one
 * is split so that its first channel gets the first gain and its second the second. Not a StereoPannerNode, whose
 * equal-power law differs from A-09's.
 * Its `disconnect` covers the source too, and a failure part way disconnects every node so far before it is rethrown.
 */
function parameterGraph(context: AudioContext, source: AudioBufferSourceNode, initial: VoiceNodeParameters) {
  const nodes: AudioNode[] = [source];
  const made = <T extends AudioNode>(node: T): T => { nodes.push(node); return node; };
  try {
    const volume = made(context.createGain());
    const left = made(context.createGain());
    const right = made(context.createGain());
    const merger = made(context.createChannelMerger(2));
    // Before any connection: once connected, the render thread may compute a parameter from its old value and store
    // that back over a later main-thread `value` set (the automation event still applies a quantum later), so the
    // `value` getter at start() could read the default.
    volume.gain.value = initial.gain;
    left.gain.value = initial.left;
    right.gain.value = initial.right;
    source.playbackRate.value = initial.playbackRate;
    source.connect(volume);
    if (source.buffer!.numberOfChannels > 1) {
      const splitter = made(context.createChannelSplitter(2));
      volume.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);
    } else {
      volume.connect(left);
      volume.connect(right);
    }
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    merger.connect(context.destination);
    return {
      set({ gain, left: first, right: second, playbackRate }: VoiceNodeParameters, when: number): void {
        volume.gain.setValueAtTime(gain, when);
        left.gain.setValueAtTime(first, when);
        right.gain.setValueAtTime(second, when);
        source.playbackRate.setValueAtTime(playbackRate, when);
      },
      disconnect(): void {
        for (const node of nodes) node.disconnect();
      },
    };
  } catch (error) {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // The construction failure is the one reported.
      }
    }
    throw error;
  }
}

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
    createVoice(buffer, loop, parameters) {
      const node = context.createBufferSource();
      node.buffer = buffer as AudioBuffer;
      node.loop = loop;
      const graph = parameters === undefined ? null : parameterGraph(context, node, parameters);
      if (graph === null) node.connect(context.destination);
      const port: AudioVoicePort = {
        start: when => node.start(when),
        stop: when => node.stop(when),
        disconnect: () => (graph === null ? node.disconnect() : graph.disconnect()),
        onEnded(listener) {
          node.addEventListener('ended', listener);
          return () => node.removeEventListener('ended', listener);
        },
      };
      // Only a voice with parameter nodes can take new parameters.
      if (graph !== null) port.setParameters = (values, when) => graph.set(values, when);
      return port;
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
