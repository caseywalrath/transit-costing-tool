// Mounts the GTFS import dialog on the running app for the import specs. The dialog is opened from the menus only in sub-plan I9, so the
// spec imports its module from the Vite dev server and renders it into a container with page.evaluate (sub-plan I8, answer 1). Nothing in
// the app is changed to do this. The helper is a test seam only: it does not write to the database.
import { expect, type Page } from '@playwright/test';

export interface MountGtfsImportOptions {
  level: 'A' | 'B' | 'C';
  projectName?: string;
  scenarioName?: string;
  existingRouteNames?: string[];
}

/** Renders the import dialog over the app, and waits for its title. The page must already be at '/'. */
export async function mountGtfsImport(page: Page, options: MountGtfsImportOptions): Promise<void> {
  await page.evaluate(async (props) => {
    // The path is a variable so that the compiler does not resolve it: the browser loads it from the dev server.
    const dialogPath = '/src/ui/gtfs/GtfsImportDialog.tsx';
    const module = (await import(/* @vite-ignore */ dialogPath)) as { mountGtfsImportDialog: (container: HTMLElement, props: Record<string, unknown>) => () => void };
    const container = document.createElement('div');
    container.id = 'gtfs-import-test-root';
    document.body.append(container);
    module.mountGtfsImportDialog(container, { ...props, onClose: () => container.remove() });
  }, options);
  await expect(page.getByRole('heading', { name: titleOf(options.level) })).toBeVisible();
}

function titleOf(level: MountGtfsImportOptions['level']): string {
  if (level === 'A') return 'New project from GTFS feed';
  if (level === 'B') return 'New scenario from GTFS feed';
  return 'Add routes from GTFS feed';
}
