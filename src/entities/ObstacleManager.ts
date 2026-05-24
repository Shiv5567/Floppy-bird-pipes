
import { Bird } from './Bird.ts';

export interface Obstacle {
  x: number;
  width: number;
  topHeight: number;
  bottomHeight: number;
  passed: boolean;
  grazed?: boolean;
  isCavern?: boolean;
  
  // Custom modifiers per theme
  worldId: string;
  isMoving: boolean;
  movingDir: 1 | -1;
  speedY: number;
  rangeY: number;
  initialTopHeight: number;
  initialBottomHeight: number;
  
  // Cyberpunk lasers specific properties
  isLaser: boolean;
  laserActive: boolean;
  laserTimer: number;

  // Spawning guides
  hasSpawnedRewards?: boolean;

  // Animation values stored at spawn to prevent micro-stutter on score increment
  oscillationFrequency?: number;
  oscillationRange?: number;
}

export class ObstacleManager {
  private list: Obstacle[] = [];
  private spawnTimer = 0;
  private obstacleWidth = 72;
  private waveTime = 0;
  private tunnelSpawnCount = 0;
  private nextSpawnDistance = 350;
  private lastTopHeight: number | null = null;

  constructor() {}

  public getList(): Obstacle[] {
    return this.list;
  }

  public clear() {
    this.list = [];
    this.spawnTimer = 0;
    this.waveTime = 0;
    this.tunnelSpawnCount = 0;
    this.nextSpawnDistance = 350;
    this.lastTopHeight = null;
  }

  public update(
    deltaTime: number,
    scrollSpeed: number,
    score: number,
    worldId: string,
    width: number,
    height: number,
    timeScale: number,
    zone: 'classic' | 'vertical' | 'wave' = 'classic',
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ) {
    const dtCoeff = deltaTime * 60 * timeScale;
    this.waveTime += deltaTime * timeScale;
    
    // Smooth, step-by-step progressive difficulty scaling ratio over 60 points
    const progressRatio = Math.min(1.0, score / 60.0);
    
    // Dynamic difficulty limits (enforce the constant vertical gap of 255 - representing a 30% increase from 196)
    let startGap = 255;
    let minGap = 255;
    let distMultiplier = 1.0;

    if (difficulty === 'easy') {
      startGap = 255;
      minGap = 255;
      distMultiplier = 1.3;
    } else if (difficulty === 'hard') {
      startGap = 255;
      minGap = 255;
      distMultiplier = 0.80;
    }

    // Scroll speed is already scaled progressively by GameEngine, so we use it directly to ensure perfect sync
    const actualScrollSpeed = scrollSpeed * dtCoeff;

    // Smooth horizontal distance spawning scaling
    const baseDistance = (width / 1.35) * distMultiplier;
    const minDistance = width / 2.0;
    
    // Scale horizontal distance according to user specs
    let targetDistance;
    if (zone === 'classic') {
      // Classic Mode standard spacing: Default (Medium/Hard) classic gap uses 0.80 multiplier
      const baseDistanceClassic = (width / 1.35) * 0.80;
      const defaultDistance = baseDistanceClassic * 1.15;
      
      if (difficulty === 'easy') {
        targetDistance = defaultDistance * 1.20;
      } else {
        targetDistance = defaultDistance;
      }
    } else if (zone === 'vertical') {
      targetDistance = (baseDistance - (baseDistance - minDistance) * progressRatio) * 1.25 * 0.60;
    } else {
      targetDistance = (baseDistance - (baseDistance - minDistance) * progressRatio) * 0.60;
    }

    // If not set or invalid, initialize nextSpawnDistance
    if (this.nextSpawnDistance <= 150 && zone !== 'wave') {
      this.nextSpawnDistance = targetDistance;
    }

    // Update existing obstacles
    for (let i = this.list.length - 1; i >= 0; i--) {
      const obs = this.list[i];
      obs.x -= actualScrollSpeed;

      // Handle vertical moving pillars per Zone with progressive speed & range scaling
      if (difficulty === 'hard' && obs.isMoving) {
        // Chaotic unpredictable "flying" behavior: instant up and down jumps, no continuous pattern
        if (Math.random() < 0.05 * dtCoeff) {
          obs.movingDir = Math.random() > 0.5 ? 1 : -1;
        }
        const chaoticStep = (1.5 + Math.random() * 3.5) * obs.speedY * obs.movingDir * dtCoeff;
        obs.topHeight += chaoticStep;
        obs.bottomHeight -= chaoticStep;

        // 3% chance per frame for sudden instant vertical teleport/jitter
        if (Math.random() < 0.03 * dtCoeff) {
          const teleportAmt = (Math.random() - 0.5) * obs.rangeY * 1.5;
          obs.topHeight = obs.initialTopHeight + teleportAmt;
          obs.bottomHeight = obs.initialBottomHeight - teleportAmt;
        }

        // Clamp to physical ranges
        const topDiff = obs.topHeight - obs.initialTopHeight;
        if (Math.abs(topDiff) > obs.rangeY * 1.5) {
          obs.movingDir *= -1;
          obs.topHeight = obs.initialTopHeight + Math.sign(topDiff) * obs.rangeY * 1.5;
          obs.bottomHeight = obs.initialBottomHeight - Math.sign(topDiff) * obs.rangeY * 1.5;
        }
      } else if (zone === 'vertical') {
        // Use stored frequency and range to prevent on-screen jitter/jump on score increment
        const frequency = obs.oscillationFrequency !== undefined ? obs.oscillationFrequency : (0.8 + 1.0 * progressRatio);
        const range = obs.oscillationRange !== undefined ? obs.oscillationRange : (obs.rangeY * (0.5 + 0.5 * progressRatio));
        const offset = Math.sin(this.waveTime * frequency + obs.initialTopHeight * 0.05) * range;
        obs.topHeight = obs.initialTopHeight + offset;
        obs.bottomHeight = obs.initialBottomHeight - offset;
      } else if (zone === 'wave') {
        const frequency = obs.oscillationFrequency !== undefined ? obs.oscillationFrequency : (2.4 + 1.6 * progressRatio);
        const range = obs.oscillationRange !== undefined ? obs.oscillationRange : (obs.rangeY * (0.6 + 0.4 * progressRatio));
        // Smooth tunnel: obstacles shift heights dynamically based on spatial coordinate
        const offset = Math.sin((obs.x * 0.0038) - this.waveTime * frequency) * range;
        obs.topHeight = obs.initialTopHeight + offset;
        obs.bottomHeight = obs.initialBottomHeight - offset;
      } else if (obs.isMoving) {
        // Standard linear bounce (Classic Zone - reserved for future use or custom worlds)
        const moveAmt = obs.speedY * obs.movingDir * dtCoeff;
        obs.topHeight += moveAmt;
        obs.bottomHeight -= moveAmt;

        // Bounce back if moving exceeds ranges
        const topDiff = obs.topHeight - obs.initialTopHeight;
        if (Math.abs(topDiff) > obs.rangeY) {
          obs.movingDir *= -1; // Reverse direction
        }
      }

      // Handle Cyberpunk pulsing lasers
      if (obs.isLaser) {
        obs.laserTimer += deltaTime * timeScale;
        if (obs.laserTimer >= 1.6) {
          obs.laserActive = !obs.laserActive;
          obs.laserTimer = 0;
        }
      }

      // Remove offscreen obstacles
      if (obs.x + obs.width < -50) {
        this.list.splice(i, 1);
      }
    }

    // Procedural Spawning using distance-based logic (extremely robust)
    this.spawnTimer += actualScrollSpeed;
    if (this.spawnTimer >= this.nextSpawnDistance) {
      this.spawnTimer = 0;
      
      // Smooth step-by-step gap height scaling (Classic Mode has a completely constant, generous gap)
      const dynamicGap = zone === 'classic' 
        ? startGap 
        : (startGap - (startGap - minGap) * progressRatio);
      this.spawnObstacle(worldId, width, height, dynamicGap, zone, difficulty, progressRatio, score);

      // Determine next spawn distance (reduced wave spawn distance as well)
      if (zone === 'wave') {
        if (this.tunnelSpawnCount < 3) { // 4 pipes total (0, 1, 2, 3)
          this.tunnelSpawnCount++;
          this.nextSpawnDistance = 100; // close spacing for connected section
        } else {
          this.tunnelSpawnCount = 0;
          this.nextSpawnDistance = 330; // larger smooth gap section
        }
      } else if (zone === 'classic') {
        const lastObs = this.list[this.list.length - 1];
        if (lastObs && lastObs.isCavern) {
          // If we just spawned a cavern obstacle, use tight spacing
          const baseClassicDistance = 165;
          if (difficulty === 'easy') {
            this.nextSpawnDistance = baseClassicDistance * 1.20;
          } else {
            this.nextSpawnDistance = baseClassicDistance;
          }
        } else {
          // Otherwise, it was a standard pillar obstacle, use standard spacious classic distance
          const baseDistanceClassic = (width / 1.35) * 0.80;
          const defaultDistance = baseDistanceClassic * 1.15;
          if (difficulty === 'easy') {
            this.nextSpawnDistance = defaultDistance * 1.20;
          } else {
            this.nextSpawnDistance = defaultDistance;
          }
        }
      } else {
        this.nextSpawnDistance = targetDistance;
      }
    }
  }

  private spawnObstacle(
    worldId: string,
    width: number,
    height: number,
    gapHeight: number,
    zone: 'classic' | 'vertical' | 'wave' = 'classic',
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    progressRatio = 0,
    score = 0
  ) {
    let margin = 60;
    let topHeight = 0;
    let bottomHeight = 0;
    let isMoving = false;
    let isLaser = false;
    let rangeY = difficulty === 'hard' ? 50 + Math.random() * 40 : 30 + Math.random() * 30;
    let isCavernVal = false;

    if (zone === 'vertical') {
      margin = 85;
      const playableHeight = height - gapHeight - margin * 2;
      topHeight = margin + 0.25 * playableHeight + Math.random() * 0.5 * playableHeight;
      bottomHeight = height - topHeight - gapHeight;
      isMoving = true;
      rangeY = 55 + Math.random() * 25; // beautiful vertical sweep
      isCavernVal = false;
    } else if (zone === 'wave') {
      margin = 85;
      const playableHeight = height - gapHeight - margin * 2;
      // perfectly center the winding tunnel so it can oscillate nicely
      topHeight = margin + playableHeight / 2;
      bottomHeight = height - topHeight - gapHeight;
      isMoving = true;
      rangeY = 65; // constant amplitude for cohesive wave look
      isCavernVal = false;
    } else {
      // Classic Mode: Hybrid Selection
      // 40% probability for a jagged cavern, 60% for a standard flat pillar
      isCavernVal = Math.random() < 0.40;

      if (isCavernVal) {
        // Jagged Cavern Heartbeat / Seismograph Generator
        // Dynamic Gap Width: randomly between a "tight squeeze" (65px) and "brief breathing room" (110px)
        const gapHeightVal = 65 + Math.random() * 45;
        const playableHeight = height - gapHeightVal - margin * 2;
        let targetTopHeight = margin + Math.random() * playableHeight;

        if (this.lastTopHeight !== null) {
          // Seismograph Heartbeat logic: a high peak is immediately followed by a deep, sharp dip
          const isLastHigh = this.lastTopHeight < margin + playableHeight * 0.5;
          let minVal, maxVal;
          
          if (isLastHigh) {
            // Last stalactite was high (top half). Force the new stalagmite to be deep low (bottom half).
            minVal = margin + playableHeight * 0.58;
            maxVal = margin + playableHeight * 0.95;
          } else {
            // Last stalactite was low (bottom half). Force the new stalagmite to be extremely high (top half).
            minVal = margin + playableHeight * 0.05;
            maxVal = margin + playableHeight * 0.42;
          }
          
          targetTopHeight = minVal + Math.random() * (maxVal - minVal);
        }

        topHeight = targetTopHeight;
        this.lastTopHeight = topHeight;
        bottomHeight = height - topHeight - gapHeightVal;
      } else {
        // Traditional flat-surfaced columns
        // Unpredictable Zigzag: base variation of 60%, increasing by 10% every 50 score up to 95%
        const playableHeight = height - gapHeight - margin * 2;
        let targetTopHeight = margin + Math.random() * playableHeight;

        if (this.lastTopHeight !== null) {
          const scoreTier = Math.floor(score / 50);
          const zigzagFactor = Math.min(0.95, 0.60 + scoreTier * 0.10);
          const maxStep = playableHeight * zigzagFactor;
          
          // 68% chance to actively bias the next height in the opposite vertical half of the screen
          const forceAlternate = Math.random() < 0.68;
          let minVal = Math.max(margin, this.lastTopHeight - maxStep);
          let maxVal = Math.min(margin + playableHeight, this.lastTopHeight + maxStep);
          
          if (forceAlternate) {
            const isHigh = this.lastTopHeight > margin + playableHeight * 0.5;
            if (isHigh) {
              // Last pipe was high, bias the new one to the lower screen region
              maxVal = Math.min(maxVal, margin + playableHeight * 0.45);
            } else {
              // Last pipe was low, bias the new one to the upper screen region
              minVal = Math.max(minVal, margin + playableHeight * 0.55);
            }
            // Safeguard bounds validity
            if (minVal > maxVal) {
              minVal = Math.max(margin, this.lastTopHeight - maxStep);
              maxVal = Math.min(margin + playableHeight, this.lastTopHeight + maxStep);
            }
          }

          targetTopHeight = minVal + Math.random() * (maxVal - minVal);
        }

        topHeight = targetTopHeight;
        this.lastTopHeight = topHeight;
        bottomHeight = height - topHeight - gapHeight;
      }

      // Keep walls static on screen in Classic Zone
      isMoving = false;
      isLaser = worldId === 'cyberpunk' && Math.random() < 0.35;
    }

    let oscillationFrequency = 0;
    let oscillationRange = 0;
    if (zone === 'vertical') {
      oscillationFrequency = 0.8 + 1.0 * progressRatio;
      oscillationRange = rangeY * (0.5 + 0.5 * progressRatio);
    } else if (zone === 'wave') {
      oscillationFrequency = 2.4 + 1.6 * progressRatio;
      oscillationRange = rangeY * (0.6 + 0.4 * progressRatio);
    }

    this.list.push({
      x: width + 50,
      width: this.obstacleWidth,
      topHeight,
      bottomHeight,
      passed: false,
      isCavern: isCavernVal,
      worldId,
      isMoving,
      movingDir: Math.random() > 0.5 ? 1 : -1,
      speedY: 0.4 + Math.random() * 0.6,
      rangeY,
      initialTopHeight: topHeight,
      initialBottomHeight: bottomHeight,
      isLaser,
      laserActive: true,
      laserTimer: 0,
      oscillationFrequency,
      oscillationRange
    });
  }

  // Enforces invisible vertical boundaries and evaluates collisions
  public enforceBoundariesAndCheckCollisions(
    bird: Bird,
    height: number,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ): Obstacle | null {
    let effectiveRadius = bird.radius * 0.40;
    let effectiveRadiusBottom = bird.vy > 0 ? bird.radius * 0.16 : bird.radius * 0.26;

    if (difficulty === 'easy') {
      effectiveRadius = bird.radius * 0.28;
      effectiveRadiusBottom = bird.vy > 0 ? bird.radius * 0.08 : bird.radius * 0.18;
    } else if (difficulty === 'hard') {
      effectiveRadius = bird.radius * 0.58;
      effectiveRadiusBottom = bird.vy > 0 ? bird.radius * 0.38 : bird.radius * 0.48;
    }

    // 1. Check floor/ceiling boundaries with generous collision tolerance
    if (bird.y - effectiveRadius <= 5) {
      return {} as Obstacle; // Collided with ceiling
    }
    if (bird.y + effectiveRadiusBottom >= height - 35) {
      return {} as Obstacle; // Collided with floor
    }

    for (let i = 0; i < this.list.length; i++) {
      const obs = this.list[i];

      const left = obs.x;
      const right = obs.x + obs.width;

      // Range check: Skip heavy math if bird is horizontally nowhere near this obstacle!
      const maxRad = bird.radius;
      if (right < bird.x - maxRad || left > bird.x + maxRad) {
        continue;
      }

      const topPipeBottom = obs.topHeight;
      const bottomPipeTop = height - obs.bottomHeight;

      // Mathematically check exact circle-to-rectangle collision for top pipe
      const closestTopX = Math.max(left, Math.min(bird.x, right));
      const closestTopY = Math.max(-2000, Math.min(bird.y, topPipeBottom));
      const distTopX = bird.x - closestTopX;
      const distTopY = bird.y - closestTopY;
      const isCollidingTop = (distTopX * distTopX + distTopY * distTopY) <= effectiveRadius * effectiveRadius;

      // Mathematically check exact circle-to-rectangle collision for bottom pipe
      const closestBottomX = Math.max(left, Math.min(bird.x, right));
      const closestBottomY = Math.max(bottomPipeTop, Math.min(bird.y, height + 2000));
      const distBottomX = bird.x - closestBottomX;
      const distBottomY = bird.y - closestBottomY;
      const isCollidingBottom = (distBottomX * distBottomX + distBottomY * distBottomY) <= effectiveRadiusBottom * effectiveRadiusBottom;

      if (isCollidingTop || isCollidingBottom) {
        // Enforce physical blocking / clamping with the new hitboxes
        if (isCollidingTop) {
          if (bird.x >= left && bird.x <= right) {
            // Directly under the top pipe - clamp vertically
            bird.y = topPipeBottom + effectiveRadius;
            if (bird.vy < 0) bird.vy = 0;
          } else if (bird.x < left) {
            // Hitting the left side/corner
            if (bird.y <= topPipeBottom) {
              // Completely above the pipe bottom (hitting vertical face)
              bird.x = left - effectiveRadius;
            } else {
              // Hitting the bottom-left corner
              const vx = bird.x - left;
              const vy = bird.y - topPipeBottom;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadius) {
                bird.x = left + (vx / len) * effectiveRadius;
                bird.y = topPipeBottom + (vy / len) * effectiveRadius;
              }
            }
          } else if (bird.x > right) {
            // Hitting the right side/corner
            if (bird.y <= topPipeBottom) {
              // Hitting vertical face
              bird.x = right + effectiveRadius;
            } else {
              // Hitting the bottom-right corner
              const vx = bird.x - right;
              const vy = bird.y - topPipeBottom;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadius) {
                bird.x = right + (vx / len) * effectiveRadius;
                bird.y = topPipeBottom + (vy / len) * effectiveRadius;
              }
            }
          }
        } else if (isCollidingBottom) {
          if (bird.x >= left && bird.x <= right) {
            // Directly above the bottom pipe - clamp vertically
            bird.y = bottomPipeTop - effectiveRadiusBottom;
            if (bird.vy > 0) bird.vy = 0;
          } else if (bird.x < left) {
            // Hitting the left side/corner
            if (bird.y >= bottomPipeTop) {
              // Completely below bottom pipe top (hitting vertical face)
              bird.x = left - effectiveRadiusBottom;
            } else {
              // Hitting the top-left corner
              const vx = bird.x - left;
              const vy = bird.y - bottomPipeTop;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadiusBottom) {
                bird.x = left + (vx / len) * effectiveRadiusBottom;
                bird.y = bottomPipeTop + (vy / len) * effectiveRadiusBottom;
              }
            }
          } else if (bird.x > right) {
            // Hitting the right side/corner
            if (bird.y >= bottomPipeTop) {
              // Hitting vertical face
              bird.x = right + effectiveRadiusBottom;
            } else {
              // Hitting the top-right corner
              const vx = bird.x - right;
              const vy = bird.y - bottomPipeTop;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadiusBottom) {
                bird.x = right + (vx / len) * effectiveRadiusBottom;
                bird.y = bottomPipeTop + (vy / len) * effectiveRadiusBottom;
              }
            }
          }
        }

        return obs;
      }

      // Special Cyberpunk dynamic central laser beam check
      if (obs.worldId === 'cyberpunk' && obs.isLaser && obs.laserActive) {
        const laserLeft = obs.x + obs.width * 0.42;
        const laserRight = obs.x + obs.width * 0.58;
        if (bird.x + effectiveRadius >= laserLeft && bird.x - effectiveRadius <= laserRight) {
          // Check if bird is within the vertical gap of the laser
          if (bird.y + effectiveRadius > topPipeBottom && bird.y - effectiveRadius < bottomPipeTop) {
            return obs;
          }
        }
      }
    }

    return null;
  }


  // Draw procedural themed obstacle pillars
  public render(ctx: CanvasRenderingContext2D, height: number) {
    ctx.shadowBlur = 0; // Disable shadows for high performance
    for (let i = 0; i < this.list.length; i++) {
      const obs = this.list[i];
      ctx.save();
      
      if (obs.isCavern) {
        let colorTop = '#55a855';
        let colorBottom = '#336633';
        let outlineColor = '#0e240e';

        switch (obs.worldId) {
          case 'jungle':
            colorTop = '#5c5d4d';
            colorBottom = '#3c3d33';
            outlineColor = '#181914';
            break;
          case 'cyberpunk':
            colorTop = '#ff007f';
            colorBottom = '#00f3ff';
            outlineColor = '#0b001a';
            break;
          case 'ice':
            colorTop = '#e0ffff';
            colorBottom = '#4682b4';
            outlineColor = '#ffffff';
            break;
          case 'desert':
            colorTop = '#d2b48c';
            colorBottom = '#8b5a2b';
            outlineColor = '#3e2723';
            break;
          case 'volcano':
            colorTop = '#ff4500';
            colorBottom = '#4a0e00';
            outlineColor = '#ff1a00';
            break;
          case 'space':
            colorTop = '#8a2be2';
            colorBottom = '#4b0082';
            outlineColor = '#da70d6';
            break;
          case 'underwater':
            colorTop = '#20b2aa';
            colorBottom = '#008b8b';
            outlineColor = '#004d40';
            break;
          case 'heaven':
            colorTop = '#ffffff';
            colorBottom = '#87ceeb';
            outlineColor = '#ffd700';
            break;
          case 'retro':
            colorTop = '#73c93e';
            colorBottom = '#387c12';
            outlineColor = '#000000';
            break;
        }

        this.drawCavernObstacle(ctx, obs, height, colorTop, colorBottom, outlineColor);
      } else {
        switch (obs.worldId) {
          case 'jungle':
            this.drawJunglePillars(ctx, obs, height);
            break;
          case 'cyberpunk':
            this.drawCyberpunkPillars(ctx, obs, height);
            break;
          case 'ice':
            this.drawIcePillars(ctx, obs, height);
            break;
          case 'desert':
            this.drawDesertPillars(ctx, obs, height);
            break;
          case 'volcano':
            this.drawVolcanoPillars(ctx, obs, height);
            break;
          case 'space':
            this.drawSpaceObstacles(ctx, obs, height);
            break;
          case 'underwater':
            this.drawUnderwaterPillars(ctx, obs, height);
            break;
          case 'heaven':
            this.drawHeavenPillars(ctx, obs, height);
            break;
          case 'retro':
            this.drawRetroPillars(ctx, obs, height);
            break;
          default:
            this.drawDefaultPillars(ctx, obs, height);
        }
      }
      ctx.restore();
    }
  }

  // Visual Pillar Painters
  private drawDefaultPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    const grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    grad.addColorStop(0, '#55a855');
    grad.addColorStop(0.3, '#88d888');
    grad.addColorStop(0.7, '#336633');
    grad.addColorStop(1, '#1b3d1b');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#0e240e';
    ctx.lineWidth = 3;

    // Top column (Unified with offscreen extension)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    // Bottom column (Unified with offscreen extension)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Pillar ridges caps (standardized to obs.width)
    ctx.fillStyle = '#88d888';
    ctx.fillRect(rx, rTop - 20, rw, 20);
    ctx.strokeRect(rx, rTop - 20, rw, 20);

    ctx.fillRect(rx, height - rBottom, rw, 20);
    ctx.strokeRect(rx, height - rBottom, rw, 20);
  }

  private drawRetroPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    ctx.fillStyle = '#73c93e'; // Simple retro green
    ctx.strokeStyle = '#000000'; // Simple black outline
    ctx.lineWidth = 3;

    // Top column
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    // Bottom column
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Pillar ridges caps
    ctx.fillStyle = '#9be669'; // Lighter green for simple flat highlight cap
    ctx.fillRect(rx - 4, rTop - 24, rw + 8, 24);
    ctx.strokeRect(rx - 4, rTop - 24, rw + 8, 24);

    ctx.fillRect(rx - 4, height - rBottom, rw + 8, 24);
    ctx.strokeRect(rx - 4, height - rBottom, rw + 8, 24);
  }

  private drawJunglePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Ancient stone pillars
    const stoneGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    stoneGrad.addColorStop(0, '#4f5043');
    stoneGrad.addColorStop(0.5, '#7f8170');
    stoneGrad.addColorStop(1, '#2f3028');

    ctx.fillStyle = stoneGrad;
    ctx.strokeStyle = '#1b1c16';
    ctx.lineWidth = 2.5;

    // Draw stone columns with brick joints lines (Unified with offscreen extension)
    this.drawStoneColumn(ctx, rx, -1000, rw, rTop + 1000);
    this.drawStoneColumn(ctx, rx, height - rBottom, rw, rBottom + 1000);

    // Draw hanging green leaves / ivy vines procedurally
    ctx.fillStyle = 'rgba(34, 139, 34, 0.85)';
    ctx.beginPath();
    // Hanging vines paths
    ctx.moveTo(rx + 10, rTop);
    ctx.lineTo(rx + 15, rTop + 15);
    ctx.lineTo(rx + 22, rTop);
    ctx.moveTo(rx + 50, rTop);
    ctx.lineTo(rx + 55, rTop + 25);
    ctx.lineTo(rx + 65, rTop);
    ctx.fill();
  }

  private drawStoneColumn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // Horizontal cracks lines
    ctx.strokeStyle = '#1b1c16';
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.3);
    ctx.lineTo(x + w * 0.6, y + h * 0.3);
    ctx.moveTo(x + w * 0.4, y + h * 0.7);
    ctx.lineTo(x + w, y + h * 0.7);
    ctx.stroke();

    // Moss highlights overlay
    ctx.fillStyle = 'rgba(85, 107, 47, 0.4)';
    ctx.fillRect(x + 2, y + 2, w - 4, 15);
    ctx.fillRect(x + w - 15, y + 10, 13, h - 20);
  }

  private drawCyberpunkPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2.0;

    // Draw glowing neon panel infinite extensions (optimized to -1000 range)
    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 127, 0.15)'; // Top panel glow
    ctx.fillRect(rx + 10, -1000, rw - 20, rTop + 990);
    ctx.fillStyle = 'rgba(0, 243, 255, 0.15)'; // Bottom panel glow
    ctx.fillRect(rx + 10, height - rBottom + 10, rw - 20, rBottom + 990);
    ctx.restore();

    // Glowing metal columns scaffolding (Unified with offscreen extension)
    ctx.fillStyle = '#120f26';
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Draw glowing neon panel inside columns
    ctx.fillStyle = 'rgba(255, 0, 127, 0.15)';
    ctx.fillRect(rx + 10, 10, rw - 20, rTop - 20);
    ctx.fillStyle = 'rgba(0, 243, 255, 0.15)';
    ctx.fillRect(rx + 10, height - rBottom + 10, rw - 20, rBottom - 20);

    // Dynamic Central Laser Beam rendering
    if (obs.isLaser) {
      if (obs.laserActive) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rx + rw * 0.45, rTop, rw * 0.1, height - rTop - rBottom);
        ctx.fillStyle = 'rgba(255, 0, 85, 0.85)';
        ctx.fillRect(rx + rw * 0.42, rTop, rw * 0.16, height - rTop - rBottom);
      } else {
        // Soft red dotted warning line
        ctx.strokeStyle = 'rgba(255, 0, 50, 0.35)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.5, rTop);
        ctx.lineTo(rx + rw * 0.5, height - rBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawIcePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Use solid semi-transparent ice-blue background (removing slow gradient & heavy shadow calculations)
    ctx.fillStyle = 'rgba(173, 216, 230, 0.75)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2.0;

    // Top column (Unified with offscreen extension)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // Bottom column (Unified with offscreen extension)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Snowy/frosty cap caps
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx, rTop - 15, rw, 15);
    ctx.strokeRect(rx, rTop - 15, rw, 15);

    ctx.fillRect(rx, height - rBottom, rw, 15);
    ctx.strokeRect(rx, height - rBottom, rw, 15);
  }

  private drawDesertPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Ancient desert sandstones obelisks
    const sandGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    sandGrad.addColorStop(0, '#8e6d3c');
    sandGrad.addColorStop(0.5, '#ab8e60');
    sandGrad.addColorStop(1, '#5e431f');

    ctx.fillStyle = sandGrad;
    ctx.strokeStyle = '#3e2c14';
    ctx.lineWidth = 2.0;

    // Top obelisk (Unified with offscreen extension)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // Bottom obelisk (Unified with offscreen extension)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Engraved hieroglyph symbols
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(rx + rw * 0.5, rTop * 0.5, 8, 0, Math.PI * 2);
    ctx.moveTo(rx + rw * 0.3, height - rBottom * 0.5);
    ctx.lineTo(rx + rw * 0.7, height - rBottom * 0.5);
    ctx.stroke();
  }

  private drawVolcanoPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Molten igneous obsidian pillars
    const lavaGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    lavaGrad.addColorStop(0, '#100505');
    lavaGrad.addColorStop(0.5, '#40150a');
    lavaGrad.addColorStop(1, '#050101');

    ctx.fillStyle = lavaGrad;
    ctx.strokeStyle = '#ff3c00';
    ctx.lineWidth = 2.5;

    // Top Jagged Obsidian column (Unified with offscreen extension)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // Bottom Jagged Obsidian column (Unified with offscreen extension)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Lava cracks detailing
    ctx.fillStyle = 'rgba(255, 60, 0, 0.85)';
    ctx.strokeStyle = '#ff3c00';
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.2, 0);
    ctx.lineTo(rx + rw * 0.3, rTop * 0.7);
    ctx.lineTo(rx + rw * 0.25, rTop);
    ctx.lineTo(rx + rw * 0.4, rTop * 0.6);
    ctx.stroke();
  }

  private drawSpaceObstacles(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Deep space dark purple gradient column
    const spaceGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    spaceGrad.addColorStop(0, '#0b001a');
    spaceGrad.addColorStop(0.5, '#2e0854');
    spaceGrad.addColorStop(1, '#05000d');

    ctx.fillStyle = spaceGrad;
    ctx.strokeStyle = '#da70d6';
    ctx.lineWidth = 2.0;

    // Top cosmic column (Unified with offscreen extension)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // Bottom cosmic column (Unified with offscreen extension)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Glowing nebula cap
    const nebulaGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    nebulaGrad.addColorStop(0, '#ff1493');
    nebulaGrad.addColorStop(0.5, '#ffffff');
    nebulaGrad.addColorStop(1, '#00bfff');

    ctx.fillStyle = nebulaGrad;
    ctx.fillRect(rx, rTop - 15, rw, 15);
    ctx.strokeRect(rx, rTop - 15, rw, 15);

    ctx.fillRect(rx, height - rBottom, rw, 15);
    ctx.strokeRect(rx, height - rBottom, rw, 15);
  }

  private drawUnderwaterPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Algae covered marine pillars
    const marineGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    marineGrad.addColorStop(0, '#00251a');
    marineGrad.addColorStop(0.5, '#004d40');
    marineGrad.addColorStop(1, '#001a14');

    ctx.fillStyle = marineGrad;
    ctx.strokeStyle = '#00695c';
    ctx.lineWidth = 2.0;

    // Top (Unified with offscreen extension)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // Bottom (Unified with offscreen extension)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Seaweed leaves details overlay
    ctx.fillStyle = 'rgba(0, 150, 136, 0.4)';
    ctx.fillRect(rx + 4, rTop - 15, rw - 8, 15);
    ctx.fillRect(rx + 4, height - rBottom, rw - 8, 15);
  }

  private drawHeavenPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Golden white celestial marble columns
    const heavGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    heavGrad.addColorStop(0, '#ffffff');
    heavGrad.addColorStop(0.5, '#f5f5f0');
    heavGrad.addColorStop(0.8, '#e6e6fa');
    heavGrad.addColorStop(1, '#d8bfd8');

    ctx.fillStyle = heavGrad;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2.5;

    // Top (Unified with offscreen extension)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // Bottom (Unified with offscreen extension)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Golden halo crown on column caps (standardized to obs.width)
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(rx, rTop - 12, rw, 12);
    ctx.fillRect(rx, height - rBottom, rw, 12);
  }

  private drawCavernObstacle(
    ctx: CanvasRenderingContext2D,
    obs: Obstacle,
    height: number,
    colorTop: string,
    colorBottom: string,
    outlineColor: string
  ) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    // Draw Jagged Top Stalactite Cavern Wall
    ctx.save();
    const gradTop = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    gradTop.addColorStop(0, colorTop);
    gradTop.addColorStop(0.5, colorBottom);
    gradTop.addColorStop(1, '#1b1b1b');
    ctx.fillStyle = gradTop;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 3.5;

    ctx.beginPath();
    ctx.moveTo(rx, -1000);
    ctx.lineTo(rx, rTop - 12);
    // Draw jagged rocky stalactites along the safe opening edge
    ctx.lineTo(rx + rw * 0.2, rTop - 25 + Math.sin(rx * 0.05) * 8);
    ctx.lineTo(rx + rw * 0.45, rTop + 10); // Sharp spike stalactite
    ctx.lineTo(rx + rw * 0.75, rTop - 20 + Math.cos(rx * 0.03) * 6);
    ctx.lineTo(rx + rw, rTop - 8);
    ctx.lineTo(rx + rw, -1000);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw rocky layers and texture lines inside the top cavern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.15, rTop - 40);
    ctx.lineTo(rx + rw * 0.5, rTop - 15);
    ctx.lineTo(rx + rw * 0.85, rTop - 35);
    ctx.stroke();
    ctx.restore();

    // Draw Jagged Bottom Stalagmite Cavern Wall
    ctx.save();
    const gradBottom = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    gradBottom.addColorStop(0, colorTop);
    gradBottom.addColorStop(0.5, colorBottom);
    gradBottom.addColorStop(1, '#1b1b1b');
    ctx.fillStyle = gradBottom;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 3.5;

    const floorY = height - rBottom;
    ctx.beginPath();
    ctx.moveTo(rx, height + 1000);
    ctx.lineTo(rx, floorY + 12);
    // Draw jagged rocky stalagmites along the safe opening edge
    ctx.lineTo(rx + rw * 0.25, floorY + 20 + Math.cos(rx * 0.04) * 8);
    ctx.lineTo(rx + rw * 0.55, floorY - 12); // Sharp stalagmite spike pointing up
    ctx.lineTo(rx + rw * 0.8, floorY + 18 + Math.sin(rx * 0.06) * 6);
    ctx.lineTo(rx + rw, floorY + 8);
    ctx.lineTo(rx + rw, height + 1000);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw rocky layers and texture lines inside the bottom cavern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.2, floorY + 35);
    ctx.lineTo(rx + rw * 0.6, floorY + 15);
    ctx.lineTo(rx + rw * 0.8, floorY + 40);
    ctx.stroke();
    ctx.restore();
  }
}
