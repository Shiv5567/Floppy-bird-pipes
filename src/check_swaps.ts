import { LevelManager } from './systems/LevelManager.ts';

const levels = LevelManager.getAllLevels();
for (const lvl of levels) {
  if (lvl.levelNum >= 41 && lvl.levelNum <= 50) {
    console.log(`Level ${lvl.levelNum}: Name="${lvl.name}", World="${lvl.worldId}", Patterns=${JSON.stringify(lvl.patterns)}`);
  }
}
