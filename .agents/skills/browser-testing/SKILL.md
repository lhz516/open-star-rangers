---
name: browser-testing
description: 'Verify Open Star Rangers in a running browser using synthetic content: React flows, Canvas/WebGL rendering, Core-command feedback, keyboard/mouse input, Runtime lifecycle, and IndexedDB/localStorage behavior. Use for browser testing, UI/gameplay verification, reproducing browser bugs, or checks assigned by execute-goal.'
argument-hint: 'spec/subtask path or a concrete browser scenario'
---

# Browser Testing

Verify observable behavior in the running Vite application. This is not a substitute for Node/Core tests, fidelity measurements, real system-shortcut checks, or deployment verification.

Read [AGENTS.md](../../../AGENTS.md), [the task workflow](../../../docs/engineering/agent-workflow.md), the selected spec/subtask, and [synthetic test-data guidance](./references/test-data.md).

Do not modify application code while testing. Report findings to the caller; an execute-goal implementation pass may fix them and invoke this skill again.

## 1. Preflight

1. Discover available browser capabilities before calling tools. Use one supported browser tool family, without guessing tool names or arguments.
2. If browser tools are unavailable, report browser checks as blocked. CLI HTTP responses or screenshots from elsewhere are not an equivalent pass.
3. Identify the actual acceptance criteria, expected DOM/game/render/persistence outcomes, and required browser engines/devices.
4. Inspect the existing app process/origin before starting a server. Do not stop user-owned processes or unrelated projects.
5. Use a fresh, isolated browser context/profile for synthetic test data. If isolation is unavailable, do not mutate an existing user profile's storage; report the limitation and use safe read-only checks.
6. Keep the exact origin throughout the run; `localhost`, `127.0.0.1`, and different ports have separate storage.
7. Inspect existing scripts/tooling. The Vite shell may lack the feature, game renderer, or E2E runner; report what is missing instead of assuming it exists.

## 2. Start or reuse Vite

Use the repository's Node/pnpm versions and `pnpm dev`. Reuse a server only after confirming it serves this repository and the intended working tree.

If starting one, choose an available local port and run it in an attached async terminal session. For example, when port 5173 is free:

```sh
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
```

Verify the process is alive and HTTP-responsive, then navigate with the browser and confirm the application loaded. Record the actual URL. Do not detach the process or install new tooling merely for this check; restore dependencies only after a missing-dependency failure, using the lockfile.

A server response confirms startup, not acceptance. Check console errors, failed asset/module/Worker requests, and the feature's rendered behavior.

## 3. Prepare synthetic state

Follow [the test-data reference](./references/test-data.md):

- Generate archives/images/meshes/saves from code-owned synthetic fixtures; never use original files in agent-controlled browser checks or public automation.
- Prefer normal UI flows or existing scoped test fixtures. Do not write directly into Core state, add a public debug mutation API, or invent storage record shapes.
- Only exercise storage writes, corruption, quota-like failures, or version transitions in the isolated synthetic context.
- Record initial state, seed/tick inputs where relevant, and expected outputs so failures are reproducible.

Original-game reference comparisons remain separate authorized local research. Their screenshots and decoded output stay in `local/`, never in browser-test reports, tracked fixtures, or tool attachments.

## 4. Drive and observe

### React and application flows

- Use DOM/accessibility snapshots and locators for menus, settings, import status, errors, and focus.
- Exercise relevant empty/loading/error states, retries, repeated clicks, reloads, and return-to-menu flows.
- Confirm a UI command was accepted or rejected by Core and reflected by projection; an optimistic button label alone is not evidence.

### Canvas/WebGL and game runtime

- A Canvas element or a successful WebGL context is not proof of the intended scene.
- Observe the actual rendered synthetic result using screenshots plus the spec's assertions; use existing read-only development projections/telemetry when appropriate.
- Verify the relevant pause/resume/restart/exit behavior, tick advancement, event delivery, interpolation, and resource cleanup. Repeated lifecycle transitions must not produce duplicate loops/listeners.
- Use bounded observations and measurable thresholds from the spec. Do not add test-only world mutation hooks or infer performance from a single frame.
- Test resizing/aspect ratio and device-pixel-ratio handling when in scope. Classic defaults to a fixed logical aspect ratio; wider FOV is not a harmless fidelity-neutral change.

### Input and browser capabilities

- Verify applicable keydown/keyup, mouse behavior, focus loss, page visibility changes, and lock exit/recovery.
- Keep the page foregrounded for rAF-sensitive checks. If focus/visibility cannot be established, report the affected test as blocked rather than forcing clicks until it appears to pass.
- Fullscreen, Pointer Lock, Keyboard Lock, audio unlock, GPU performance, and system shortcuts may require real user gestures/devices.
- Synthesized Alt/Option/F-key events cannot prove browser or OS shortcuts were intercepted. WebKit automation is not a real Safari result; record engines and platforms precisely.
- Desktop keyboard/mouse is the first-release target. Do not introduce mobile-touch or Gamepad acceptance unless the approved scope explicitly changes that decision through an ADR.

### Local persistence and privacy

- Check synthetic save/settings results via actual read-back, reload, or export/import round trips, not merely the presence of keys.
- Exercise relevant incompatible/corrupt data, interrupted writes, quota/error feedback, cache identity/version, and resource reimport paths.
- Audit actual network requests when privacy is in scope. Imported resources and saves must not be uploaded; allow legitimate app-code requests without confusing them with resource leakage.
- Treat test-tool capability limitations as limitations, not an excuse to bypass application boundaries.

## 5. Record results

For every assigned case record:

| Criterion | Setup/action | Expected | Observed evidence | Result |
|---|---|---|---|---|

Use `passed`, `failed`, or `blocked`; unexecuted cases remain pending. Include browser/OS, viewport, origin, relevant errors, and exact unmet prerequisites. Only synthetic screenshots or sanitized output may be included.

For an active goal, put criterion evidence in the owning subtask's `完成证据`; the execute-goal caller updates tracker state. Otherwise report inline unless the user requested a saved report. Do not create a separate report stage or mark a whole task complete here.

## 6. Clean up

- Close only test contexts/pages you created.
- Remove only your specifically identified temporary synthetic files/scripts and test state.
- Stop only servers you started, using the recorded terminal handle or specific process ID. Leave reused user servers running.
- Never clear all site data or delete a user's save/resource stores.
- Preserve baseline working-tree changes. Report owned processes/artifacts intentionally retained at the user's request.

When invoked inside execute-goal, return findings and cleanup status so implementation can continue.
