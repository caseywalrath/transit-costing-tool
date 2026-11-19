import json, sys, re, openpyxl
backup_path, xlsx, out = sys.argv[1:4]
d = json.load(open(backup_path))
ws = openpyxl.load_workbook(xlsx, data_only=True).worksheets[0]
blocks = {}; cur = None; pending = None
for r in ws.iter_rows(values_only=True):
    a, b = r[0], r[1]
    if a in ('Southbound', 'Northbound'): pending = a; continue
    if b == 'Stop Name':
        cur = pending if pending not in blocks else None
        if cur: blocks[cur] = []
        continue
    if cur and isinstance(a, (int, float)) and b: blocks[cur].append((str(int(a)), str(b).strip()))
    else: cur = None
nodes = {n['id']: n['name'] for n in d['nodes']}
MATCH = {'Wagon Road': 'Wagon Road', '112th Ave': '112th', '104th Ave': '104th', 'Westminster Station': 'Westminster Station', 'Clear Creek & Federal': 'Clear Creek', 'Federal-32nd': None, 'Decatur - Federal': 'Decatur', 'Alameda': 'Alameda Ave', 'Evans': 'Evans Ave', 'Yale': 'Yale Ave', 'Englewood': 'Englewood'}
def ave(name):
    m = re.search(r'W (\d+)(st|nd|rd|th) Ave', name); return int(m.group(1)) if m else None
route = d['routes'][0]; stamp = '2026-11-19T00:00:00.000Z'
stops = {}; placements = {}; codes = {}
dirname = {x['id']: x['name'] for x in d['directions']}
for pat in d['patterns']:
    rows = blocks[dirname[pat['directionId']]]
    pts = sorted(pat['points'], key=lambda p: p['sequence'])
    # index of each timepoint's stop row in the workbook block
    idx = []
    for p in pts:
        key = MATCH[nodes[p['nodeId']]]
        if key is None: idx.append(None); continue
        i = next(k for k, (_, nm) in enumerate(rows) if key.lower() in nm.lower())
        idx.append(i); codes.setdefault(pat['id'], {})[p['id']] = rows[i][0]
    pl = []
    for s in range(len(pts) - 1):
        a = idx[s]; b = idx[s + 1]
        # Federal-32nd has no stop: split the stops at 32nd Avenue.
        if a is None or b is None:
            lo = idx[s - 1] if a is None else a; hi = idx[s + 2] if b is None else b
            seg = [k for k in range(lo + 1, hi) if (ave(rows[k][1]) or 0) > 32] if dirname[pat['directionId']] == 'Southbound' else [k for k in range(lo + 1, hi) if (ave(rows[k][1]) or 99) < 32]
            if a is None: seg = [k for k in range(lo + 1, hi) if k not in seg]
        else:
            seg = range(a + 1, b)
        for n, k in enumerate(seg):
            code, name = rows[k]; sid = 'stop-' + code
            stops[sid] = {'id': sid, 'name': name, 'stopCode': code}
            pl.append({'id': f'pl-{pat["id"][:8]}-{code}', 'stopId': sid, 'afterPatternPointId': pts[s]['id'], 'sequence': n, 'timing': 'interpolate'})
    if pl: placements[pat['id']] = pl
d['exportSchemaVersion'] = 15
d['routeStopSets'] = [{'id': 'federal-stop-set', 'scenarioId': route['scenarioId'], 'routeId': route['id'], 'roundingSeconds': 60, 'stops': list(stops.values()), 'placementsByPatternId': placements, 'timepointStopCodesByPatternId': codes, 'createdAt': stamp, 'updatedAt': stamp}]
weekday = next(s for s in d['serviceDays'] if s['name'] == 'Weekday')
H = 3600
periods = [(4, 6, 15), (6, 10, 15), (10, 15, 15), (15, 18, 15), (18, 20, 15), (20, 22, 30), (22, 24, 30)]
d['plannedFrequencies'] = [{'id': 'federal-weekday-plan', 'scenarioId': route['scenarioId'], 'routeId': route['id'], 'serviceDayId': weekday['id'], 'periods': [{'id': f'period-{i}', 'startTime': a * H, 'endTime': b * H, 'headwaySeconds': m * 60} for i, (a, b, m) in enumerate(periods)], 'measureNodeIdByDirectionId': {}, 'createdAt': stamp, 'updatedAt': stamp}]
json.dump(d, open(out, 'w'), indent=1)
print(len(stops), 'stops;', {k[:6]: len(v) for k, v in placements.items()})
