# Contributing to Podcast Recorder

Thank you for your interest in contributing to Podcast Recorder! This document provides guidelines and information for contributors.

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in [GitHub Issues](https://github.com/roseratugo/podcast-recorder/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, version, etc.)

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and its use case
3. Explain why it would benefit the project

### Submitting Code

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests and linting: `pnpm lint && pnpm typecheck`
5. Commit with conventional commits: `git commit -m "feat: add my feature"`
6. Push and open a Pull Request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/roseratugo/podcast-recorder.git
cd podcast-recorder

# Install dependencies
pnpm install

# Start development
pnpm dev:desktop
```

## Code Style

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

With optional emoji:
- ✨ `feat` - New feature
- 🐛 `fix` - Bug fix
- 📚 `docs` - Documentation
- ♻️ `refactor` - Refactoring
- 🧹 `chore` - Cleanup

### TypeScript

- Use strict TypeScript
- Add types for all function parameters and returns
- Avoid `any` type

### React

- Use functional components with hooks
- Keep components small and focused
- Use Zustand for global state

### Formatting

Code is automatically formatted with Prettier and ESLint:

```bash
pnpm lint:fix
pnpm format
```

## Project Structure

```
apps/
├── desktop/     # Tauri desktop app
└── signaling/   # Cloudflare Worker

packages/
└── ui/          # Shared UI components
```

## Pull Request Process

1. Update documentation if needed
2. Ensure all tests pass
3. Request review from maintainers
4. Address review feedback
5. Squash commits before merge

## Questions?

Feel free to open an issue or reach out to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the project's MIT + Commons Clause license.
