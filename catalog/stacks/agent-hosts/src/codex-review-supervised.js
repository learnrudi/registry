import { createCodexReviewRpc } from "./codex-review-rpc.js";

/** The protected supervisor gives the controller three exclusively inherited
 * channels. Only that supervisor can acknowledge worker death. The worker gets
 * no control channel. EOF on worker stdout is never drain evidence. */
export function createSupervisedCodexReview({ readable, writable, control, timeoutMs }, { signal } = {}) {
  if (!readable?.destroy || !writable?.destroy || !control?.write || !control?.on
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 900000) throw new Error("Supervised connection rejected");
  let stopping; let response = ""; let invalid = false; let ended = false;
  let finish = () => {};
  let deadline;
  const fail = () => {
    invalid = true;
    readable.destroy(new Error("Supervised connection rejected"));
    void rpc.stop();
  };
  control.on("data", chunk => {
    response += chunk.toString("utf8");
    if (!stopping || Buffer.byteLength(response) > 100) { invalid = true; finish(false); }
  });
  control.on("error", () => { invalid = true; finish(false); fail(); });
  control.on("end", () => {
    ended = true;
    if (!stopping) { fail(); return; }
    try {
      const value = JSON.parse(response);
      finish(!invalid && Object.keys(value).length === 1 && value.terminationConfirmed === true);
    } catch { finish(false); }
  });
  const terminate = () => stopping ??= (async () => {
    clearTimeout(deadline); signal?.removeEventListener("abort", fail);
    let timer;
    const confirmed = new Promise(resolve => {
      finish = resolve;
      timer = setTimeout(() => resolve(false), 1500);
    });
    // Defer the write so the stopping state is visible before synchronous test
    // streams or a fast supervisor can answer.
    await Promise.resolve();
    if (ended || control.destroyed) finish(false);
    else control.write("stop\n", error => { if (error) finish(false); });
    const terminationConfirmed = await confirmed;
    clearTimeout(timer); readable.destroy(); writable.destroy(); control.destroy();
    return { terminationConfirmed: terminationConfirmed === true && !invalid };
  })();
  const rpc = createCodexReviewRpc({ readable, writable, terminate });
  deadline = setTimeout(fail, timeoutMs);
  signal?.addEventListener("abort", fail, { once: true });
  if (signal?.aborted) fail();
  return rpc;
}
