# Contributing to ytranscript

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/nadimtuhin/ytranscript.git
   cd ytranscript
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Run tests:
   ```bash
   bun test
   ```

4. Type check:
   ```bash
   bun run typecheck
   ```

5. Lint:
   ```bash
   bun run lint
   ```

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `bun test`
6. Commit your changes with a descriptive message
7. Push to your fork and submit a Pull Request

## Code Style

- We use [Biome](https://biomejs.dev/) for linting and formatting
- Run `bun run lint` before committing
- TypeScript strict mode is enabled

## Reporting Issues

- Check existing issues before creating a new one
- Include reproduction steps if reporting a bug
- Provide YouTube video IDs that demonstrate the issue (if applicable)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
