import { chromium } from "playwright";

import type { BrowserSession, ValidatedExportRequest } from "./types.js";
import { RenderError } from "./types.js";

const REMOTE_TIMEOUT_MS = 15_000;
const LOCAL_TIMEOUT_MS = 30_000;

export async function acquireBrowserSession(
  request: ValidatedExportRequest,
): Promise<BrowserSession> {
  try {
    const browser = request.browserWsEndpoint
      ? await chromium.connectOverCDP({
          wsEndpoint: request.browserWsEndpoint,
          timeout: REMOTE_TIMEOUT_MS,
        })
      : await chromium.launch({
          headless: true,
          timeout: LOCAL_TIMEOUT_MS,
          args: ["--no-sandbox"],
        });

    const context =
      browser.contexts()[0] ??
      (await browser.newContext({
        viewport: { width: request.viewportWidth, height: request.viewportHeight },
        deviceScaleFactor: request.scale,
      }));

    const page = await context.newPage();
    const telemetry = {
      consoleErrors: [] as string[],
      pageErrors: [] as string[],
      failedRequests: [] as string[],
    };

    page.on("console", (message) => {
      if (message.type() === "error") {
        telemetry.consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", (error) => {
      telemetry.pageErrors.push(error.message);
    });

    page.on("requestfailed", (request_) => {
      telemetry.failedRequests.push(`${request_.method()} ${request_.url()}`);
    });

    return {
      browser,
      context,
      page,
      telemetry,
      release: async () => {
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
          await browser.close();
        } catch {
          // Best-effort cleanup.
        }
      },
    };
  } catch (error) {
    throw new RenderError(
      "BROWSER_ACQUISITION_FAILED",
      request.browserWsEndpoint
        ? "Failed to connect to the remote Chromium endpoint."
        : "Failed to launch the local Chromium browser.",
      {
        browserWsEndpoint: request.browserWsEndpoint,
        cause: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

export async function navigateAndWait(
  session: BrowserSession,
  request: ValidatedExportRequest,
): Promise<void> {
  const fileUrl = new URL(`file://${request.inputPath}`);

  try {
    await session.page.goto(fileUrl.toString(), { waitUntil: "networkidle" });
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
