# Changesets

Every change to a package under `packages/` needs a changeset: run `pnpm changeset`, pick the packages and the bump (patch, minor or major) and describe the change for the changelog. Commit the generated file with your change.

To release, run `pnpm version-packages` (applies the changesets: bumps versions, writes CHANGELOG.md files, updates internal dependencies), commit, then `pnpm release` (builds the packages and publishes the new versions). The app in `apps/web` is private and is never versioned or published.
