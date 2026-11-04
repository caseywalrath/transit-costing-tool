"""Reference check for the automatic blocking rule (Decision 0055, vehicle choice amended by Decision 0056).

A plain re-statement of the chaining rule on a synthetic out-and-back timetable. It is not product code. The domain
tests in `src/domain/autoBlocking.test.ts` must reproduce the numbers printed here (package AB2).

Timetable: Route with terminals A (home) and B (far). 29 trips A->B departing 9:00, 9:15, ... 16:00 and 29 trips B->A
departing 9:00 + run, then every 15 minutes. Each trip takes `run` minutes. Minimum layover: 20 min after a trip that
arrives at A (pattern B->A), none after a trip that arrives at B (pattern A->B). Break: 35 min (includes the minimum
layover), taken only after B->A trips (arrival at A), first break no earlier than 1 h after the block's first
departure, only for blocks longer than `min_block` hours (enforced by rebuilding, at most 5 passes). No second break.

Run: python3 synthetic-check.py
Expected output:
  35-min trips, breaks:    (7, 2560, [70, 355, 355, 445, 445, 445, 445], 6)
  46-min trips, breaks:    (9, 3348, [92, 347, 347, 347, 347, 467, 467, 467, 467], 8)
  35-min trips, no breaks: (6, 2490, [340, 430, 430, 430, 430, 430], 0)
  35-min trips, min 7 h:   (7, 2530, [70, 340, 340, 445, 445, 445, 445], 4)
Tuple: (blocks, total block span in minutes, sorted spans in minutes, blocks with a break).
Block span = last arrival - first departure; with no deadhead this equals the app's block revenue time.
"""


def run(run_min, home_layover=20, break_min=35, first_after_h=1.0, min_block_h=4.0):
    trips = []
    for k in range(29):
        d = 9 * 60 + 15 * k
        trips.append((d, d + run_min, 'A', 'B'))
        d2 = 9 * 60 + run_min + 15 * k
        trips.append((d2, d2 + run_min, 'B', 'A'))
    trips.sort(key=lambda t: (t[0], t[2]))  # first departure, then a stable tie-break

    def build(no_break_first_trips):
        blocks = []
        for start, end, origin, destination in trips:
            # The most recently ready open block; ties go to the earlier-created block (Decision 0056).
            ready = [(b['ready'], i) for i, b in enumerate(blocks) if b['at'] == origin and b['ready'] <= start]
            if ready:
                _, i = max(ready, key=lambda r: (r[0], -r[1]))
                block = blocks[i]
            else:
                blocks.append({'start': start, 'first': (start, origin), 'breaks': 0})
                block = blocks[-1]
            block['end'] = end
            block['at'] = destination
            layover = home_layover if destination == 'A' else 0
            if (break_min and destination == 'A' and block['breaks'] == 0
                    and block['first'] not in no_break_first_trips
                    and end - block['start'] >= first_after_h * 60):
                layover = max(layover, break_min)
                block['breaks'] = 1
            block['ready'] = end + layover
        return blocks

    suppressed = set()
    for _ in range(5):
        blocks = build(suppressed)
        short = {b['first'] for b in blocks if b['breaks'] and (b['end'] - b['start']) <= min_block_h * 60}
        if short <= suppressed:
            break
        suppressed |= short
    spans = sorted(b['end'] - b['start'] for b in blocks)
    return len(blocks), sum(spans), spans, sum(b['breaks'] for b in blocks)


if __name__ == '__main__':
    print('35-min trips, breaks:   ', run(35))
    print('46-min trips, breaks:   ', run(46))
    print('35-min trips, no breaks:', run(35, break_min=None))
    print('35-min trips, min 7 h:  ', run(35, min_block_h=7))
