#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vinext="${project_root}/node_modules/.bin/vinext"

if [[ ! -x "${vinext}" ]]; then
  echo "Dependencies are missing. Run npm ci first." >&2
  exit 69
fi

"${vinext}" build
node --test "${project_root}/tests/rendered-html.test.mjs"
