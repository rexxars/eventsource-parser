<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.0.1](https://github.com/rexxars/eventsource-parser/compare/v3.0.0...v3.0.1) (2025-03-27)

### Bug Fixes

- optimize `splitLines` function ([8952917](https://github.com/rexxars/eventsource-parser/commit/8952917a6f5b3d8c97175d00980538edc96b611d))
- throw helpful error if passing function to `createParser()` ([4cd3a44](https://github.com/rexxars/eventsource-parser/commit/4cd3a443f21c441be29e524637a3a603d4425a12))

## [3.0.0](https://github.com/rexxars/eventsource-parser/compare/v2.0.1...v3.0.0) (2024-10-19)

### ⚠ BREAKING CHANGES

- The parser now takes an object of callbacks instead of an `onParse` callback. This means you do not have to check the type of the event in the `onEvent` callback, but instead provide separate callbacks for each event type.
- The `ParsedEvent` type has been renamed to `EventSourceMessage` and the `type` attribute has been removed.
- The `EventSourceCallback` type has been removed in favor of the `ParserCallbacks` interface.

BREAKING CHNAGE: The `ReconnectInterval` type has been removed in favor of providing the interval directly to the `onRetry` callback.

- The `ParseEvent` type has been removed in favor of providing separate callbacks for each event type.
- The parser has been rewritten to be more specification compliant. Certain _rare_ edge cases may now be handled differently. Mixed CRLF and LF line endings will now be handled correctly. `retry` fields now have to be completely valid integers to be parsed.

### Features

- provide `onError`, `onComment`, and `onRetry` callbacks ([#15](https://github.com/rexxars/eventsource-parser/issues/15)) ([c544729](https://github.com/rexxars/eventsource-parser/commit/c54472901ddf0674b38deb164013feade31d9869))

## [2.0.1](https://github.com/rexxars/eventsource-parser/compare/v2.0.0...v2.0.1) (2024-08-07)

### Bug Fixes

- include root-level legacy export in published files ([c814b4b](https://github.com/rexxars/eventsource-parser/commit/c814b4bc03fc0f72729a88a829c33e243c2c3cc8))

## [2.0.0](https://github.com/rexxars/eventsource-parser/compare/v1.1.2...v2.0.0) (2024-08-07)

### ⚠ BREAKING CHANGES

- BREAKING: minimum node.js version is now v18

### Bug Fixes

- BREAKING: minimum node.js version is now v18 ([d652333](https://github.com/rexxars/eventsource-parser/commit/d652333674e6e26ecd23e0b85cc83f57e06d894e))
- enable legacy exports ([b88e02c](https://github.com/rexxars/eventsource-parser/commit/b88e02cdfb3cf2e503eb9dc51e8115121fee7eea))

## [1.1.2](https://github.com/rexxars/eventsource-parser/compare/v1.1.1...v1.1.2) (2024-02-13)

### Bug Fixes

- add field `typesVersions` in package.json ([efcde97](https://github.com/rexxars/eventsource-parser/commit/efcde97173e02313f2702348088d319946a40859)), closes [#7](https://github.com/rexxars/eventsource-parser/issues/7)

## [1.1.1](https://github.com/rexxars/eventsource-parser/compare/v1.1.0...v1.1.1) (2023-09-20)

### Bug Fixes

- publish only source and dist folders ([af08bcb](https://github.com/rexxars/eventsource-parser/commit/af08bcb72cda660b0c34d7c2be5794b8d5f9a07e))

## [1.1.0](https://github.com/rexxars/eventsource-parser/compare/v1.0.0...v1.1.0) (2023-09-20)

### Features

- implement and expose `EventSourceParserStream` class ([aac9c6f](https://github.com/rexxars/eventsource-parser/commit/aac9c6f04dd082434baddbd808fd8df52f704506))

### Bug Fixes

- exclude pattern for tests ([04fc73e](https://github.com/rexxars/eventsource-parser/commit/04fc73e804361fc9e4f3922023a5845150d7ae37))

## [1.0.0](https://github.com/rexxars/eventsource-parser/compare/v0.1.0...v1.0.0) (2023-03-23)

### ⚠ BREAKING CHANGES

- improve ESM/CJS compatibility, require node 14 or higher

### Code Refactoring

- improve ESM/CJS compatibility, require node 14 or higher ([26d630e](https://github.com/rexxars/eventsource-parser/commit/26d630e9fc53d3a9e6952dff4b53289e48d1b092))
