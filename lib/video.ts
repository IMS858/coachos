/**
 * Browser-side video helpers.
 *
 * Everything here runs before upload so there's no transcoding service in the
 * loop. At this studio's volume — a handful of clips a week — Supabase Storage
 * with a progressive MP4 is the right call; a streaming service (Mux,
 * Cloudflare Stream) buys adaptive bitrate and per-minute billing that isn't
 * worth the complexity yet. The one thing progressive delivery genuinely costs
 * us is graceful degradation on a weak connection, which is why the poster and
 * duration matter: the client can see what a clip is before committing to it.
 */

/** Read duration and dimensions without downloading anything twice. */
export function readVideoMeta(
  file: File
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const meta = {
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video."));
    };
    video.src = url;
  });
}

/**
 * Grab a representative still.
 *
 * Seeks ~1s in rather than frame zero — the first frame of a phone recording is
 * very often a blurred pan or the floor as the camera comes up.
 */
export function extractPoster(file: File, maxWidth = 640): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    // Required for iOS Safari to decode without entering fullscreen playback.
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(url);
    const bail = () => {
      cleanup();
      resolve(null);
    };

    video.onloadedmetadata = () => {
      const target = Math.min(1, (video.duration || 2) / 2);
      video.currentTime = target;
    };

    video.onseeked = () => {
      try {
        const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((video.videoWidth || maxWidth) * scale);
        canvas.height = Math.round((video.videoHeight || maxWidth) * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return bail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob);
          },
          "image/jpeg",
          0.72
        );
      } catch {
        bail();
      }
    };

    video.onerror = bail;
    // Some codecs never fire onseeked; don't hang the upload waiting.
    setTimeout(bail, 8000);
    video.src = url;
  });
}

/**
 * PUT straight to the signed URL via XHR.
 *
 * fetch() can't report upload progress, and a two-minute silent bar on a
 * 200MB clip over gym wifi reads as a broken app.
 */
export function uploadWithProgress(
  signedUrl: string,
  file: File | Blob,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.ontimeout = () => reject(new Error("Upload timed out."));
    xhr.timeout = 15 * 60 * 1000;
    xhr.send(file);
  });
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
