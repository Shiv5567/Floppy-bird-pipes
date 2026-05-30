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
    // Generate 50 unique levels
    const worlds = ['jungle', 'jungle_temple', 'ice', 'cyberpunk', 'volcano'];
    const worldNames = ['Grass Hangar', 'Ancient Ruins', 'Glacial Ridge', 'Neon Sector', 'Magma Abyss'];

    // All available active moving/oscillating wave patterns
    const wavePatterns = [
      'wave_10', 'breathing_12', 'moving_stair_15', 'rotating_17',
      'dynamic_w_18', 'exp_shrink_19', 'hybrid_20', 'snake_21',
      'pulse_22', 'gravity_23', 'rotating_24', 'waterfall_25',
      'elevator_26', 'magnetic_27', 'pendulum_28', 'sliding_29'
    ];

    for (let levelNum = 1; levelNum <= 50; levelNum++) {
      // Determine world group (10 levels per world)
      const worldIdx = Math.min(4, Math.floor((levelNum - 1) / 10));
      const worldId = worlds[worldIdx];
      const worldName = worldNames[worldIdx];

      // Progressive difficulty values
      const targetScore = 150; // Level complete requires 150 obstacles crossed
      const scrollSpeed = (3.3 + (levelNum * 0.06)) * 0.8; // Decreased by 20%
      let gapHeight = Math.max(195, 260 - (levelNum * 2.2)); // 260 down to 195px
      if (levelNum === 1) {
        gapHeight = 280; // Large gap size for easy learning
      } else if (levelNum === 2) {
        gapHeight = 265; // Large gap size for onboarding
      }

      // Distribute patterns based on level brackets using active wave/moving patterns ONLY
      let patterns: string[] = [];
      if (levelNum === 1) {
        patterns = ['level1_straight'];
      } else if (levelNum === 2) {
        patterns = ['level2_w'];
      } else if (levelNum === 3) {
        patterns = ['level3_stair'];
      } else if (levelNum === 4) {
        patterns = ['level4_wave'];
      } else if (levelNum === 5) {
        patterns = ['level5_zigzag'];
      } else if (levelNum === 6) {
        patterns = ['level6_slope'];
      } else if (levelNum === 7) {
        patterns = ['level7_snake'];
      } else if (levelNum === 8) {
        patterns = ['level8_breathing'];
      } else if (levelNum === 9) {
        patterns = ['level9_sliding'];
      } else if (levelNum === 10) {
        patterns = ['level10_hybrid'];
      } else {
        // Levels 11-50: Cycle through standard wave patterns for simple animation
        const patternIndex = (levelNum - 11) % wavePatterns.length;
        patterns = [wavePatterns[patternIndex]];
      }

      this.levels.push({
        levelNum,
        name: `${worldName} - Zone ${((levelNum - 1) % 10) + 1}`,
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
