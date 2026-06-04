#!/usr/bin/env bash
set -euo pipefail

echo "==> typecheck"
pnpm typecheck

echo "==> lint"
pnpm lint

echo "==> test"
pnpm test

echo "==> format check"
pnpm format:check

echo "all checks passed"
