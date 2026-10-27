// Test seams for the interface revision (plan UR-0). Specs reach scope selectors, panels, and menu commands through these helpers, so a
// package that moves a control changes this file and not every spec. Later packages change only the maps below.
import type { Locator, Page } from '@playwright/test';

/** The scope selectors. The names are the revised ones (T1-A); `todayLabel` is the label the control carries now. */
export type ScopeFieldName = 'Route' | 'Day' | 'Direction' | 'Trip profile' | 'Blocking scenario' | 'View year';

const scopeFieldToday: Record<ScopeFieldName, string> = {
  Route: 'Route',
  Day: 'Day',
  Direction: 'Direction',
  'Trip profile': 'Trip Profile',
  'Blocking scenario': 'Blocking Scenario',
  'View year': 'View year',
};

/** Returns the scope selector with this label. Today these sit in the route picker and the module toolbars. */
export const scopeField = (page: Page, label: ScopeFieldName): Locator => page.locator('.route-picker, .module-toolbar').getByLabel(scopeFieldToday[label]);

/** The global Project and Scenario selectors. Packages UR-5 turns them into switchers; this is the one place that changes. */
export const projectSelect = (page: Page): Locator => page.locator('.context-bar select').first();
export const scenarioSelect = (page: Page): Locator => page.locator('.context-bar select').nth(1);

export type RegionId = 'unassignedTrips' | 'currentBlock' | 'runtimes' | 'trips' | 'blockingControls' | 'routeControls' | 'costingControls';

const regionToday: Record<RegionId, string> = {
  unassignedTrips: 'Unassigned Trips',
  currentBlock: 'Current Block',
  runtimes: 'Runtimes section',
  trips: 'Trips section',
  blockingControls: 'Blocking controls',
  routeControls: 'Route controls',
  costingControls: 'Costing controls',
};

/** Returns the panel with this id. */
export const region = (page: Page, id: RegionId): Locator => page.locator(`[aria-label="${regionToday[id]}"]`);

type Command = {
  /** The accessible name of the menu trigger, which is also the menu's name. */
  menu: string;
  /** The panel that holds the trigger. Omitted when the trigger is unique on the page. */
  within?: RegionId;
  item: string;
  role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';
};

/** How each command is run today. Section 7, UR-0 of `docs/implementation/ui-revision-plan.md` lists the ids. */
const commands = {
  'trips.build': { menu: 'Trip actions', within: 'trips', item: 'Build trips…' },
  'trips.add': { menu: 'Trip actions', within: 'trips', item: 'Add trip…' },
  'trips.shift': { menu: 'Trip actions', within: 'trips', item: 'Shift selected…' },
  // Decision 0046: always listed, and disabled until a selected Trip has changed runtimes.
  'trips.regenerate': { menu: 'Trip actions', within: 'trips', item: 'Regenerate selected…' },
  // A separate item, listed only while the saved undo applies. Its name is "Undo last regeneration (N Trips)".
  'trips.undoRegeneration': { menu: 'Trip actions', within: 'trips', item: 'Undo last regeneration' },
  'trips.changePattern': { menu: 'Trip actions', within: 'trips', item: 'Change pattern…' },
  'trips.assignBlock': { menu: 'Trip actions', within: 'trips', item: 'Assign Block…' },
  'trips.unassignBlock': { menu: 'Trip actions', within: 'trips', item: 'Unassign from Block…' },
  'trips.delete': { menu: 'Trip actions', within: 'trips', item: 'Delete selected…' },
  'trips.copyDay': { menu: 'Trip actions', within: 'trips', item: 'Copy Trips from day…' },
  'trips.exportCsv': { menu: 'Trip actions', within: 'trips', item: 'Export Trips CSV' },
  'trips.toggleHeadways': { menu: 'Trip actions', within: 'trips', item: 'Show headways', role: 'menuitemcheckbox' },
  'trips.toggleBands': { menu: 'Trip actions', within: 'trips', item: 'Show runtime bands', role: 'menuitemcheckbox' },
  'trips.toggleRounding': { menu: 'Trip actions', within: 'trips', item: 'Round displayed times', role: 'menuitemcheckbox' },
  'runtime.addBand': { menu: 'Runtime actions', within: 'runtimes', item: 'Add Time Band' },
  'runtime.copyDay': { menu: 'Runtime actions', within: 'runtimes', item: 'Copy runtimes from day…' },
  'runtime.exportCsv': { menu: 'Runtime actions', within: 'runtimes', item: 'Export profile CSV' },
  'runtime.method.singleBand': { menu: 'Runtime actions', within: 'runtimes', item: 'Single band for trip', role: 'menuitemradio' },
  'runtime.method.segmentStart': { menu: 'Runtime actions', within: 'runtimes', item: 'Band at segment start', role: 'menuitemradio' },
  'project.new': { menu: 'Project actions', item: 'New project' },
  'project.rename': { menu: 'Project actions', item: 'Rename project' },
  'project.delete': { menu: 'Project actions', item: 'Delete project' },
  'project.backup': { menu: 'Project actions', item: 'Backup project JSON' },
  'project.restore': { menu: 'Project actions', item: 'Restore project JSON' },
  'scenario.new': { menu: 'Scenario actions', item: 'New scenario' },
  'scenario.rename': { menu: 'Scenario actions', item: 'Rename scenario' },
  'scenario.duplicate': { menu: 'Scenario actions', item: 'Duplicate scenario' },
  'scenario.delete': { menu: 'Scenario actions', item: 'Delete scenario' },
  'route.new': { menu: 'Route actions', item: 'New route' },
  'route.rename': { menu: 'Route actions', item: 'Rename route' },
  'route.duplicate': { menu: 'Route actions', item: 'Duplicate route' },
  'route.exportCsv': { menu: 'Route actions', item: 'Export Route CSV (ZIP)' },
  'route.delete': { menu: 'Route actions', item: 'Delete route' },
  'blockingScenario.new': { menu: 'Blocking actions', item: 'New Blocking Scenario…' },
  'blockingScenario.rename': { menu: 'Blocking actions', item: 'Rename Blocking Scenario…' },
  'blockingScenario.duplicate': { menu: 'Blocking actions', item: 'Duplicate Blocking Scenario…' },
  'blockingScenario.delete': { menu: 'Blocking actions', item: 'Delete Blocking Scenario…' },
  'blockingScenario.exportCsv': { menu: 'Blocking actions', item: 'Export Blocking CSV (ZIP)' },
  'block.new': { menu: 'Current Block actions', within: 'currentBlock', item: 'New Block…' },
  'block.rename': { menu: 'Current Block actions', within: 'currentBlock', item: 'Rename Block…' },
  'block.notes': { menu: 'Current Block actions', within: 'currentBlock', item: 'Edit notes…' },
  'block.delete': { menu: 'Current Block actions', within: 'currentBlock', item: 'Delete Block…' },
  'block.addPullOut': { menu: 'Current Block actions', within: 'currentBlock', item: 'Add pull-out…' },
  'block.addPullIn': { menu: 'Current Block actions', within: 'currentBlock', item: 'Add pull-in…' },
  'block.reassignTrips': { menu: 'Current Block actions', within: 'currentBlock', item: 'Reassign Trips…' },
  'block.removeTrips': { menu: 'Current Block actions', within: 'currentBlock', item: 'Remove Trips…' },
  'unassigned.compatibleOnly': { menu: 'Unassigned Trip actions', within: 'unassignedTrips', item: 'Compatible only', role: 'menuitemcheckbox' },
  'unassigned.clearFilters': { menu: 'Unassigned Trip actions', within: 'unassignedTrips', item: 'Clear filters' },
  'costing.exportCsv': { menu: 'Costing actions', item: 'Export Costing CSV (ZIP)' },
} satisfies Record<string, Command>;

export type CommandId = keyof typeof commands;

/** Opens the command's menu and chooses its item. Item names match exactly, except the Undo item, whose name ends in "(N Trips)". */
export async function runCommand(page: Page, id: CommandId) {
  const command: Command = commands[id];
  const scope = command.within ? region(page, command.within) : page;
  await scope.getByRole('button', { name: command.menu, exact: true }).click();
  await page.getByRole('menu', { name: command.menu, exact: true }).getByRole(command.role ?? 'menuitem', { name: command.item, exact: id !== 'trips.undoRegeneration' }).click();
}
