
import { Bird } from './Bird.ts';

export interface Obstacle {
  x: number;
  width: number;
  topHeight: number;
  bottomHeight: number;
  passed: boolean;
  grazed?: boolean;
  
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
    
    // Scale horizontal distance according to user specs (Narrow Horizontal Spacing: no coasting)
    let targetDistance;
    if (zone === 'classic') {
      // Base classic distance of 165px (very tight, chaotic, immediate next peak visible)
      const baseClassicDistance = 165;
      if (difficulty === 'easy') {
        // Easy Mode: 20% constant gap increase compared to the base gap (165 * 1.20 = 198px)
        targetDistance = baseClassicDistance * 1.20;
      } else {
        targetDistance = baseClassicDistance;
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
        // By changing '+' to '-', we align the horizontal scroll frequency and temporal frequency directions,
        // preventing visual phase cancellation and producing a gorgeous, fast propagating, fluid wave tunnel.
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
    void score;
    void progressRatio;
    let margin = 60;
    let topHeight = 0;
    let bottomHeight = 0;
    let isMoving = false;
    let isLaser = false;
    let rangeY = difficulty === 'hard' ? 50 + Math.random() * 40 : 30 + Math.random() * 30;

    if (zone === 'vertical') {
      margin = 85;
      const playableHeight = height - gapHeight - margin * 2;
      topHeight = margin + 0.25 * playableHeight + Math.random() * 0.5 * playableHeight;
      bottomHeight = height - topHeight - gapHeight;
      isMoving = true;
      rangeY = 55 + Math.random() * 25; // beautiful vertical sweep
    } else if (zone === 'wave') {
      margin = 85;
      const playableHeight = height - gapHeight - margin * 2;
      // perfectly center the winding tunnel so it can oscillate nicely
      topHeight = margin + playableHeight / 2;
      bottomHeight = height - topHeight - gapHeight;
      isMoving = true;
      rangeY = 65; // constant amplitude for cohesive wave look
    } else {
      // Classic Mode: Jagged Cavern Heartbeat / Seismograph Generator
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
      
      // Keep cavern walls static on screen in Classic Zone
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


  // Draw procedural themed obstacle pillars as a jagged rocky cavern / canyon channel
  public render(ctx: CanvasRenderingContext2D, height: number) {
    ctx.shadowBlur = 0; // Disable shadows for high performance
    for (let i = 0; i < this.list.length; i++) {
      const obs = this.list[i];
      ctx.save();
      
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
      ctx.restore();
    }
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
