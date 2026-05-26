
import { Bird } from './Bird.ts';

export interface Obstacle {
  x: number;
  width: number;
  topHeight: number;
  bottomHeight: number;
  passed: boolean;
  grazed?: boolean;
  isCavern?: boolean;
  isMutated?: boolean;
  isStructured?: boolean;
  
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

  // Reactive Level Mode properties
  patternType?: string;
  animationProgress?: number;
  animTimer?: number;
  segmentOffsets?: number[];
  isTriggered?: boolean;
  triggerDistance?: number;
  animDuration?: number;
  targetTopHeight?: number;
  targetBottomHeight?: number;
  closedTopHeight?: number;
  closedBottomHeight?: number;
  levelNum?: number;
  shakeX?: number;
  shakeX2?: number;
  gapHeight?: number;
  spawnCenterY?: number;
  obstacleIdx?: number;
}

export class ObstacleManager {
  private list: Obstacle[] = [];
  private freePool: Obstacle[] = [];
  private spawnTimer = 0;
  private obstacleWidth = 72;
  private waveTime = 0;
  private nextSpawnDistance = 350;
  private lastTopHeight: number | null = null;

  private activeLevelConfig: any = null;

  constructor() {}

  private acquireObstacle(props: Partial<Obstacle>): Obstacle {
    let obs = this.freePool.pop();
    if (!obs) {
      obs = {} as Obstacle;
    }
    Object.assign(obs, {
      x: 0,
      width: 72,
      topHeight: 0,
      bottomHeight: 0,
      passed: false,
      grazed: false,
      isCavern: false,
      isMutated: false,
      isStructured: false,
      worldId: 'jungle',
      isMoving: false,
      movingDir: 1,
      speedY: 0,
      rangeY: 0,
      initialTopHeight: 0,
      initialBottomHeight: 0,
      isLaser: false,
      laserActive: false,
      laserTimer: 0,
      hasSpawnedRewards: false,
      oscillationFrequency: 0,
      oscillationRange: 0,
      patternType: undefined,
      isTriggered: false,
      animTimer: 0,
      animDuration: 0,
      triggerDistance: 0,
      closedTopHeight: 0,
      closedBottomHeight: 0,
      targetTopHeight: 0,
      targetBottomHeight: 0,
      levelNum: undefined,
      shakeX: 0,
      shakeX2: 0,
      gapHeight: 0,
      spawnCenterY: 0,
      obstacleIdx: undefined
    }, props);
    return obs;
  }

  public setLevelMode(_enabled: boolean, config: any) {
    this.activeLevelConfig = config;
  }

  public getList(): Obstacle[] {
    return this.list;
  }

  public clear() {
    while (this.list.length > 0) {
      this.freePool.push(this.list.pop()!);
    }
    this.spawnTimer = 0;
    this.waveTime = 0;
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
    zone: 'classic' | 'wave' = 'classic',
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    _birdX?: number,
    _particleEngine?: any
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
    } else {
      // Wave Zone spacing
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

      // Handle Cyberpunk pulsing lasers
      if (obs.isLaser) {
        obs.laserTimer += deltaTime * timeScale;
        if (obs.laserTimer >= 1.6) {
          obs.laserActive = !obs.laserActive;
          obs.laserTimer = 0;
        }
      }


      // Remove offscreen obstacles & recycle them back to the free pool for Object Pooling!
      if (obs.x + obs.width < -50) {
        this.freePool.push(obs);
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

      // Determine next spawn distance: Standard spacious classic distance for all obstacles
      const baseDistanceClassic = (width / 1.35) * 0.80;
      const defaultDistance = baseDistanceClassic * 1.15;
      if (difficulty === 'easy') {
        this.nextSpawnDistance = defaultDistance * 1.20;
      } else {
        this.nextSpawnDistance = defaultDistance;
      }
    }
  }

  private spawnObstacle(
    worldId: string,
    width: number,
    height: number,
    gapHeight: number,
    _zone: 'classic' | 'vertical' | 'wave' = 'classic',
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    _progressRatio = 0,
    score = 0
  ) {
    let margin = 60;
    let topHeight = 0;
    let bottomHeight = 0;
    let isMoving = false;
    let isLaser = false;
    let rangeY = difficulty === 'hard' ? 50 + Math.random() * 40 : 30 + Math.random() * 30;
    let isCavernVal = false;

    // Classic/Standard Spawning logic for height/margin calculations
    if (difficulty === 'easy') {
      margin = 75;
    } else if (difficulty === 'hard') {
      margin = 40;
    } else {
      margin = 60;
    }

    const playableHeight = height - gapHeight - margin * 2;
    let targetTopHeight = margin + Math.random() * playableHeight;

    if (this.lastTopHeight !== null) {
      const scoreTier = Math.floor(score / 50);
      let zigzagFactor = 0.65;
      let forceAlternateChance = 0.68;
      
      if (difficulty === 'easy') {
        zigzagFactor = Math.min(0.45, 0.25 + scoreTier * 0.05);
        forceAlternateChance = 0.30;
      } else if (difficulty === 'hard') {
        zigzagFactor = Math.min(0.98, 0.85 + scoreTier * 0.05);
        forceAlternateChance = 0.90;
      } else {
        zigzagFactor = Math.min(0.85, 0.60 + scoreTier * 0.08);
        forceAlternateChance = 0.68;
      }

      const maxStep = playableHeight * zigzagFactor;
      const forceAlternate = Math.random() < forceAlternateChance;
      let minVal = Math.max(margin, this.lastTopHeight - maxStep);
      let maxVal = Math.min(margin + playableHeight, this.lastTopHeight + maxStep);
      
      if (forceAlternate) {
        const isHigh = this.lastTopHeight > margin + playableHeight * 0.5;
        if (isHigh) {
          const lowBiasLimit = difficulty === 'easy' ? 0.35 : (difficulty === 'hard' ? 0.48 : 0.45);
          maxVal = Math.min(maxVal, margin + playableHeight * lowBiasLimit);
        } else {
          const highBiasLimit = difficulty === 'easy' ? 0.65 : (difficulty === 'hard' ? 0.52 : 0.55);
          minVal = Math.max(minVal, margin + playableHeight * highBiasLimit);
        }
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

    isLaser = worldId === 'cyberpunk' && Math.random() < 0.35;

    const levelNum = this.activeLevelConfig ? this.activeLevelConfig.levelNum : undefined;
    const isMutated = this.activeLevelConfig ? (this.activeLevelConfig.levelNum % 2 === 0) : (score >= 20 && score < 50);
    const isStructured = this.activeLevelConfig ? (this.activeLevelConfig.levelNum % 3 === 0) : (score >= 50 && score <= 70);

    this.list.push(this.acquireObstacle({
      x: width + 50,
      width: this.obstacleWidth,
      topHeight,
      bottomHeight,
      passed: false,
      isCavern: isCavernVal,
      isMutated,
      isStructured,
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
      oscillationFrequency: 0,
      oscillationRange: 0,
      levelNum
    }));
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

      const topShift = obs.shakeX || 0;
      const bottomShift = obs.shakeX2 !== undefined ? obs.shakeX2 : (obs.shakeX || 0);

      const leftTop = obs.x + topShift;
      const rightTop = obs.x + obs.width + topShift;
      const leftBottom = obs.x + bottomShift;
      const rightBottom = obs.x + obs.width + bottomShift;

      // Range check: Skip heavy math if bird is horizontally nowhere near this obstacle!
      const maxRad = bird.radius;
      const minLeft = Math.min(leftTop, leftBottom);
      const maxRight = Math.max(rightTop, rightBottom);
      if (maxRight < bird.x - maxRad || minLeft > bird.x + maxRad) {
        continue;
      }

      const topPipeBottom = obs.topHeight;
      const bottomPipeTop = height - obs.bottomHeight;

      // Mathematically check exact circle-to-rectangle collision for top pipe
      const closestTopX = Math.max(leftTop, Math.min(bird.x, rightTop));
      const closestTopY = Math.max(-2000, Math.min(bird.y, topPipeBottom));
      const distTopX = bird.x - closestTopX;
      const distTopY = bird.y - closestTopY;
      const isCollidingTop = (distTopX * distTopX + distTopY * distTopY) <= effectiveRadius * effectiveRadius;

      // Mathematically check exact circle-to-rectangle collision for bottom pipe
      const closestBottomX = Math.max(leftBottom, Math.min(bird.x, rightBottom));
      const closestBottomY = Math.max(bottomPipeTop, Math.min(bird.y, height + 2000));
      const distBottomX = bird.x - closestBottomX;
      const distBottomY = bird.y - closestBottomY;
      const isCollidingBottom = (distBottomX * distBottomX + distBottomY * distBottomY) <= effectiveRadiusBottom * effectiveRadiusBottom;

      if (isCollidingTop || isCollidingBottom) {
        // Enforce physical blocking / clamping with the new hitboxes
        if (isCollidingTop) {
          if (bird.x >= leftTop && bird.x <= rightTop) {
            // Directly under the top pipe - clamp vertically
            bird.y = topPipeBottom + effectiveRadius;
            if (bird.vy < 0) bird.vy = 0;
          } else if (bird.x < leftTop) {
            // Hitting the left side/corner
            if (bird.y <= topPipeBottom) {
              // Completely above the pipe bottom (hitting vertical face)
              bird.x = leftTop - effectiveRadius;
            } else {
              // Hitting the bottom-left corner
              const vx = bird.x - leftTop;
              const vy = bird.y - topPipeBottom;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadius) {
                bird.x = leftTop + (vx / len) * effectiveRadius;
                bird.y = topPipeBottom + (vy / len) * effectiveRadius;
              }
            }
          } else if (bird.x > rightTop) {
            // Hitting the right side/corner
            if (bird.y <= topPipeBottom) {
              // Hitting vertical face
              bird.x = rightTop + effectiveRadius;
            } else {
              // Hitting the bottom-right corner
              const vx = bird.x - rightTop;
              const vy = bird.y - topPipeBottom;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadius) {
                bird.x = rightTop + (vx / len) * effectiveRadius;
                bird.y = topPipeBottom + (vy / len) * effectiveRadius;
              }
            }
          }
        } else if (isCollidingBottom) {
          if (bird.x >= leftBottom && bird.x <= rightBottom) {
            // Directly above the bottom pipe - clamp vertically
            bird.y = bottomPipeTop - effectiveRadiusBottom;
            if (bird.vy > 0) bird.vy = 0;
          } else if (bird.x < leftBottom) {
            // Hitting the left side/corner
            if (bird.y >= bottomPipeTop) {
              // Completely below bottom pipe top (hitting vertical face)
              bird.x = leftBottom - effectiveRadiusBottom;
            } else {
              // Hitting the top-left corner
              const vx = bird.x - leftBottom;
              const vy = bird.y - bottomPipeTop;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadiusBottom) {
                bird.x = leftBottom + (vx / len) * effectiveRadiusBottom;
                bird.y = bottomPipeTop + (vy / len) * effectiveRadiusBottom;
              }
            }
          } else if (bird.x > rightBottom) {
            // Hitting the right side/corner
            if (bird.y >= bottomPipeTop) {
              // Hitting vertical face
              bird.x = rightBottom + effectiveRadiusBottom;
            } else {
              // Hitting the top-right corner
              const vx = bird.x - rightBottom;
              const vy = bird.y - bottomPipeTop;
              const len = Math.sqrt(vx * vx + vy * vy);
              if (len > 0 && len < effectiveRadiusBottom) {
                bird.x = rightBottom + (vx / len) * effectiveRadiusBottom;
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
      
      // Store original float values to keep physics update clean and drift-free
      const origX = obs.x;
      const origTopHeight = obs.topHeight;
      const origBottomHeight = obs.bottomHeight;
      const origWidth = obs.width;

      // Wrap drawing values in Math.round to force perfect alignment to screen pixels
      obs.x = Math.round(obs.x);
      obs.topHeight = Math.round(obs.topHeight);
      obs.bottomHeight = Math.round(obs.bottomHeight);
      obs.width = Math.round(obs.width);

      const drawPillars = () => {
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
            case 'jungle_temple':
              colorTop = '#3a533c';
              colorBottom = '#243325';
              outlineColor = '#0b130c';
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
        } else if (obs.isStructured) {
          switch (obs.worldId) {
            case 'jungle':
              this.drawStructuredJunglePillars(ctx, obs, height);
              break;
            case 'jungle_temple':
              this.drawStructuredJungleTemplePillars(ctx, obs, height);
              break;
            case 'cyberpunk':
              this.drawStructuredCyberpunkPillars(ctx, obs, height);
              break;
            case 'ice':
              this.drawStructuredIcePillars(ctx, obs, height);
              break;
            case 'desert':
              this.drawStructuredDesertPillars(ctx, obs, height);
              break;
            case 'volcano':
              this.drawStructuredVolcanoPillars(ctx, obs, height);
              break;
            case 'space':
              this.drawStructuredSpaceObstacles(ctx, obs, height);
              break;
            case 'underwater':
              this.drawStructuredUnderwaterPillars(ctx, obs, height);
              break;
            case 'heaven':
              this.drawStructuredHeavenPillars(ctx, obs, height);
              break;
            case 'retro':
              this.drawStructuredRetroPillars(ctx, obs, height);
              break;
            default:
              this.drawStructuredDefaultPillars(ctx, obs, height);
          }
        } else {
          switch (obs.worldId) {
            case 'jungle':
              this.drawJunglePillars(ctx, obs, height);
              break;
            case 'jungle_temple':
              this.drawJungleTemplePillars(ctx, obs, height);
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
      };

      // Save context state for drawing this obstacle
      ctx.save();

      // Draw the main obstacle pillars
      drawPillars();

      // Draw custom overlays for level patterns
      if (obs.patternType === 'rotating_24') {
        const centerY = obs.topHeight + (height - obs.bottomHeight - obs.topHeight) / 2;
        ctx.save();
        ctx.translate(obs.x + obs.width / 2, centerY);
        ctx.rotate(this.waveTime * 2.0);
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(-18, -18, 36, 36);
        ctx.restore();
      } else if (obs.patternType === 'boss_30') {
        const centerY = obs.topHeight + (height - obs.bottomHeight - obs.topHeight) / 2;
        ctx.save();
        ctx.translate(obs.x + obs.width / 2, centerY);
        
        const pulse = 16 + Math.sin(this.waveTime * 8.0) * 5;
        const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, pulse);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, '#ff8800');
        grad.addColorStop(1, 'rgba(255, 68, 0, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, pulse, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.rotate(-this.waveTime * 3.5);
        ctx.strokeStyle = 'rgba(255, 69, 0, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();
      }

      // Restore context state back to standard
      ctx.restore();

      // Restore original float values for smooth physics simulation
      obs.x = origX;
      obs.topHeight = origTopHeight;
      obs.bottomHeight = origBottomHeight;
      obs.width = origWidth;
    }
  }

  // Visual Pillar Painters
  private drawDefaultPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;

    if (obs.isMutated) {
      if (isPerformance) {
        ctx.fillStyle = '#1e3a8a';
        ctx.strokeStyle = '#fbbf24';
      } else {
        // Royal blue and polished gold
        const grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.3, '#1e3a8a');
        grad.addColorStop(0.7, '#1e40af');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#fbbf24'; // Gold outline
      }
      ctx.lineWidth = 3.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Shiny gold caps
      if (isPerformance) {
        ctx.fillStyle = '#d97706';
      } else {
        const goldGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
        goldGrad.addColorStop(0, '#d97706');
        goldGrad.addColorStop(0.5, '#fef08a');
        goldGrad.addColorStop(1, '#b45309');
        ctx.fillStyle = goldGrad;
      }
      ctx.fillRect(rx, rTop - 20, rw, 20);
      ctx.strokeRect(rx, rTop - 20, rw, 20);
      ctx.fillRect(rx, height - rBottom, rw, 20);
      ctx.strokeRect(rx, height - rBottom, rw, 20);
    } else {
      if (isPerformance) {
        ctx.fillStyle = '#336633';
        ctx.strokeStyle = '#0e240e';
      } else {
        const grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
        grad.addColorStop(0, '#55a855');
        grad.addColorStop(0.3, '#88d888');
        grad.addColorStop(0.7, '#336633');
        grad.addColorStop(1, '#1b3d1b');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#0e240e';
      }
      ctx.lineWidth = 3;

      // Top column (Unified with offscreen extension)
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      // Bottom column (Unified with offscreen extension)
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Pillar ridges caps (standardized to obs.width)
      if (isPerformance) {
        ctx.fillStyle = '#55a855';
      } else {
        ctx.fillStyle = '#88d888';
      }
      ctx.fillRect(rx, rTop - 20, rw, 20);
      ctx.strokeRect(rx, rTop - 20, rw, 20);

      ctx.fillRect(rx, height - rBottom, rw, 20);
      ctx.strokeRect(rx, height - rBottom, rw, 20);
    }
  }

  private drawRetroPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#ec4899' : '#73c93e';
      ctx.strokeStyle = obs.isMutated ? '#06b6d4' : '#000000';
      ctx.lineWidth = obs.isMutated ? 3.5 : 3;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    if (obs.isMutated) {
      // Retro pink
      ctx.fillStyle = '#ec4899';
      ctx.strokeStyle = '#06b6d4'; // Cyan neon outline
      ctx.lineWidth = 3.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Vaporwave retro horizontal gridlines
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let y = rTop - 120; y < rTop; y += 24) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      for (let y = height - rBottom; y < height - rBottom + 120; y += 24) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      ctx.stroke();
    } else {
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
  }

  private drawJunglePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#083722' : '#4f5043';
      ctx.strokeStyle = obs.isMutated ? '#00e676' : '#1b1c16';
      ctx.lineWidth = 2.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    if (obs.isMutated) {
      // Vibrant semi-transparent exotic emerald forest gradient (very attractive and environment matching)
      const forestGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      forestGrad.addColorStop(0, 'rgba(8, 55, 34, 0.72)');
      forestGrad.addColorStop(0.5, 'rgba(18, 92, 58, 0.78)');
      forestGrad.addColorStop(1, 'rgba(6, 42, 26, 0.72)');

      // 1. Draw central organic bark-brown wooden vine-core panel
      ctx.fillStyle = 'rgba(109, 76, 65, 0.65)';
      ctx.fillRect(rx + rw * 0.4, -1000, rw * 0.2, rTop + 1000 - 8);
      ctx.fillRect(rx + rw * 0.4, height - rBottom + 8, rw * 0.2, rBottom + 1000 - 8);

      // 2. Draw outer semi-transparent foliage shell
      ctx.fillStyle = forestGrad;
      ctx.strokeStyle = 'rgba(0, 230, 118, 0.95)'; // Rich vibrant neon-moss green outline
      ctx.lineWidth = 2.0;

      // Draw Top Column Shell
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);

      // Draw Bottom Column Shell
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Flat caps matching border green
      ctx.fillStyle = 'rgba(0, 230, 118, 0.95)';
      ctx.fillRect(rx, rTop - 8, rw, 8);
      ctx.fillRect(rx, height - rBottom, rw, 8);

      // Flat green leaves details hanging from boundaries
      ctx.fillStyle = 'rgba(34, 139, 34, 0.8)';
      ctx.beginPath();
      ctx.moveTo(rx + 10, rTop);
      ctx.lineTo(rx + 15, rTop + 12);
      ctx.lineTo(rx + 20, rTop);
      ctx.moveTo(rx + 45, rTop);
      ctx.lineTo(rx + 50, rTop + 18);
      ctx.lineTo(rx + 58, rTop);
      ctx.fill();
    } else {
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
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#05050a' : '#120f26';
      ctx.strokeStyle = obs.isMutated ? '#39ff14' : '#00f3ff';
      ctx.lineWidth = 2.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      if (obs.isLaser) {
        if (obs.laserActive) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx + rw * 0.45, rTop, rw * 0.1, height - rTop - rBottom);
          ctx.fillStyle = obs.isMutated ? 'rgba(57, 255, 20, 0.9)' : 'rgba(255, 0, 85, 0.85)';
          ctx.fillRect(rx + rw * 0.42, rTop, rw * 0.16, height - rTop - rBottom);
        } else {
          ctx.strokeStyle = obs.isMutated ? 'rgba(57, 255, 20, 0.4)' : 'rgba(255, 0, 50, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(rx + rw * 0.5, rTop);
          ctx.lineTo(rx + rw * 0.5, height - rBottom);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      return;
    }

    if (obs.isMutated) {
      // Matrix code columns
      ctx.fillStyle = '#05050a';
      ctx.strokeStyle = '#39ff14'; // Matrix neon green outline
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Draw digital code grid lines
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = rTop - 120; y < rTop; y += 20) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      for (let y = height - rBottom; y < height - rBottom + 120; y += 20) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      ctx.stroke();

      // Laser warning
      if (obs.isLaser) {
        if (obs.laserActive) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx + rw * 0.45, rTop, rw * 0.1, height - rTop - rBottom);
          ctx.fillStyle = 'rgba(57, 255, 20, 0.9)'; // Neon green laser beam
          ctx.fillRect(rx + rw * 0.42, rTop, rw * 0.16, height - rTop - rBottom);
        } else {
          ctx.strokeStyle = 'rgba(57, 255, 20, 0.4)';
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(rx + rw * 0.5, rTop);
          ctx.lineTo(rx + rw * 0.5, height - rBottom);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    } else {
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
  }

  private drawIcePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#3b82f6' : 'rgba(173, 216, 230, 0.75)';
      ctx.strokeStyle = obs.isMutated ? '#ffffff' : 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = obs.isMutated ? 3 : 2;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    if (obs.isMutated) {
      // Aurora prism gradient
      const prismGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      prismGrad.addColorStop(0, '#ec4899'); // Pink
      prismGrad.addColorStop(0.5, '#3b82f6'); // Blue
      prismGrad.addColorStop(1, '#06b6d4'); // Cyan
      ctx.fillStyle = prismGrad;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Frost crack sparkles
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.5, rTop - 5);
      ctx.lineTo(rx + rw * 0.5, rTop - 60);
      ctx.moveTo(rx + rw * 0.2, rTop - 35);
      ctx.lineTo(rx + rw * 0.8, rTop - 35);
      ctx.moveTo(rx + rw * 0.5, height - rBottom + 5);
      ctx.lineTo(rx + rw * 0.5, height - rBottom + 60);
      ctx.moveTo(rx + rw * 0.2, height - rBottom + 35);
      ctx.lineTo(rx + rw * 0.8, height - rBottom + 35);
      ctx.stroke();
    } else {
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
  }

  private drawDesertPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#fbbf24' : '#ab8e60';
      ctx.strokeStyle = obs.isMutated ? '#ef4444' : '#3e2c14';
      ctx.lineWidth = 2.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    if (obs.isMutated) {
      // Jeweled sandstone
      const sandGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      sandGrad.addColorStop(0, '#b45309');
      sandGrad.addColorStop(0.5, '#fbbf24');
      sandGrad.addColorStop(1, '#78350f');
      ctx.fillStyle = sandGrad;
      ctx.strokeStyle = '#ef4444'; // Ruby red borders
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Draw embedded glowing gems
      ctx.fillStyle = '#06b6d4'; // Turquoise gems
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5, rTop - 40, 6, 0, Math.PI * 2);
      ctx.arc(rx + rw * 0.5, height - rBottom + 40, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444'; // Ruby gems
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5, rTop - 100, 5, 0, Math.PI * 2);
      ctx.arc(rx + rw * 0.5, height - rBottom + 100, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
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
  }

  private drawVolcanoPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#0a0505' : '#100505';
      ctx.strokeStyle = obs.isMutated ? '#f97316' : '#ff3c00';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      if (obs.isMutated) {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(rx + rw * 0.38, -1000, rw * 0.24, rTop + 1000);
        ctx.fillRect(rx + rw * 0.38, height - rBottom, rw * 0.24, rBottom + 1000);
      }
      return;
    }

    if (obs.isMutated) {
      // Darkest obsidian
      ctx.fillStyle = '#0a0505';
      ctx.strokeStyle = '#f97316'; // Orange outline
      ctx.lineWidth = 3;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Flowing central lava vein
      const lavaFlow = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      lavaFlow.addColorStop(0, '#f97316');
      lavaFlow.addColorStop(0.5, '#facc15'); // Yellow core
      lavaFlow.addColorStop(1, '#ea580c');
      ctx.fillStyle = lavaFlow;
      ctx.fillRect(rx + rw * 0.38, -1000, rw * 0.24, rTop + 1000);
      ctx.fillRect(rx + rw * 0.38, height - rBottom, rw * 0.24, rBottom + 1000);
    } else {
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
  }

  private drawSpaceObstacles(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#030008' : '#2e0854';
      ctx.strokeStyle = obs.isMutated ? '#a855f7' : '#da70d6';
      ctx.lineWidth = 2.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    if (obs.isMutated) {
      // Deep cosmic black
      ctx.fillStyle = '#030008';
      ctx.strokeStyle = '#a855f7'; // Purple neon outline
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Nebula dust sparkles
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx + rw * 0.2, rTop - 40, 3, 3);
      ctx.fillRect(rx + rw * 0.7, rTop - 80, 2, 2);
      ctx.fillRect(rx + rw * 0.5, height - rBottom + 60, 3, 3);

      // Glowing galaxy rings wrapped around the pillar
      const ringGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      ringGrad.addColorStop(0, '#ec4899');
      ringGrad.addColorStop(0.5, '#e0f2fe'); // Star white
      ringGrad.addColorStop(1, '#3b82f6');
      ctx.fillStyle = ringGrad;
      ctx.fillRect(rx - 6, rTop - 30, rw + 12, 10);
      ctx.fillRect(rx - 6, height - rBottom + 20, rw + 12, 10);
    } else {
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
  }

  private drawUnderwaterPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#081e26' : '#004d40';
      ctx.strokeStyle = obs.isMutated ? '#ec4899' : '#00695c';
      ctx.lineWidth = 2.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    if (obs.isMutated) {
      // Deep sea navy
      ctx.fillStyle = '#081e26';
      ctx.strokeStyle = '#ec4899'; // Coral pink outline
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Bioluminescent pink corals polyps
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.arc(rx + 12, rTop - 25, 6, 0, Math.PI * 2);
      ctx.arc(rx + 25, rTop - 50, 4, 0, Math.PI * 2);
      ctx.arc(rx + rw - 15, height - rBottom + 35, 7, 0, Math.PI * 2);
      ctx.arc(rx + rw - 30, height - rBottom + 60, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
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
  }

  private drawHeavenPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = obs.isMutated ? '#ffffff' : '#f5f5f0';
      ctx.strokeStyle = obs.isMutated ? '#fcd34d' : '#ffd700';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    if (obs.isMutated) {
      // Divine white marble
      const heavGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      heavGrad.addColorStop(0, '#fcd34d'); // Gold yellow
      heavGrad.addColorStop(0.3, '#ffffff');
      heavGrad.addColorStop(0.7, '#ffffff');
      heavGrad.addColorStop(1, '#a7f3d0'); // Divine mint
      ctx.fillStyle = heavGrad;
      ctx.strokeStyle = '#fcd34d'; // Shiny gold
      ctx.lineWidth = 3;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Glowing golden wings caps
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(rx - 8, rTop - 16, rw + 16, 16);
      ctx.fillRect(rx - 8, height - rBottom, rw + 16, 16);
    } else {
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
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = colorTop;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.5;

      ctx.beginPath();
      ctx.moveTo(rx, -1000);
      ctx.lineTo(rx, rTop - 12);
      ctx.lineTo(rx + rw * 0.2, rTop - 25 + Math.sin(rx * 0.05) * 8);
      ctx.lineTo(rx + rw * 0.45, rTop + 10);
      ctx.lineTo(rx + rw * 0.75, rTop - 20 + Math.cos(rx * 0.03) * 6);
      ctx.lineTo(rx + rw, rTop - 8);
      ctx.lineTo(rx + rw, -1000);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const floorY = height - rBottom;
      ctx.beginPath();
      ctx.moveTo(rx, height + 1000);
      ctx.lineTo(rx, floorY + 12);
      ctx.lineTo(rx + rw * 0.25, floorY + 20 + Math.cos(rx * 0.04) * 8);
      ctx.lineTo(rx + rw * 0.55, floorY - 12);
      ctx.lineTo(rx + rw * 0.8, floorY + 18 + Math.sin(rx * 0.06) * 6);
      ctx.lineTo(rx + rw, floorY + 8);
      ctx.lineTo(rx + rw, height + 1000);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }

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

    ctx.stroke();
    ctx.restore();
  }

  // Visual Structured Pillar Painters
  private drawStructuredDefaultPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#1e3a8a';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Deep royal blue gradient columns with golden joints
    const grad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.3, '#1e3a8a');
    grad.addColorStop(0.7, '#1e40af');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#fbbf24'; // Gold outline
    ctx.lineWidth = 3;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Draw structural block joints
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = rTop - 120; y < rTop - 20; y += 35) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    for (let y = height - rBottom + 20; y < height - rBottom + 120; y += 35) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    ctx.stroke();

    // Stepped Greek capital crowns
    const goldGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    goldGrad.addColorStop(0, '#d97706');
    goldGrad.addColorStop(0.5, '#fef08a');
    goldGrad.addColorStop(1, '#b45309');
    ctx.fillStyle = goldGrad;

    ctx.fillRect(rx - 6, rTop - 24, rw + 12, 12);
    ctx.strokeRect(rx - 6, rTop - 24, rw + 12, 12);
    ctx.fillRect(rx - 2, rTop - 12, rw + 4, 12);
    ctx.strokeRect(rx - 2, rTop - 12, rw + 4, 12);

    ctx.fillRect(rx - 6, height - rBottom, rw + 12, 12);
    ctx.strokeRect(rx - 6, height - rBottom, rw + 12, 12);
    ctx.fillRect(rx - 2, height - rBottom + 12, rw + 4, 12);
    ctx.strokeRect(rx - 2, height - rBottom + 12, rw + 4, 12);
  }

  private drawStructuredRetroPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#ec4899';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Stacked pixel blocks with isometric 3D-shaded borders
    ctx.fillStyle = '#ec4899'; // Hot pink
    ctx.strokeStyle = '#06b6d4'; // Cyan neon
    ctx.lineWidth = 3;

    // Draw stepped 3D segmented towers
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Vaporwave retro horizontal gridlines
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let y = rTop - 120; y < rTop; y += 24) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    for (let y = height - rBottom; y < height - rBottom + 120; y += 24) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    ctx.stroke();

    // Stepped pixel block caps (structured)
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(rx - 8, rTop - 28, rw + 16, 14);
    ctx.strokeRect(rx - 8, rTop - 28, rw + 16, 14);
    ctx.fillRect(rx - 4, rTop - 14, rw + 8, 14);
    ctx.fillRect(rx - 4, rTop - 12, rw + 8, 12);
    ctx.strokeRect(rx - 4, rTop - 12, rw + 8, 12);
    ctx.fillRect(rx - 8, rTop - 24, rw + 16, 12);
    ctx.strokeRect(rx - 8, rTop - 24, rw + 16, 12);

    ctx.fillRect(rx - 4, height - rBottom, rw + 8, 12);
    ctx.strokeRect(rx - 4, height - rBottom, rw + 8, 12);
    ctx.fillRect(rx - 8, height - rBottom + 12, rw + 16, 12);
    ctx.strokeRect(rx - 8, height - rBottom + 12, rw + 16, 12);
  }

  private drawStructuredJunglePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#102a12';
      ctx.strokeStyle = 'rgba(217, 160, 24, 0.70)';
      ctx.lineWidth = 2.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Semi-transparent deep mossy jade-olive gradient (environment friendly and slightly transparent)
    const jungleGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    jungleGrad.addColorStop(0, 'rgba(16, 42, 25, 0.72)');
    jungleGrad.addColorStop(0.5, 'rgba(38, 75, 45, 0.78)');
    jungleGrad.addColorStop(1, 'rgba(10, 32, 18, 0.72)');

    ctx.fillStyle = jungleGrad;
    ctx.strokeStyle = 'rgba(217, 160, 24, 0.70)'; // Dimmer, less glowing amber-gold outline
    ctx.lineWidth = 2.0;

    // TOP COLUMN (flat standard rectangle)
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // BOTTOM COLUMN (flat standard rectangle)
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Stepped gold joint collars at safe boundaries (very premium, flat and static)
    ctx.fillStyle = 'rgba(217, 160, 24, 0.70)';
    ctx.fillRect(rx - 2, rTop - 8, rw + 4, 8);
    ctx.strokeRect(rx - 2, rTop - 8, rw + 4, 8);
    ctx.fillRect(rx - 2, height - rBottom, rw + 4, 8);
    ctx.strokeRect(rx - 2, height - rBottom, rw + 4, 8);

    // Simple flat horizontal joints (ancient temple block divisions)
    ctx.strokeStyle = 'rgba(217, 160, 24, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, rTop - 45);
    ctx.lineTo(rx + rw, rTop - 45);
    ctx.moveTo(rx, rTop - 90);
    ctx.lineTo(rx + rw, rTop - 90);
    ctx.moveTo(rx, height - rBottom + 45);
    ctx.lineTo(rx + rw, height - rBottom + 45);
    ctx.moveTo(rx, height - rBottom + 90);
    ctx.lineTo(rx + rw, height - rBottom + 90);
    ctx.stroke();

    // Side gold rivets/decorations at block segments (very low performance footprint, flat graphics)
    ctx.fillStyle = 'rgba(217, 160, 24, 0.70)';
    ctx.beginPath();
    ctx.arc(rx + 3, rTop - 45, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + rw - 3, rTop - 45, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + 3, rTop - 90, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + rw - 3, rTop - 90, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + 3, height - rBottom + 45, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + rw - 3, height - rBottom + 45, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + 3, height - rBottom + 90, 2.5, 0, Math.PI * 2);
    ctx.arc(rx + rw - 3, height - rBottom + 90, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawStructuredCyberpunkPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#0e0b1c';
      ctx.strokeStyle = '#8a2be2';
      ctx.lineWidth = 2.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      if (obs.isLaser) {
        if (obs.laserActive) {
          ctx.fillStyle = 'rgba(255, 0, 127, 0.85)';
          ctx.fillRect(rx + rw * 0.42, rTop, rw * 0.16, height - rTop - rBottom);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx + rw * 0.46, rTop, rw * 0.08, height - rTop - rBottom);
        } else {
          ctx.strokeStyle = 'rgba(255, 0, 127, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(rx + rw * 0.5, rTop);
          ctx.lineTo(rx + rw * 0.5, height - rBottom);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      return;
    }

    // Simple background-friendly dark metallic chassis (static linear gradient)
    const chassisGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    chassisGrad.addColorStop(0, '#0e0b1c');
    chassisGrad.addColorStop(0.5, '#15102a');
    chassisGrad.addColorStop(1, '#0e0b1c');

    ctx.fillStyle = chassisGrad;
    ctx.strokeStyle = '#8a2be2'; // Background-friendly static neon violet outline
    ctx.lineWidth = 2.0;

    // Draw Top Pillar Main Chassis
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);

    // Draw Bottom Pillar Main Chassis
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Simple flat structural joint caps at the safe borders
    ctx.fillStyle = '#8a2be2';
    ctx.fillRect(rx, rTop - 8, rw, 8);
    ctx.fillRect(rx, height - rBottom, rw, 8);

    // Simple static cyber panel divisions for "structured" look (very low performance footprint, no lights)
    ctx.strokeStyle = 'rgba(138, 43, 226, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx, rTop - 45);
    ctx.lineTo(rx + rw, rTop - 45);
    ctx.moveTo(rx, rTop - 90);
    ctx.lineTo(rx + rw, rTop - 90);
    ctx.moveTo(rx, height - rBottom + 45);
    ctx.lineTo(rx + rw, height - rBottom + 45);
    ctx.moveTo(rx, height - rBottom + 90);
    ctx.lineTo(rx + rw, height - rBottom + 90);
    ctx.stroke();

    // Standard Cyberpunk Laser (simple flat rendering, no complex transparency overlays)
    if (obs.isLaser) {
      if (obs.laserActive) {
        ctx.fillStyle = 'rgba(255, 0, 127, 0.85)'; // Solid pink laser
        ctx.fillRect(rx + rw * 0.42, rTop, rw * 0.16, height - rTop - rBottom);
        ctx.fillStyle = '#ffffff'; // White core
        ctx.fillRect(rx + rw * 0.46, rTop, rw * 0.08, height - rTop - rBottom);
      } else {
        // Dotted warning line
        ctx.strokeStyle = 'rgba(255, 0, 127, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(rx + rw * 0.5, rTop);
        ctx.lineTo(rx + rw * 0.5, height - rBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawStructuredIcePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#3b82f6';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Aurora prism gradient and sharp, jagged crystalline facets instead of rectangles!
    const prismGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    prismGrad.addColorStop(0, '#ec4899'); // Pink
    prismGrad.addColorStop(0.5, '#3b82f6'); // Blue
    prismGrad.addColorStop(1, '#06b6d4'); // Cyan
    ctx.fillStyle = prismGrad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;

    // TOP CRYSTAL SPIRE (procedural jagged facets)
    ctx.beginPath();
    ctx.moveTo(rx + 8, -1000);
    ctx.lineTo(rx + 8, rTop - 90);
    ctx.lineTo(rx - 12, rTop - 65); // Jagged left spike
    ctx.lineTo(rx + 16, rTop - 45); // Stepped crystal joint
    ctx.lineTo(rx - 8, rTop - 25);  // Inner left spike
    ctx.lineTo(rx + rw * 0.5, rTop); // Sharp tip!
    ctx.lineTo(rx + rw + 8, rTop - 25);
    ctx.lineTo(rx + rw - 16, rTop - 45);
    ctx.lineTo(rx + rw + 12, rTop - 65); // Jagged right spike
    ctx.lineTo(rx + rw - 8, rTop - 90);
    ctx.lineTo(rx + rw - 8, -1000);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // BOTTOM CRYSTAL SPIRE
    ctx.beginPath();
    ctx.moveTo(rx + 8, height + 1000);
    ctx.lineTo(rx + 8, height - rBottom + 90);
    ctx.lineTo(rx - 12, height - rBottom + 65); // Jagged left spike
    ctx.lineTo(rx + 16, height - rBottom + 45);
    ctx.lineTo(rx - 8, height - rBottom + 25);
    ctx.lineTo(rx + rw * 0.5, height - rBottom); // Sharp tip!
    ctx.lineTo(rx + rw + 8, height - rBottom + 25);
    ctx.lineTo(rx + rw - 16, height - rBottom + 45);
    ctx.lineTo(rx + rw + 12, height - rBottom + 65); // Jagged right spike
    ctx.lineTo(rx + rw - 8, height - rBottom + 90);
    ctx.lineTo(rx + rw - 8, height + 1000);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner ice shine lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.5, rTop - 90); ctx.lineTo(rx + rw * 0.5, rTop);
    ctx.moveTo(rx + rw * 0.5, height - rBottom + 90); ctx.lineTo(rx + rw * 0.5, height - rBottom);
    ctx.stroke();
  }

  private drawStructuredDesertPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Egyptian Tapered Sandstone Pylons!
    const sandGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    sandGrad.addColorStop(0, '#b45309');
    sandGrad.addColorStop(0.5, '#fbbf24');
    sandGrad.addColorStop(1, '#78350f');
    ctx.fillStyle = sandGrad;
    ctx.strokeStyle = '#ef4444'; // Ruby red borders
    ctx.lineWidth = 2.5;

    // TOP COLUMN: Tapered pylon path (slopes inward smoothly)
    ctx.beginPath();
    ctx.moveTo(rx - 10, -1000);
    ctx.lineTo(rx + rw + 10, -1000);
    ctx.lineTo(rx + rw - 8, rTop - 25);
    ctx.lineTo(rx + 8, rTop - 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // BOTTOM COLUMN: Tapered pylon path
    ctx.beginPath();
    ctx.moveTo(rx - 10, height + 1000);
    ctx.lineTo(rx + rw + 10, height + 1000);
    ctx.lineTo(rx + rw - 8, height - rBottom + 25);
    ctx.lineTo(rx + 8, height - rBottom + 25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Flat stepped Egyptian capitals
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(rx + 4, rTop - 25, rw - 8, 12);
    ctx.strokeRect(rx + 4, rTop - 25, rw - 8, 12);
    ctx.fillRect(rx, rTop - 13, rw, 13);
    ctx.strokeRect(rx, rTop - 13, rw, 13);

    ctx.fillRect(rx + 4, height - rBottom + 13, rw - 8, 12);
    ctx.strokeRect(rx + 4, height - rBottom + 13, rw - 8, 12);
    ctx.fillRect(rx, height - rBottom, rw, 13);
    ctx.strokeRect(rx, height - rBottom, rw, 13);

    // Embedded glowing ruby gems
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(rx + rw * 0.5, rTop - 60, 6, 0, Math.PI * 2);
    ctx.arc(rx + rw * 0.5, height - rBottom + 60, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawStructuredVolcanoPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#0a0505';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Basalt staggered columnar joints (bundle of vertical hexagonal joints of different heights)
    ctx.strokeStyle = '#f97316'; // Lava orange
    ctx.lineWidth = 2.5;

    const colW = rw / 3;

    // TOP COLUMN (3 staggered basalt joints)
    // Left joint column (medium height)
    ctx.fillStyle = '#0a0505';
    ctx.fillRect(rx, -1000, colW, rTop + 1000 - 15);
    ctx.strokeRect(rx, -1000, colW, rTop + 1000 - 15);
    // Middle joint column (longest height)
    ctx.fillStyle = '#110505';
    ctx.fillRect(rx + colW, -1000, colW, rTop + 1000);
    ctx.strokeRect(rx + colW, -1000, colW, rTop + 1000);
    // Right joint column (shortest height)
    ctx.fillStyle = '#050101';
    ctx.fillRect(rx + colW * 2, -1000, colW, rTop + 1000 - 30);
    ctx.strokeRect(rx + colW * 2, -1000, colW, rTop + 1000 - 30);

    // BOTTOM COLUMN (staggered joints)
    // Left joint column
    ctx.fillStyle = '#0a0505';
    ctx.fillRect(rx, height - rBottom + 15, colW, rBottom + 1000 - 15);
    ctx.strokeRect(rx, height - rBottom + 15, colW, rBottom + 1000 - 15);
    // Middle joint column (longest height closer to safe gap)
    ctx.fillStyle = '#110505';
    ctx.fillRect(rx + colW, height - rBottom, colW, rBottom + 1000);
    ctx.strokeRect(rx + colW, height - rBottom, colW, rBottom + 1000);
    // Right joint column
    ctx.fillStyle = '#050101';
    ctx.fillRect(rx + colW * 2, height - rBottom + 30, colW, rBottom + 1000 - 30);
    ctx.strokeRect(rx + colW * 2, height - rBottom + 30, colW, rBottom + 1000 - 30);

    // Flowing central superheated yellow magma vein inside the middle column
    const lavaFlow = ctx.createLinearGradient(rx + colW, 0, rx + colW * 2, 0);
    lavaFlow.addColorStop(0, '#f97316');
    lavaFlow.addColorStop(0.5, '#facc15'); // Yellow core
    lavaFlow.addColorStop(1, '#ea580c');
    ctx.fillStyle = lavaFlow;
    ctx.fillRect(rx + colW + 4, -1000, colW - 8, rTop + 1000);
    ctx.fillRect(rx + colW + 4, height - rBottom, colW - 8, rBottom + 1000);
  }

  private drawStructuredSpaceObstacles(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#15062b';
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Dark space-alloy obelisk body
    const spaceGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    spaceGrad.addColorStop(0, '#020005');
    spaceGrad.addColorStop(0.4, '#15062b');
    spaceGrad.addColorStop(0.7, '#0d021f');
    spaceGrad.addColorStop(1, '#000000');

    ctx.fillStyle = spaceGrad;
    ctx.strokeStyle = '#a855f7'; // Neon purple outline
    ctx.lineWidth = 2.5;

    // TOP COLUMN: Quantum Monolith (Stepped height)
    ctx.fillRect(rx, -1000, rw, rTop + 1000 - 30);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000 - 30);

    // BOTTOM COLUMN: Quantum Monolith
    ctx.fillRect(rx, height - rBottom + 30, rw, rBottom + 1000 - 30);
    ctx.strokeRect(rx, height - rBottom + 30, rw, rBottom + 1000 - 30);

    // 1. Central glowing quantum energy conduits
    ctx.save();
    ctx.fillStyle = '#3b82f6'; // Bright blue core
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#3b82f6';
    }
    ctx.fillRect(rx + rw * 0.42, -1000, rw * 0.16, rTop + 1000 - 30);
    ctx.fillRect(rx + rw * 0.42, height - rBottom + 30, rw * 0.16, rBottom + 1000 - 30);
    ctx.restore();

    // 2. Stepped warp-gate node capitals at safe boundaries
    const nodeGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    nodeGrad.addColorStop(0, '#a855f7');
    nodeGrad.addColorStop(0.5, '#ffffff'); // bright core
    nodeGrad.addColorStop(1, '#3b82f6');
    ctx.fillStyle = nodeGrad;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.0;

    // Top stepped nodes
    ctx.fillRect(rx - 8, rTop - 30, rw + 16, 12);
    ctx.strokeRect(rx - 8, rTop - 30, rw + 16, 12);
    ctx.fillRect(rx - 4, rTop - 18, rw + 8, 18);
    ctx.strokeRect(rx - 4, rTop - 18, rw + 8, 18);

    // Bottom stepped nodes
    ctx.fillRect(rx - 8, height - rBottom + 18, rw + 16, 12);
    ctx.strokeRect(rx - 8, height - rBottom + 18, rw + 16, 12);
    ctx.fillRect(rx - 4, height - rBottom, rw + 8, 18);
    ctx.strokeRect(rx - 4, height - rBottom, rw + 8, 18);
  }

  private drawStructuredUnderwaterPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#081e26';
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Atlantis fluted ruins columns: Broken Greek columns shifted horizontally!
    ctx.fillStyle = '#081e26';
    ctx.strokeStyle = '#ec4899'; // Coral pink
    ctx.lineWidth = 2.5;

    // TOP COLUMN: broken at rTop - 60, offset left by 8px, right by 8px
    // 1. Far base segment (shifted left)
    ctx.fillRect(rx - 8, -1000, rw, rTop + 1000 - 60);
    ctx.strokeRect(rx - 8, -1000, rw, rTop + 1000 - 60);
    // 2. Inner crown segment (shifted right)
    ctx.fillRect(rx + 8, rTop - 60, rw, 60);
    ctx.strokeRect(rx + 8, rTop - 60, rw, 60);

    // BOTTOM COLUMN: broken at height - rBottom + 60, offset right by 8px, left by 8px
    // 1. Far base segment (shifted right)
    ctx.fillRect(rx + 8, height - rBottom + 60, rw, rBottom + 1000 - 60);
    ctx.strokeRect(rx + 8, height - rBottom + 60, rw, rBottom + 1000 - 60);
    // 2. Inner crown segment (shifted left)
    ctx.fillRect(rx - 8, height - rBottom, rw, 60);
    ctx.strokeRect(rx - 8, height - rBottom, rw, 60);

    // Bioluminescent coral polyps
    ctx.fillStyle = '#f472b6';
    ctx.beginPath();
    ctx.arc(rx + 12, rTop - 25, 6, 0, Math.PI * 2);
    ctx.arc(rx + rw - 15, height - rBottom + 35, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawStructuredHeavenPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 3;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    // Winged angelic marble columns with flaring gold wing-arches
    const heavGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    heavGrad.addColorStop(0, '#fcd34d');
    heavGrad.addColorStop(0.3, '#ffffff');
    heavGrad.addColorStop(0.7, '#ffffff');
    heavGrad.addColorStop(1, '#a7f3d0');
    ctx.fillStyle = heavGrad;
    ctx.strokeStyle = '#fcd34d'; // Shiny gold
    ctx.lineWidth = 3;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Fluted grooved lines
    ctx.strokeStyle = 'rgba(252, 211, 77, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.33, -1000); ctx.lineTo(rx + rw * 0.33, rTop);
    ctx.moveTo(rx + rw * 0.66, -1000); ctx.lineTo(rx + rw * 0.66, rTop);
    ctx.moveTo(rx + rw * 0.33, height - rBottom); ctx.lineTo(rx + rw * 0.33, height + 1000);
    ctx.moveTo(rx + rw * 0.66, height - rBottom); ctx.lineTo(rx + rw * 0.66, height + 1000);
    ctx.stroke();

    // Grand flaring semi-circular gold wing-arches at safe gap caps!
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath();
    // Top wing-arch flaring outwards
    ctx.arc(rx + rw * 0.5, rTop - 12, rw * 0.7, Math.PI, 0, false);
    ctx.lineTo(rx + rw, rTop);
    ctx.lineTo(rx, rTop);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    // Bottom wing-arch flaring outwards
    ctx.arc(rx + rw * 0.5, height - rBottom + 12, rw * 0.7, 0, Math.PI, false);
    ctx.lineTo(rx, height - rBottom);
    ctx.lineTo(rx + rw, height - rBottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Draw Jungle Temple Pillars (Standard & Mutated)
  private drawJungleTemplePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#434e44';
      ctx.strokeStyle = '#0e120f';
      ctx.lineWidth = 3.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    const stoneGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    stoneGrad.addColorStop(0, '#384339');
    stoneGrad.addColorStop(0.3, '#5c6b5d');
    stoneGrad.addColorStop(0.7, '#434e44');
    stoneGrad.addColorStop(1, '#1e241f');

    ctx.fillStyle = stoneGrad;
    ctx.strokeStyle = '#0e120f';
    ctx.lineWidth = 3.0;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    ctx.strokeStyle = '#0e120f';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(rx, rTop - 60);
    ctx.lineTo(rx + rw * 0.4, rTop - 45);
    ctx.lineTo(rx + rw * 0.35, rTop - 90);
    ctx.moveTo(rx + rw * 0.6, rTop - 120);
    ctx.lineTo(rx + rw, rTop - 140);
    ctx.moveTo(rx, height - rBottom + 80);
    ctx.lineTo(rx + rw * 0.5, height - rBottom + 60);
    ctx.lineTo(rx + rw * 0.7, height - rBottom + 110);
    ctx.stroke();

    ctx.save();
    if (obs.isMutated) {
      ctx.strokeStyle = '#00ffaa';
      if (!(window as any).gameDisableShadows) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ffaa';
      }
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.8;
    }

    ctx.beginPath();
    ctx.arc(rx + rw * 0.5, rTop - 80, 12, 0, Math.PI * 2);
    ctx.moveTo(rx + rw * 0.35, rTop - 80);
    ctx.lineTo(rx + rw * 0.65, rTop - 80);
    ctx.moveTo(rx + rw * 0.5, rTop - 95);
    ctx.lineTo(rx + rw * 0.5, rTop - 65);
    ctx.arc(rx + rw * 0.5, height - rBottom + 80, 12, 0, Math.PI * 2);
    ctx.moveTo(rx + rw * 0.35, height - rBottom + 80);
    ctx.lineTo(rx + rw * 0.65, height - rBottom + 80);
    ctx.moveTo(rx + rw * 0.5, height - rBottom + 65);
    ctx.lineTo(rx + rw * 0.5, height - rBottom + 95);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#1b4d22';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(rx - 2, rTop - 10);
    ctx.quadraticCurveTo(rx + rw * 0.4, rTop - 30, rx + rw * 0.7, rTop - 15);
    ctx.quadraticCurveTo(rx + rw * 0.9, rTop - 2, rx + rw + 2, rTop - 25);
    ctx.moveTo(rx - 2, height - rBottom + 25);
    ctx.quadraticCurveTo(rx + rw * 0.3, height - rBottom + 10, rx + rw * 0.6, height - rBottom + 30);
    ctx.quadraticCurveTo(rx + rw * 0.8, height - rBottom + 45, rx + rw + 2, height - rBottom + 15);
    ctx.stroke();

    ctx.fillStyle = '#2d7a3c';
    ctx.beginPath();
    ctx.arc(rx + 15, rTop - 26, 6, 0, Math.PI * 2);
    ctx.arc(rx + 35, rTop - 22, 5, 0, Math.PI * 2);
    ctx.arc(rx + rw - 20, rTop - 16, 6, 0, Math.PI * 2);
    ctx.arc(rx + 25, height - rBottom + 20, 5, 0, Math.PI * 2);
    ctx.arc(rx + rw - 30, height - rBottom + 32, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a2212';
    ctx.fillRect(rx, rTop - 12, rw, 12);
    ctx.fillRect(rx, height - rBottom, rw, 12);
  }

  // Draw Jungle Temple Structured Stepped Pillars (Score 50-70)
  private drawStructuredJungleTemplePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const isPerformance = (window as any).gameDisableShadows;
    if (isPerformance) {
      ctx.fillStyle = '#344237';
      ctx.strokeStyle = '#0a0d0b';
      ctx.lineWidth = 3.0;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      return;
    }

    const stoneGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    stoneGrad.addColorStop(0, '#2d382f');
    stoneGrad.addColorStop(0.3, '#435446');
    stoneGrad.addColorStop(0.7, '#344237');
    stoneGrad.addColorStop(1, '#1b241e');

    ctx.fillStyle = stoneGrad;
    ctx.strokeStyle = '#0a0d0b';
    ctx.lineWidth = 3.0;

    ctx.beginPath();
    for (let y = rTop - 150; y < rTop - 20; y += 45) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    for (let y = height - rBottom + 45; y < height - rBottom + 150; y += 45) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#d4af37';
    ctx.fillRect(rx + rw * 0.42, rTop - 120, rw * 0.16, 12);
    ctx.fillRect(rx + rw * 0.42, rTop - 75, rw * 0.16, 12);
    ctx.fillRect(rx + rw * 0.42, height - rBottom + 70, rw * 0.16, 12);
    ctx.fillRect(rx + rw * 0.42, height - rBottom + 115, rw * 0.16, 12);

    const goldGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    goldGrad.addColorStop(0, '#cda225');
    goldGrad.addColorStop(0.5, '#fef08a');
    goldGrad.addColorStop(1, '#aa7e18');
    ctx.fillStyle = goldGrad;
    ctx.strokeStyle = '#0a0d0b';
    ctx.lineWidth = 2.5;

    ctx.fillRect(rx - 8, rTop - 36, rw + 16, 12);
    ctx.strokeRect(rx - 8, rTop - 36, rw + 16, 12);
    ctx.fillRect(rx - 4, rTop - 24, rw + 8, 12);
    ctx.strokeRect(rx - 4, rTop - 24, rw + 8, 12);
    ctx.fillRect(rx - 1, rTop - 12, rw + 2, 12);
    ctx.strokeRect(rx - 1, rTop - 12, rw + 2, 12);

    ctx.fillRect(rx - 8, height - rBottom + 24, rw + 16, 12);
    ctx.strokeRect(rx - 8, height - rBottom + 24, rw + 16, 12);
    ctx.fillRect(rx - 4, height - rBottom + 12, rw + 8, 12);
    ctx.strokeRect(rx - 4, height - rBottom + 12, rw + 8, 12);
    ctx.fillRect(rx - 1, height - rBottom, rw + 2, 12);
    ctx.strokeRect(rx - 1, height - rBottom, rw + 2, 12);

    ctx.strokeStyle = '#22542a';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(rx - 8, rTop - 30);
    ctx.lineTo(rx + rw + 8, rTop - 30);
    ctx.moveTo(rx - 8, height - rBottom + 30);
    ctx.lineTo(rx + rw + 8, height - rBottom + 30);
    ctx.stroke();
  }


}
