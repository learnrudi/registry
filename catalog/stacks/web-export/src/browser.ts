import { prepareDocumentContext } from "./document-context.js";
import { chromium, type Browser } from "playwright";

import type { BrowserSession, ValidatedExportRequest } from "./types.js";
import { RenderError } from "./types.js";
import { remainingRenderMs } from './render-budget.js';

const REMOTE_TIMEOUT_MS = 15_000;
const LOCAL_TIMEOUT_MS = 30_000;

export async function acquireBrowserSession(
  request: ValidatedExportRequest,
): Promise<BrowserSession> {
  let browser: Browser | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    browser = request.browserWsEndpoint
      ? await chromium.connectOverCDP({
          wsEndpoint: request.browserWsEndpoint,
          timeout: Math.min(REMOTE_TIMEOUT_MS, remainingRenderMs(request)),
        })
      : await chromium.launch({
          headless: true,
          timeout: Math.min(LOCAL_TIMEOUT_MS, remainingRenderMs(request)),
          chromiumSandbox: true,
          args: ["--disable-background-networking", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
        });

    const context = await browser.newContext({
        serviceWorkers: "block",
        acceptDownloads: false,
        viewport: { width: request.viewportWidth, height: request.viewportHeight },
        deviceScaleFactor: request.scale,
      });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(15_000);
    deadline = setTimeout(() => { void context.close().catch(() => {}); }, remainingRenderMs(request));

    const page = await context.newPage();
    const telemetry = {
      consoleErrors: [] as string[],
      pageErrors: [] as string[],
      failedRequests: [] as string[],
    };

    page.on("console", (message) => {
      if (message.type() === "error") {
        if (telemetry.consoleErrors.length < 100) telemetry.consoleErrors.push(message.text().slice(0, 1000));
      }
    });

    page.on("pageerror", (error) => {
      if (telemetry.pageErrors.length < 100) telemetry.pageErrors.push(error.message.slice(0, 1000));
    });

    page.on("requestfailed", (request_) => {
      if (telemetry.failedRequests.length < 100) telemetry.failedRequests.push(`${request_.method()} ${request_.url()}`.slice(0, 1000));
    });

    return {
      browser,
      context,
      page,
      telemetry,
      release: async () => {
        clearTimeout(deadline);
        try {
          if (!page.isClosed()) {
            await page.close();
          }
        } catch {
          // Best-effort cleanup.
        }

        try {
          await context.close();
        } catch {
          // Best-effort cleanup.
        }

        try {
          await browser?.close();
        } catch {
          // Best-effort cleanup.
        }
      },
    };
  } catch (error) {
    clearTimeout(deadline);
    await browser?.close().catch(() => {});
    throw new RenderError(
      "BROWSER_ACQUISITION_FAILED",
      request.browserWsEndpoint
        ? "Failed to connect to the remote Chromium endpoint."
        : "Failed to launch the local Chromium browser.",
      {
        cause: request.browserWsEndpoint ? "Configured remote browser connection failed" : error instanceof Error ? error.message : String(error),
      },
    );
  }
}

export async function navigateAndWait(
  session: BrowserSession,
  request: ValidatedExportRequest,
): Promise<void> {
  const documentUrl = await prepareDocumentContext(session.context, request.inputPath);

  try {
    await session.page.goto(documentUrl, { waitUntil: "networkidle" });
    await session.page.waitForLoadState("networkidle");
    await session.page.evaluate(async () => {
      if ("fonts" in document && document.fonts?.ready) {
        await document.fonts.ready;
      }
    });

    if (request.readySelector) {
      await session.page.waitForSelector(request.readySelector, { state: "visible" });
    }

    if (request.waitForJs) {
      await session.page.waitForFunction(request.waitForJs);
    }
  } catch (error) {
    throw new RenderError("NAVIGATION_FAILED", "Failed to load the HTML document into Chromium.", {
      inputPath: request.inputPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}
