/**
 * Hide the agent's ``<answer_meta>{…}</answer_meta>`` tail while a turn is still
 * streaming.
 *
 * The agent emits prose first, then a structured ``<answer_meta>`` block in the
 * same text. During streaming the raw tokens (incl. that block) are rendered
 * live, so without this the user briefly watches the meta JSON type out before
 * the final event swaps in the clean answer. We render only the prose up to the
 * marker — and trim a partial opening tag as it streams in (`…<answer_me`) so
 * there's no flicker of the `<`. Idempotent on already-clean text (final replay
 * / server-split answers), so it's safe to apply unconditionally.
 */

const META_OPEN = "<answer_meta";

export function stripAnswerMeta(raw: string): string {
  if (!raw) return raw;
  const i = raw.indexOf(META_OPEN);
  if (i !== -1) return raw.slice(0, i).trimEnd();
  // Marker not complete yet: if the text ends with a partial prefix of
  // `<answer_meta` (e.g. `<`, `<a`, `<answer_me`), drop that partial so the
  // opening tag never flashes on screen mid-stream.
  const lt = raw.lastIndexOf("<");
  if (lt !== -1 && META_OPEN.startsWith(raw.slice(lt))) {
    return raw.slice(0, lt).trimEnd();
  }
  return raw;
}
