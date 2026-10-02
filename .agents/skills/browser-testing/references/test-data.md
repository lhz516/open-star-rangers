# Synthetic Browser Test Data

Browser automation uses code-owned synthetic content in a fresh browser context. Original resources, decoded media, captured original screens, and real user saves are not fixtures.

## Discover the actual contracts

Read the selected spec and the owning TypeScript types before preparing state. Core/save types belong in `src/core/`, normalized content in `src/content/`, original-format structures in `src/original-data/`, and persistence adapters in `src/platform/`.

Some of these modules may not exist yet. Do not invent a storage schema or assume a test hook exists. If the feature is not implemented or safely testable, record the missing prerequisite.

## Format fixtures

Reuse [synthetic.ts](../../../../src/original-data/synthetic.ts) and nearby parser tests:

- `ByteWriter` builds explicit little-endian fields.
- `buildImfat` builds code-owned archive directories/payloads.
- `imageRecord` builds the shared image record; append invented palettes and pixels.

Use small invented meshes, palettes, glyphs, task data, and PCM where the approved test requires them. Do not copy values or decoded output from original game files.

Generate file-input fixtures in memory or an explicitly identified temporary location. Synthetic disc-image fixtures are generated at test time, not committed as image binaries. Remove named temporary files afterward; preserve reusable source builders/tests that are part of the approved implementation.

## Game scenarios

- Use a fixed seed, explicit initial state, and known per-tick input/commands.
- Enter the synthetic scene through the app's supported UI or existing test fixture interface.
- Assertions use returned events, projections, rendered outcomes, and existing read-only development telemetry.
- Never mutate the live authoritative Core world from browser JavaScript to manufacture a passing test.
- Label prototype behavior as synthetic; it is not original-game fidelity evidence.

## Browser storage

1. Use a fresh context/profile and preserve its origin for the entire scenario.
2. Create synthetic settings/saves through the application, or its already-approved test adapter when UI setup cannot represent the case.
3. Match actual record types, database/store names, schema/save versions, and content fingerprints. Do not guess.
4. Verify values through read-back or reload/export/import; key counts alone are insufficient.
5. Corrupt/incompatible legacy fixtures must be synthetic and must exercise the application's real validation/recovery path.
6. Use scoped test fault injection only when it represents the specified failure. A generic thrown exception does not prove IndexedDB transaction atomicity or actual quota handling.

Metadata inspection can help diagnose the isolated context, but is not acceptance evidence by itself. For example, using a supported Playwright tool:

```js
await page.evaluate(async () => ({
  localStorageKeys: Object.keys(localStorage),
  indexedDbMetadata: typeof indexedDB.databases === 'function'
    ? await indexedDB.databases()
    : 'Database enumeration is unsupported in this browser',
}));
```

Do not call `indexedDB.open` merely to inspect a guessed database: it can create an empty database or trigger an upgrade. Use known initialized application stores and read-only transactions through existing adapters when available.

## Cleanup and evidence

- Prefer destroying the fresh test context to resetting persistent user state.
- Never run blanket `localStorage.clear()` or delete existing application databases in a shared profile.
- Remove only exact owned temporary files and stop only owned processes.
- Summarize synthetic record fields and observed behavior without private paths or original resource data.
- Record acceptance evidence in the assigned subtask; do not create a parallel execution tracker.
