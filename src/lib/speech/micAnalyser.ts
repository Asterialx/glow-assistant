/**
 * Mic level metering without routing capture to speakers.
 * Never connect the graph to ctx.destination (Chrome sidetone).
 */

export type MicAnalyser = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  stop: () => void;
};

function audioContextCtor(): typeof AudioContext {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  );
}

/** Safe getUserMedia constraints — no `advanced` that can Overconstrain. */
export function micTrackConstraints(deviceId?: string): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
  if (deviceId) base.deviceId = { ideal: deviceId };
  return base;
}

/** Best-effort: stop Chrome from rendering mic into the headset (non-fatal). */
export async function forceNoAssociatedSink(stream: MediaStream): Promise<void> {
  for (const track of stream.getAudioTracks()) {
    try {
      await track.applyConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...( { chromeRenderToAssociatedSink: false } as any ),
      });
    } catch {
      try {
        await track.applyConstraints({
          advanced: [{ chromeRenderToAssociatedSink: false }],
        } as unknown as MediaTrackConstraints);
      } catch {
        /* ignore — constraint unsupported */
      }
    }
  }
}

/**
 * Open analyser for level meter.
 * Output goes only to a dummy MediaStreamDestination (inaudible).
 */
export async function openMicAnalyser(stream: MediaStream): Promise<MicAnalyser> {
  await forceNoAssociatedSink(stream);

  const Ctx = audioContextCtor();
  const ctx = new Ctx();
  if (ctx.state === "suspended") await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.2;
  source.connect(analyser);

  // Dummy sink — keeps Chrome graph alive, never speakers
  const dummy = ctx.createMediaStreamDestination();
  const mute = ctx.createGain();
  mute.gain.value = 0;
  analyser.connect(mute);
  mute.connect(dummy);

  return {
    ctx,
    analyser,
    stop: () => {
      try {
        source.disconnect();
        analyser.disconnect();
        mute.disconnect();
        dummy.disconnect();
      } catch {
        /* ignore */
      }
      void ctx.close();
    },
  };
}

export function readRmsLevel(analyser: AnalyserNode, buf: Uint8Array): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analyser.getByteTimeDomainData(buf as any);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 6);
}
