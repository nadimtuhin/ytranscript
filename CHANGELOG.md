# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.2] - 2025-01-12

### Fixed
- Reverted bin paths to use simple relative paths to appease npm validation
- Kept permission fixes

## [1.2.1] - 2025-01-12

### Fixed
- Fixed CLI binary permissions and path resolution for `npx` execution
- Added explicit executable permissions to build artifacts

## [1.2.0] - 2025-01-12

### Added
- Proxy support for CLI and programmatic API via `--proxy` flag and `proxy` option
- Automatic proxy detection from `HTTP_PROXY` / `HTTPS_PROXY` environment variables
- `ProxyConfig` type exported for TypeScript users
- Documentation for proxy configuration in README

### Changed
- Uses undici's ProxyAgent for proxy support (inspired by ytfetcher)

## [1.1.0] - 2024-01-12

### Added
- Node.js compatibility - now works with `npx @nadimtuhin/ytranscript`
- Cross-runtime file utilities for Node.js/Bun compatibility
- TypeScript declaration files (.d.ts) for library consumers
- Comprehensive test suite (83 tests, 98% coverage)
- Tests for output writers, fetcher (mocked), and fs utilities
- Concurrent append test to verify no data loss
- README badges for npm, CI, coverage, license, and runtime support

### Fixed
- Race condition in `appendJsonl` - now uses atomic append
- Race condition in `writeCsv` append mode - now uses atomic append

### Changed
- CLI shebang changed from `#!/usr/bin/env bun` to `#!/usr/bin/env node`
- Build targets Node.js instead of Bun for broader compatibility
- Added Node.js 18+ engine requirement

## [1.0.2] - 2024-01-11

### Fixed
- npm package binary configuration

## [1.0.1] - 2024-01-11

### Fixed
- Package publishing configuration

## [1.0.0] - 2024-01-11

### Added
- Initial release
- CLI with `get`, `bulk`, and `info` commands
- MCP server with 4 tools (`get_transcript`, `get_transcript_languages`, `extract_video_id`, `get_transcripts_bulk`)
- Direct YouTube innertube API integration (no third-party services)
- Google Takeout support (watch history JSON, watch-later CSV)
- Multiple output formats (text, JSON, JSONL, CSV, SRT, VTT)
- Bulk processing with concurrency control
- Resume-safe processing (skips already-processed videos)
- Programmatic API for library usage
