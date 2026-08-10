---
'eventsource-parser': major
---

pr: 33

Require Node.js 22.12 or higher, drop the CommonJS build, and discard invalid lines instead of buffering them

**Breaking changes**

- Node.js 18 and 20 are no longer supported. `engines` now requires `>=22.12`, and the browserslist target moved from `node >= 18` to `node >= 22.12`. Older versions may keep working, but they are no longer tested or guaranteed.
- The CommonJS build has been removed. The `main` field and the `require` export conditions are gone, so the package resolves to `./dist/index.js` and `./dist/stream.js` only. Node 22.12 and above supports `require(esm)` transparently, so `require('eventsource-parser')` continues to work there.
- The root `stream.js` file has been removed. It re-exported `./dist/stream.cjs` for React Native and other bundlers without package exports support. Import `eventsource-parser/stream` instead, and make sure your bundler resolves the `exports` field.
- Invalid lines are now discarded as soon as the parser can tell they cannot become a valid SSE field, rather than being buffered until the line terminator arrives. `onError` is not called for these, and no `line`, `field`, or `value` is retained. Only lines that are complete when found to be invalid still produce a `ParseError` with `type: 'unknown-field'`. This also means `reset({consume: true})` no longer reports pending data that was already discarded.
- Partial comment lines (starting with `:`) are only buffered when an `onComment` callback is configured. Without one, they are discarded like any other line the parser has no use for.

**Other changes**

- A leading byte order mark is now stripped whether it arrives as a decoded `U+FEFF` (for example from a `TextDecoder` created with `ignoreBOM`) or as the raw three byte `0xEF 0xBB 0xBF` sequence. Previously only the raw form was handled.
- The README documented an `invalid-field` error type that the parser never emitted. The `ErrorType` union is unchanged; the documentation now correctly refers to `unknown-field`.
