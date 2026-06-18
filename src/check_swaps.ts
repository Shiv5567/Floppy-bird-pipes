import { LevelManager } from './systems/LevelManager.ts';

const levels = LevelManager.getAllLevels();
for (const lvl of levels) {
  console.log(`Level ${lvl.levelNum}: Name="${lvl.name}", World="${lvl.worldId}", targetScore=${lvl.targetScore}, gapHeight=${lvl.gapHeight}, scrollSpeed=${lvl.scrollSpeed}, Patterns=${JSON.stringify(lvl.patterns)}`);
}
