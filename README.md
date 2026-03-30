# Ream Development Workspace

Development workspace for the Ream framework. Uses git submodules to link all packages.

## Setup

```bash
git clone --recursive git@github.com:C9up/ream-dev.git
cd ream-dev
pnpm install
cargo build --release
```

## Commands

```bash
# Run all TypeScript tests
pnpm test

# Run all Rust tests
pnpm test:rust

# Build Rust crates
pnpm build:rust

# Lint TypeScript
pnpm lint
```

## Structure

Each package is a git submodule pointing to its own repository:

| Directory | Repository | Package |
|-----------|------------|---------|
| `packages/ream` | [C9up/ream](https://github.com/C9up/ream) | `@c9up/ream` |
| `packages/pulsar` | [C9up/pulsar](https://github.com/C9up/pulsar) | `@c9up/pulsar` |
| `packages/atlas` | [C9up/atlas](https://github.com/C9up/atlas) | `@c9up/atlas` |
| `packages/rune` | [C9up/rune](https://github.com/C9up/rune) | `@c9up/rune` |
| `packages/warden` | [C9up/warden](https://github.com/C9up/warden) | `@c9up/warden` |
| `packages/spectrum` | [C9up/spectrum](https://github.com/C9up/spectrum) | `@c9up/spectrum` |
| `packages/forge` | [C9up/forge](https://github.com/C9up/forge) | `@c9up/forge` |
| `packages/create-ream` | [C9up/create-ream](https://github.com/C9up/create-ream) | `create-ream` |
| `docs` | [C9up/v1-docs](https://github.com/C9up/v1-docs) | Documentation |

## Workflow

1. Make changes in any `packages/<name>/` directory
2. Test with `pnpm test`
3. Commit and push from the submodule directory — it pushes to the package's own repo
4. Commit the submodule reference update in `ream-dev`

## License

MIT
