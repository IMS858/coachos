/**
 * In-browser video compression, run before upload.
 *
 * WHY THIS EXISTS
 * A modern iPhone records 4K by default, which is ~375MB per minute. Supabase's
 * free tier is 1GB of file storage — two clips and it's full. Re-encoding to
 * 720p at 1.5Mbps lands around 11MB/min, which is roughly 34x more clips in the
 * same space and drops monthly egress from hundreds of GB to single digits.
 *
 * For a coaching clip that's not a quality compromise: at 720p you can still
 * see joint position clearly, which is the entire point of the footage.
 *
 * HOW
 * Decode → draw each frame to a downscaled canvas → capture that canvas as a
 * stream → re-encode via MediaRecorder, carrying the original audio track so
 * spoken cues survive.
 *
 * THE TRADE-OFF, STATED PLAINLY
 * MediaRecorder records in wall-clock time, so compressing a 60-second clip
 * takes about 60 seconds. That's why this only runs on files big enough to be
 * worth it, always reports progress, and can always be skipped.
 */

export const COMPRESS_THRESHOLD_MB = 25;

/**
 * Quality presets.
 *
 * Deliberately no 4K option. Clients watch in a ~400px-wide container on a
 * phone, so 4K's pixels are thrown away on arrival — but because this is a
 * progressive MP4 with no adaptive bitrate, they still wait for every one of
 * them. A 1-minute 4K clip is roughly six minutes of loading on LTE. That's not
 * a quality setting, it's a way to make people give up before they watch.
 *
 * For movement review, framerate beats resolution: 1080p at 60fps shows joint
 * motion far better under slow-mo than 4K at 30fps.
 */
export const QUALITY_PRESETS = {
  standard: {
    label: "Standard",
    hint: "720p · fast on cellular",
    maxHeight: 720,
    bitrate: 1_500_000,
    approxMbPerMin: 11,
  },
  high: {
    label: "High",
    hint: "1080p · best for slow-mo detail",
    maxHeight: 1080,
    bitrate: 4_000_000,
    approxMbPerMin: 30,
  },
} as const;

export type QualityKey = keyof typeof QUALITY_PRESETS;

export type CompressResult = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  skipped: boolean;
  reason?: string;
};

/** Best container/codec this browser will actually produce. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2", // Safari, and most playable everywhere
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function canCompress(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickMimeType() !== null
  );
}

export async function compressVideo(
  file: File,
  opts: {
    maxHeight?: number;
    bitrate?: number;
    onProgress?: (pct: number) => void;
  } = {}
): Promise<CompressResult> {
  const maxHeight = opts.maxHeight ?? 720;
  const bitrate = opts.bitrate ?? 1_500_000;
  const onProgress = opts.onProgress ?? (() => {});
  const original = file.size;

  const bail = (reason: string): CompressResult => ({
    file,
    originalBytes: original,
    compressedBytes: original,
    skipped: true,
    reason,
  });

  const mimeType = pickMimeType();
  if (!mimeType) return bail("This browser can't re-encode video.");

  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Couldn't read the video."));
      setTimeout(() => reject(new Error("Timed out reading the video.")), 15000);
    });

    // Already small enough that re-encoding would cost more time than it saves.
    if (video.videoHeight <= maxHeight && original < COMPRESS_THRESHOLD_MB * 1024 * 1024) {
      return bail("Already small enough.");
    }

    const scale = Math.min(1, maxHeight / (video.videoHeight || maxHeight));
    // Even dimensions — odd ones break some H.264 encoders.
    const width = Math.round((video.videoWidth * scale) / 2) * 2;
    const height = Math.round((video.videoHeight * scale) / 2) * 2;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return bail("Canvas unavailable.");

    const canvasStream = canvas.captureStream(30);

    // Carry the spoken cues across. Not every browser exposes captureStream on
    // a media element — if it doesn't, compress video-only rather than fail.
    try {
      const el = video as HTMLVideoElement & { captureStream?: () => MediaStream };
      if (typeof el.captureStream === "function") {
        const src = el.captureStream();
        for (const track of src.getAudioTracks()) canvasStream.addTrack(track);
      }
    } catch {
      /* video-only is an acceptable degradation */
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: 96_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start(1000);
    video.muted = false;
    video.volume = 0; // audible playback would be bizarre; the track still records
    await video.play();

    let raf = 0;
    const draw = () => {
      if (video.paused || video.ended) return;
      ctx.drawImage(video, 0, 0, width, height);
      if (video.duration) {
        onProgress(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      // Hard ceiling so a corrupt file can't hang the UI forever.
      setTimeout(resolve, (video.duration || 60) * 1000 + 10_000);
    });

    cancelAnimationFrame(raf);
    if (recorder.state !== "inactive") recorder.stop();
    await finished;
    onProgress(100);

    const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
    if (blob.size === 0) return bail("Re-encode produced nothing.");
    // If the re-encode isn't meaningfully smaller, keep the original.
    if (blob.size >= original * 0.9) return bail("Wouldn't save enough to be worth it.");

    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const base = file.name.replace(/\.[^.]+$/, "") || "clip";
    const out = new File([blob], `${base}-720p.${ext}`, { type: blob.type });

    return {
      file: out,
      originalBytes: original,
      compressedBytes: out.size,
      skipped: false,
    };
  } catch (e) {
    return bail(e instanceof Error ? e.message : "Compression failed.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
