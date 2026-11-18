import { CAPTURE_MS, estimatePulse, type PulseSample } from './estimate';

type Failure = 'unavailable' | 'denied' | 'cameraError' | 'weak';
type Handlers = {
  progress: (seconds: number, covered: boolean) => void;
  finish: (result: number | Failure) => void;
};

export function capturePulse({ progress, finish }: Handlers) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  let stream: MediaStream | undefined, frame = 0, ended = false;
  let timeout: ReturnType<typeof setTimeout>;
  const stop = () => {
    ended = true;
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    stream?.getTracks().forEach(track => track.stop());
    video.pause();
    video.srcObject = null;
  };
  const complete = (result: number | Failure) => {
    if (ended) return;
    stop();
    finish(result);
  };
  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return complete('unavailable');
    timeout = setTimeout(() => complete('cameraError'), 45_000);
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
      facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 30 },
    } });
    // A permission prompt can resolve after the dialog has already been closed.
    if (ended) return stop();
    const track = stream.getVideoTracks()[0];
    track.addEventListener('ended', () => complete('cameraError'), { once: true });
    if ((track.getCapabilities?.() as { torch?: boolean } | undefined)?.torch) {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] }).catch(() => {});
    }
    if (ended) return;
    video.srcObject = stream;
    await video.play();
    if (ended) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 12;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return complete('cameraError');
    const samples: PulseSample[] = [];
    let lastFrame = -1, lastSeconds = -1, lastContact: boolean | undefined;
    clearTimeout(timeout);
    timeout = setTimeout(() => complete('weak'), 45_000);
    function sample() {
      if (ended) return;
      try {
        if (video.readyState >= 2 && video.currentTime !== lastFrame) {
          lastFrame = video.currentTime;
          const w = video.videoWidth, h = video.videoHeight;
          ctx!.drawImage(video, w / 4, h / 4, w / 2, h / 2, 0, 0, 12, 12);
          const pixels = ctx!.getImageData(0, 0, 12, 12).data;
          let green = 0, contactPixels = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
            if (r > 45 && r > 1.25 * g && r > 1.4 * b && g > 2 && g < 248) contactPixels++;
            green += g;
          }
          const covered = contactPixels >= 0.85 * 144;
          const ms = video.currentTime * 1000;
          if (!covered || (samples.length && ms - samples.at(-1)!.ms > 180)) samples.length = 0;
          if (covered) samples.push({ ms, value: green / 144 });
          const elapsed = samples.length ? ms - samples[0].ms : 0;
          if (elapsed >= CAPTURE_MS) return complete(estimatePulse(samples) ?? 'weak');
          const seconds = Math.floor(elapsed / 1000);
          if (seconds !== lastSeconds || covered !== lastContact) progress(seconds, covered);
          lastSeconds = seconds;
          lastContact = covered;
        }
        frame = requestAnimationFrame(sample);
      } catch { complete('cameraError'); }
    }
    sample();
  }
  void start().catch((error: unknown) => complete(
    error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name) ? 'denied' : 'cameraError',
  ));
  return stop;
}
