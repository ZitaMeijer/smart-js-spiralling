import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSequence, pickSequencing } from '../app/engine/sequence.js';

// the real stage table
const csv = readFileSync(new URL('../content/stages.csv', import.meta.url), 'utf8').replace(/\r/g, '').trim().split('\n');
const head = csv[0].split(',');
const list = csv.slice(1).map((line) => {
  const c = line.split(',');
  return { stage: Number(c[head.indexOf('stage')]), family: c[head.indexOf('family')] };
});
const stages = { list };
const families = [...new Set(list.map((s) => s.family))];
const maxId = Math.max(...list.map((s) => s.stage));
const minId = Math.min(...list.map((s) => s.stage));

const walk = (seq) => { const out = []; for (let s = seq.first; !seq.isDone(s); s = seq.next(s)) out.push(s); return out; };

test('linear reproduces the original behaviour exactly', () => {
  const seq = buildSequence(stages, { mode: 'linear' });
  assert.equal(seq.first, minId);
  assert.equal(seq.last, maxId);
  assert.equal(seq.done, maxId + 1);
  for (const { stage } of list) {
    assert.equal(seq.next(stage), stage + 1);
    assert.equal(seq.displayStage(stage), stage);
  }
  assert.equal(seq.next(maxId), maxId + 1);
  assert.equal(seq.clamp(maxId + 1), maxId);
  assert.deepEqual(walk(seq), list.map((s) => s.stage));
});

test('interleaved is a permutation, round-robin over families, ascending within each family', () => {
  const seq = buildSequence(stages, { mode: 'interleaved' });
  const order = walk(seq);
  assert.equal(order.length, list.length);
  assert.equal(new Set(order).size, list.length);
  // first round: first stage of every family, in family order
  const firstOfFamily = families.map((f) => Math.min(...list.filter((s) => s.family === f).map((s) => s.stage)));
  assert.deepEqual(order.slice(0, families.length), firstOfFamily);
  // never two consecutive stages of one family while another family still has stages left
  const fam = new Map(list.map((s) => [s.stage, s.family]));
  for (const f of families) {
    const own = order.filter((id) => fam.get(id) === f);
    assert.deepEqual(own, [...own].sort((a, b) => a - b));
  }
  assert.equal(seq.first, minId);
  assert.equal(seq.done, maxId + 1);
});

test('the number on screen counts 1, 2, 3 ... without jumping', () => {
  const seq = buildSequence(stages, { mode: 'interleaved' });
  const shown = walk(seq).map((id) => seq.displayStage(id));
  assert.deepEqual(shown, list.map((_, i) => minId + i));
  const positions = walk(seq).map((id) => seq.position(id));
  assert.deepEqual(positions, list.map((_, i) => i + 1));
});

test('tail families are appended after the round-robin block, in order', () => {
  const seq = buildSequence(stages, { mode: 'interleaved', tailFamilies: ['mathematics'] });
  const order = walk(seq);
  const math = list.filter((s) => s.family === 'mathematics').map((s) => s.stage);
  assert.deepEqual(order.slice(-math.length), math);
  assert.equal(new Set(order).size, list.length);
  assert.throws(() => buildSequence(stages, { mode: 'interleaved', tailFamilies: ['nope'] }));
});

test('normalize and done sentinel', () => {
  const seq = buildSequence(stages, { mode: 'interleaved' });
  assert.equal(seq.normalize(undefined), seq.first);
  assert.equal(seq.normalize(0), seq.first);
  assert.equal(seq.normalize(maxId + 1), seq.done);
  assert.equal(seq.normalize(maxId + 50), seq.done);
  assert.equal(seq.normalize('30'), 30);
  assert.equal(seq.next(seq.last), seq.done);
  assert.ok(seq.isDone(seq.done));
});

test('pickSequencing: study decides, default is linear, debug can force', () => {
  const cfg = { sequencing: { mode: 'linear', byStudy: { draak2026: 'interleaved' }, tailFamilies: [] } };
  assert.equal(pickSequencing(cfg, { studyCode: 'draak2026' }).mode, 'interleaved');
  assert.equal(pickSequencing(cfg, { studyCode: 'pilot27' }).mode, 'linear');
  assert.equal(pickSequencing(cfg, {}).mode, 'linear');
  assert.equal(pickSequencing({}, {}).mode, 'linear');
  assert.equal(pickSequencing(cfg, { studyCode: 'pilot27', forced: 'interleaved' }).mode, 'interleaved');
  assert.throws(() => pickSequencing(cfg, { forced: 'zigzag' }));
});

test('look: dragons and backgrounds follow the original order, whatever the content order', () => {
  const lin = buildSequence(stages, { mode: 'linear' });
  const inter = buildSequence(stages, { mode: 'interleaved' });
  for (const { stage } of list) assert.equal(lin.look(stage), stage);
  // the n-th level always shows the n-th dragon/background of the programme
  assert.deepEqual(walk(inter).map((id) => inter.look(id)), list.map((s) => s.stage).sort((a, b) => a - b));
  // content of level 2 is another family's first stage, but the dragon is stage 6's
  const second = walk(inter)[1];
  assert.notEqual(second, 6);
  assert.equal(inter.look(second), 6);
  // finished: shows the last dragon; the "next" dragon is looked up with displayStage(done) = done (no dragon)
  assert.equal(inter.look(inter.done), maxId);
  assert.equal(inter.displayStage(inter.done), inter.done);
});
