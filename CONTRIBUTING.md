# Contributing

Clone the repository and run `npm run dev` with Node.js 20+. Open http://localhost:8080. Native ES modules need no dependencies, build or compilation. A Python static server also works.

For bug reports, include browser/version, device, reproduction steps, expected behavior and the selected path (`glass.renderer`). Screenshots help with optical issues. Test `mode: 'css'` to distinguish SVG problems from layout issues.

For a focused pull request:

1. Explain the concrete behavior it fixes or adds.
2. Preserve native events, focus order, touch/pointer interaction and cleanup.
3. Check multiple instances, responsive sizes and the CSS fallback.
4. Preserve material defaults of Refraction 100, Blur 0 and Light 22 unless changing them is the purpose.
5. Run `npm run check` and `npm test`. Run `/tests/browser.html` for component changes.
6. Update documentation and TypeScript declarations for API changes.
7. Record new asset sources and licenses in `ASSETS.md`.

`src/` is the library. `examples/` and the root page show integration. `demo/` preserves the original WebGL wallpaper experiment; it is not a library dependency.

Do not commit credentials, personal uploads, environment files, generated output or deployment-specific configuration.
