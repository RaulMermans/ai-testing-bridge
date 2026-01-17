# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in AI Testing Bridge, please report it privately:

1. **DO NOT** create a public GitHub issue
2. Email the maintainer or use GitHub's private security advisory feature
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We aim to respond within 48 hours and will work with you to address the issue promptly.

## Security Considerations

### SSRF Protection

This MCP server navigates to user-provided URLs using Playwright. To prevent Server-Side Request Forgery (SSRF) attacks:

- **Blocked**: localhost, 127.0.0.1, private IP ranges (10.x, 192.168.x, 172.16-31.x)
- **Blocked**: Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
- **Allowed**: Only HTTP/HTTPS protocols

If you need to test local/internal deployments, use a different tool or explicitly add an allowlist configuration (not implemented by default for security).

### Path Traversal Protection

Screenshot filenames are sanitized to prevent directory traversal:
- Only alphanumeric characters, dots, hyphens, and underscores allowed
- Leading dots removed
- Maximum length: 255 characters

### Screenshot Privacy

**WARNING**: Screenshots may capture sensitive information including:
- Credentials displayed on pages
- Personal data (PII)
- Session tokens in URLs or page content
- Proprietary/confidential information

**Recommendations**:
- Never screenshot pages with visible secrets
- Do not commit screenshots to version control
- Securely delete screenshots after use
- Consider using authenticated/isolated environments for testing

### Dependency Security

Run regular security audits:
```bash
pnpm audit
pnpm update
```

Playwright browser binaries are updated with package updates. Keep dependencies current.

### Resource Limits

To prevent resource exhaustion:
- Default 30-second timeout per navigation
- Browser instances are reused (singleton pattern)
- Pages are explicitly closed after each operation

Consider implementing rate limiting if exposing this service over a network (not recommended).

### Known Limitations

1. **No authentication**: This server has no built-in auth. Relies on MCP stdio transport security.
2. **Local file access**: Screenshots are written to local filesystem with current user permissions.
3. **JavaScript execution**: Playwright executes JavaScript on target pages (inherent to browser automation).

## Security Best Practices

### Deployment

- **DO NOT** expose this service over HTTP/network without authentication
- **DO** run with least-privilege user account
- **DO** use in isolated/sandboxed environments for untrusted URLs
- **DO** regularly update dependencies

### Usage

- **Validate** that URLs are expected/trusted before passing to tools
- **Review** screenshots before sharing (may contain sensitive data)
- **Rotate** secrets if accidentally captured in screenshots
- **Monitor** for unusual activity (unexpected URLs, excessive requests)

## Contact

For security-related questions or concerns, please contact the repository maintainer.
