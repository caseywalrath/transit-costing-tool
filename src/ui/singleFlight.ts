/**
 * Runs `run` one at a time (review package U07, the screen half of the Runtime first-visit race recorded in the P09 entry). A call made while `run` is
 * working does not start a second run beside it: it asks for one more run once the current one ends, and every caller waits for the
 * last run and gets its result. So however many calls overlap, `run` never overlaps itself, the last run starts after the last call,
 * and no more than two runs happen for any burst of calls that begins while one is working.
 */
export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let current: Promise<T> | undefined;
  let again = false;
  return () => {
    if (current) { again = true; return current; }
    current = (async () => {
      try {
        let result: T;
        do { again = false; result = await run(); } while (again);
        return result;
      } finally { current = undefined; }
    })();
    return current;
  };
}
