import type { Block } from '../domain/types';
import type { RouteDefinitionRepository } from '../application/ports';

/**
 * Stores `blocks` beside the Blocks already stored, replacing a Block with the same id. Test setup only: the repositories have no
 * direct Block write (`saveBlocks` was removed in package F2 because only tests called it), so this goes through the project snapshot.
 */
export async function addBlocks(repository: Pick<RouteDefinitionRepository, 'listProjects' | 'listScenarios' | 'getProjectSnapshot' | 'saveProjectSnapshot'>, blocks: Block[]): Promise<void> {
  for (const project of await repository.listProjects()) {
    const scenarioIds = new Set((await repository.listScenarios(project.id)).map((scenario) => scenario.id));
    if (!blocks.every((block) => scenarioIds.has(block.scenarioId))) continue;
    const snapshot = (await repository.getProjectSnapshot(project.id))!;
    const replaced = new Set(blocks.map((block) => block.id));
    await repository.saveProjectSnapshot({ ...snapshot, blocks: [...snapshot.blocks.filter((block) => !replaced.has(block.id)), ...blocks] });
    return;
  }
  throw new Error('No stored project owns these Blocks.');
}
