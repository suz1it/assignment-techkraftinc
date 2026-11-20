import { Subject, defer, finalize, throwError } from 'rxjs';
import { DraftSaveQueue } from './draft-save-queue';

type Patch = Record<string, string>;

/**
 * A tiny model of the wizard: `form` is what the user typed, `snapshot` what the server acknowledged.
 * Each save returns a Subject the test resolves manually, so ordering and overlap are observable.
 */
function setup(options: { retryCount?: number } = {}) {
  const form: Patch = {};
  let snapshot: Patch = {};
  const requests: { patch: Patch; response: Subject<void> }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const queue = new DraftSaveQueue<Patch>({
    computePatch: () => {
      const patch: Patch = {};
      for (const [key, value] of Object.entries(form))
        if (snapshot[key] !== value) patch[key] = value;
      return Object.keys(patch).length ? patch : null;
    },
    // Cold, like HttpClient: every subscription (including a retry) is a new request.
    save: (patch) =>
      defer(() => {
        const response = new Subject<void>();
        requests.push({ patch, response });
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return response.pipe(finalize(() => inFlight--));
      }),
    onSaved: (patch) => (snapshot = { ...snapshot, ...patch }),
    retryCount: options.retryCount ?? 0,
    retryBaseDelayMs: 10,
    errorMessage: () => 'Save failed',
  });
  queue.start();

  const respond = (index: number) => {
    requests[index].response.next();
    requests[index].response.complete();
  };
  const fail = (index: number) => requests[index].response.error(new Error('500'));

  return {
    form,
    queue,
    requests,
    respond,
    fail,
    snapshot: () => snapshot,
    maxInFlight: () => maxInFlight,
  };
}

describe('DraftSaveQueue (autosave concurrency)', () => {
  it('never runs two writes at once: a tick during a save waits for it', () => {
    const t = setup();
    t.form['legalName'] = 'A';
    t.queue.schedule();
    t.form['legalName'] = 'AB';
    t.queue.schedule();

    expect(t.requests).toHaveLength(1);
    expect(t.queue.status().state).toBe('saving');
    t.respond(0);
    expect(t.requests).toHaveLength(2);
    expect(t.maxInFlight()).toBe(1);
  });

  it('applies responses strictly in order, so an older save can never overwrite a newer one', () => {
    const t = setup();
    t.form['city'] = 'Pune';
    t.queue.schedule();
    t.form['city'] = 'Mumbai';
    t.queue.schedule();

    t.respond(0);
    t.respond(1);
    expect(t.requests.map((r) => r.patch)).toEqual([{ city: 'Pune' }, { city: 'Mumbai' }]);
    expect(t.snapshot()).toEqual({ city: 'Mumbai' });
  });

  it('coalesces ticks queued during a save into one request with the latest values', () => {
    const t = setup();
    t.form['a'] = '1';
    t.queue.schedule();
    t.form['a'] = '2';
    t.queue.schedule();
    t.form['b'] = '3';
    t.queue.schedule();
    t.queue.schedule();

    t.respond(0);
    expect(t.requests).toHaveLength(2);
    expect(t.requests[1].patch).toEqual({ a: '2', b: '3' });
    t.respond(1);
    expect(t.requests).toHaveLength(2);
  });

  it('skips the request entirely when nothing changed', () => {
    const t = setup();
    t.queue.schedule();
    expect(t.requests).toHaveLength(0);
    expect(t.queue.status().state).toBe('idle');
  });

  it('keeps the form untouched on failure and re-sends the failed keys on the next tick', () => {
    const t = setup();
    t.form['email'] = 'a@b.co';
    t.queue.schedule();
    t.fail(0);

    expect(t.queue.status()).toEqual({ state: 'error', message: 'Save failed' });
    expect(t.form['email']).toBe('a@b.co');
    expect(t.snapshot()).toEqual({});

    t.form['phone'] = '123';
    t.queue.schedule();
    expect(t.requests[1].patch).toEqual({ email: 'a@b.co', phone: '123' });
    t.respond(1);
    expect(t.queue.status().state).toBe('saved');
  });

  it('retries a failed save with backoff before reporting an error', async () => {
    vi.useFakeTimers();
    try {
      const t = setup({ retryCount: 2 });
      t.form['x'] = '1';
      t.queue.schedule();
      t.fail(0);
      expect(t.queue.status().state).toBe('saving');
      await vi.advanceTimersByTimeAsync(10);
      expect(t.requests).toHaveLength(2);
      t.fail(1);
      await vi.advanceTimersByTimeAsync(20);
      expect(t.requests).toHaveLength(3);
      t.respond(2);
      expect(t.queue.status().state).toBe('saved');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('flush (before submit / navigation)', () => {
    it('waits for the in-flight save plus any outstanding changes, then reports success', () => {
      const t = setup();
      t.form['a'] = '1';
      t.queue.schedule();
      t.form['a'] = '2';

      const results: boolean[] = [];
      t.queue.flush().subscribe((saved) => results.push(saved));
      expect(results).toEqual([]);

      t.respond(0);
      expect(t.requests[1].patch).toEqual({ a: '2' });
      expect(results).toEqual([]);
      t.respond(1);
      expect(results).toEqual([true]);
    });

    it('reports failure when the last save failed', () => {
      const t = setup();
      t.form['a'] = '1';
      const results: boolean[] = [];
      t.queue.flush().subscribe((saved) => results.push(saved));
      t.fail(0);
      expect(results).toEqual([false]);
    });

    it('resolves immediately when there is nothing to save', () => {
      const t = setup();
      const results: boolean[] = [];
      t.queue.flush().subscribe((saved) => results.push(saved));
      expect(results).toEqual([true]);
    });
  });

  it('exposes queue activity as a signal', () => {
    const t = setup();
    expect(t.queue.isBusy()).toBe(false);
    t.form['a'] = '1';
    t.queue.schedule();
    expect(t.queue.isBusy()).toBe(true);
    t.respond(0);
    expect(t.queue.isBusy()).toBe(false);
  });

  it('releases a waiting flush when the queue is stopped', () => {
    const t = setup();
    t.form['a'] = '1';
    const results: boolean[] = [];
    t.queue.flush().subscribe((saved) => results.push(saved));
    expect(results).toEqual([]);
    t.queue.stop();
    expect(results).toHaveLength(1);
    expect(t.queue.isBusy()).toBe(false);
  });

  it('ignores ticks after stop()', () => {
    const t = setup();
    t.queue.stop();
    t.form['a'] = '1';
    t.queue.schedule();
    expect(t.requests).toHaveLength(0);
  });

  it('reports a synchronous save error as a failed save', () => {
    const queue = new DraftSaveQueue<Patch>({
      computePatch: () => ({ a: '1' }),
      save: () => throwError(() => new Error('boom')),
      onSaved: () => undefined,
      retryCount: 0,
    });
    queue.start();
    queue.schedule();
    expect(queue.status()).toEqual({ state: 'error', message: 'Couldn’t save your changes.' });
  });
});
