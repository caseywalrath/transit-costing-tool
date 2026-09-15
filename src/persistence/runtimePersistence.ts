import { validateRuntimeAssignment, validateRuntimeProfile } from '../domain/runtime';
import type { RoutePattern, RuntimeAssignment, RuntimeProfile, ServiceDayDefinition } from '../domain/types';

export function assertRuntimeGraph(
  profiles: RuntimeProfile[],
  assignments: RuntimeAssignment[],
  patterns: RoutePattern[],
  serviceDays: ServiceDayDefinition[],
  scenarioId?: string,
): void {
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const profileById = new Map<string, RuntimeProfile>();
  for (const profile of profiles) {
    if (scenarioId && profile.scenarioId !== scenarioId) throw new Error(`Runtime profile ${profile.id} references another scenario`);
    const pattern = patternById.get(profile.patternId);
    if (!pattern) throw new Error(`Runtime profile ${profile.id} references a missing pattern`);
    if (profile.routeId !== pattern.routeId || profile.scenarioId !== pattern.scenarioId) throw new Error(`Runtime profile ${profile.id} has invalid ownership`);
    if (profileById.has(profile.id)) throw new Error(`Duplicate runtime profile id ${profile.id}`);
    const findings = validateRuntimeProfile(profile, pattern);
    const error = findings.find((finding) => finding.severity === 'error');
    if (error) throw new Error(`Runtime profile ${profile.id} failed validation: ${error.messageKey}`);
    profileById.set(profile.id, profile);
  }
  const serviceDayById = new Map(serviceDays.map((day) => [day.id, day]));
  const assignmentKeys = new Set<string>();
  const assignmentIds = new Set<string>();
  for (const assignment of assignments) {
    if (scenarioId && assignment.scenarioId !== scenarioId) throw new Error(`Runtime assignment ${assignment.id} references another scenario`);
    if (assignmentIds.has(assignment.id)) throw new Error(`Duplicate runtime assignment id ${assignment.id}`);
    assignmentIds.add(assignment.id);
    const pattern = patternById.get(assignment.patternId);
    const profile = profileById.get(assignment.runtimeProfileId);
    const serviceDay = serviceDayById.get(assignment.serviceDayId);
    if (!pattern || !profile || !serviceDay) throw new Error(`Runtime assignment ${assignment.id} references a missing record`);
    if (serviceDay.scenarioId !== assignment.scenarioId) throw new Error(`Runtime assignment ${assignment.id} has an invalid service-day relationship`);
    const findings = validateRuntimeAssignment(assignment, pattern, profile);
    const error = findings.find((finding) => finding.severity === 'error');
    if (error) throw new Error(`Runtime assignment ${assignment.id} failed validation: ${error.messageKey}`);
    const key = `${assignment.patternId}:${assignment.serviceDayId}`;
    if (assignmentKeys.has(key)) throw new Error(`Duplicate runtime assignment for ${key}`);
    assignmentKeys.add(key);
  }
}
