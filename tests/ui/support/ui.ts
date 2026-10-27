// Test seams for the interface revision (plan UR-0). Specs reach scope selectors, panels, and menu commands through these helpers, so a
// package that moves a control changes this file and not every spec. Later packages change only the maps below.
import { expect, type Locator, type Page } from '@playwright/test';

/** The scope selectors. The names are the revised ones (T1-A); `todayLabel` is the label the control carries now. */
export type ScopeFieldName = 'Route' | 'Day' | 'Direction' | 'Trip profile' | 'Blocking scenario' | 'View year';

const scopeFieldToday: Record<ScopeFieldName, string> = {
  Route: 'Route',
  Day: 'Day',
  Direction: 'Direction',
  'Trip profile': 'Trip profile',
  'Blocking scenario': 'Blocking scenario',
  'View year': 'View year',
};

/** Returns the scope selector with this label. The selectors sit in row 2 of the header (the scope bar). */
export const scopeField = (page: Page, label: ScopeFieldName): Locator => page.getByRole('region', { name: 'Scope', exact: true }).getByLabel(scopeFieldToday[label], { exact: true });

/** The Project and Scenario switchers in the header: the menu buttons whose names are "Project: <name>" and "Scenario: <name>". */
export const projectSwitcher = (page: Page): Locator => page.getByRole('button', { name: /^Project: / });
export const scenarioSwitcher = (page: Page): Locator => page.getByRole('button', { name: /^Scenario: / });

/** Chooses a project or scenario from its switcher menu. */
export async function chooseProject(page: Page, name: string) {
  await projectSwitcher(page).click();
  await page.getByRole('menu', { name: 'Project actions', exact: true }).getByRole('menuitemradio', { name, exact: true }).click();
}
export async function chooseScenario(page: Page, name: string) {
  await scenarioSwitcher(page).click();
  await page.getByRole('menu', { name: 'Scenario actions', exact: true }).getByRole('menuitemradio', { name, exact: true }).click();
}

export type RegionId = 'unassignedTrips' | 'currentBlock' | 'runtimes' | 'trips' | 'blockingControls' | 'routeControls' | 'costingControls';

const regionToday: Record<RegionId, string> = {
  unassignedTrips: 'Unassigned Trips',
  currentBlock: 'Current Block',
  runtimes: 'Runtimes section',
  trips: 'Trips section',
  blockingControls: 'Scope',
  routeControls: 'Scope',
  costingControls: 'Scope',
};

/** Returns the panel with this id. */
export const region = (page: Page, id: RegionId): Locator => page.locator(`[aria-label="${regionToday[id]}"]`);

/**
 * Opens the Runtimes section on the Trips tab (R-A). It is collapsed by default, and every spec that edits or reads the Runtime editor,
 * profile, or actions calls this first. Does nothing when the section is already open.
 */
export async function openRuntimes(page: Page) {
  const toggle = region(page, 'runtimes').getByRole('button', { name: 'Runtimes', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

type Command = {
  /** The accessible name of the menu trigger, which is also the menu's name. */
  menu: string;
  /** The trigger's accessible name when it differs from the menu's: the header switchers read "Project: <name>". */
  trigger?: RegExp;
  /** The panel that holds the trigger. Omitted when the trigger is unique on the page. */
  within?: RegionId;
  item: string;
  role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox';
};

/** Commands that are a plain button, not a menu item. `within` is the panel that holds the button. */
const buttonCommands = {
  'costing.exportCsv': { name: 'Export costing CSV' },
  // UR-6c: Build trips and Add trip are header buttons; the commands that need a selection are buttons in the selection bar.
  'trips.build': { name: 'Build trips…', within: 'trips' },
  'trips.add': { name: 'Add trip', within: 'trips' },
  'trips.shift': { name: 'Shift…', within: 'selectionBar' },
  // Decision 0046: always present while trips are selected, and disabled until a selected Trip has changed runtimes.
  'trips.regenerate': { name: 'Regenerate…', within: 'selectionBar' },
  'trips.changePattern': { name: 'Change pattern…', within: 'selectionBar' },
  'trips.assignBlock': { name: 'Assign block…', within: 'selectionBar' },
  'trips.unassignBlock': { name: 'Unassign…', within: 'selectionBar' },
  'trips.delete': { name: 'Delete…', within: 'selectionBar' },
  'runtime.addBand': { name: 'Add time band', within: 'runtimes' },
} satisfies Record<string, { name: string; within?: RegionId | 'selectionBar' }>;

/** How each menu command is run today. Section 7, UR-0 of `docs/implementation/ui-revision-plan.md` lists the ids. */
const commands = {
  // A separate item, listed only while the saved undo applies. Its name is "Undo last regeneration (N trips)".
  'trips.undoRegeneration': { menu: 'Trip actions', within: 'trips', item: 'Undo last regeneration' },
  'trips.copyDay': { menu: 'Trip actions', within: 'trips', item: 'Copy trips from another day…' },
  'trips.exportCsv': { menu: 'Trip actions', within: 'trips', item: 'Export trips CSV' },
  'trips.toggleHeadways': { menu: 'View', within: 'trips', item: 'Show headways', role: 'menuitemcheckbox' },
  'trips.toggleBands': { menu: 'View', within: 'trips', item: 'Show runtime bands', role: 'menuitemcheckbox' },
  'trips.toggleRounding': { menu: 'View', within: 'trips', item: 'Round displayed times', role: 'menuitemcheckbox' },
  'runtime.copyDay': { menu: 'Runtime actions', within: 'runtimes', item: 'Copy runtimes from another day…' },
  'runtime.exportCsv': { menu: 'Runtime actions', within: 'runtimes', item: 'Export profile CSV' },
  'runtime.method.singleBand': { menu: 'Runtime actions', within: 'runtimes', item: 'Single band for trip', role: 'menuitemradio' },
  'runtime.method.segmentStart': { menu: 'Runtime actions', within: 'runtimes', item: 'Band at segment start', role: 'menuitemradio' },
  'project.new': { menu: 'Project actions', trigger: /^Project: /, item: 'New project…' },
  'project.rename': { menu: 'Project actions', trigger: /^Project: /, item: 'Rename project…' },
  'project.delete': { menu: 'Project actions', trigger: /^Project: /, item: 'Delete project…' },
  'project.backup': { menu: 'Project actions', trigger: /^Project: /, item: 'Back up project (JSON)' },
  'project.restore': { menu: 'Project actions', trigger: /^Project: /, item: 'Restore project from backup…' },
  'scenario.new': { menu: 'Scenario actions', trigger: /^Scenario: /, item: 'New scenario…' },
  'scenario.rename': { menu: 'Scenario actions', trigger: /^Scenario: /, item: 'Rename scenario…' },
  'scenario.duplicate': { menu: 'Scenario actions', trigger: /^Scenario: /, item: 'Duplicate scenario…' },
  'scenario.delete': { menu: 'Scenario actions', trigger: /^Scenario: /, item: 'Delete scenario…' },
  'pattern.duplicate': { menu: 'Pattern actions', item: 'Duplicate pattern' },
  'pattern.delete': { menu: 'Pattern actions', item: 'Delete pattern…' },
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
} satisfies Record<string, Command>;

export type CommandId = keyof typeof commands | keyof typeof buttonCommands;

/** Opens the command's menu and chooses its item. Item names match exactly, except the Undo item, whose name ends in "(N Trips)". */
export async function runCommand(page: Page, id: CommandId) {
  if (id in buttonCommands) {
    const button: { name: string; within?: RegionId | 'selectionBar' } = buttonCommands[id as keyof typeof buttonCommands];
    // The selection bar is above the table, or pinned above the table headings (outside the Trips section) while the page is scrolled.
    const scope = button.within === 'selectionBar' ? page.getByRole('toolbar', { name: 'Selected trips' }) : button.within ? region(page, button.within) : page;
    await scope.getByRole('button', { name: button.name, exact: true }).click();
    return;
  }
  const command: Command = commands[id as keyof typeof commands];
  const scope = command.within ? region(page, command.within) : page;
  await scope.getByRole('button', command.trigger ? { name: command.trigger } : { name: command.menu, exact: true }).click();
  await page.getByRole('menu', { name: command.menu, exact: true }).getByRole(command.role ?? 'menuitem', { name: command.item, exact: id !== 'trips.undoRegeneration' }).click();
}
