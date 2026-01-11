# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in ytranscript, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email the maintainer directly at [nadimtuhin@gmail.com](mailto:nadimtuhin@gmail.com)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution Timeline**: Depends on severity
  - Critical: Within 7 days
  - High: Within 14 days
  - Medium/Low: Within 30 days

### Disclosure Policy

- We follow responsible disclosure practices
- We will credit reporters in the changelog (unless anonymity is requested)
- We will coordinate disclosure timing with reporters

## Security Best Practices

When using ytranscript:

1. **Keep Updated**: Always use the latest version
2. **API Keys**: This package doesn't require API keys, but if you extend it, never commit secrets
3. **File Paths**: Be cautious with user-supplied file paths in CLI usage
4. **Output Files**: Transcripts may contain sensitive content - handle output files appropriately

## Dependencies

We use Dependabot to automatically monitor and update dependencies for security patches.
