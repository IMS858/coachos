/** Optional browser encoding. Original uploads remain the default.
 * Encoding is capped at 30 fps and may change codec, colour/HDR and slow-motion
 * metadata. Keep the original for source fidelity; no upscaling is performed.
 * An audio setup, decode or encode failure always returns the original file.
 */
export const COMPRESS_THRESHOLD_MB = 25;
export const QUALITY_PRESETS = {
  standard: { label: "Full HD", hint: "Up to 1080p · 30 fps · smaller file", maxHeight: 1080, bitrate: 5_000_000, approxMbPerMin: 38 },
  high: { label: "Full HD high detail", hint: "Up to 1080p · 30 fps · higher bitrate", maxHeight: 1080, bitrate: 8_000_000, approxMbPerMin: 60 },
} as const;
export type QualityKey = keyof typeof QUALITY_PRESETS;
export type CompressResult = { file: File; originalBytes: number; compressedBytes: number; skipped: boolean; reason?: string };
export function fitVideoDimensions(width: number, height: number, maxHeight = 1080) {
  if (![width, height, maxHeight].every(n => Number.isFinite(n) && n >= 2)) throw new Error("Invalid video dimensions.");
  const scale = Math.min(1, maxHeight / Math.min(width, height), (maxHeight * 16 / 9) / Math.max(width, height));
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
}
function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}
export function canCompress(): boolean {
  return typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function" && typeof AudioContext !== "undefined" && pickMimeType() !== null;
}
export async function compressVideo(file: File, opts: { maxHeight?: number; bitrate?: number; onProgress?: (pct: number) => void } = {}): Promise<CompressResult> {
  const original = file.size;
  const keep = (reason: string): CompressResult => ({ file, originalBytes: original, compressedBytes: original, skipped: true, reason });
  if (!canCompress()) return keep("Audio-preserving browser optimization is unavailable. Original retained.");
  if (original < COMPRESS_THRESHOLD_MB * 1024 * 1024) return keep("Original is already small enough.");
  const mimeType = pickMimeType()!;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  let audio: AudioContext | undefined, audioSource: MediaElementAudioSourceNode | undefined;
  let stream: MediaStream | undefined, recorder: MediaRecorder | undefined;
  let raf = 0;
  try {
    video.playsInline = true; video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Video metadata timed out.")), 15000);
      video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error("This video cannot be decoded here.")); };
      video.src = url;
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 15 * 60) return keep("Use the original for long or unsupported footage.");
    const { width, height } = fitVideoDimensions(video.videoWidth, video.videoHeight, opts.maxHeight ?? 1080);
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return keep("Canvas unavailable. Original retained.");
    stream = canvas.captureStream(30);
    // Route decoded audio into the recorder, not into the speakers. Never silently discard it.
    audio = new AudioContext();
    await audio.resume();
    if (audio.state !== "running") return keep("Audio permission unavailable. Original retained.");
    const audioOut = audio.createMediaStreamDestination();
    audioSource = audio.createMediaElementSource(video); audioSource.connect(audioOut);
    const audioTrack = audioOut.stream.getAudioTracks()[0];
    if (!audioTrack) return keep("Audio capture unavailable. Original retained.");
    stream.addTrack(audioTrack);
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: opts.bitrate ?? 5_000_000, audioBitsPerSecond: 128_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    let encodeFailed = false;
    recorder.onerror = () => { encodeFailed = true; video.pause(); };
    const finished = new Promise<void>(resolve => { recorder!.onstop = () => resolve(); });
    recorder.start(1000);
    await video.play();
    const draw = () => {
      if (video.ended || video.paused) return;
      ctx.drawImage(video, 0, 0, width, height);
      opts.onProgress?.(Math.min(99, Math.round(video.currentTime / video.duration * 100)));
      raf = requestAnimationFrame(draw);
    };
    draw();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Optimization did not finish. Original retained.")), (video.duration * 1.25 + 15) * 1000);
      video.onended = () => { clearTimeout(timer); resolve(); };
      video.onerror = () => { clearTimeout(timer); reject(new Error("Decode failed. Original retained.")); };
    });
    cancelAnimationFrame(raf);
    if (recorder.state !== "inactive") recorder.stop();
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Encoder did not finish.")), 10000); void finished.then(() => { clearTimeout(timer); resolve(); }); });
    if (encodeFailed) return keep("Encoding failed. Original retained.");
    const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
    if (!blob.size || blob.size >= original * 0.9) return keep("Optimization would not save enough space. Original retained.");
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const result = new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-${width}x${height}.${ext}`, { type: blob.type });
    opts.onProgress?.(100);
    return { file: result, originalBytes: original, compressedBytes: result.size, skipped: false };
  } catch (e) { return keep(e instanceof Error ? e.message : "Optimization failed. Original retained."); }
  finally {
    cancelAnimationFrame(raf); video.pause();
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); audioSource?.disconnect();
    if (audio && audio.state !== "closed") await audio.close().catch(() => {});
    video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
  }
}
export function formatMB(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(1)}MB`; }
