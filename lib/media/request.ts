/** Read small JSON requests without trusting Content-Length. Never buffers the video itself. */
export async function smallJson(request: Request, limit = 32768): Promise<unknown> {
  if (!request.body) throw new Error("Request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Request is too large."); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
