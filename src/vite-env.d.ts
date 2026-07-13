/// <reference types="vite/client" />

// This project has no `@types/node` dependency (tsconfig's `types` array is
// deliberately just `["vitest/globals", "@testing-library/jest-dom"]` — see
// CLAUDE.md gotcha 4), so bare Node built-ins have no ambient type and
// `tsc --noEmit` fails on them with "Cannot find name '<module>'". The only
// user is src/ui/theme.test.ts, which reads styles.css via 'node:fs' under
// vitest (real Node) to cross-check it against theme.ts. Declaring just the
// one export it calls is cheaper than adding a dependency for one call site.
declare module 'node:fs' {
  export function readFileSync(path: URL | string, encoding: 'utf8'): string;
}
