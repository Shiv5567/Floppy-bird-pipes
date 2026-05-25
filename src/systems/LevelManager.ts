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
      const targetScore = 50; // Level complete requires 50 obstacles crossed
      const scrollSpeed = (3.3 + (levelNum * 0.06)) * 0.8; // Decreased by 20%
      const gapHeight = Math.max(195, 260 - (levelNum * 2.2)); // 260 down to 195px

      // Distribute patterns based on level brackets
      let patterns: string[] = [];
      if (levelNum === 1) {
        patterns = ['stair_30'];
      } else if (levelNum === 2) {
        patterns = ['w_30'];
      } else if (levelNum === 3) {
        patterns = ['stair_loop'];
      } else if (levelNum === 7) {
        patterns = ['w_shape'];
      } else if (levelNum === 8) {
        patterns = ['stair_loop'];
      } else if (levelNum === 10) {
        patterns = ['wave_10'];
      } else if (levelNum === 11) {
        patterns = ['zigzag_11'];
      } else if (levelNum === 12) {
        patterns = ['breathing_12'];
      } else if (levelNum === 13) {
        patterns = ['diagonal_13'];
      } else if (levelNum === 14) {
        patterns = ['reactive_14'];
      } else if (levelNum === 15) {
        patterns = ['moving_stair_15'];
      } else if (levelNum === 16) {
        patterns = ['alternating_16'];
      } else if (levelNum === 17) {
        patterns = ['rotating_17'];
      } else if (levelNum === 18) {
        patterns = ['dynamic_w_18'];
      } else if (levelNum === 19) {
        patterns = ['exp_shrink_19'];
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
      } else {
        // Levels 21-30: master levels combining all obstacle systems
        patterns = [...allPatterns, 'wave_10', 'zigzag_11', 'breathing_12', 'diagonal_13', 'reactive_14', 'moving_stair_15', 'alternating_16', 'rotating_17', 'dynamic_w_18', 'exp_shrink_19', 'hybrid_20'];
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
