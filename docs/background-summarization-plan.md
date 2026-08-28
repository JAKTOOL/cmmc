# Plan: background evidence summarization and a minimizable draft panel

Status: planned (2026-08-28). Not implemented.

## Context

Three UX problems exist today:

- The "Draft from evidence" flow (`DraftPanel`) is a full-screen blocking modal. Document summarization runs inside it, and the user must wait. The modal's unmount effect aborts the job, so navigation kills it.
- Evidence summaries are computed lazily, on the first draft request. That is exactly when the user watches. Summaries computed at add/update time would make the draft flow hit the cache and start almost immediately.
- The View Evidence page has no way to pre-summarize the whole corpus on demand.
- The evidence edit modal has no way to summarize one file on demand.

The fix has four parts that share one new UI element: a bottom-docked task chip area for background AI work.

Decisions (confirmed 2026-08-28):

- The auto-summarize toggle defaults to off. The feature loads a 1-3 GB model and runs GPU inference without a user action, so it is opt-in.
- A click on the modal backdrop minimizes the panel. It no longer aborts the run. The ✕ and Close buttons remain the explicit abort.
- The draft pipeline moves into a module-level store. A per-page mount was rejected: client navigation unmounts the panel and the cleanup effect kills the job.
- Background work coordinates with interactive work through an explicit pause API, not through status polling alone. See "Coordination" below.

## Verified groundwork (no code change needed)

- The LLM runs in a web worker (`client/src/app/llm/engine.ts`). One generation runs at a time. `generate()` throws "A generation is already running" on a second call. The UI blocking is a state-ownership problem, not a threading problem.
- `ensureDocSummary` (`client/src/app/llm/summarize.ts:194-272`) works per file, with no requirement context. It caches in the IDB `evidence_summaries` store, keyed by evidence content hash. The fingerprint covers evidence id + `EXTRACTOR_VERSION` + `SUMMARY_VERSION` + model id. It persists chunk summaries as it goes (`complete: false`) and resumes interrupted runs.
- The repo idiom for global state is a module-level listener store with a snapshot getter (`subscribeLlmStatus` in `engine.ts:71-87`, `loader.tsx`), consumed through `useSyncExternalStore`, with hosts mounted in the root `client/src/app/layout.tsx`.
- The text-extraction reconciler (`client/src/app/search/evidence_text_store.ts`) is the pattern for background sync: `reconcile()` diffs stores, one artifact at a time; `ensureEvidenceTextSynced()` coalesces concurrent calls (`inFlight`/`rerun`); `startEvidenceTextSync()` is idempotent, uses `requestIdleCallback` (fallback: `setTimeout` 2 s) for startup, and listens to `TABLE_CHANGED_EVENT` with a 1 s debounce.
- `TABLE_CHANGED_EVENT` (`client/src/app/db.ts:540-548`) fires on window after every IDB put/delete/clear, with `detail.table`.
- Evidence is readable when its `IDBEvidenceText` row has `status === "ok"` and non-empty text. Evidence id is a SHA-256 content hash. One file can link to many requirements; summaries are per file.
- Settings live in localStorage (`client/src/app/llm/settings.ts`). The AI settings modal (`client/src/app/components/ai/model_settings.tsx`) opens through `openAiSettings()` and holds the enable toggle, model select, and weights status.
- The other interactive `generate()` consumer is the objective review: `run()` in `client/src/app/ai/review.ts` (~line 118).

## Part 1: minimizable draft panel

### 1. New file `client/src/app/components/ai/draft_job.ts` — store + pipeline

Single job slot. The worker runs one generation at a time, so one slot is correct.

```ts
export type DraftJobPhase = "preparing" | "generating" | "done" | "error";

export interface DraftJobState {
    requirement: ElementWrapper;
    subStatements: { id: string; text: string }[];
    focusId?: string;
    /** window.location.pathname captured at start — where Insert works. */
    returnPath: string;
    // Pipeline state, moved 1:1 from draft_panel.tsx useState
    phase: DraftJobPhase;
    statusNote: string;
    draft: string;
    chunks: EvidenceChunk[];
    usedOverviews: { filename: string; summary: string }[];
    unreadable: string[];
    findings: ReviewFinding[];
    staleFindings: number;
    prompt: string;
    error: string | null;
    // Minimize UX
    minimized: boolean;
    /** Reached done/error while minimized; cleared on restore. */
    attention: boolean;
}
```

Module-scope internals, not in the snapshot: `abortController`, `handle`, `runId`. These replace today's `abortRef`/`handleRef`/`runIdRef`. Snapshot updates must be immutable replacements, so that the `useSyncExternalStore` referential check works.

Exported API:

- `getDraftJob()` / `subscribeDraftJob(listener)` — the `engine.ts` listener pattern.
- `startDraftJob({ requirement, subStatements, focusId })` — no-op while a job is preparing/generating; replaces a finished job. Captures `returnPath`, then runs the pipeline.
- `rerunDraftJob()` — the Regenerate path: bump `runId`, abort, re-run with stored params.
- `stopDraftJob()` — `handle?.abort()`; the worker finishes early and the normal done path runs with the partial draft.
- `minimizeDraftJob()` / `restoreDraftJob()` — flip `minimized`; restore clears `attention`.
- `closeDraftJob()` — bump `runId`, abort controller and handle, clear the job.
- `isDraftJobActive()`.

Move `run()` from `draft_panel.tsx:140-363` verbatim; each `setX` call becomes a store patch. Move the `subscribeLlmStatus` model-load subscription (`draft_panel.tsx:128-138`) into the pipeline: mirror progress into `statusNote` only while `phase === "preparing"`, unsubscribe in `finally`. On the done and error transitions, set `attention: job.minimized`.

### 2. New file `client/src/app/components/ai/draft_host.tsx` — host + chip

```tsx
export const DraftHost = () => {
    const job = useSyncExternalStore(subscribeDraftJob, getDraftJob, () => null);
    if (!job) return null;
    return job.minimized ? <DraftChip job={job} /> : <DraftPanel />;
};
```

`DraftChip`: a pill inside the shared bottom-left container (see Part 2 step 5). Styling: `rounded-full border border-border bg-card text-card-foreground shadow-lg px-4 py-2 text-sm flex items-center gap-2`. Content by phase: preparing/generating → pulsing dot + requirement id + truncated live `statusNote` (`max-w-64 truncate`); done → green dot + "Draft ready"; error → red dot + "Draft failed". When `attention` is set, add `ring-2 ring-primary`. Chip click → `restoreDraftJob()`. A trailing ✕ with `stopPropagation` → `closeDraftJob()`. Put `aria-live="polite"` on the status text.

### 3. `client/src/app/layout.tsx` — mount the host

Mount `<DraftHost />` next to `<AiSettingsModal />` (~line 73). No tier gate is needed: only `SummarizeButton` starts jobs, and it already returns null on `FREE_TIER`.

### 4. `client/src/app/components/ai/draft_panel.tsx` — becomes a pure view

- Drop the props; read the job through `useSyncExternalStore`. Delete the pipeline, the refs, and the mount effect.
- Keep view-local state only: `targetId`, `mode`, `showSources`, `copied`, `outputRef` + the marked-render effect.
- Wire buttons to store actions: Stop → `stopDraftJob`, Regenerate → `rerunDraftJob`, Close/✕ → `closeDraftJob`, Insert → `dispatchDraftInsert` then `closeDraftJob`.
- Add a minimize button in the header next to ✕ (`aria-label="Minimize"`). Change the backdrop `onClick` (line ~417) from close to `minimizeDraftJob`.
- Cross-page Insert: compare `usePathname()` with `job.returnPath`. When they differ, replace the Insert controls with a note ("This draft targets {id} — open its page to insert.") and a `<Link href={job.returnPath}>`. Copy stays available. Reason: the insert event is only consumed by the listener in `form_elements.tsx` (~line 181) on that requirement's page; elsewhere the dispatch is a silent no-op.

### 5. `client/src/app/components/ai/summarize_button.tsx` — start/restore/busy

- Remove the `open` state and the `<DraftPanel>` mount (lines 30, 133-140).
- Subscribe to the store. On click: when the job matches this requirement + focus → `restoreDraftJob()`; when another job runs → the button is disabled (title: "A draft is already generating for {id} — finish or close it first"); otherwise → `startDraftJob(...)`.

### Part 1 edge cases

| Case | Behavior |
|---|---|
| Navigate while minimized | Store is module-scope, host is in the root layout — the job survives, the chip persists |
| Page reload / quit | The job dies (unchanged); per-chunk IDB persistence makes a rerun resume |
| Done/error while minimized | Chip flips state + attention ring; restore shows the result |
| Second draft while one runs | Other buttons are disabled with an explanatory title |
| Restore on a different page | Insert is replaced by the "open its page" link; the job survives the navigation |
| Stop while minimized | Not on the chip; restore, then Stop. The chip ✕ aborts and discards |

## Part 2: auto-summarize evidence in the background (opt-in)

### Coordination

A reactive design (background watches draft state and aborts) races: `generate()` throws on overlap, and a worker abort is not instantaneous. The objective review also runs many generations with idle gaps between them, so a status-only check lets background work jump into a gap. The deterministic fix: `summary_sync.ts` exports `pauseSummarySync(): Promise<() => void>`. It aborts the current background chunk, awaits settlement, and holds background off until the returned release runs. Exactly two interactive call sites acquire it: the draft pipeline in `draft_job.ts` and `run()` in `client/src/app/ai/review.ts`. As a backstop, the background loop also checks that `getLlmStatus().phase` is not "generating"/"loading" before each file. Coupling is one-directional (interactive → summary_sync); the `draft_job.ts` store stays pure — only pipeline code imports summary_sync.

Model load is on demand and deferred: the fingerprint diff runs before `ensureLoaded`, and `ensureLoaded` runs only when the queue is non-empty. Do not add an unload path; nothing else in the app unloads either.

### 1. New file `client/src/app/llm/summary_sync.ts` — store + reconciler + pause API

Mirror `evidence_text_store.ts` structurally and the `subscribeLlmStatus` listener idiom.

```ts
export interface SummarySyncState {
    phase: "idle" | "running" | "paused";
    filename?: string;
    fileDone: number;   // files completed / queued in this pass
    fileTotal: number;
    chunkDone?: number; // within the current file, from ensureDocSummary onProgress
    chunkTotal?: number;
}
const IDLE: SummarySyncState = { phase: "idle", fileDone: 0, fileTotal: 0 };
```

Keep `IDLE` a stable module constant. `getSummarySync` doubles as the `useSyncExternalStore` server snapshot in a layout-mounted component, and referential stability avoids hydration loops.

Exports:

- `startSummarySync()` — idempotent: deferred startup pass (`requestIdleCallback`, fallback 2 s timeout) + `TABLE_CHANGED_EVENT` listener filtered to `detail.table === IDB.evidenceText.table`, 1 s debounce. The evidenceText filter is sufficient — evidence writes flow through extraction, which writes evidenceText — and it prevents self-retriggering, because this module writes only evidenceSummaries.
- `ensureSummarySynced(opts?: { manual?: boolean })` — the `inFlight`/`rerun` coalescer around `reconcile()`. `manual: true` makes the next pass skip the auto-toggle gate (Part 3). Tier, AI-enabled, model, and weight gates still apply.
- `cancelSummarySync()` — set a cancel flag, abort the current controller; stay idle until the next trigger.
- `pauseSummarySync()` — increment a pause counter, abort the current file's controller, await the tracked `ensureDocSummary` promise, return a once-only release. Fast no-op when idle.
- `getSummarySync()` / `subscribeSummarySync(listener)`.

`reconcile()` order:

1. Check the cheap gates first: `FREE_TIER`, `isAiEnabled()`, `isAutoSummarizeEnabled()` (skipped for a manual pass). On failure, set `IDLE` and return.
2. `await ensureEvidenceTextSynced()` — text is current before the diff. This also covers pages that never mount the evidence UI. If it writes rows, the resulting event coalesces into one follow-up pass.
3. Resolve the model: `resolveUsableModel(getSelectedModelId(), await getDeviceCapabilities())`. Return when null or when `weightsAvailable(model)` is false.
4. Orphan cleanup: delete evidenceSummaries rows with no matching evidence id (mirror `evidence_text_store.ts:18-23`).
5. Build the queue without materializing texts: keep evidenceText rows with `status === "ok"` and non-blank text; compute `summaryFingerprint(id, model.id)`; skip rows whose cached summary has a matching fingerprint, `complete`, and a non-empty summary. Queue stale rows and fresh-but-incomplete rows. On an empty queue, return before the model loads.
6. Wait until free: while the pause counter is above zero, or `getLlmStatus().phase` is "generating" or "loading", await the release or a status transition, then a ~2 s grace delay.
7. `await ensureLoaded(model)` — now, and only now.
8. Per-file loop, one at a time. For each file: re-check the gates (toggle off → exit to IDLE); re-resolve the model (changed id → exit and re-run the pass); re-check that the evidence and text rows still exist with `status === "ok"`; build the `EvidenceDoc` (`{evidenceId, filename, text}`, the `gatherEvidence` mapping at `prompt.ts:36-55`); create a fresh `AbortController`; set `{phase: "running", filename, fileDone, fileTotal}`; call `ensureDocSummary(doc, model.id, {signal, onProgress})` and map progress into `chunkDone`/`chunkTotal`. On `AbortError`: canceled → exit the pass; paused → set "paused", await the release + grace delay, retry the same file (chunk persistence resumes it). On other errors: `console.error` and exit the pass — do not retry-loop a failing model.
9. Queue drained → set `IDLE`.

Multiple tabs can both summarize. Last write wins on identical content — the same accepted property as the extraction reconciler. Note this in the module header.

### 2. `client/src/app/llm/summarize.ts`

Export `summaryFingerprint` (line 131, currently module-private). No other change.

### 3. `client/src/app/llm/settings.ts`

```ts
const AUTO_SUMMARIZE_KEY = "llm.autoSummarize";
/** Background evidence summarization; off by default — it loads the model
 *  and runs the GPU without a user action, so it is opt-in. */
export const isAutoSummarizeEnabled = (): boolean =>
    storage()?.getItem(AUTO_SUMMARIZE_KEY) === "true";
export const setAutoSummarizeEnabled = (enabled: boolean): void =>
    storage()?.setItem(AUTO_SUMMARIZE_KEY, String(enabled));
```

### 4. `client/src/app/components/ai/model_settings.tsx`

- Add `autoSummarize` state; initialize it in the `AI_SETTINGS_OPEN_EVENT` handler (~lines 100-104).
- Below the enable toggle (~lines 162-174), add a matching checkbox row: "Summarize evidence in the background", `disabled={!enabled || weights === "missing"}`, with a muted note that it loads the model and uses GPU/battery when evidence changes.
- On change: on → `setAutoSummarizeEnabled(true); startSummarySync(); void ensureSummarySynced();` off → `setAutoSummarizeEnabled(false); cancelSummarySync();`
- In the model select handler (~lines 194-197), append `void ensureSummarySynced();`. A model switch changes fingerprints; the call is a no-op when the toggle is off.

### 5. `draft_host.tsx` — chip container + global start point

- `useEffect(() => startSummarySync(), [])`. The host lives in the root layout, so the startup backfill runs on any page — unlike `startEvidenceTextSync`, which only starts from evidence UI components. The gates inside `reconcile()` keep this free for everyone else.
- Wrap both chips in one container: `<div className="fixed bottom-4 left-4 z-40 flex flex-col items-start gap-2">`. The draft chip loses its own fixed positioning. z-40 sits below the z-50 modals and above page content.
- Summary chip: render when `sync.phase !== "idle"`, same pill styling. Text: `Summarizing evidence {fileDone + 1}/{fileTotal} — {filename}` with the filename truncated, plus `({chunkDone + 1}/{chunkTotal})` when known. Paused: `Summarizing paused — {fileDone}/{fileTotal}`. Chip click → `openAiSettings()` (the toggle lives there). Trailing ✕ with `stopPropagation` → `cancelSummarySync()`.

### 6. Interactive call sites acquire the pause

In the `draft_job.ts` pipeline and in `review.ts` `run()`: `const resume = await pauseSummarySync();` at the start, `resume()` in `finally`.

### Part 2 edge cases

| Case | Handling |
|---|---|
| Evidence deleted mid-queue | The per-file existence re-check skips it; orphan rows are cleaned on the next pass |
| Model switched mid-queue | The per-file re-resolve exits and starts a fresh pass under the new id |
| Toggle off mid-run | The settings handler calls `cancelSummarySync()`; the per-file gate re-check covers other paths |
| Tab closed mid-file | Chunks persist (`complete: false`); the startup pass queues incomplete rows and resumes |
| Interactive job starts mid-chunk | `pauseSummarySync()` aborts and awaits settlement before the first interactive `generate()`; release + grace retries the same file |

## Part 3: "Summarize all" on the View Evidence page

`client/src/app/components/evidence_table.tsx`:

- The table already calls `startEvidenceTextSync()` on mount (line 171); add `startSummarySync()` beside it (idempotent).
- Add a "Summarize all" button in the toolbar area, styled like the other outline buttons. Visibility mirrors `SummarizeButton` gating: hidden on `FREE_TIER`, when `isAiEnabled()` is false, or when no usable model resolves. When weights are missing, the click opens `openAiSettings()` (as `summarize_button.tsx:110` does).
- On click: `void ensureSummarySynced({ manual: true })` — one pass over all readable evidence, independent of the auto toggle. Fresh summaries are skipped by fingerprint, so a warm corpus finishes immediately.
- Button state: subscribe with `useSyncExternalStore(subscribeSummarySync, getSummarySync, getSummarySync)`. While `phase !== "idle"`, render it disabled as "Summarizing… {fileDone}/{fileTotal}". Progress and cancel live in the shared bottom chip.
- When an interactive draft or review runs, the pass waits in `reconcile()` step 6. The click is still accepted; the chip shows "paused" until the worker frees up.

## Verification

Part 1:

1. Run `npm run models` in `client/` (the pipeline calls `engine.generate` directly, so the stub does not cover it). Then run `npm run dev`.
2. Open a requirement (for example `/r3/requirement/03.01.01`) and attach two or more text/PDF files.
3. Click "Draft from evidence", then Minimize. Confirm that the chip docks bottom-left with a live "Summarizing file (n/m)…" status. Confirm that a backdrop click also minimizes.
4. Navigate to another page. Confirm that the chip persists and that draft buttons on other requirements are disabled with an explanatory title.
5. Let the job finish while minimized. Confirm the "Draft ready" ring, restore on a different page, follow the "open its page" link, and insert into the description field.
6. Click the chip ✕ mid-run. Confirm a clean abort and that the next start works.

Part 2:

7. Open AI settings. Confirm that the new toggle is present, unchecked by default, and disabled when AI features are off. Enable it on a corpus with un-summarized evidence. Confirm that the chip appears, the model loads, counts tick up, and the chip disappears when drained. Confirm `evidence_summaries` rows with `complete: true` in devtools.
8. Upload a new PDF. Confirm that the chip reappears for that file after the extraction debounce.
9. Contention: mid-file, start "Draft from evidence". Confirm that the chip shows "paused", that the draft completes without "A generation is already running", and that the background pass then resumes the same file with the chunk counter continuing. Repeat with an objective review.
10. Confirm: toggle off mid-run stops the pass; a model switch mid-run restarts the pass under the new model; a tab kill mid-file resumes from persisted chunks on relaunch.
11. Warm cache: confirm that "Draft from evidence" skips the per-file "Summarizing…" phase.

Part 3:

12. On the View Evidence page with the toggle off, click "Summarize all". Confirm the pass runs, the button shows progress and disables, the chip ✕ cancels, and a second click on a warm corpus finishes immediately.

Static checks: run `npm run lint` and `npx tsc --noEmit` in `client/`. Confirm that a free-tier build shows no toggle, no button, no chip, and registers no timers.
