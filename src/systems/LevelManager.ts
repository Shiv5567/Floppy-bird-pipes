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

    // All available active moving/oscillating wave patterns
    const wavePatterns = [
      'wave_10', 'breathing_12', 'moving_stair_15', 'rotating_17',
      'dynamic_w_18', 'exp_shrink_19', 'hybrid_20', 'snake_21',
      'pulse_22', 'gravity_23', 'rotating_24', 'waterfall_25',
      'elevator_26', 'magnetic_27', 'pendulum_28', 'sliding_29',
      'boss_30'
    ];

    for (let levelNum = 1; levelNum <= 30; levelNum++) {
      // Determine world group (6 levels per world)
      const worldIdx = Math.min(4, Math.floor((levelNum - 1) / 6));
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
      } else if (levelNum === 11) {
        patterns = ['rotating_24'];
      } else if (levelNum === 12) {
        patterns = ['waterfall_25'];
      } else if (levelNum === 13) {
        patterns = ['elevator_26'];
      } else if (levelNum === 14) {
        patterns = ['magnetic_27'];
      } else if (levelNum === 15) {
        patterns = ['pendulum_28'];
      } else if (levelNum === 16) {
        patterns = ['sliding_29'];
      } else if (levelNum === 17) {
        patterns = ['boss_30'];
      } else if (levelNum === 20) {
        patterns = ['hybrid_20'];
      } else if (levelNum === 21) {
        patterns = ['snake_21'];
      } else if (levelNum === 22) {
        patterns = ['pulse_22'];
      } else if (levelNum === 23) {
        patterns = ['gravity_23'];
      } else if (levelNum === 24) {
        patterns = ['rotating_24'];
      } else if (levelNum === 25) {
        patterns = ['waterfall_25'];
      } else if (levelNum === 26) {
        patterns = ['elevator_26'];
      } else if (levelNum === 27) {
        patterns = ['magnetic_27'];
      } else if (levelNum === 28) {
        patterns = ['pendulum_28'];
      } else if (levelNum === 29) {
        patterns = ['sliding_29'];
      } else if (levelNum === 30) {
        patterns = ['boss_30'];
      } else if (levelNum <= 5) {
        patterns = ['level1_straight', 'level2_w', 'level3_stair'];
      } else if (levelNum <= 10) {
        patterns = ['level4_wave', 'level5_zigzag', 'level6_slope', 'level7_snake'];
      } else if (levelNum <= 15) {
        patterns = ['snake_21', 'pulse_22', 'gravity_23', 'rotating_24'];
      } else if (levelNum <= 20) {
        patterns = ['waterfall_25', 'elevator_26', 'magnetic_27', 'pendulum_28', 'sliding_29'];
      } else {
        // Fallback for Master Levels
        patterns = [...wavePatterns];
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
