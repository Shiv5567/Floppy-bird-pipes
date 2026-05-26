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
      const targetScore = 50; // Level complete requires 50 obstacles crossed
      const scrollSpeed = (3.3 + (levelNum * 0.06)) * 0.8; // Decreased by 20%
      const gapHeight = Math.max(195, 260 - (levelNum * 2.2)); // 260 down to 195px

      // Distribute patterns based on level brackets using active wave/moving patterns ONLY
      let patterns: string[] = [];
      if (levelNum === 1) {
        patterns = ['wave_10'];
      } else if (levelNum === 2) {
        patterns = ['breathing_12'];
      } else if (levelNum === 3) {
        patterns = ['moving_stair_15'];
      } else if (levelNum === 4) {
        patterns = ['rotating_17'];
      } else if (levelNum === 5) {
        patterns = ['dynamic_w_18'];
      } else if (levelNum === 6) {
        patterns = ['exp_shrink_19'];
      } else if (levelNum === 7) {
        patterns = ['hybrid_20'];
      } else if (levelNum === 8) {
        patterns = ['snake_21'];
      } else if (levelNum === 9) {
        patterns = ['pulse_22'];
      } else if (levelNum === 10) {
        patterns = ['gravity_23'];
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
      } else if (levelNum <= 5) {
        patterns = ['wave_10', 'breathing_12', 'moving_stair_15'];
      } else if (levelNum <= 10) {
        patterns = ['rotating_17', 'dynamic_w_18', 'exp_shrink_19', 'hybrid_20'];
      } else if (levelNum <= 15) {
        patterns = ['snake_21', 'pulse_22', 'gravity_23', 'rotating_24'];
      } else if (levelNum <= 20) {
        patterns = ['waterfall_25', 'elevator_26', 'magnetic_27', 'pendulum_28', 'sliding_29'];
      } else {
        // Master Levels (21-30): mix of all 17 wave patterns!
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
