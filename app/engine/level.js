/**
 * Level state machine. Both phases work on a run of slots (stones):
 *   training: `criterion` slots; an error greys one slot (allowed up to
 *             `maxTrainingErrors`), one error more empties the run.
 *   testing:  `testTrials` slots; the test fails when errors exceed
 *             `maxTestErrors` (immediately if `abortWhenFailed`, otherwise
 *             after the last trial), else it is passed.
 * Pure logic, no DOM.
 *
 * `slots` holds 'ok' | 'miss' per completed slot of the current run (for the header).
 * `tally` is the number of 'ok' slots in the current run.
 *
 * Events returned by record():
 *   'continue'   - keep going in the current phase
 *   'reset'      - training run emptied by one error too many
 *   'toTesting'  - training run completed; caller shows the battle intro
 *   'passed'     - test passed; level cleared
 *   'failed'     - test failed; state has been reset to training
 */
export class LevelRunner {
  constructor(options) {
    this.criterion = options.criterion;
    this.testTrials = options.testTrials;
    this.resetOnError = options.resetOnError ?? true;
    this.hintForfeitsPoint = options.hintForfeitsPoint ?? true;
    this.maxTrainingErrors = options.maxTrainingErrors ?? 0;
    this.maxTestErrors = options.maxTestErrors ?? 0;
    this.abortWhenFailed = options.abortWhenFailed ?? true;
    this.reset();
  }

  reset() {
    this.phase = 'training';
    this.slots = [];
    this.tally = 0;
    this.errors = 0;
    this.testTrial = 0;      // number of testing trials completed
    this.trialsInLevel = 0;
  }

  get testTrialNumber() { return this.testTrial + 1; }

  _startRun() { this.slots = []; this.tally = 0; this.errors = 0; }

  record({ correct, usedHint = false, timedOut = false }) {
    const ok = Boolean(correct) && !timedOut;
    this.trialsInLevel++;

    if (this.phase === 'training') {
      if (ok) {
        if (usedHint && this.hintForfeitsPoint) return 'continue'; // no stone, no slot
        this.slots.push('ok');
        this.tally++;
      } else if (this.resetOnError) {
        this.errors++;
        if (this.errors > this.maxTrainingErrors) { this._startRun(); return 'reset'; }
        this.slots.push('miss');
      }
      if (this.slots.length >= this.criterion) {
        this.phase = 'testing';
        this._startRun();
        this.testTrial = 0;
        return 'toTesting';
      }
      return 'continue';
    }

    // testing
    this.testTrial++;
    this.slots.push(ok ? 'ok' : 'miss');
    if (ok) this.tally++; else this.errors++;
    const last = this.testTrial >= this.testTrials;
    if (this.errors > this.maxTestErrors && (this.abortWhenFailed || last)) {
      this.reset();
      return 'failed';
    }
    if (last) return 'passed';
    return 'continue';
  }
}