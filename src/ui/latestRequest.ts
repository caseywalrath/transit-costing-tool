/**
 * Lets only the most recently started request of one kind apply its result (review issue I-083, finding 4-026). Blocking reloads its data
 * after every change; responses can arrive out of order, and an older response must not replace a newer one.
 *
 * `begin()` marks a new request and returns a function that says whether that request is still the latest one.
 */
export function createLatestRequest() {
  let latest = 0;
  return { begin(): () => boolean { const mine = ++latest; return () => mine === latest; } };
}
