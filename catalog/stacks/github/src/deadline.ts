/** Bounds waiting for trusted asynchronous dependencies; late values are discarded. */
export async function withinDeadline<T>(operation: () => Promise<T>, milliseconds: number): Promise<T> {
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0 || milliseconds > 120_000) {
    throw new Error("Invalid dependency deadline");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Dependency deadline exceeded")), milliseconds);
  });
  try { return await Promise.race([Promise.resolve().then(operation), deadline]); }
  finally { clearTimeout(timer); }
}
