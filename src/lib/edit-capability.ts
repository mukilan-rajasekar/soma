// edit-capability.ts — whether THIS host can actually run an edit search.
//
// THE BUG THIS FIXES. /api/batches/<token>/edit-preview shells out to Python and ffmpeg
// via runEditSearch. ResultReport fetched it unconditionally on every render, and the
// site deploys to Vercel, where there is no Python. So Block 05 ("Per-shot edit
// diagnosis") rendered its error state on EVERY real customer report — the one page a
// paying customer is sent to — and Block 06's "Search edits for this cut" links led to a
// form whose submit is beta-gated and answers 404. A customer saw two broken blocks at
// the bottom of an otherwise honest read-out.
//
// WHY A FLAG AND NOT A PROBE. Spawning Python to ask "is Python here?" costs the thing we
// are trying not to spend, on a page render, per request. The host either has the whole
// edit stack (interpreter, ffmpeg, the model, the repo's Python modules on the path) or it
// has none of it — there is no partial case worth detecting at runtime, and the operator
// who provisioned the box is the one who knows. So it is declared, not sniffed.
//
// DEFAULT CLOSED, for the same reason beta-gate.ts is: a missing env var meaning
// "available" is how a broken block ships to a customer, which is exactly the failure we
// just had. Forget to set it and the blocks are hidden, not broken. Local development is
// exempt so the blocks stay visible while working on them.
//
// FIX-FORWARD PATH (docs/strategy/PLAN.md, Phase 0.2). Hiding is the right move today, not
// the right move forever: the edit candidates are cheap to compute on the scorer box,
// which already has the interpreter, the footage and the arcs in hand. Once run_batch.py
// writes them into the report JSON, Block 05 becomes static data every host can render and
// this flag stops mattering for the preview. Block 06 still needs a reachable /edit.

/** True when this host can run an edit search — Python, ffmpeg and the model are present. */
export function editSearchAvailable(): boolean {
  if (process.env.SOMA_EDIT_PREVIEW?.trim()) return true;
  // A developer machine running the site is also the machine with the stack on it.
  return process.env.NODE_ENV !== "production";
}
