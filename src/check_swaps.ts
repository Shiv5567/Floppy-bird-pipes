import { LevelManager } from './systems/LevelManager.ts';

const levels = LevelManager.getAllLevels();
for (const lvl of levels) {
  if ([25, 27, 28, 29, 30, 37, 38, 39, 40, 46, 50].includes(lvl.levelNum)) {
    console.log(`Level ${lvl.levelNum}: Name="${lvl.name}", World="${lvl.worldId}", Patterns=${JSON.stringify(lvl.patterns)}`);
  }
}
