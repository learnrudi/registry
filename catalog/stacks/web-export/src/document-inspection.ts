import type { Page } from 'playwright';
import { RenderError } from './types.js';

/** Read native DOM APIs without the untrusted document's JavaScript overrides. */
export async function inspectDocument<T>(page: Page, inspect: () => T | Promise<T>): Promise<T> {
  const session = await page.context().newCDPSession(page);
  try {
    const { frameTree } = await session.send('Page.getFrameTree');
    const { executionContextId } = await session.send('Page.createIsolatedWorld', {
      frameId: frameTree.frame.id,
      worldName: 'rudi-render-inspection',
      grantUniveralAccess: false,
    });
    // Only repository-owned callbacks enter this expression; document data is
    // never evaluated as source. A missing/failed isolated world fails closed.
    const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
      expression: `(${inspect.toString()})()`,
      contextId: executionContextId,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new RenderError('DOCUMENT_INSPECTION_FAILED', 'Could not inspect the document in an isolated browser world.');
    }
    return result.value as T;
  } finally {
    await session.detach();
  }
}
