import { StringDecoder } from "node:string_decoder";

const METHODS = new Set(["initialize", "account/read", "thread/start", "turn/start", "turn/interrupt"]);
const rejected = () => new Error("Native review RPC rejected");

/**
 * Adapt the native host's dedicated stdio streams. No executable, environment,
 * credentials or command comes from a review request. terminate must drain the
 * actual native process group; closing a stream is NOT termination evidence.
 */
export function createCodexReviewRpc({ readable, writable, terminate }) {
  if (!readable?.on || !writable?.write || typeof terminate !== "function") throw rejected();
  const decoder = new StringDecoder("utf8");
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0; let bytes = 0; let buffer = ""; let failed = false; let stopping;
  const emit = event => { for (const listener of listeners) listener(event); };
  const fail = () => {
    if (failed) return;
    failed = true;
    for (const item of pending.values()) item.reject(rejected());
    pending.clear();
    emit({ method: "error", params: {} });
  };
  const parse = line => {
    const message = JSON.parse(line);
    if (!message || typeof message !== "object" || Array.isArray(message)) throw rejected();
    if (typeof message.method === "string") {
      // Approval/tool requests are delivered for rejection, never answered.
      emit(message);
      if (Object.hasOwn(message, "id")) fail();
      return;
    }
    const item = pending.get(message.id);
    if (!item || Object.hasOwn(message, "result") === Object.hasOwn(message, "error")) throw rejected();
    pending.delete(message.id);
    if (Object.hasOwn(message, "error")) { item.reject(rejected()); fail(); }
    else item.resolve(message.result);
  };
  const data = chunk => {
    if (failed) return;
    try {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 8388608) throw rejected();
      buffer += decoder.write(Buffer.from(chunk));
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        if (line.trim()) parse(line);
      }
      if (Buffer.byteLength(buffer) > 1048576) throw rejected();
    } catch { fail(); }
  };
  const ended = () => { if (!stopping || buffer.trim()) fail(); };
  readable.on("data", data); readable.on("error", fail); readable.on("end", ended);
  writable.on("error", fail);
  const send = message => {
    if (failed || stopping) throw rejected();
    const wire = JSON.stringify(message) + "\n";
    if (Buffer.byteLength(wire) > 2097152) throw rejected();
    writable.write(wire, error => { if (error) fail(); });
  };
  return {
    request(method, params) {
      return new Promise((resolve, reject) => {
        if (!METHODS.has(method) || pending.size || failed || stopping) { reject(rejected()); return; }
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        try { send({ id, method, params }); }
        catch { pending.delete(id); reject(rejected()); fail(); }
      });
    },
    notify(method, params) {
      if (method !== "initialized") throw rejected();
      send({ method, params });
    },
    onNotification(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop() {
      if (!stopping) {
        // Set stopping synchronously, before invoking trusted host termination.
        stopping = Promise.resolve().then(terminate).then(result => ({ terminationConfirmed: result?.terminationConfirmed === true }),
          () => ({ terminationConfirmed: false })).finally(() => {
          for (const item of pending.values()) item.reject(rejected());
          pending.clear();
          readable.off("data", data); readable.off("end", ended);
          // Keep sanitized error handlers on potentially late native stream errors.
        });
      }
      return stopping;
    },
  };
}
