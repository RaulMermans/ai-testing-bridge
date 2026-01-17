# AI Testing Bridge

MCP server for health checks and visual verification of Railway deployments using Playwright.

## Features

- **Health Checks**: Navigate to URLs and capture HTTP status, page title, load time, and console errors
- **Visual Verification**: Take full-page screenshots of deployments
- **Element Verification**: Check if specific UI elements (buttons, forms, etc.) are visible on pages

## Installation

### Prerequisites

- Node.js (v18 or higher)
- pnpm (v10 or higher)

### Setup

1. Clone or navigate to this repository:
   ```bash
   cd ai-testing-bridge
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Install Playwright browser binaries (CRITICAL STEP):
   ```bash
   npx playwright install --with-deps chromium
   ```

4. Build the project:
   ```bash
   pnpm build
   ```

## Usage

### As an MCP Server (Claude Desktop)

1. Add the server to your Claude Desktop configuration file:

   **Location**: `~/Library/Application Support/Claude/claude_desktop_config.json`

   ```json
   {
     "mcpServers": {
       "ai-testing-bridge": {
         "command": "node",
         "args": ["/Users/raulm/Desktop/GitHub/my-ai-infrastructure/ai-testing-bridge/dist/index.js"]
       }
     }
   }
   ```

2. Restart Claude Desktop

3. The following tools will be available:

   - **inspect_site**: Check if a deployment is live
   - **capture_screenshot**: Take a screenshot of a page
   - **check_element**: Verify if a specific element exists

### Example Commands (in Claude Desktop)

```
"Check if https://my-railway-app.up.railway.app is online"

"Take a screenshot of https://my-railway-app.up.railway.app"

"Check if the login button is visible on https://my-app.com using selector '.login-btn'"
```

## Available Tools

### 1. `inspect_site`

Navigate to a URL and return health metrics.

**Input:**
- `url` (string, required): Target URL to inspect

**Output:**
- HTTP status code
- Page title
- Load time (ms)
- Console errors (if any)

### 2. `capture_screenshot`

Take a full-page screenshot and save to local folder.

**Input:**
- `url` (string, required): Target URL
- `filename` (string, optional): Custom filename (defaults to timestamp)

**Output:**
- Screenshot file path (absolute)
- Filename
- Image dimensions

**Note**: Screenshots are saved to `./screenshots/` directory.

### 3. `check_element`

Verify if a CSS selector is visible on the page.

**Input:**
- `url` (string, required): Target URL
- `selector` (string, required): CSS selector (e.g., `.login-button`, `#submit`)

**Output:**
- Element found (boolean)
- Element visible (boolean)
- Text content (if visible)

## Development

### Commands

- `pnpm dev`: Run server in watch mode
- `pnpm build`: Compile TypeScript to JavaScript
- `pnpm typecheck`: Run TypeScript type checking

### Architecture

- **Headless Mode**: All Playwright operations run headless (no browser windows)
- **Error Handling**: Graceful failures - server never crashes on network/timeout errors
- **Resource Cleanup**: Browser contexts/pages are properly closed after each operation
- **Timeouts**: 30-second default navigation timeout

## Security

This tool implements several security measures to protect against common attacks:

### SSRF Protection

Blocks access to:
- Localhost and loopback addresses (127.0.0.1, ::1)
- Private IP ranges (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
- Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
- Non-HTTP/HTTPS protocols (file://, ftp://, etc.)

If a URL is blocked, the tool will return a security error message.

### Path Traversal Protection

Screenshot filenames are automatically sanitized:
- Only alphanumeric characters, dots, hyphens, underscores allowed
- Path separators (/, \) are replaced with underscores
- Maximum filename length: 255 characters

### Screenshot Privacy Warning

**IMPORTANT**: Screenshots may capture sensitive information including passwords, session tokens, PII, or confidential data visible on the page.

**Best practices**:
- Never screenshot pages with visible credentials
- Do not commit screenshots to version control
- Delete screenshots after review
- Use isolated/test environments when possible

### Dependency Security

Run security audits regularly:
```bash
pnpm audit
pnpm audit --fix  # Apply automatic fixes
```

Update dependencies to patch vulnerabilities:
```bash
pnpm update
```

See [SECURITY.md](SECURITY.md) for detailed security documentation and reporting vulnerabilities.

## Troubleshooting

### "Browser executable not found"

Run the Playwright installation command again:
```bash
npx playwright install --with-deps chromium
```

### Screenshots folder doesn't exist

The folder is created automatically on first run. If issues persist, manually create it:
```bash
mkdir screenshots
```

### Server doesn't start in Claude Desktop

1. Verify the absolute path in your config file is correct
2. Ensure the project is built (`pnpm build`)
3. Check Claude Desktop logs for errors

## License

ISC
