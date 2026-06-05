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
      let targetScore = 150;
      let gapHeight = Math.max(195, 260 - (levelNum * 2.2)); // Default calculation
      if (levelNum >= 1 && levelNum <= 5) {
        targetScore = 150;
      } else if (levelNum >= 6 && levelNum <= 10) {
        const scores = [162, 162, 165, 165, 168];
        targetScore = scores[levelNum - 6];
      } else if (levelNum >= 11 && levelNum <= 15) {
        const scores = [171, 171, 174, 174, 177];
        targetScore = scores[levelNum - 11];
      } else if (levelNum >= 16 && levelNum <= 20) {
        const scores = [180, 180, 183, 183, 186];
        targetScore = scores[levelNum - 16];
      } else if (levelNum >= 21 && levelNum <= 25) {
        const scores = [192, 192, 195, 195, 198];
        targetScore = scores[levelNum - 21];
      } else if (levelNum >= 26 && levelNum <= 30) {
        const scores = [201, 201, 204, 204, 207];
        targetScore = scores[levelNum - 26];
      } else if (levelNum >= 31 && levelNum <= 35) {
        const scores = [210, 210, 213, 213, 216];
        targetScore = scores[levelNum - 31];
      } else if (levelNum >= 36 && levelNum <= 40) {
        const scores = [222, 222, 225, 225, 228];
        targetScore = scores[levelNum - 36];
      } else if (levelNum >= 41 && levelNum <= 45) {
        const scores = [231, 231, 234, 234, 237];
        targetScore = scores[levelNum - 41];
      } else if (levelNum >= 46 && levelNum <= 50) {
        const scores = [240, 240, 243, 243, 246];
        targetScore = scores[levelNum - 46];
      }

      // Linear gap scaling rebalance (from exactly 280px at Level 1 to exactly 150px at Level 50)
      if (levelNum === 1) {
        gapHeight = 185; // Generous, smooth entry gap (easy and readable)
      } else if (levelNum >= 2 && levelNum <= 10) {
        // Redesign levels 1 to 10 to be highly progressive and challenging!
        // Level 2 starts at 184px and Level 10 is 136px
        gapHeight = 190 - (levelNum - 1) * 6;
        if (levelNum === 4) {
          gapHeight = Math.round(gapHeight * 0.65); // Decreased by 35% (from 172 to 112)
        }
      } else if (levelNum === 13) {
        // Completely replaced by Level 4, decreased by 35%
        gapHeight = Math.round((190 - (4 - 1) * 6) * 0.65); // 112px
      } else if (levelNum === 14) {
        // Completely replaced by Level 3
        gapHeight = 190 - (3 - 1) * 6;
      } else if (levelNum === 15) {
        // Completely replaced by Level 7
        gapHeight = 190 - (7 - 1) * 6;
      } else {
        gapHeight = Math.max(150, Math.round(280 - (levelNum - 1) * 2.653));
      }

      let scrollSpeed = (3.3 + (levelNum * 0.06)) * 0.8; // Decreased by 20%
      if (levelNum >= 1 && levelNum <= 10) {
        // Scroll speed starts at 3.6 (challenging) and scales to 5.58 at Level 10 (intense!)
        scrollSpeed = 3.6 + (levelNum - 1) * 0.22;
        if (levelNum === 4) {
          scrollSpeed = 3.1; // Decreased scroll speed for Level 4
        } else if (levelNum === 6) {
          scrollSpeed = scrollSpeed * 0.75; // Decreased scroll speed for Level 6 by 25% (from 4.7 to 3.525)
        } else if (levelNum === 9) {
          scrollSpeed = scrollSpeed * 0.80; // Decreased by 20% (from 5.36 to 4.29)
        } else if (levelNum === 10) {
          scrollSpeed = scrollSpeed * 0.60; // Decreased by 40% (from 5.58 to 3.35)
        }
      } else if (levelNum === 13) {
        // Completely replaced by Level 4
        scrollSpeed = 3.1;
      } else if (levelNum === 14) {
        // Completely replaced by Level 3, then decreased by 15% for Wormhole Vortex
        scrollSpeed = (3.6 + (3 - 1) * 0.22) * 0.85;
      } else if (levelNum === 15) {
        // Completely replaced by Level 7
        scrollSpeed = 3.6 + (7 - 1) * 0.22;
      }
      
      if (levelNum === 21) {
        scrollSpeed = scrollSpeed * 0.80; // Reduce horizontal scroll speed by 20%
      } else if (levelNum >= 22 && levelNum <= 29) {
        scrollSpeed = scrollSpeed * 0.85; // Reduce horizontal scroll speed by 15%
      } else if (levelNum >= 30 && levelNum <= 50) {
        scrollSpeed = scrollSpeed * 0.80; // Reduce horizontal scroll speed by 20%
      }

      // Distribute patterns based on level brackets using active wave/moving patterns ONLY
      let patterns: string[] = [];
      if (levelNum === 1) {
        patterns = ['level1_funnel'];
      } else if (levelNum === 2) {
        patterns = ['level2_diamond'];
      } else if (levelNum === 3) {
        patterns = ['level3_arc'];
      } else if (levelNum === 4) {
        patterns = ['level4_snake'];
      } else if (levelNum === 5) {
        patterns = ['level5_hourglass'];
      } else if (levelNum === 6) {
        patterns = ['level6_infinity'];
      } else if (levelNum === 7) {
        patterns = ['level7_dna'];
      } else if (levelNum === 8) {
        patterns = ['level8_lightning'];
      } else if (levelNum === 9) {
        patterns = ['level9_magnetic'];
      } else if (levelNum === 10) {
        patterns = ['level10_miniboss'];
      } else if (levelNum === 11) {
        patterns = ['level11_diamond'];
      } else if (levelNum === 12) {
        patterns = ['level12_doublewave'];
      } else if (levelNum === 13) {
        patterns = ['level4_snake'];
      } else if (levelNum === 14) {
        patterns = ['level3_arc'];
      } else if (levelNum === 15) {
        patterns = ['level7_dna'];
      } else if (levelNum === 16) {
        patterns = ['level16_rotatingarc'];
      } else if (levelNum === 17) {
        patterns = ['level17_heartbeat'];
      } else if (levelNum === 18) {
        patterns = ['level18_serpent'];
      } else if (levelNum === 19) {
        patterns = ['level19_magnetic'];
      } else if (levelNum === 20) {
        patterns = ['level20_masterhybrid'];
      } else if (levelNum === 30) {
        patterns = ['level30_hybridwave'];
      } else if (levelNum === 31) {
        patterns = ['level31_snakemotion'];
      } else if (levelNum === 32) {
        patterns = ['level32_waterfall'];
      } else if (levelNum === 33) {
        patterns = ['level33_magneticpush'];
      } else if (levelNum === 34) {
        patterns = ['level34_pendulum'];
      } else if (levelNum === 35) {
        patterns = ['level35_triplestair'];
      } else if (levelNum === 36) {
        patterns = ['level36_spiralflow'];
      } else if (levelNum === 37) {
        patterns = ['level37_elevator'];
      } else if (levelNum === 38) {
        patterns = ['level38_scurve'];
      } else if (levelNum === 39) {
        patterns = ['level39_orbit'];
      } else if (levelNum === 40) {
        patterns = ['level40_miniboss'];
      } else if (levelNum === 41) {
        patterns = ['level41_doublew'];
      } else if (levelNum === 42) {
        patterns = ['level42_infinity'];
      } else if (levelNum === 43) {
        patterns = ['level43_dnahelix'];
      } else if (levelNum === 44) {
        patterns = ['level44_pendulum'];
      } else if (levelNum === 45) {
        patterns = ['level45_scurve'];
      } else if (levelNum === 46) {
        patterns = ['level46_triplespiral'];
      } else if (levelNum === 47) {
        patterns = ['level47_diamond'];
      } else if (levelNum === 48) {
        patterns = ['level48_tornado'];
      } else if (levelNum === 49) {
        patterns = ['level49_fractal'];
      } else if (levelNum === 50) {
        patterns = ['level50_finalboss'];
      } else if (levelNum >= 21 && levelNum <= 29) {
        patterns = [`level${levelNum}_progress`];
      } else {
        // Fallback cycling
        const patternIndex = (levelNum - 21) % wavePatterns.length;
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

    // Swap Level Configurations (Option 2: 40-44 exchanged with 46-50, 45 in the middle; Level 3 and Level 50 exchanged; Level 2 and Level 4 exchanged)
    const swapPairs = [
      [40, 46],
      [41, 47],
      [42, 48],
      [43, 49],
      [44, 50],
      [3, 50],
      [2, 4]
    ];
    for (const [a, b] of swapPairs) {
      const idxA = this.levels.findIndex(l => l.levelNum === a);
      const idxB = this.levels.findIndex(l => l.levelNum === b);
      if (idxA !== -1 && idxB !== -1) {
        // Swap targetScore, scrollSpeed, gapHeight, patterns
        const tempTargetScore = this.levels[idxA].targetScore;
        const tempScrollSpeed = this.levels[idxA].scrollSpeed;
        const tempGapHeight = this.levels[idxA].gapHeight;
        const tempPatterns = this.levels[idxA].patterns;

        this.levels[idxA].targetScore = this.levels[idxB].targetScore;
        this.levels[idxA].scrollSpeed = this.levels[idxB].scrollSpeed;
        this.levels[idxA].gapHeight = this.levels[idxB].gapHeight;
        this.levels[idxA].patterns = this.levels[idxB].patterns;

        this.levels[idxB].targetScore = tempTargetScore;
        this.levels[idxB].scrollSpeed = tempScrollSpeed;
        this.levels[idxB].gapHeight = tempGapHeight;
        this.levels[idxB].patterns = tempPatterns;
      }
    }

    // Reduce Level 2 path gap by 30%; Reduce Level 3 path gap by 20% and set total obstacles to 150; Reduce Level 4 path gap by 30%
    const lvl2 = this.levels.find(l => l.levelNum === 2);
    if (lvl2) {
      lvl2.gapHeight = Math.round(lvl2.gapHeight * 0.70);
    }
    const lvl3 = this.levels.find(l => l.levelNum === 3);
    if (lvl3) {
      lvl3.gapHeight = Math.round(lvl3.gapHeight * 0.80);
      lvl3.targetScore = 150;
    }
    const lvl4 = this.levels.find(l => l.levelNum === 4);
    if (lvl4) {
      lvl4.gapHeight = Math.round(lvl4.gapHeight * 0.70);
    }
  }

  public static getLevel(levelNum: number): LevelConfig | undefined {
    return this.levels.find(l => l.levelNum === levelNum);
  }

  public static getAllLevels(): LevelConfig[] {
    return this.levels;
  }
}
