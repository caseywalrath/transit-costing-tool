import type { Project, ProjectSnapshot } from '../domain/types';
import { cloneProjectSnapshot, exportProjectJson, importProjectJson } from './backup';
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
    // Parsing and validation complete before any repository write is attempted.
    const source = importProjectJson(payload);
    const existing = await this.getSnapshot(source.project.id);
    if (existing && mode === 'reject') throw new Error('Project already exists; choose replace or copy');
    const snapshot = mode === 'copy' ? cloneProjectSnapshot(source) : source;
    await this.saveSnapshot(snapshot);
    return snapshot.project;
  }
}
