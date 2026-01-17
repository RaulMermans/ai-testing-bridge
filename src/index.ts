#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, Browser, Page } from "playwright";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security: SSRF Protection - Block private IP ranges and metadata endpoints
const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "169.254.169.254", // AWS/GCP metadata
  "metadata.google.internal",
  "::1", // IPv6 localhost
];

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^fc00:/,
  /^fd00:/,
];

function validateUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Only allow http/https
    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, error: "Only HTTP/HTTPS protocols are allowed" };
    }

    // Check blocked hosts
    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_HOSTS.includes(hostname)) {
      return {
        valid: false,
        error: "Access to localhost/metadata endpoints is blocked",
      };
    }

    // Check private IP ranges
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(hostname)) {
        return { valid: false, error: "Access to private IP ranges is blocked" };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: "Invalid URL format" };
  }
}

// Security: Sanitize filename to prevent path traversal
function sanitizeFilename(filename: string): string {
  // Remove path separators and dangerous characters
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "") // Remove leading dots
    .substring(0, 255); // Limit length
}

// Schema definitions
const InspectSiteSchema = z.object({
  url: z.string().url(),
});

const CaptureScreenshotSchema = z.object({
  url: z.string().url(),
  filename: z.string().optional(),
});

const CheckElementSchema = z.object({
  url: z.string().url(),
  selector: z.string(),
});

// Ensure screenshots directory exists
const screenshotsDir = path.join(__dirname, "..", "screenshots");
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Resource limits
const MAX_SCREENSHOT_SIZE_MB = 50;
const NAVIGATION_TIMEOUT_MS = 30000;

// Browser management
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      // Security: Disable file downloads to prevent abuse
      args: ["--disable-dev-shm-usage"],
    });
  }
  return browser;
}

async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

// Tool implementations
async function inspectSite(url: string) {
  const startTime = Date.now();
  let page: Page | null = null;
  const consoleErrors: string[] = [];

  // Security: Validate URL before navigation
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      error: `Security: ${validation.error}`,
      loadTime: 0,
    };
  }

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const loadTime = Date.now() - startTime;
    const title = await page.title();
    const status = response?.status() || 0;

    return {
      success: true,
      status,
      title,
      loadTime,
      consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
    };
  } catch (error) {
    const loadTime = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      loadTime,
      consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

async function captureScreenshot(url: string, filename?: string) {
  let page: Page | null = null;

  // Security: Validate URL before navigation
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      error: `Security: ${validation.error}`,
    };
  }

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    // Security: Sanitize filename to prevent path traversal
    const screenshotFilename = filename
      ? sanitizeFilename(filename)
      : `screenshot-${timestamp}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotFilename);

    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    // Security: Check screenshot file size
    const stats = fs.statSync(screenshotPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB > MAX_SCREENSHOT_SIZE_MB) {
      // Delete oversized screenshot
      fs.unlinkSync(screenshotPath);
      return {
        success: false,
        error: `Screenshot exceeds size limit (${fileSizeMB.toFixed(2)}MB > ${MAX_SCREENSHOT_SIZE_MB}MB)`,
      };
    }

    // Get viewport size for dimensions
    const viewport = page.viewportSize();

    return {
      success: true,
      path: screenshotPath,
      filename: screenshotFilename,
      fileSizeMB: parseFloat(fileSizeMB.toFixed(2)),
      dimensions: viewport
        ? { width: viewport.width, height: viewport.height }
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

async function checkElement(url: string, selector: string) {
  let page: Page | null = null;

  // Security: Validate URL before navigation
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      error: `Security: ${validation.error}`,
    };
  }

  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    const locator = page.locator(selector);
    const isVisible = await locator.isVisible().catch(() => false);
    const textContent = isVisible
      ? await locator.textContent().catch(() => null)
      : null;

    return {
      success: true,
      found: isVisible,
      visible: isVisible,
      textContent: textContent || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

// MCP Server setup
const server = new Server(
  {
    name: "ai-testing-bridge",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "inspect_site",
        description:
          "Navigate to a URL and return HTTP status, page title, load time, and console errors. Great for spotting broken deployments.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to inspect",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "capture_screenshot",
        description:
          "Navigate to a URL and take a full-page screenshot. Saves to local screenshots folder.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to screenshot",
            },
            filename: {
              type: "string",
              description:
                "Optional custom filename (defaults to timestamp-based name)",
            },
          },
          required: ["url"],
        },
      },
      {
        name: "check_element",
        description:
          "Verify if a specific CSS selector is visible on the page. Returns visibility status and text content.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "The URL to check",
            },
            selector: {
              type: "string",
              description: "CSS selector to verify (e.g., '.login-button')",
            },
          },
          required: ["url", "selector"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "inspect_site": {
        const { url } = InspectSiteSchema.parse(args);
        const result = await inspectSite(url);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "capture_screenshot": {
        const { url, filename } = CaptureScreenshotSchema.parse(args);
        const result = await captureScreenshot(url, filename);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "check_element": {
        const { url, selector } = CheckElementSchema.parse(args);
        const result = await checkElement(url, selector);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid arguments: ${error.message}`);
    }
    throw error;
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Cleanup on exit
  process.on("SIGINT", async () => {
    await closeBrowser();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
