export interface LevelConfig {
  levelNum: number;
  name: string;
  worldId: string;
  targetScore: number;
  scrollSpeed: number;
  gapHeight: number;
  patterns: string[];
}

export class LevelManager {
  private static levels: LevelConfig[] = [];

  static {
    // Generate 30 unique levels
    const worlds = ['jungle', 'jungle_temple', 'ice', 'cyberpunk', 'volcano'];
    const worldNames = ['Grass Hangar', 'Ancient Ruins', 'Glacial Ridge', 'Neon Sector', 'Magma Abyss'];

    // All available reactive patterns
    const allPatterns = [
      'stair_up', 'stair_down', 'reverse_stair', 'zigzag_stair',
      'v_shape', 'arrow_shape', 'w_shape', 'm_shape', 'n_shape',
      'diamond_gate', 'mechanical_claw', 'temple_door', 'scissor_gate',
      'spiral_motion', 'wave_corridor'
    ];

    for (let levelNum = 1; levelNum <= 30; levelNum++) {
      // Determine world group (6 levels per world)
      const worldIdx = Math.min(4, Math.floor((levelNum - 1) / 6));
      const worldId = worlds[worldIdx];
      const worldName = worldNames[worldIdx];

      // Progressive difficulty values
      const targetScore = 8 + Math.floor(levelNum * 0.5); // 8 up to 23 points
      const scrollSpeed = 3.3 + (levelNum * 0.06); // 3.3 up to 5.1
      const gapHeight = Math.max(195, 260 - (levelNum * 2.2)); // 260 down to 195px

      // Distribute patterns based on level brackets
      let patterns: string[] = [];
      if (levelNum <= 5) {
        // Levels 1-5: simple reactive motion
        patterns = ['stair_up', 'stair_down', 'v_shape'];
      } else if (levelNum <= 10) {
        // Levels 6-10: rhythm-based patterns
        patterns = ['stair_up', 'stair_down', 'zigzag_stair', 'reverse_stair', 'arrow_shape'];
      } else if (levelNum <= 15) {
        // Levels 11-15: advanced transformations
        patterns = ['v_shape', 'arrow_shape', 'w_shape', 'm_shape', 'n_shape', 'diamond_gate'];
      } else if (levelNum <= 20) {
        // Levels 16-20: fast motion flow
        patterns = ['w_shape', 'm_shape', 'diamond_gate', 'wave_corridor', 'mechanical_claw', 'temple_door'];
      } else if (levelNum <= 25) {
        // Levels 21-25: high complexity
        patterns = ['wave_corridor', 'mechanical_claw', 'temple_door', 'scissor_gate', 'spiral_motion'];
      } else {
        // Levels 26-30: master levels (combines all obstacle systems)
        patterns = [...allPatterns];
      }

      this.levels.push({
        levelNum,
        name: `${worldName} - Zone ${((levelNum - 1) % 6) + 1}`,
        worldId,
        targetScore,
        scrollSpeed,
        gapHeight,
        patterns
      });
    }
  }

  public static getLevel(levelNum: number): LevelConfig | undefined {
    return this.levels.find(l => l.levelNum === levelNum);
  }

  public static getAllLevels(): LevelConfig[] {
    return this.levels;
  }
}
