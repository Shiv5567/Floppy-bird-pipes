import { ParticleEngine } from '../engine/ParticleEngine.ts';
import type { Obstacle } from './ObstacleManager.ts';

export type PowerupType = 'shield' | 'slowmo' | 'magnet' | 'double' | 'revive' | 'turbo' | 'ghost' | 'mini' | 'booster' | 'rescue' | 'merge';

export interface PowerupItem {
  x: number;
  y: number;
  radius: number;
  type: PowerupType | 'coin' | 'gem';
  active: boolean;
  pulseTimer: number;
  initialY: number;
  associatedObstacle?: Obstacle;
  verticalOffsetPct?: number;
  verticalOffsetPx?: number;
}

export class PowerupManager {
  private list: PowerupItem[] = [];
  private endlessSpawnPlans: Record<number, { index: number, type: PowerupType }[]> = {};
  private levelSpawnPlan: { index: number, type: PowerupType }[] | null = null;
  private cumulativeDistance = 0;
  private coinDistances: number[] = [];
  private nextCoinIndex = 0;
  private gemDistances: number[] = [];
  private nextGemIndex = 0;
  private lastSpawnedObstacleCenterY = 300;
  private nextRescueSpawnTarget = 10 + Math.floor(Math.random() * 6); // random between 10 and 15

  constructor() {}

  public getList(): PowerupItem[] {
    return this.list;
  }

  private getEndlessSpawnPlan(blockNum: number): { index: number, type: PowerupType }[] {
    if (!this.endlessSpawnPlans[blockNum]) {
      // Spawn at equal intervals (25, 50, 75) in the 100-obstacle block
      const indices = [25, 50, 75];

      const pool: PowerupType[] = ['shield', 'slowmo', 'magnet', 'turbo', 'mini'];

      const chosenTypes: PowerupType[] = [];
      while (chosenTypes.length < 3) {
        const type = pool[Math.floor(Math.random() * pool.length)];
        if (!chosenTypes.includes(type)) {
          chosenTypes.push(type);
        }
      }

      this.endlessSpawnPlans[blockNum] = [
        { index: indices[0], type: chosenTypes[0] },
        { index: indices[1], type: chosenTypes[1] },
        { index: indices[2], type: chosenTypes[2] }
      ];
    }
    return this.endlessSpawnPlans[blockNum];
  }

  private getLevelSpawnPlan(targetScore: number): { index: number, type: PowerupType }[] {
    if (!this.levelSpawnPlan) {
      // Spawn at equal intervals (25%, 50%, 75% of targetScore)
      const idx1 = Math.floor(targetScore * 0.25);
      const idx2 = Math.floor(targetScore * 0.50);
      const idx3 = Math.floor(targetScore * 0.75);
      const indices = [idx1, idx2, idx3];

      const pool: PowerupType[] = ['shield', 'slowmo', 'magnet', 'turbo', 'mini'];
      const chosenTypes: PowerupType[] = [];
      while (chosenTypes.length < 3) {
        const type = pool[Math.floor(Math.random() * pool.length)];
        if (!chosenTypes.includes(type)) {
          chosenTypes.push(type);
        }
      }

      this.levelSpawnPlan = [
        { index: indices[0], type: chosenTypes[0] },
        { index: indices[1], type: chosenTypes[1] },
        { index: indices[2], type: chosenTypes[2] }
      ];
    }
    return this.levelSpawnPlan;
  }

  public clear() {
    this.list = [];
    this.endlessSpawnPlans = {};
    this.levelSpawnPlan = null;
    this.cumulativeDistance = 0;
    this.coinDistances = [];
    this.nextCoinIndex = 0;
    this.gemDistances = [];
    this.nextGemIndex = 0;
    this.lastSpawnedObstacleCenterY = 300;
    this.nextRescueSpawnTarget = 10 + Math.floor(Math.random() * 6);
  }

  public initLevelCollectibles(levelNum: number, targetScore: number) {
    this.cumulativeDistance = 0;
    this.nextCoinIndex = 0;
    this.nextGemIndex = 0;
    this.lastSpawnedObstacleCenterY = 300; // default height / 2

    // Determine target coins based on level: exactly 50 coins for every level
    const targetCoins: number = 50;

    // Determine target gap gems based on level: 1-20 (3 gems), 21-40 (4 gems), 41-50 (5 gems)
    let targetGapGems = 3;
    if (levelNum >= 1 && levelNum <= 20) {
      targetGapGems = 3;
    } else if (levelNum >= 21 && levelNum <= 40) {
      targetGapGems = 4;
    } else if (levelNum >= 41 && levelNum <= 50) {
      targetGapGems = 5;
    }

    // Pre-calculate spawn distances for all targetScore obstacles
    const obstacleWidth = 72;
    const groupSize = Math.floor(targetScore / 3);
    const isLevel6 = levelNum === 6;
    const distances: number[] = [];
    let x = 350; // initial spawn distance
    for (let i = 0; i < targetScore; i++) {
      distances.push(x);
      if (i === groupSize - 1 || i === (groupSize * 2) - 1) {
        x += obstacleWidth * 3.5;
      } else {
        x += isLevel6 ? obstacleWidth * 1.25 : obstacleWidth;
      }
    }

    // Distribute targetCoins in groups of 3 between startX and endX
    const startX = 400;
    const endX = distances[distances.length - 1] || 400;
    this.coinDistances = [];
    
    const numGroups = Math.ceil(targetCoins / 3);
    if (numGroups > 1) {
      const interval = (endX - startX) / (numGroups - 1);
      for (let g = 0; g < numGroups; g++) {
        const groupCenter = startX + g * interval;
        const count = (g === numGroups - 1 && targetCoins % 3 !== 0) ? (targetCoins % 3) : 3;
        
        if (count === 3) {
          this.coinDistances.push(groupCenter - 49.5);
          this.coinDistances.push(groupCenter);
          this.coinDistances.push(groupCenter + 49.5);
        } else if (count === 2) {
          this.coinDistances.push(groupCenter - 24.75);
          this.coinDistances.push(groupCenter + 24.75);
        } else if (count === 1) {
          this.coinDistances.push(groupCenter);
        }
      }
    } else if (numGroups === 1) {
      const groupCenter = (startX + endX) / 2;
      const count = targetCoins;
      if (count === 3) {
        this.coinDistances.push(groupCenter - 49.5);
        this.coinDistances.push(groupCenter);
        this.coinDistances.push(groupCenter + 49.5);
      } else if (count === 2) {
        this.coinDistances.push(groupCenter - 24.75);
        this.coinDistances.push(groupCenter + 24.75);
      } else if (count === 1) {
        this.coinDistances.push(groupCenter);
      }
    }

    // Distribute targetGapGems between startXGems and endXGems (offset by 36px to prevent overlap)
    const startXGems = startX + 36;
    const endXGems = endX - 36;
    this.gemDistances = [];
    if (targetGapGems > 1) {
      const interval = (endXGems - startXGems) / (targetGapGems - 1);
      for (let k = 0; k < targetGapGems; k++) {
        this.gemDistances.push(startXGems + k * interval);
      }
    } else if (targetGapGems === 1) {
      this.gemDistances.push((startXGems + endXGems) / 2);
    }
  }

  public update(
    deltaTime: number,
    scrollSpeed: number,
    birdX: number,
    birdY: number,
    hasMagnet: boolean,
    width: number,
    height: number,
    timeScale: number,
    obstacles: Obstacle[],
    gameMode: 'endless' | 'level' | 'flock' | 'rescue' | 'formation' = 'endless',
    particleEngine?: ParticleEngine,
    flock?: any[]
  ) {
    const dtCoeff = deltaTime * 60 * timeScale;
    const actualScrollSpeed = scrollSpeed * dtCoeff;

    // 1. Update powerups positions & magnet attraction
    for (let i = this.list.length - 1; i >= 0; i--) {
      const item = this.list[i];

      // Float hovering animation via sine wave
      item.pulseTimer += deltaTime * 4 * timeScale;
      
      if (item.type === 'booster' && particleEngine) {
        if (Math.random() < 0.15 * dtCoeff) {
          particleEngine.spawn(
            item.x + (Math.random() - 0.5) * 16,
            item.y + (Math.random() - 0.5) * 16,
            -scrollSpeed * 0.2 + (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.8,
            '#ffd700',
            1.5 + Math.random() * 2,
            0.8,
            0.02,
            'star',
            true,
            '#ffd700'
          );
        }
      }
      
      const gameEngine = (window as any).gameEngine;
      const isAngryRed = gameEngine && gameEngine.bird && gameEngine.bird.getSkin().id === 'angry_red';
      const isEagleKing = gameEngine && gameEngine.bird && gameEngine.bird.getSkin().id === 'legendary_eagle_king';
      const isUltimateActive = gameEngine && gameEngine.ultimateActive;
      
      const isAttracted = hasMagnet || 
                          (isAngryRed && isUltimateActive && (item.type === 'coin' || item.type === 'gem')) ||
                          (isEagleKing && isUltimateActive && (item.type === 'coin' || item.type === 'gem'));

      let activeRange = 160;
      if (isUltimateActive && isAngryRed) {
        activeRange = 800; // Screen-wide
      } else if (hasMagnet || (isUltimateActive && isEagleKing)) {
        activeRange = 280;
      }

      if (isAttracted) {
        // Pull items towards the closest bird in the squad (or leader)!
        let targetX = birdX;
        let targetY = birdY;

        if (flock && flock.length > 0) {
          let minDistance = Infinity;
          for (let j = 0; j < flock.length; j++) {
            const b = flock[j];
            if (!b) continue;
            const tdx = b.x - item.x;
            const tdy = b.y - item.y;
            const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
            if (tdist < minDistance) {
              minDistance = tdist;
              targetX = b.x;
              targetY = b.y;
            }
          }
        }

        const dx = targetX - item.x;
        const dy = targetY - item.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < activeRange) {
          const pullForce = 8 * dtCoeff;
          item.x += (dx / distance) * pullForce;
          item.y += (dy / distance) * pullForce;
          item.associatedObstacle = undefined; // Detach on magnet pull
        } else {
          item.x -= actualScrollSpeed;
          if (item.associatedObstacle) {
            const obs = item.associatedObstacle;
            const gapTop = obs.topHeight;
            const gapBottom = height - obs.bottomHeight;
            const gapHeight = gapBottom - gapTop;
            const gapCenter = gapTop + gapHeight * 0.5;
            
            let shift = 0;
            if (item.verticalOffsetPx !== undefined) {
              shift = item.verticalOffsetPx;
            } else {
              shift = (item.verticalOffsetPct || 0) * (gapHeight * 0.5);
              if (item.type === 'coin') {
                if (item.verticalOffsetPct === 0.25) shift = 20;
                else if (item.verticalOffsetPct === -0.25) shift = -20;
              }
            }
            item.y = gapCenter + shift + Math.sin(item.pulseTimer) * 12;
            item.initialY = gapCenter + shift;
          } else {
            item.y = item.initialY + Math.sin(item.pulseTimer) * 12;
          }
        }
      } else {
        item.x -= actualScrollSpeed;
        if (item.associatedObstacle) {
          const obs = item.associatedObstacle;
          const gapTop = obs.topHeight;
          const gapBottom = height - obs.bottomHeight;
          const gapHeight = gapBottom - gapTop;
          const gapCenter = gapTop + gapHeight * 0.5;
          let shift = 0;
          if (item.verticalOffsetPx !== undefined) {
            shift = item.verticalOffsetPx;
          } else {
            shift = (item.verticalOffsetPct || 0) * (gapHeight * 0.5);
            if (item.type === 'coin') {
              if (item.verticalOffsetPct === 0.25) shift = 20;
              else if (item.verticalOffsetPct === -0.25) shift = -20;
            }
          }
          item.y = gapCenter + shift + Math.sin(item.pulseTimer) * 12;
          item.initialY = gapCenter + shift;
        } else {
          item.y = item.initialY + Math.sin(item.pulseTimer) * 12;
        }
      }

      // Remove offscreen items
      if (item.x + item.radius < -50) {
        this.list.splice(i, 1);
      }
    }

    // Track scroll distance and spawn deterministic coins/gems in Level Mode
    if (gameMode === 'level') {
      this.cumulativeDistance += actualScrollSpeed;
      
      // Spawn coins
      while (
        this.nextCoinIndex < this.coinDistances.length &&
        this.cumulativeDistance >= this.coinDistances[this.nextCoinIndex]
      ) {
        this.spawnItem('coin', width, height, width + 50, this.lastSpawnedObstacleCenterY);
        this.nextCoinIndex++;
      }

      // Spawn gems
      while (
        this.nextGemIndex < this.gemDistances.length &&
        this.cumulativeDistance >= this.gemDistances[this.nextGemIndex]
      ) {
        this.spawnItem('gem', width, height, width + 50, this.lastSpawnedObstacleCenterY);
        this.nextGemIndex++;
      }
    }

    // 2. Guide-based Spawning: Centered inside upcoming obstacles gaps
    const unrewardedObstacle = obstacles.find(obs => !obs.hasSpawnedRewards && obs.x >= width - 150);
    if (unrewardedObstacle) {
      unrewardedObstacle.hasSpawnedRewards = true;

      const gapTop = unrewardedObstacle.topHeight;
      const gapBottom = height - unrewardedObstacle.bottomHeight;
      const gapCenterY = gapTop + (gapBottom - gapTop) * 0.5;
      const baseOffset = unrewardedObstacle.width / 2;
      const targetX = unrewardedObstacle.x + baseOffset;

      if (gameMode === 'endless') {
        const obsIdx = unrewardedObstacle.obstacleIdx !== undefined ? unrewardedObstacle.obstacleIdx : 0;
        const blockNum = Math.floor(obsIdx / 100);
        const indexInBlock = obsIdx % 100;
        const plan = this.getEndlessSpawnPlan(blockNum);
        const planItem = plan.find(item => item.index === indexInBlock);
        
        if (planItem) {
          // Spawn exactly in the center of the gap (targetX, gapCenterY)
          this.spawnItem(planItem.type, width, height, targetX, gapCenterY);
        } else if (indexInBlock % 9 === 0) {
          // Cycle through 4 pattern styles for engaging gameplay:
          // Pattern 0: Convex Arch Shape (5 coins: pointing up)
          // Pattern 1: Concave U Shape (5 coins: pointing down)
          // Pattern 2: Diamond Shape (8 coins)
          // Pattern 3: Right Arrow Shape (8 coins)
          // Spawning on a modulo of 4 ensures exactly 25 spawns per 100 score interval.
          // By cycling through these 4 patterns, we get around 162 coins per 100 score!
          const patternType = Math.floor(obsIdx / 4) % 4;
          const syncTimer = 0; // Ensure they hover in sync!

          if (patternType === 0) {
            // Spawn Convex Arch Shape (5 coins: pointing up)
            this.spawnItem('coin', width, height, targetX - 40, gapCenterY + 15, unrewardedObstacle, undefined, 15);
            this.spawnItem('coin', width, height, targetX - 20, gapCenterY,     unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX,      gapCenterY - 15, unrewardedObstacle, undefined, -15);
            this.spawnItem('coin', width, height, targetX + 20, gapCenterY,     unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX + 40, gapCenterY + 15, unrewardedObstacle, undefined, 15);

            const startIdx = this.list.length - 5;
            for (let k = startIdx; k < this.list.length; k++) {
              if (this.list[k]) this.list[k].pulseTimer = syncTimer;
            }
          } else if (patternType === 1) {
            // Spawn Concave U Shape (5 coins: pointing down)
            this.spawnItem('coin', width, height, targetX - 40, gapCenterY - 15, unrewardedObstacle, undefined, -15);
            this.spawnItem('coin', width, height, targetX - 20, gapCenterY,     unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX,      gapCenterY + 15, unrewardedObstacle, undefined, 15);
            this.spawnItem('coin', width, height, targetX + 20, gapCenterY,     unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX + 40, gapCenterY - 15, unrewardedObstacle, undefined, -15);

            const startIdx = this.list.length - 5;
            for (let k = startIdx; k < this.list.length; k++) {
              if (this.list[k]) this.list[k].pulseTimer = syncTimer;
            }
          } else if (patternType === 2) {
            // Spawn Diamond Shape (8 coins)
            this.spawnItem('coin', width, height, targetX,      gapCenterY - 30, unrewardedObstacle, undefined, -30);
            this.spawnItem('coin', width, height, targetX - 20, gapCenterY - 15, unrewardedObstacle, undefined, -15);
            this.spawnItem('coin', width, height, targetX + 20, gapCenterY - 15, unrewardedObstacle, undefined, -15);
            this.spawnItem('coin', width, height, targetX - 40, gapCenterY,     unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX + 40, gapCenterY,     unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX - 20, gapCenterY + 15, unrewardedObstacle, undefined, 15);
            this.spawnItem('coin', width, height, targetX + 20, gapCenterY + 15, unrewardedObstacle, undefined, 15);
            this.spawnItem('coin', width, height, targetX,      gapCenterY + 30, unrewardedObstacle, undefined, 30);

            const startIdx = this.list.length - 8;
            for (let k = startIdx; k < this.list.length; k++) {
              if (this.list[k]) this.list[k].pulseTimer = syncTimer;
            }
          } else {
            // Spawn Right-Pointing Arrow Shape (8 coins)
            // Column 1: targetX - 40, offset Y: 0 (stem start)
            // Column 2: targetX - 20, offset Y: 0 (stem mid)
            // Column 3: targetX,      offset Y: 0 (arrow base center)
            //           targetX,      offset Y: -30 (top wing tip)
            //           targetX,      offset Y: +30 (bottom wing tip)
            // Column 4: targetX + 20, offset Y: -15 (upper arrow boundary)
            //           targetX + 20, offset Y: +15 (lower arrow boundary)
            // Column 5: targetX + 40, offset Y: 0 (tip pointing right)
            this.spawnItem('coin', width, height, targetX - 40, gapCenterY,      unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX - 20, gapCenterY,      unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX,      gapCenterY - 30, unrewardedObstacle, undefined, -30);
            this.spawnItem('coin', width, height, targetX,      gapCenterY,      unrewardedObstacle, undefined, 0);
            this.spawnItem('coin', width, height, targetX,      gapCenterY + 30, unrewardedObstacle, undefined, 30);
            this.spawnItem('coin', width, height, targetX + 20, gapCenterY - 15, unrewardedObstacle, undefined, -15);
            this.spawnItem('coin', width, height, targetX + 20, gapCenterY + 15, unrewardedObstacle, undefined, 15);
            this.spawnItem('coin', width, height, targetX + 40, gapCenterY,      unrewardedObstacle, undefined, 0);

            const startIdx = this.list.length - 8;
            for (let k = startIdx; k < this.list.length; k++) {
              if (this.list[k]) this.list[k].pulseTimer = syncTimer;
            }
          }
        } else if ([10, 35, 62, 85].includes(indexInBlock)) {
          // Spawn exactly 4 gems per 100 obstacles cycle
          this.spawnItem('gem', width, height, targetX, gapCenterY);
        }
      }


      // ── Squad Survival (flock) Mode: Anchor items/cages to moving gaps with 30% up/down shifting ──────
      if (gameMode === 'flock') {
        const obsIdx = unrewardedObstacle.obstacleIdx !== undefined ? unrewardedObstacle.obstacleIdx : 0;

        // Initialize target for flock mode on first obstacle to ensure it is in the 10-15 range
        if (obsIdx === 0) {
          this.nextRescueSpawnTarget = 10 + Math.floor(Math.random() * 6); // 10 to 15
        }

        // Determine offset percent: 50% chance of 0, 50% chance of either -0.3 or 0.3
        let offsetPct = 0;
        if (Math.random() < 0.5) {
          offsetPct = Math.random() < 0.5 ? -0.3 : 0.3;
        }
        const gapHeight = gapBottom - gapTop;
        const targetY = gapCenterY + offsetPct * (gapHeight * 0.5);

        if (obsIdx === this.nextRescueSpawnTarget) {
          // Spawn a cage in the gap center (or shifted)
          this.spawnItem('rescue', width, height, targetX, targetY, unrewardedObstacle, offsetPct);
          this.nextRescueSpawnTarget = obsIdx + 10 + Math.floor(Math.random() * 6); // Set next spawn between 10 and 15 obstacles
        } else if (obsIdx % 6 === 0) {
          // Spawn 4 coins group (aims for around 60 to 70 coins per 100 score interval)
          this.spawnItem('coin', width, height, targetX - 45, targetY, unrewardedObstacle, offsetPct);
          this.spawnItem('coin', width, height, targetX - 15, targetY, unrewardedObstacle, offsetPct);
          this.spawnItem('coin', width, height, targetX + 15, targetY, unrewardedObstacle, offsetPct);
          this.spawnItem('coin', width, height, targetX + 45, targetY, unrewardedObstacle, offsetPct);
        } else if ([10, 35, 62, 85].includes(obsIdx % 100)) {
          // Spawn exactly 4 gems per 100 obstacles cycle
          this.spawnItem('gem', width, height, targetX, targetY, unrewardedObstacle, offsetPct);
        } else if (obsIdx % 12 === 8) {
          // Rare random powerups
          const pool: PowerupType[] = ['shield', 'slowmo', 'magnet', 'turbo', 'mini'];
          const randomType = pool[Math.floor(Math.random() * pool.length)];
          this.spawnItem(randomType, width, height, targetX, targetY, unrewardedObstacle, offsetPct);
        }
      }

      if (gameMode === 'level') {
        // Track the last spawned obstacle gap center Y
        this.lastSpawnedObstacleCenterY = gapCenterY;

        const obsIdx = unrewardedObstacle.obstacleIdx !== undefined ? unrewardedObstacle.obstacleIdx : 0;
        const gameEngine = (window as any).gameEngine;
        const targetScore = gameEngine?.activeLevelConfig?.targetScore || 150;
        
        // Permanent Level 35 custom powerup spawns: 2 shields in Group 2 (magnetic_27)
        const levelNumPlayable = gameEngine?.activeLevelConfig?.levelNum;
        let hasCustomSpawn = false;
        if (levelNumPlayable === 35) {
          const groupSize = Math.floor(targetScore / 3);
          const startIdx = groupSize;
          const midIdx = groupSize + Math.floor(groupSize / 2);
          if (obsIdx === startIdx || obsIdx === midIdx) {
            this.spawnItem('shield', width, height, targetX, gapCenterY, unrewardedObstacle, 0);
            hasCustomSpawn = true;
          }
        }

        const plan = this.getLevelSpawnPlan(targetScore);
        const planItem = plan.find(item => item.index === obsIdx);

        if (planItem && !hasCustomSpawn) {
          // Spawn exactly in the center of the gap (targetX, gapCenterY)
          this.spawnItem(planItem.type, width, height, targetX, gapCenterY);
        }
      }
    }

    // 3. Fallback rare random spawns if no obstacles are currently active
    if (obstacles.length === 0) {
      if (Math.random() < 0.005 * dtCoeff) {
        this.spawnItem('coin', width, height);
      }
      if (Math.random() < 0.001 * dtCoeff) {
        this.spawnItem('gem', width, height);
      }
    }
  }

  public spawnItem(
    type: PowerupItem['type'],
    width: number,
    height: number,
    customX?: number,
    customY?: number,
    associatedObstacle?: Obstacle,
    verticalOffsetPct?: number,
    verticalOffsetPx?: number
  ) {
    let radius = 20; // enlarged from 14
    if (type === 'coin') radius = 14.4; // reduced by 10% (from 16)
    else if (type === 'gem') radius = 14; // enlarged from 8
    else if (type === 'rescue') radius = 42; // Another 40% size increase (from 30)

    const spawnX = customX !== undefined ? customX : (width + 50);
    let spawnY = customY;
    
    if (spawnY === undefined) {
      const margin = 100;
      spawnY = margin + Math.random() * (height - margin * 2 - 40);
    }

    this.list.push({
      x: spawnX,
      y: spawnY,
      initialY: spawnY,
      radius,
      type,
      active: true,
      pulseTimer: Math.random() * Math.PI * 2,
      associatedObstacle,
      verticalOffsetPct,
      verticalOffsetPx
    });
  }

  // Handle bird coin/powerup collisions
  public checkItemCollisions(
    birdX: number,
    birdY: number,
    birdRadius: number,
    particleEngine: ParticleEngine,
    soundManager: any
  ): PowerupItem['type'] | null {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const item = this.list[i];
      const dx = birdX - item.x;
      const dy = birdY - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < birdRadius + item.radius) {
        const type = item.type;

        // Visual collection particles
        if (item.type === 'coin') {
          const gameScore = (window as any).gameEngine ? (window as any).gameEngine.score : 0;
          let sparkleColor = '#ffd700';
          if (gameScore >= 300 && gameScore < 500) {
            sparkleColor = '#1e88e5'; // Royal blue sparkle for 2x coins
          } else if (gameScore >= 500) {
            sparkleColor = '#ff3d00';
          }
          particleEngine.emitCoinSparkle(item.x, item.y, sparkleColor);
          soundManager.playCoin();
        } else if (item.type === 'gem') {
          particleEngine.emitCoinSparkle(item.x, item.y, '#00ffcc');
          soundManager.playGem();
        } else if (item.type === 'rescue') {
          // CAGE BREAK: Bird escapes! Dramatic multi-burst effect
          particleEngine.emitRing(item.x, item.y, '#ffaa00', 18);
          // Golden cage-bar shatter sparks flying outward
          for (let k = 0; k < 12; k++) {
            const angle = (k / 12) * Math.PI * 2;
            particleEngine.spawn(
              item.x + Math.cos(angle) * 8,
              item.y + Math.sin(angle) * 8,
              Math.cos(angle) * (1.5 + Math.random() * 2.5),
              Math.sin(angle) * (1.5 + Math.random() * 2.5),
              k % 2 === 0 ? '#ffaa00' : '#ffffff',
              3 + Math.random() * 3,
              1.0,
              0.03,
              'star'
            );
          }
          // Freed bird upward trail
          for (let k = 0; k < 8; k++) {
            particleEngine.spawn(
              item.x + (Math.random() - 0.5) * 12,
              item.y - k * 4,
              (Math.random() - 0.5) * 1.5,
              -1 - Math.random() * 2,
              '#00f3ff',
              2 + Math.random() * 2,
              0.9,
              0.04,
              'star'
            );
          }
          soundManager.playLevelUp();
        } else {
          particleEngine.emitRing(item.x, item.y, this.getPowerupGlowColor(item.type));
          soundManager.playShieldDeflect();
        }

        this.list.splice(i, 1);
        return type;
      }
    }
    return null;
  }

  private getPowerupGlowColor(type: PowerupItem['type']): string {
    switch (type) {
      case 'shield': return '#00bfff';
      case 'slowmo': return '#da70d6';
      case 'magnet': return '#ff003c';
      case 'double': return '#ffd700';
      case 'turbo': return '#ff4500';
      case 'ghost': return '#9400d3';
      case 'mini': return '#00ff7f';
      case 'revive': return '#ffa07a';
      case 'booster': return '#ffd700';
      case 'rescue': return '#ffaa00';
      case 'merge': return '#ff007f';
      default: return '#ffffff';
    }
  }

  // Draw glowing powerup vector boxes
  public render(ctx: CanvasRenderingContext2D, gameEngine?: any) {
    for (let i = 0; i < this.list.length; i++) {
      const item = this.list[i];
      
      ctx.save();
      ctx.translate(Math.round(item.x), Math.round(item.y));

      if (item.type === 'coin') {
        this.drawCoin(ctx, item);
      } else if (item.type === 'gem') {
        this.drawGem(ctx, item);
      } else if (item.type === 'booster') {
        this.drawLightningBolt(ctx, item);
      } else if (item.type === 'rescue') {
        // Render a classic iron/steel cage directly without any glows, bubbles, or halos
        const t = performance.now() * 0.001;
        const flapAngle = Math.sin(t * 7) * 0.5;

        // Scale cage 3.045x (40% increase from 2.175x) so it matches the collision size nicely
        const scale = 3.045;
        ctx.scale(scale, scale);

        // Cage outer frame (Classic iron/steel grey)
        ctx.strokeStyle = '#95a5a6'; // Classic iron grey
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';

        // Top dome arc
        ctx.beginPath();
        ctx.arc(0, -1, 7, 0, Math.PI, true);
        // Bottom bar
        ctx.lineTo(-7, 6);
        ctx.moveTo(-7, 6);
        ctx.lineTo(7, 6);
        ctx.moveTo(7, 6);
        ctx.lineTo(7, -1);
        ctx.stroke();

        // Vertical bars
        ctx.beginPath();
        ctx.moveTo(-3.5, -6.5); ctx.lineTo(-3.5, 6);
        ctx.moveTo(0,   -8);    ctx.lineTo(0,    6);
        ctx.moveTo(3.5, -6.5);  ctx.lineTo(3.5,  6);
        ctx.stroke();

        // Hinge at top
        ctx.fillStyle = '#7f8c8d'; // Darker steel grey
        ctx.beginPath();
        ctx.arc(0, -8.5, 2, 0, Math.PI * 2);
        ctx.fill();

        if (gameEngine && gameEngine.bird && gameEngine.progressManager) {
          const skin = gameEngine.progressManager.getActiveSkinInfo();
          ctx.save();
          
          // Position inside the cage and scale it down to fit
          ctx.translate(0, 1.5);
          ctx.scale(0.12, 0.12);
          
          // Animate flap
          const origFlap = gameEngine.bird.flapCycle;
          gameEngine.bird.flapCycle = flapAngle * 4; // Use flapAngle for syncing
          
          // Render the active character geometry
          gameEngine.bird.renderSkinGeometry(ctx, skin.id);
          
          gameEngine.bird.flapCycle = origFlap;
          ctx.restore();
        } else {
          // Fallback: Flapping white bird body inside cage
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(0, 1.5, 2.5, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();

          // Left wing (flapping)
          ctx.strokeStyle = '#aaccff';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(-2.5, 1.5);
          ctx.quadraticCurveTo(-5, 1.5 + Math.sin(flapAngle) * 3, -3.5, 1.5 + Math.sin(flapAngle) * 5);
          ctx.stroke();

          // Right wing (flapping)
          ctx.beginPath();
          ctx.moveTo(2.5, 1.5);
          ctx.quadraticCurveTo(5, 1.5 - Math.sin(flapAngle) * 3, 3.5, 1.5 - Math.sin(flapAngle) * 5);
          ctx.stroke();

          // Bird beak
          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.moveTo(-2.5, 0.8);
          ctx.lineTo(-4.5, 1.5);
          ctx.lineTo(-2.5, 2.2);
          ctx.closePath();
          ctx.fill();

          // Bird eye
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(-0.8, 0.8, 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        this.drawPowerupBox(ctx, item);
      }

      ctx.restore();
    }
  }

  private drawLightningBolt(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18 + Math.sin(item.pulseTimer * 3) * 6; // Pulsing glow!
      ctx.shadowColor = '#ffd700';
    }

    const rad = item.radius;
    // Pulsing size animation
    const pulseScale = 1.0 + Math.sin(item.pulseTimer * 4) * 0.12;
    ctx.scale(pulseScale, pulseScale);

    // Glowing golden gradient
    const grad = ctx.createLinearGradient(-rad, -rad, rad, rad);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#ffea00');
    grad.addColorStop(1, '#ffd700');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#e6ad00';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    // Lightning shape centered at (0,0)
    ctx.moveTo(rad * 0.1, -rad * 0.9);  // Top point
    ctx.lineTo(rad * 0.5, -rad * 0.15); // Top right bend
    ctx.lineTo(rad * 0.15, -rad * 0.15); // Middle inner bend
    ctx.lineTo(rad * 0.4, rad * 0.85);  // Bottom point
    ctx.lineTo(-rad * 0.35, rad * 0.1);  // Lower left bend
    ctx.lineTo(0.0, rad * 0.1);       // Middle inner bend left
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
  }

  private drawCoin(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    // Coins ma dynamic light haru use na garne lightweight hunu laro
    // We completely omit shadow blurs/glows on coins for maximum performance!
    const gameEngine = (window as any).gameEngine;
    const score = gameEngine ? gameEngine.score : 0;

    let coinGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, item.radius);

    if (score >= 300 && score < 500) {
      // Dark blue on the outer layer, yellow on the inner layer
      coinGrad.addColorStop(0, '#ffffff');   // White center shine
      coinGrad.addColorStop(0.3, '#ffd700'); // Inner Yellow
      coinGrad.addColorStop(0.7, '#1e88e5'); // Blue middle layer
      coinGrad.addColorStop(1, '#0d47a1');   // Dark Blue outer edge
    } else if (score >= 500) {
      // Gradient mixed of yellow and red
      coinGrad.addColorStop(0, '#ffffff');   // White
      coinGrad.addColorStop(0.3, '#ffea00'); // Yellow
      coinGrad.addColorStop(0.7, '#ff3d00'); // Red
      coinGrad.addColorStop(1, '#b30000');   // Dark Red
    } else {
      // Standard Yellow/Gold coin gradient
      coinGrad.addColorStop(0, '#fff');
      coinGrad.addColorStop(0.3, '#ffd700');
      coinGrad.addColorStop(1, '#c59b27');
    }

    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    // Squish slightly to simulate spin
    const spinWidth = item.radius * (0.8 + Math.sin(item.pulseTimer * 2) * 0.2);
    ctx.ellipse(0, 0, spinWidth, item.radius, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark stroke contour
    if (score >= 300 && score < 500) {
      ctx.strokeStyle = '#0d47a1'; // Dark Blue stroke for outer layer
    } else if (score >= 500) {
      ctx.strokeStyle = '#800000'; // Dark Red stroke
    } else {
      ctx.strokeStyle = '#996515'; // Golden stroke
    }
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner details star / sign
    if (score >= 300 && score < 500) {
      ctx.fillStyle = '#0d47a1'; // Dark Blue detail
    } else if (score >= 500) {
      ctx.fillStyle = '#800000';
    } else {
      ctx.fillStyle = '#996515';
    }
    ctx.fillRect(-1.5, -3, 3, 6);
  }

  private drawGem(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00ffcc';
    }

    const gemGrad = ctx.createLinearGradient(-item.radius, -item.radius, item.radius, item.radius);
    gemGrad.addColorStop(0, '#e0ffff');
    gemGrad.addColorStop(0.5, '#00ffcc');
    gemGrad.addColorStop(1, '#008b8b');

    ctx.fillStyle = gemGrad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;

    // Diamond faceted geometry shape
    ctx.beginPath();
    ctx.moveTo(0, -item.radius);
    ctx.lineTo(item.radius, 0);
    ctx.lineTo(0, item.radius);
    ctx.lineTo(-item.radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawPowerupBox(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    const color = this.getPowerupGlowColor(item.type);
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;
    }

    // Draw glowing crystal energy bubble
    const bub = ctx.createRadialGradient(-3, -3, 3, 0, 0, item.radius);
    bub.addColorStop(0, '#ffffff');
    bub.addColorStop(0.5, color + '66'); // 40% opacity
    bub.addColorStop(1, '#000000aa');

    ctx.fillStyle = bub;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.0;

    ctx.beginPath();
    ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glossy light reflection highlight on the bubble surface
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(-item.radius * 0.35, -item.radius * 0.35, item.radius * 0.3, item.radius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw customized symbolic vector logo inside
    ctx.save();

    // Radial highlight glow behind logo inside bubble
    const logoGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, item.radius * 0.75);
    logoGlow.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    logoGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = logoGlow;
    ctx.beginPath();
    ctx.arc(0, 0, item.radius * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Increase logo size inside bubble by 1.35x
    ctx.scale(1.35, 1.35);

    if (item.type === 'shield') {
      // Shield logo
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5.5, -4);
      ctx.lineTo(4.5, 1.5);
      ctx.quadraticCurveTo(4.5, 4.5, 0, 7.5);
      ctx.quadraticCurveTo(-4.5, 4.5, -4.5, 1.5);
      ctx.lineTo(-5.5, -4);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      
      // Inner cross line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -3.5);
      ctx.lineTo(0, 4);
      ctx.moveTo(-2.5, -0.5);
      ctx.lineTo(2.5, -0.5);
      ctx.stroke();
    } else if (item.type === 'slowmo') {
      // Clock face
      ctx.beginPath();
      ctx.arc(0, 0.5, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      
      // Clock hands
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0.5);
      ctx.lineTo(0, -3.0); // 12 o'clock
      ctx.moveTo(0, 0.5);
      ctx.lineTo(2.5, 2.0); // 4 o'clock
      ctx.stroke();
      
      // Stopwatch top trigger ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(0, -7.5, 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (item.type === 'magnet') {
      // U-Magnet
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(-4, 0.5);
      ctx.arc(0, 0.5, 4, Math.PI, 0, true);
      ctx.lineTo(4, -4);
      ctx.stroke();
      
      // Red pole tips
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = '#ff3d00';
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(-4, -6.5);
      ctx.moveTo(4, -4);
      ctx.lineTo(4, -6.5);
      ctx.stroke();
    } else if (item.type === 'turbo') {
      // Double chevron >>
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      // First chevron
      ctx.moveTo(-4.5, -4.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-4.5, 4.5);
      // Second chevron
      ctx.moveTo(0.5, -4.5);
      ctx.lineTo(5, 0);
      ctx.lineTo(0.5, 4.5);
      ctx.stroke();
    } else if (item.type === 'mini') {
      // Mini Bird head
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0.5, 0.5, 4.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Beak
      ctx.fillStyle = '#ff9100';
      ctx.beginPath();
      ctx.moveTo(-3, -0.5);
      ctx.lineTo(-6.5, 0.5);
      ctx.lineTo(-3, 1.5);
      ctx.closePath();
      ctx.fill();
      
      // Eye
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(-1.0, -1.0, 1.0, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.type === 'merge') {
      // Draw double helix/merging rings
      ctx.fillStyle = '#ff007f';
      ctx.beginPath();
      ctx.arc(-3, 0, 4, 0, Math.PI * 2);
      ctx.arc(3, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.lineTo(3, 0);
      ctx.stroke();
    } else {
      // Fallback text drawing for any other unregistered powerups
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Outfit, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', 0, 0.5);
    }
    ctx.restore();
  }
}
