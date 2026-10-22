import type { Project, ProjectSnapshot } from '../domain/types';
import { cloneProjectSnapshot, exportProjectJson, importProjectJson, parseProjectBackupWithReport, type BackupImportReport } from './backup';
import type { BackupImportMode, BackupPort } from '../application/ports';

export class ProjectBackupService implements BackupPort {
  constructor(
    private readonly getSnapshot: (id: string) => Promise<ProjectSnapshot | undefined>,
    private readonly saveSnapshot: (snapshot: ProjectSnapshot) => Promise<void>,
  ) {}

  async exportProject(id: string): Promise<string> {
    const snapshot = await this.getSnapshot(id);
    if (!snapshot) throw new Error('Project not found');
    return exportProjectJson(snapshot);
  }

  async importProject(payload: string, mode: BackupImportMode = 'reject'): Promise<Project> {
    return (await this.importProjectWithReport(payload, mode)).project;
  }

  /** Imports a backup and says what parsing repaired, could not repair, or left out. Presenting the report is the data-safety package (U02). */
  async importProjectWithReport(payload: string, mode: BackupImportMode = 'reject'): Promise<{ project: Project; report: BackupImportReport }> {
    // Parsing and validation complete before any repository write is attempted.
    const { snapshot: source, report } = parseProjectBackupWithReport(payload);
    const existing = await this.getSnapshot(source.project.id);
    if (existing && mode === 'reject') throw new Error('Project already exists; choose replace or copy');
    // Re-parse copied snapshots before writing so cloned references receive the same
    // graph validation as an uploaded backup.
    const snapshot = mode === 'copy'
      ? importProjectJson(exportProjectJson(cloneProjectSnapshot(source)))
      : source;
    await this.saveSnapshot(snapshot);
    return { project: snapshot.project, report };
  }
}
