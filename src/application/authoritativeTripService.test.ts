import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import { AnchorBandChoiceError } from '../domain/trips';
import type { Block, GenerateTripsRequest, RoutePattern, RuntimeAssignment, RuntimeProfile, Trip, TripGenerationSet, TripRegenerationUndo } from '../domain/types';
import { TripGenerationService, TripRecalculationConfirmationError, TripShiftStalePreviewError } from './tripGenerationService';
import type { TripGenerationRepository } from './ports';

class AuthoritativeFake implements TripGenerationRepository {
  readonly sets = new Map<string, TripGenerationSet>();
  readonly trips = new Map<string, Trip>();
  readonly blocks = new Map<string, Block>();
  undoSnapshot?: TripRegenerationUndo;
  readonly assignments: RuntimeAssignment[] = [];
  failTripChangeCommit = false;
  readonly patterns: RoutePattern[];
  readonly profiles: RuntimeProfile[];
  constructor(patterns: RoutePattern[], profiles: RuntimeProfile[]) { this.patterns = patterns; this.profiles = profiles; }
  async getGenerationSet(id: string) { return this.sets.get(id); }
  async listGenerationSets() { return []; }
  async saveGenerationSet(set: TripGenerationSet) { this.sets.set(set.id, set); }
  async listTrips(serviceDayId: string, generationSetIdOrProfileId?: string) { return [...this.trips.values()].filter((trip) => trip.serviceDayId === serviceDayId && (!generationSetIdOrProfileId || trip.provenance.generationSetId === generationSetIdOrProfileId || trip.tripProfileId === generationSetIdOrProfileId)); }
  async getTrip(id: string) { return this.trips.get(id); }
  async saveTrips(values: Trip[]) { for (const trip of values) this.trips.set(trip.id, trip); if (this.undoSnapshot && values.some((trip) => this.undoSnapshot!.afterTrips.some((after) => after.id === trip.id))) this.undoSnapshot = undefined; }
  async listBlocks(serviceDayId: string) { return [...this.blocks.values()].filter((block) => block.serviceDayId === serviceDayId); }
  async saveBlocks(values: Block[]) { for (const block of values) this.blocks.set(block.id, block); }
  async replaceGenerationSet() { /* historical surface */ }
  async listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string) { return this.assignments.filter((a) => a.scenarioId === scenarioId && (!serviceDayId || a.serviceDayId === serviceDayId) && (!patternId || a.patternId === patternId)); }
  async getPattern(id: string) { return this.patterns.find((pattern) => pattern.id === id); }
  async getRuntimeProfile(id: string) { return this.profiles.find((profile) => profile.id === id); }
  async insertTripsAtomically(values: Trip[]) { for (const trip of values) { if (this.trips.has(trip.id)) throw new Error('duplicate'); this.trips.set(trip.id, trip); } }
  async saveTripChangesAtomically(values: Trip[], blocks: Block[] = []) { if (this.failTripChangeCommit) throw new Error('forced trip change failure'); for (const trip of values) this.trips.set(trip.id, trip); for (const block of blocks) this.blocks.set(block.id, block); if (this.undoSnapshot && values.some((trip) => this.undoSnapshot!.afterTrips.some((after) => after.id === trip.id))) this.undoSnapshot = undefined; }
  async saveRegeneratedTripsWithUndo(_before: Trip[], after: Trip[], snapshot: TripRegenerationUndo) { for (const trip of after) this.trips.set(trip.id, trip); this.undoSnapshot = snapshot; }
  async getLastTripRegenerationUndo() { return this.undoSnapshot; }
  async restoreLastTripRegenerationUndo() { const snapshot = this.undoSnapshot; if (!snapshot) throw new Error('There is no regeneration to undo.'); for (const trip of snapshot.beforeTrips) this.trips.set(trip.id, trip); this.undoSnapshot = undefined; return snapshot.beforeTrips; }
  async deleteTripsAtomically(ids: string[], blocks: Block[] = []) { for (const id of ids) this.trips.delete(id); for (const block of blocks) this.blocks.set(block.id, block); }
}

const pattern = (id: string, name: string, sequence: number): RoutePattern => ({ ...metadata(), id, scenarioId: 'scenario', routeId: 'route', name, directionId: 'southbound', sequence, points: [{ id: `${id}-a`, nodeId: 'a', sequence: 0, cumulativeMiles: 0, directionColumnId: 'col-a' }, { id: `${id}-b`, nodeId: 'b', sequence: 1, cumulativeMiles: 1, directionColumnId: 'col-b' }] });
const profile = (id: string, patternId: string, endTime = 10000, calculationRevision = 0): RuntimeProfile => ({ ...metadata(), id, scenarioId: 'scenario', routeId: 'route', patternId, name: 'Default', calculationRevision, bands: [{ id: `${id}-band`, label: 'All day', sequence: 0, startTime: 0, endTime, segmentRuntimeSeconds: [600] }] });
const request = (patternId: string, firstTrip = 0, lastTrip = 900): GenerateTripsRequest => ({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId, firstTrip, headwaySeconds: 300, lastTrip });

describe('authoritative trip workflow', () => {
  it('generates additively, interlaces duplicate patterns, and records calculation source', async () => {
    const p1 = pattern('p1', 'Southbound 1', 0); const p2 = pattern('p2', 'Southbound 2', 1);
    const repository = new AuthoritativeFake([p1, p2], [profile('rp1', 'p1'), profile('rp2', 'p2')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' }, { ...metadata(), id: 'a2', scenarioId: 'scenario', patternId: 'p2', serviceDayId: 'weekday', runtimeProfileId: 'rp2' });
    const service = new TripGenerationService(repository, () => '2026-09-11T00:00:00.000Z');
    const first = await service.generateTrips(request('p1', 0, 600));
    const second = await service.generateTrips(request('p2', 0, 600));
    expect(first.trips).toHaveLength(3); expect(second.trips).toHaveLength(3); expect(repository.trips.size).toBe(6);
    expect(second.trips[0].provenance.creationMethod).toBe('generated');
    expect(second.trips[0].provenance.calculationSource).toEqual({ runtimeProfileId: 'rp2', runtimeCalculationRevision: 0 });
  });

  it('accepts a count-limited additive generation request', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const generated = await service.generateTrips({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'p1', firstTrip: 0, headwaySeconds: 300, tripCount: 4 });
    expect(generated.trips.map((trip) => trip.stopTimes[0].time)).toEqual([0, 300, 600, 900]);
  });

  it('orders interlaced patterns at their first common timetable point', async () => {
    const p1: RoutePattern = { ...pattern('p1', 'Southbound 1', 0), points: [
      { id: 'p1-a', nodeId: 'a', sequence: 0, cumulativeMiles: 0, directionColumnId: 'col-a' },
      { id: 'p1-b', nodeId: 'b', sequence: 1, cumulativeMiles: 1, directionColumnId: 'col-b' },
      { id: 'p1-c', nodeId: 'c', sequence: 2, cumulativeMiles: 2, directionColumnId: 'col-c' },
    ] };
    const p2: RoutePattern = { ...pattern('p2', 'Southbound 2', 1), points: [
      { id: 'p2-b', nodeId: 'b', sequence: 0, cumulativeMiles: 0, directionColumnId: 'col-b' },
      { id: 'p2-c', nodeId: 'c', sequence: 1, cumulativeMiles: 1, directionColumnId: 'col-c' },
    ] };
    const repository = new AuthoritativeFake([p1, p2], [
      { ...profile('rp1', 'p1'), bands: [{ ...profile('rp1', 'p1').bands[0], segmentRuntimeSeconds: [600, 600] }] },
      { ...profile('rp2', 'p2'), bands: [{ ...profile('rp2', 'p2').bands[0], segmentRuntimeSeconds: [100] }] },
    ]);
    repository.assignments.push(
      { ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' },
      { ...metadata(), id: 'a2', scenarioId: 'scenario', patternId: 'p2', serviceDayId: 'weekday', runtimeProfileId: 'rp2' },
    );
    const service = new TripGenerationService(repository);
    await service.generateTrips(request('p1', 0, 0));
    await service.generateTrips(request('p2', 300, 300));
    const ordered = await service.listScheduleTrips('weekday', 'southbound');
    expect(ordered.map((trip) => trip.patternId)).toEqual(['p2', 'p1']);
    expect(ordered.map((trip) => trip.stopTimes[0].time)).toEqual([300, 0]);
  });

  it('returns an exact duplicate warning without rejecting additive generation', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    await service.generateTrips(request('p1', 0, 0));
    const duplicate = await service.generateTrips(request('p1', 0, 0));
    expect(duplicate.warnings.map((finding) => finding.messageKey)).toEqual(['trip.possibleExactDuplicate']);
    expect(repository.trips.size).toBe(2);
  });

  it('shifts only the selected authoritative trips by signed whole minutes', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const generated = await service.generateTrips(request('p1', 0, 300));
    const [first, second] = generated.trips;
    const shifted = await service.applyTripShift([second.id], -120);
    expect(shifted).toHaveLength(1);
    expect(shifted[0].stopTimes[0].time).toBe(180);
    expect(shifted[0].provenance.manualTimeShiftSeconds).toBe(-120);
    expect(shifted[0].provenance.manuallyChangedFields).toContain('times');
    expect((await repository.getTrip(first.id))?.stopTimes[0].time).toBe(0);
    expect((await repository.getTrip(second.id))?.stopTimes[0].time).toBe(180);
  });

  it('previews and atomically applies a scoped staged Shift', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository, () => '2026-09-14T01:00:00.000Z');
    const generated = await service.generateTrips({ ...request('p1', 600, 600), tripProfileId: 'profile' });
    const preview = await service.previewStagedTripShift({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', directionId: 'southbound', tripProfileId: 'profile', tripIds: [generated.trips[0].id], offsetSeconds: -120 });
    expect(preview.originalTrips[0].stopTimes[0].time).toBe(600);
    expect(preview.shiftedTrips[0].stopTimes[0].time).toBe(480);
    expect((await repository.getTrip(generated.trips[0].id))?.stopTimes[0].time).toBe(600);

    const committed = await service.applyStagedTripShift(preview);
    expect(committed.shiftedTrips[0].provenance.manualTimeShiftSeconds).toBe(-120);
    expect((await repository.getTrip(generated.trips[0].id))?.stopTimes[0].time).toBe(480);
  });

  it('rejects a staged Shift when a selected Trip changes after preview', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const generated = await service.generateTrips({ ...request('p1', 600, 600), tripProfileId: 'profile' });
    const selectedId = generated.trips[0].id;
    const preview = await service.previewStagedTripShift({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', directionId: 'southbound', tripProfileId: 'profile', tripIds: [selectedId], offsetSeconds: 60 });
    const changed = await repository.getTrip(selectedId);
    await repository.saveTrips([{ ...changed!, updatedAt: '2026-09-14T02:00:00.000Z' }]);
    await expect(service.applyStagedTripShift(preview)).rejects.toBeInstanceOf(TripShiftStalePreviewError);
    expect((await repository.getTrip(selectedId))?.stopTimes[0].time).toBe(600);
  });

  it('leaves Trips unchanged when the staged Shift transaction fails', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const generated = await service.generateTrips({ ...request('p1', 600, 600), tripProfileId: 'profile' });
    const selectedId = generated.trips[0].id;
    const preview = await service.previewStagedTripShift({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', directionId: 'southbound', tripProfileId: 'profile', tripIds: [selectedId], offsetSeconds: 60 });
    repository.failTripChangeCommit = true;
    await expect(service.applyStagedTripShift(preview)).rejects.toThrow('forced trip change failure');
    expect((await repository.getTrip(selectedId))?.stopTimes[0].time).toBe(600);
  });

  it('rejects a group atomically when one departure falls in a runtime gap', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1', 600)]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    await expect(service.generateTrips(request('p1', 0, 600))).rejects.toThrow();
    expect(repository.trips.size).toBe(0);
  });

  it('adds a manual trip and requires confirmation for recalculation impacts', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1', 10000, 1)]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const added = await service.addTrip({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'p1', directionId: 'southbound', firstTrip: 1200 });
    expect(added.trip.provenance.creationMethod).toBe('manual');
    const block: Block = { ...metadata(), id: 'block', scenarioId: 'scenario', serviceDayId: 'weekday', label: '1', activities: [{ id: 'activity', type: 'revenueTrip', sequence: 0, tripId: added.trip.id }] };
    repository.blocks.set(block.id, block);
    await expect(service.recalculateTrips([added.trip.id])).rejects.toBeInstanceOf(TripRecalculationConfirmationError);
    const result = await service.recalculateTrips([added.trip.id], true);
    expect(result.trips[0].id).toBe(added.trip.id);
    expect(result.impact.blockIds).toEqual(['block']);
  });

  it('applies a reviewed anchor and rejects a stale recalculation preview', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1', 10000, 1)]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const added = await service.addTrip({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'p1', directionId: 'southbound', firstTrip: 1200 });
    const anchorId = p.points[p.points.length - 1].id;
    const reviewed = await service.previewRecalculateTrips([added.trip.id], { [added.trip.id]: anchorId });
    const applied = await service.applyRecalculationPreview(reviewed);
    expect(applied.trips[0].stopTimes.at(-1)?.time).toBe(added.trip.stopTimes.at(-1)?.time);
    await repository.saveTrips([{ ...applied.trips[0], updatedAt: '2026-09-14T02:00:00.000Z' }]);
    await expect(service.applyRecalculationPreview(reviewed)).rejects.toThrow('Review regeneration again');
  });

  it('stores one-step regeneration undo and expires it when an affected Trip is edited', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const runtime = profile('rp1', 'p1', 10000, 1);
    const repository = new AuthoritativeFake([p], [runtime]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository, () => '2026-09-14T01:00:00.000Z');
    const added = await service.addTrip({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'p1', directionId: 'southbound', tripProfileId: 'trip-profile', firstTrip: 1200 });
    runtime.calculationRevision = 2;
    runtime.bands[0].segmentRuntimeSeconds[0] = 900;
    await service.recalculateTrips([added.trip.id]);
    expect((await repository.getTrip(added.trip.id))?.stopTimes.at(-1)?.time).toBe(2100);
    expect(await service.getLastTripRegenerationUndo()).toMatchObject({ afterTrips: [{ id: added.trip.id }] });
    await service.undoLastTripRegeneration();
    expect((await repository.getTrip(added.trip.id))?.stopTimes.at(-1)?.time).toBe(1800);
    expect(await service.getLastTripRegenerationUndo()).toBeUndefined();

    await service.recalculateTrips([added.trip.id]);
    await repository.saveTrips([{ ...(await repository.getTrip(added.trip.id))!, updatedAt: '2026-09-14T02:00:00.000Z' }]);
    expect(await service.getLastTripRegenerationUndo()).toBeUndefined();
  });

  it('previews and applies Trips table CSV rows while retaining IDs on updates', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    const service = new TripGenerationService(repository, () => '2026-09-14T01:00:00.000Z');
    const context = { scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', directionId: 'southbound', tripProfileId: 'trip-profile' };
    const first = await service.previewTripTableImport(context, [{ patternId: 'p1', publicLabel: 'Imported', stopTimes: [{ patternPointId: 'p1-a', time: 1200 }, { patternPointId: 'p1-b', time: 1800 }] }]);
    expect(first).toMatchObject({ createdCount: 1, updatedCount: 0, findings: [] });
    await service.applyTripTableImport(first);
    const id = first.trips[0].id;
    const update = await service.previewTripTableImport(context, [{ tripId: id, patternId: 'p1', publicLabel: 'Updated', stopTimes: [{ patternPointId: 'p1-a', time: 1260 }, { patternPointId: 'p1-b', time: 1860 }] }]);
    expect(update).toMatchObject({ createdCount: 0, updatedCount: 1, findings: [] });
    await service.applyTripTableImport(update);
    expect(await repository.getTrip(id)).toMatchObject({ id, publicLabel: 'Updated', provenance: { manuallyChangedFields: ['times'] }, stopTimes: [{ time: 1260 }, { time: 1860 }] });
  });

  it('carries a manual band choice through preview and atomic application', async () => {
    const p = pattern('p1', 'Southbound 1', 0);
    const runtime = { ...profile('rp1', 'p1'), bands: [
      { id: 'early', label: 'Early', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [180] },
      { id: 'late', label: 'Late', sequence: 1, startTime: 3600, endTime: 9000, segmentRuntimeSeconds: [300] },
    ] };
    const repository = new AuthoritativeFake([p], [runtime]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const added = await service.addTrip({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'p1', directionId: 'southbound', firstTrip: 3500 });
    await repository.saveTrips([{ ...added.trip, stopTimes: [added.trip.stopTimes[0], { ...added.trip.stopTimes[1], time: 3840 }] }]);
    const anchor = p.points[1].id;
    await expect(service.previewRecalculateTrips([added.trip.id], { [added.trip.id]: anchor })).rejects.toBeInstanceOf(AnchorBandChoiceError);
    const reviewed = await service.previewRecalculateTrips([added.trip.id], { [added.trip.id]: anchor }, { [added.trip.id]: 'late' });
    expect(reviewed.bandSelections).toMatchObject([{ bandLabel: 'Late', departure: 3540, selection: 'manual' }]);
    const applied = await service.applyRecalculationPreview(reviewed);
    expect(applied.trips[0].stopTimes.map((point) => point.time)).toEqual([3540, 3840]);
  });

  it('deletes selected trips and removes their revenue activities from blocks atomically', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const repository = new AuthoritativeFake([p], [profile('rp1', 'p1')]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const generated = await service.generateTrips(request('p1', 0, 300));
    const block: Block = { ...metadata(), id: 'block', scenarioId: 'scenario', serviceDayId: 'weekday', label: '1', activities: [{ id: 'activity', type: 'revenueTrip', sequence: 0, tripId: generated.trips[0].id }] };
    repository.blocks.set(block.id, block);
    expect(await service.previewTripDeletion([generated.trips[0].id])).toEqual({ deletedTripIds: [generated.trips[0].id], affectedBlockIds: ['block'] });
    await service.deleteTrips([generated.trips[0].id]);
    expect(repository.trips.has(generated.trips[0].id)).toBe(false);
    expect(repository.blocks.get('block')?.activities).toEqual([]);
  });

  it('changes patterns with the target assignment while preserving the trip ID and first time', async () => {
    const p1 = pattern('p1', 'Southbound 1', 0); const p2 = pattern('p2', 'Southbound 2', 1);
    const repository = new AuthoritativeFake([p1, p2], [profile('rp1', 'p1'), profile('rp2', 'p2', 10000, 4)]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' }, { ...metadata(), id: 'a2', scenarioId: 'scenario', patternId: 'p2', serviceDayId: 'weekday', runtimeProfileId: 'rp2' });
    const service = new TripGenerationService(repository);
    const created = await service.addTrip({ scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'p1', directionId: 'southbound', firstTrip: 1200 });
    const preview = await service.previewTripPatternChange(created.trip.id, 'p2', 'southbound');
    const changed = await service.changeTripPattern(preview);
    expect(changed.id).toBe(created.trip.id); expect(changed.patternId).toBe('p2'); expect(changed.stopTimes[0].time).toBe(1200);
    expect(changed.provenance.runtimeProfileId).toBe('rp2'); expect(changed.provenance.runtimeCalculationRevision).toBe(4);
  });

  it('identifies stale runtime sources without mutating trips and orders large schedules deterministically', async () => {
    const p = pattern('p1', 'Southbound 1', 0); const current = profile('rp1', 'p1', 10000, 2);
    const repository = new AuthoritativeFake([p], [current]);
    repository.assignments.push({ ...metadata(), id: 'a1', scenarioId: 'scenario', patternId: 'p1', serviceDayId: 'weekday', runtimeProfileId: 'rp1' });
    const service = new TripGenerationService(repository);
    const generated = await service.generateTrips(request('p1', 0, 0));
    const stale = { ...generated.trips[0], id: 'stale', stopTimes: generated.trips[0].stopTimes.map((point) => ({ ...point, time: point.time + 30 })), provenance: { ...generated.trips[0].provenance, runtimeCalculationRevision: 1, calculationSource: { runtimeProfileId: 'rp1', runtimeCalculationRevision: 1 } } };
    repository.trips.set(stale.id, stale);
    expect((await service.listStaleTrips('weekday')).map((trip) => trip.id)).toEqual(['stale']);
    const bulk = Array.from({ length: 500 }, (_, index) => ({ ...generated.trips[0], id: `bulk-${index}`, stopTimes: generated.trips[0].stopTimes.map((point) => ({ ...point, time: index * 60 + point.time })) }));
    await repository.insertTripsAtomically(bulk);
    const ordered = await service.listScheduleTrips('weekday', 'southbound');
    expect(ordered.length).toBe(502); expect(ordered[0].stopTimes[0].time).toBe(0); expect(ordered.at(-1)?.stopTimes[0].time).toBeGreaterThanOrEqual(29940);
  });
});
