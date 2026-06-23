#!/usr/bin/env node
/**
 * Google Workspace OAuth Setup
 *
 * Usage:
 *   npx tsx src/auth.ts                    # Auth with default credentials
 *   npx tsx src/auth.ts user@gmail.com     # Auth for specific account
 *
 * Environment:
 *   OAUTH_PORT=3457                        # Custom OAuth callback port (default: 3456)
 */

import { google } from "googleapis";
import { createServer } from "http";
import { parse } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import * as net from "net";
import open from "open";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_DIR = join(__dirname, "..", "accounts");
config({ path: join(__dirname, "..", ".env") });

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar",
];

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

/**
 * Find an available port starting from a base port
 */
async function findAvailablePort(basePort = 3456): Promise<number> {
  for (let port = basePort; port < basePort + 10; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${basePort}-${basePort + 10}`);
}

function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return join(process.env.HOME || process.env.USERPROFILE || "", filePath.slice(2));
  }
  return filePath;
}

function getAccounts(): string[] {
  return existsSync(ACCOUNTS_DIR)
    ? readdirSync(ACCOUNTS_DIR).filter((name: string) => !name.startsWith("."))
    : [];
}

function findFirstCredentialsPath(): string | null {
  for (const account of getAccounts()) {
    const credentialsPath = join(ACCOUNTS_DIR, account, "credentials.json");
    if (existsSync(credentialsPath)) return credentialsPath;
  }
  return null;
}

function materializeCredentialsFromEnv(credentialsPath: string): boolean {
  const source = process.env.GOOGLE_CREDENTIALS?.trim();
  if (!source) return false;

  mkdirSync(dirname(credentialsPath), { recursive: true });

  if (source.startsWith("{")) {
    writeFileSync(credentialsPath, JSON.stringify(JSON.parse(source), null, 2));
    console.log(`Wrote credentials from GOOGLE_CREDENTIALS to ${credentialsPath}`);
    return true;
  }

  const sourcePath = expandHome(source);
  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, credentialsPath);
    console.log(`Copied credentials from GOOGLE_CREDENTIALS path to ${credentialsPath}`);
    return true;
  }

  try {
    const decoded = Buffer.from(source, "base64").toString("utf-8");
    writeFileSync(credentialsPath, JSON.stringify(JSON.parse(decoded), null, 2));
    console.log(`Wrote base64 credentials from GOOGLE_CREDENTIALS to ${credentialsPath}`);
    return true;
  } catch {
    throw new Error("GOOGLE_CREDENTIALS must be a path, JSON credentials content, or base64 JSON credentials content");
  }
}

function ensureCredentials(accountDir: string, credentialsPath: string) {
  if (existsSync(credentialsPath)) return;

  if (materializeCredentialsFromEnv(credentialsPath)) return;

  const existingCredentials = findFirstCredentialsPath();
  if (existingCredentials) {
    mkdirSync(accountDir, { recursive: true });
    copyFileSync(existingCredentials, credentialsPath);
    console.log(`Copied credentials.json to ${accountDir}`);
    return;
  }

  console.error("No credentials.json found.");
  console.error("Add one to the account folder or set GOOGLE_CREDENTIALS to a credentials file path or JSON value.");
  process.exit(1);
}

async function authenticate(accountEmail?: string) {
  // Determine account directory
  let accountDir: string;
  let credentialsPath: string;
  let accountName = accountEmail || process.env.GOOGLE_ACCOUNT || "";

  if (!accountName && process.env.GOOGLE_CREDENTIALS) {
    accountName = "default";
  }

  if (accountName) {
    accountDir = join(ACCOUNTS_DIR, accountName);
    credentialsPath = join(accountDir, "credentials.json");

    // Create account folder if it doesn't exist
    if (!existsSync(accountDir)) {
      console.log(`Creating account folder: ${accountName}`);
      mkdirSync(accountDir, { recursive: true });
    }

    ensureCredentials(accountDir, credentialsPath);
  } else {
    // Find first account with credentials
    const firstCredentialsPath = findFirstCredentialsPath();

    if (!firstCredentialsPath) {
      console.error("No accounts found. Run with email: npx tsx src/auth.ts user@gmail.com");
      console.error("Or set GOOGLE_CREDENTIALS to a credentials file path or JSON value.");
      process.exit(1);
    }

    credentialsPath = firstCredentialsPath;
    accountDir = dirname(credentialsPath);
    accountName = basename(accountDir);
    console.log(`Using account: ${accountName}`);
  }

  if (!existsSync(credentialsPath)) {
    console.error(`credentials.json not found at ${credentialsPath}`);
    process.exit(1);
  }

  // Find available port (support OAUTH_PORT env var or auto-detect)
  const requestedPort = process.env.OAUTH_PORT ? parseInt(process.env.OAUTH_PORT) : 3456;
  const port = await findAvailablePort(requestedPort);

  if (port !== requestedPort) {
    console.log(`Port ${requestedPort} unavailable, using port ${port} instead`);
  }

  const credentials = JSON.parse(readFileSync(credentialsPath, "utf-8"));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    `http://localhost:${port}/callback`
  );

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent to get refresh token
  });

  console.log("\n========================================");
  console.log("Google Workspace OAuth Setup");
  console.log("========================================\n");
  console.log(`Account: ${accountName || "default"}`);
  console.log("\nOpening browser for authentication...\n");

  // Start local server to receive callback
  const server = createServer(async (req, res) => {
    const urlParts = parse(req.url || "", true);

    if (urlParts.pathname === "/callback") {
      const code = urlParts.query.code as string;

      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);

          // Save token
          const tokenPath = join(accountDir, "token.json");
          const tokenData = {
            token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_uri: "https://oauth2.googleapis.com/token",
            client_id,
            client_secret,
            scopes: SCOPES,
            universe_domain: "googleapis.com",
            account: accountName || "",
            expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
          };

          writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2));

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                  <h1 style="color: #22c55e;">✓ Authentication Successful!</h1>
                  <p>Account: <strong>${accountName || "default"}</strong></p>
                  <p>You can close this window.</p>
                </div>
              </body>
            </html>
          `);

          console.log("✓ Authentication successful!");
          console.log(`  Token saved to: ${tokenPath}`);

          setTimeout(() => {
            server.close();
            process.exit(0);
          }, 1000);

        } catch (error: any) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<h1>Error</h1><p>${error.message}</p>`);
          console.error("Error getting token:", error.message);
        }
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Error: No code received</h1>");
      }
    }
  });

  server.listen(port, () => {
    console.log(`Waiting for authentication callback on http://localhost:${port}/callback\n`);
    open(authUrl);
  });
}

// Get account email from command line
const accountEmail = process.argv[2];
authenticate(accountEmail);
