import type { Page } from 'playwright';
import { inspectDocument } from './document-inspection.js';

/** Apply scripted print layout once, then keep it immutable through allocation. */
export async function preparePrintLayout(page: Page): Promise<void> {
  await page.emulateMedia({ media: 'print' });
  await inspectDocument(page, async () => {
    window.dispatchEvent(new Event('beforeprint'));
    await document.fonts.ready;
  });
  await freezeDocumentLayout(page);
}

/** Keep the ready document's current animation frame stable during rendering. */
export async function freezeDocumentLayout(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  // Runtime evaluation remains available to our measurements and artboard isolation;
  // page timers and Chromium's subsequent beforeprint dispatch cannot mutate layout.
  await session.send('Emulation.setScriptExecutionDisabled', { value: true });
  await inspectDocument(page, async () => {
    const animations = document.getAnimations();
    for (const animation of animations) animation.pause();
    await Promise.all(animations.map(animation => animation.ready));
  });
}
