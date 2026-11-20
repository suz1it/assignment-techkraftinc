// Verifies the production build is compatible with the strict Content Security Policy in
// src/index.html: run after `ng build` (part of `npm run verify`).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const outDir = 'dist/techkraft-app/browser';
const html = readFileSync(join(outDir, 'index.html'), 'utf8');
const failures = [];

const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html);
if (!meta) {
  failures.push('index.html has no Content-Security-Policy meta tag.');
} else {
  const directives = Object.fromEntries(
    meta[1]
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...values]) => [name, values]),
  );
  const scriptSrc = directives['script-src'] ?? directives['default-src'] ?? [];
  if (scriptSrc.includes("'unsafe-inline'")) failures.push("script-src allows 'unsafe-inline'.");
  if (scriptSrc.includes("'unsafe-eval'")) failures.push("script-src allows 'unsafe-eval'.");
  if (scriptSrc.some((source) => /^https?:|^\*$/.test(source))) {
    failures.push(`script-src allows remote hosts: ${scriptSrc.join(' ')}`);
  }
  if (!(directives['object-src'] ?? []).includes("'none'"))
    failures.push("object-src is not 'none'.");
  if (!directives['base-uri']) failures.push('base-uri is not restricted.');
}

// Inline scripts (including the build's critical-CSS swap script) would be blocked by script-src 'self'.
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const [, attributes, body] = match;
  if (!/\bsrc=/.test(attributes) || body.trim())
    failures.push(`Inline <script> found: ${match[0].slice(0, 80)}…`);
  const src = /\bsrc="([^"]+)"/.exec(attributes)?.[1] ?? '';
  if (/^(https?:)?\/\//.test(src)) failures.push(`Remote script found: ${src}`);
}
if (/\son[a-z]+\s*=/i.test(html))
  failures.push('Inline event handler attribute found in index.html.');

// eval-like constructs in our bundles would need 'unsafe-eval'.
for (const file of readdirSync(outDir).filter((name) => name.endsWith('.js'))) {
  const code = readFileSync(join(outDir, file), 'utf8');
  if (/\beval\(|new Function\(/.test(code)) failures.push(`${file} contains eval/new Function.`);
}

if (failures.length > 0) {
  console.error('CSP check failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(
  'CSP check passed: strict script-src, no inline scripts or handlers, no eval in bundles.',
);
