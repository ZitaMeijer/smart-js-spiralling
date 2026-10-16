/**
 * Level sequencing.
 *
 * A stage's number (its id) identifies its CONTENT: trial file, dragon,
 * background, criteria overrides. It never changes. The ORDER in which a child
 * meets the stages is a separate thing, decided here:
 *
 *   linear       5, 6, 7, ... 122                (the original programme)
 *   interleaved  round-robin over the families:  5, 30, 56, 82, 104, 6, 31, ...
 *
 * What the child SEES (dragon, background, family collection, level number)
 * follows the original order in every mode, so the story stays coherent; only
 * the trial content is taken from the stage the sequence points to.
 *
 * Progress on the server remains "the stage id to play next", so the server,
 * admin.html and existing exports keep working for both orders. Only the
 * successor function and the number shown on screen depend on the mode.
 *
 * `done` is the sentinel stored as progress once the last stage is won
 * (highest id + 1), identical in both modes and to the pre-existing behaviour.
 */

export const SEQUENCING_MODES = ['linear', 'interleaved'];

/**
 * Decide the mode for this child.
 * config.sequencing = { mode: 'linear', byStudy: { draak2026: 'interleaved' }, tailFamilies: [] }
 * `forced` (debug only) overrides everything.
 */
export function pickSequencing(config, { studyCode = null, forced = null } = {}) {
  const s = config.sequencing || {};
  const mode = forced || (studyCode && s.byStudy?.[studyCode]) || s.mode || 'linear';
  if (!SEQUENCING_MODES.includes(mode)) throw new Error(`Unknown sequencing mode: ${mode}`);
  return { mode, tailFamilies: s.tailFamilies || [] };
}

/**
 * @param stages  the indexed stages (needs only `stages.list`: rows with `stage` and `family`)
 * @param options mode, and (interleaved only) tailFamilies: families that are NOT
 *                interleaved but appended, in their own order, after the round-robin block
 */
export function buildSequence(stages, { mode = 'linear', tailFamilies = [] } = {}) {
  const rows = stages.list
    .map((r) => ({ stage: Number(r.stage), family: r.family }))
    .sort((a, b) => a.stage - b.stage);
  if (!rows.length) throw new Error('No stages');
  const families = [...new Set(rows.map((r) => r.family))]; // order of first appearance
  const idsOf = (family) => rows.filter((r) => r.family === family).map((r) => r.stage);

  let ids;
  if (mode === 'linear') {
    ids = rows.map((r) => r.stage);
  } else if (mode === 'interleaved') {
    const unknown = tailFamilies.filter((f) => !families.includes(f));
    if (unknown.length) throw new Error(`Unknown tail family: ${unknown.join(', ')}`);
    const lanes = families.filter((f) => !tailFamilies.includes(f)).map(idsOf);
    ids = [];
    for (let round = 0; lanes.some((lane) => round < lane.length); round++) {
      for (const lane of lanes) if (round < lane.length) ids.push(lane[round]);
    }
    for (const f of families) if (tailFamilies.includes(f)) ids.push(...idsOf(f));
  } else {
    throw new Error(`Unknown sequencing mode: ${mode}`);
  }
  if (ids.length !== rows.length || new Set(ids).size !== rows.length) {
    throw new Error('Sequence is not a permutation of the stages');
  }

  const position = new Map(ids.map((id, i) => [id, i + 1])); // 1-based
  const base = rows[0].stage;
  const done = rows[rows.length - 1].stage + 1;

  return {
    mode,
    ids,
    first: ids[0],
    last: ids[ids.length - 1],
    done,
    has: (id) => position.has(id),
    isDone: (id) => id >= done,
    /** 1-based place in this child's sequence (ids.length + 1 once finished). */
    position: (id) => position.get(id) ?? ids.length + 1,
    /** Stage to play after `id`; `done` after the last one. */
    next: (id) => { const p = position.get(id); return p === undefined || p >= ids.length ? done : ids[p]; },
    /** A stored/URL value -> a playable stage id, or `done`. */
    normalize: (raw) => {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return ids[0];
      if (n >= done) return done;
      return position.has(n) ? n : ids[0];
    },
    /** `id`, or the last real stage when `id` is the `done` sentinel (for dragon lookups). */
    clamp: (id) => (position.has(id) ? id : ids[ids.length - 1]),
    /**
     * The number the header shows. It counts 1, 2, 3 ... along the child's own
     * sequence, expressed as the id the linear order would have at that place, so
     * the header applies exactly the formatting it applies today. In linear mode
     * this is the id itself.
     */
    displayStage: (id) => base + (position.get(id) ?? ids.length + 1) - 1,
    /**
     * The stage whose dragon, background and family are shown at this place (the
     * `done` sentinel maps to the last one). Dragons and backgrounds follow the
     * programme's original order; only the trial content follows the child's sequence.
     */
    look: (id) => { const p = Math.min(position.get(id) ?? ids.length + 1, ids.length); return base + p - 1; },
  };
}
