// Fails if any production dependency uses a license outside the MIT-compatible allowlist.
// Usage: pnpm licenses list --prod --json | node scripts/check-licenses.mjs
import process from 'node:process'

const ALLOWED_LICENSES = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'MPL-2.0', // weak copyleft per file; fine when used unmodified
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0', // data only (caniuse-lite)
  'Unlicense',
  'Python-2.0',
])

// Package-specific exceptions, each with a justification.
const ALLOWED_PACKAGES = new Map([
  [
    '@img/sharp-libvips-linux-x64',
    'LGPL-3.0: prebuilt libvips dynamically loaded by sharp (Next.js image optimization), unmodified.',
  ],
  ['@img/sharp-libvips-linuxmusl-x64', 'Same as above (Alpine/musl build).'],
  ['@img/sharp-libvips-linux-arm64', 'Same as above (arm64 build).'],
  ['@img/sharp-libvips-darwin-arm64', 'Same as above (macOS arm64 build).'],
])

let input = ''
for await (const chunk of process.stdin) input += chunk

const byLicense = JSON.parse(input)
const violations = Object.entries(byLicense).flatMap(([license, packages]) =>
  ALLOWED_LICENSES.has(license)
    ? []
    : packages
        .filter((pkg) => !ALLOWED_PACKAGES.has(pkg.name))
        .map((pkg) => `${pkg.name}@${pkg.versions.join(',')} (${license})`),
)

if (violations.length > 0) {
  process.stderr.write(`Disallowed licenses found:\n  ${violations.join('\n  ')}\n`)
  process.exit(1)
}

const total = Object.values(byLicense).reduce((sum, pkgs) => sum + pkgs.length, 0)
process.stdout.write(`License check passed (${total} production packages).\n`)
