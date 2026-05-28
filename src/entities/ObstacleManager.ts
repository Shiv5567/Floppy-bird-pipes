
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
  private currentScore = 0;
  private waveTime = 0;
  private nextSpawnDistance = 350;
  private lastTopHeight: number | null = null;

  private activeLevelConfig: any = null;
  private currentPatternIdx = 0;

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
    this.currentPatternIdx = 0;
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
    this.currentPatternIdx = 0;
    this.currentScore = 0;
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
    this.currentScore = score;
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
      this.nextSpawnDistance = this.activeLevelConfig ? this.obstacleWidth : targetDistance;
    }

    // Update existing obstacles
    for (let i = this.list.length - 1; i >= 0; i--) {
      const obs = this.list[i];
      obs.x -= actualScrollSpeed;

      // LEVEL CREATIVE PIPE ANIMATION SYSTEM
      if (obs.levelNum !== undefined && obs.patternType) {
        obs.shakeX = 0;
        obs.shakeX2 = 0;

        // Proximity & Anticipation check
        if (_birdX !== undefined) {
          const dx = obs.x - _birdX;
          if (!obs.isTriggered) {
            if (dx <= obs.triggerDistance!) {
              obs.isTriggered = true;
              obs.animTimer = 0;
              // Spawn entry theme particles
              if (_particleEngine) {
                const particleCount = (obs.levelNum === 22 || obs.levelNum === 30) ? 20 : 10;
                for (let k = 0; k < particleCount; k++) {
                  const px = obs.x + Math.random() * obs.width;
                  const py = height / 2 + (Math.random() - 0.5) * 40;
                  const pColor = obs.worldId === 'cyberpunk' ? '#ff007f' : obs.worldId === 'ice' ? '#e0ffff' : '#ffaa00';
                  _particleEngine.spawn(
                    px, py,
                    -scrollSpeed * 0.5 + (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 3,
                    pColor,
                    2.0 + Math.random() * 2.5,
                    1.0,
                    0.03,
                    'spark'
                  );
                }
              }
            } else if (dx <= obs.triggerDistance! + 100) {
              // Anticipation nudge warning: slight horizontal visual compression
              const anticipationRatio = (obs.triggerDistance! + 100 - dx) / 100;
              const nudge = Math.sin(anticipationRatio * Math.PI) * 4;
              obs.topHeight = obs.closedTopHeight! + nudge;
              obs.bottomHeight = obs.closedBottomHeight! + nudge;
            } else {
              obs.topHeight = obs.closedTopHeight!;
              obs.bottomHeight = obs.closedBottomHeight!;
            }
          }
        }

        if (obs.isTriggered) {
          obs.animTimer! += deltaTime * timeScale;
          if (obs.animTimer! > obs.animDuration!) {
            obs.animTimer = obs.animDuration!;
          }

          const progress = obs.animTimer! / obs.animDuration!;
          // Soft elastic easing open
          const c4 = (2 * Math.PI) / 3;
          const easedOpen = progress === 0 ? 0 : progress === 1 ? 1 : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;

          // Choreographed patterns
          if (obs.patternType === 'wave_10') {
            const centerY = height / 2 + Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.5) * 55;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'breathing_12') {
            const centerY = obs.spawnCenterY!;
            const currentGap = obs.gapHeight! + Math.sin(this.waveTime * 2.5) * 30;
            obs.targetTopHeight = centerY - currentGap / 2;
            obs.targetBottomHeight = height - centerY - currentGap / 2;
          } else if (obs.patternType === 'moving_stair_15') {
            const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 1.8 + obs.obstacleIdx! * 0.3) * 40;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'rotating_17') {
            const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 1.5 + obs.obstacleIdx! * 0.5) * 35;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'dynamic_w_18') {
            const centerY = height / 2 + Math.sin(this.waveTime * 2.2 + obs.obstacleIdx! * 0.6) * 50;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'exp_shrink_19') {
            const centerY = obs.spawnCenterY!;
            const currentGap = obs.gapHeight! + Math.sin(this.waveTime * 4.0) * 25;
            obs.targetTopHeight = centerY - currentGap / 2;
            obs.targetBottomHeight = height - centerY - currentGap / 2;
          } else if (obs.patternType === 'hybrid_20') {
            const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.4) * 45;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'snake_21') {
            const centerY = height / 2 + Math.sin((obs.x * 0.008) - this.waveTime * 3.5) * 75;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'pulse_22') {
            const centerY = obs.spawnCenterY!;
            const currentGap = obs.gapHeight! + Math.sin(this.waveTime * 3.0) * 35;
            obs.targetTopHeight = centerY - currentGap / 2;
            obs.targetBottomHeight = height - centerY - currentGap / 2;
          } else if (obs.patternType === 'gravity_23') {
            const shiftCycle = Math.floor(this.waveTime / 3.0);
            const shiftProgress = (this.waveTime % 3.0) / 3.0;
            const shiftEase = Math.sin(shiftProgress * Math.PI / 2);
            const dir = shiftCycle % 2 === 0 ? 1 : -1;
            const shiftAmt = 55 * dir * shiftEase;
            obs.targetTopHeight = (obs.spawnCenterY! - obs.gapHeight! / 2) + shiftAmt;
            obs.targetBottomHeight = (height - obs.spawnCenterY! - obs.gapHeight! / 2) - shiftAmt;
          } else if (obs.patternType === 'rotating_24') {
            const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 1.5 + obs.obstacleIdx! * 0.6) * 30;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'waterfall_25') {
            const totalSpan = 240;
            const offset = ((obs.obstacleIdx! * 45 - this.waveTime * 80) % totalSpan) - totalSpan / 2;
            const centerY = height / 2 + offset;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'elevator_26') {
            const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 2.8 + (obs.obstacleIdx! % 2) * Math.PI) * 65;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'magnetic_27') {
            const pulseVal = Math.sin(this.waveTime * 3.5 + obs.obstacleIdx! * 0.8) * 30;
            const currentGap = obs.gapHeight! + pulseVal;
            obs.targetTopHeight = obs.spawnCenterY! - currentGap / 2;
            obs.targetBottomHeight = height - obs.spawnCenterY! - currentGap / 2;
          } else if (obs.patternType === 'pendulum_28') {
            const angle = Math.sin(this.waveTime * 2.2 + obs.obstacleIdx! * 0.4) * 0.40;
            const swingDrop = (1 - Math.cos(angle)) * 60;
            const centerY = obs.spawnCenterY! + swingDrop;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            obs.shakeX = Math.sin(angle) * 35;
            obs.shakeX2 = Math.sin(angle) * 35;
          } else if (obs.patternType === 'sliding_29') {
            const slideVal = Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.5) * 40;
            obs.shakeX = slideVal;
            obs.shakeX2 = slideVal;
            const centerY = obs.spawnCenterY!;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'boss_30') {
            const waveVal = Math.sin(this.waveTime * 3.2) * 35;
            const pulseVal = Math.sin(this.waveTime * 5.0) * 15;
            const stairVal = (obs.obstacleIdx! % 6) * 12 - 36;
            const centerY = height / 2 + waveVal + stairVal;
            const currentGap = obs.gapHeight! + pulseVal;
            obs.targetTopHeight = centerY - currentGap / 2;
            obs.targetBottomHeight = height - centerY - currentGap / 2;
          }

          // Smooth reveal interpolation
          obs.topHeight = obs.closedTopHeight! + (obs.targetTopHeight! - obs.closedTopHeight!) * easedOpen;
          obs.bottomHeight = obs.closedBottomHeight! + (obs.targetBottomHeight! - obs.closedBottomHeight!) * easedOpen;

          // Spawn active movement particle trails
          if (_particleEngine && Math.random() < 0.12) {
            const pxTop = obs.x + Math.random() * obs.width;
            const pyTop = obs.topHeight;
            const pxBot = obs.x + Math.random() * obs.width;
            const pyBot = height - obs.bottomHeight;

            let pColor = '#ff5a00';
            let pShape: 'circle' | 'square' | 'snowflake' | 'star' | 'bubble' | 'spark' = 'spark';
            let pGlow = false;
            let pGlowColor = undefined;

            if (obs.worldId === 'jungle' || obs.worldId === 'jungle_temple') {
              pColor = Math.random() < 0.5 ? '#228b22' : '#39ff14';
              pShape = 'spark';
            } else if (obs.worldId === 'cyberpunk') {
              pColor = Math.random() < 0.5 ? '#ff007f' : '#00f3ff';
              pShape = 'spark';
              pGlow = true;
              pGlowColor = 'rgba(255, 0, 127, 0.4)';
            } else if (obs.worldId === 'ice') {
              pColor = '#ffffff';
              pShape = 'snowflake';
            } else if (obs.worldId === 'desert') {
              pColor = '#d2b48c';
              pShape = 'spark';
            } else if (obs.worldId === 'volcano') {
              pColor = '#ff4500';
              pShape = 'circle';
              pGlow = true;
              pGlowColor = 'rgba(255, 69, 0, 0.4)';
            } else if (obs.worldId === 'space') {
              pColor = '#da70d6';
              pShape = 'star';
            } else if (obs.worldId === 'heaven') {
              pColor = '#ffd700';
              pShape = 'star';
              pGlow = true;
              pGlowColor = 'rgba(255, 215, 0, 0.3)';
            } else if (obs.worldId === 'retro') {
              pColor = '#73c93e';
              pShape = 'square';
            }

            _particleEngine.spawn(
              pxTop, pyTop,
              -scrollSpeed * 0.4 + (Math.random() - 0.5) * 1.0,
              (Math.random() - 0.5) * 1.5,
              pColor,
              2.0 + Math.random() * 2.0,
              0.9,
              0.02 + Math.random() * 0.02,
              pShape,
              pGlow,
              pGlowColor
            );

            _particleEngine.spawn(
              pxBot, pyBot,
              -scrollSpeed * 0.4 + (Math.random() - 0.5) * 1.0,
              (Math.random() - 0.5) * 1.5,
              pColor,
              2.0 + Math.random() * 2.0,
              0.9,
              0.02 + Math.random() * 0.02,
              pShape,
              pGlow,
              pGlowColor
            );
          }
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

      // Determine next spawn distance: Connected cavern spacing segments (0 distance horizontally) for all Levels in Level Mode
      if (this.activeLevelConfig) {
        this.nextSpawnDistance = this.obstacleWidth; // 0 horizontal distance between pipes!
      } else {
        const baseDistanceClassic = (width / 1.35) * 0.80;
        const defaultDistance = baseDistanceClassic * 1.15;
        if (difficulty === 'easy') {
          this.nextSpawnDistance = defaultDistance * 1.20;
        } else {
          this.nextSpawnDistance = defaultDistance;
        }
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
    if (this.activeLevelConfig) {
      const levelNum = this.activeLevelConfig.levelNum;
      const patternsList = this.activeLevelConfig.patterns;
      const patternType = patternsList[this.currentPatternIdx % patternsList.length];
      const obstacleIdx = this.currentPatternIdx;
      this.currentPatternIdx++;

      let targetCenterY = height / 2;
      
      if (patternType === 'wave_10') {
        const step = obstacleIdx % 12;
        targetCenterY = height / 2 + Math.sin(step * (Math.PI * 2 / 12)) * 55;
      } else if (patternType === 'moving_stair_15') {
        const offsets = [80, 40, 0, -40, -80, -40, 0, 40];
        targetCenterY = height / 2 + offsets[obstacleIdx % offsets.length];
      } else if (patternType === 'dynamic_w_18') {
        const offsets = [-80, -40, 0, 40, 80, 40, 0, -40];
        targetCenterY = height / 2 + offsets[obstacleIdx % offsets.length];
      } else if (patternType === 'hybrid_20') {
        const offsets = [-60, -30, 0, 30, 60, 30, 0, -30];
        targetCenterY = height / 2 + offsets[obstacleIdx % offsets.length];
      } else if (patternType === 'waterfall_25') {
        const offsets = [-80, -40, 0, 40, 80, 80, 40, 0, -40, -80];
        targetCenterY = height / 2 + offsets[obstacleIdx % offsets.length];
      } else if (patternType === 'elevator_26') {
        targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -70 : 70);
      } else if (patternType === 'sliding_29') {
        const offsets = [-50, 0, 50, 0];
        targetCenterY = height / 2 + offsets[obstacleIdx % offsets.length];
      }

      // Safeguard boundaries
      const minCenterY = 75 + gapHeight / 2;
      const maxCenterY = height - 75 - gapHeight / 2;
      targetCenterY = Math.max(minCenterY, Math.min(maxCenterY, targetCenterY));

      const targetTopHeight = targetCenterY - gapHeight / 2;
      const targetBottomHeight = height - targetCenterY - gapHeight / 2;

      // Close the gaps initially with a 30px visual slit
      const closedTopHeight = targetCenterY - 15;
      const closedBottomHeight = height - targetCenterY - 15;

      const isMutated = (levelNum % 2 === 0);
      const isStructured = (levelNum % 3 === 0);

      this.list.push(this.acquireObstacle({
        x: width + 50,
        width: this.obstacleWidth,
        topHeight: closedTopHeight, // starts closed
        bottomHeight: closedBottomHeight,
        passed: false,
        worldId,
        isMoving: true, // active dynamic pattern
        movingDir: Math.random() > 0.5 ? 1 : -1,
        speedY: 0.4 + Math.random() * 0.6,
        rangeY: difficulty === 'hard' ? 70 : (difficulty === 'easy' ? 30 : 50),
        initialTopHeight: closedTopHeight,
        initialBottomHeight: closedBottomHeight,
        isLaser: (worldId === 'cyberpunk' && Math.random() < 0.35),
        laserActive: true,
        laserTimer: 0,
        isMutated,
        isStructured,
        
        patternType,
        isTriggered: false, // starts closed, reactive approach opens it
        animTimer: 0,
        animDuration: 0.45,
        triggerDistance: 220,
        closedTopHeight,
        closedBottomHeight,
        targetTopHeight,
        targetBottomHeight,
        levelNum,
        shakeX: 0,
        shakeX2: 0,
        gapHeight,
        spawnCenterY: targetCenterY,
        obstacleIdx
      }));
      return;
    }

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
        } else if (obs.isStructured || (this.currentScore >= 50 && this.currentScore <= 70)) {
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

      // Pulsing neon gap-border glow along inner lips of moving Level columns
      if (obs.levelNum !== undefined && obs.isMoving) {
        const topShift = obs.shakeX || 0;
        const bottomShift = obs.shakeX2 !== undefined ? obs.shakeX2 : (obs.shakeX || 0);
        const leftTop = obs.x + topShift;
        const rightTop = obs.x + obs.width + topShift;
        const leftBottom = obs.x + bottomShift;
        const rightBottom = obs.x + obs.width + bottomShift;

        // Pulsing glow width and blur
        const pulse = 3.5 + Math.sin(this.waveTime * 5.0) * 1.5;
        const isPerformance = (window as any).gameDisableShadows;

        let glowColor = '#39ff14';
        if (obs.worldId === 'cyberpunk') glowColor = '#ff007f';
        else if (obs.worldId === 'ice') glowColor = '#00f3ff';
        else if (obs.worldId === 'desert') glowColor = '#fbbf24';
        else if (obs.worldId === 'volcano') glowColor = '#ff4500';
        else if (obs.worldId === 'space') glowColor = '#da70d6';
        else if (obs.worldId === 'heaven') glowColor = '#ffd700';
        else if (obs.worldId === 'retro') glowColor = '#73c93e';

        ctx.save();
        if (!isPerformance) {
          ctx.shadowBlur = 12 + Math.sin(this.waveTime * 5.0) * 4;
          ctx.shadowColor = glowColor;
        }
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = pulse;
        ctx.lineCap = 'round';

        // Draw top lip inner border line
        ctx.beginPath();
        ctx.moveTo(leftTop, obs.topHeight);
        ctx.lineTo(rightTop, obs.topHeight);
        ctx.stroke();

        // Draw bottom lip inner border line
        ctx.beginPath();
        ctx.moveTo(leftBottom, height - obs.bottomHeight);
        ctx.lineTo(rightBottom, height - obs.bottomHeight);
        ctx.stroke();
        ctx.restore();
      }

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
        ctx.lineWidth = 3.5;
        ctx.fillRect(rx, -1000, rw, rTop + 1000);
        ctx.strokeRect(rx, -1000, rw, rTop + 1000);
        ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
        ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(rx - 4, rTop - 20, rw + 8, 20);
        ctx.strokeRect(rx - 4, rTop - 20, rw + 8, 20);
        ctx.fillRect(rx - 4, height - rBottom, rw + 8, 20);
        ctx.strokeRect(rx - 4, height - rBottom, rw + 8, 20);
        return;
      }

      // Premium 3D cylindrical gradient for the body
      const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bodyGrad.addColorStop(0, '#0b132b');
      bodyGrad.addColorStop(0.3, '#1c2541');
      bodyGrad.addColorStop(0.6, '#5bc0be'); // Metallic turquoise highlight
      bodyGrad.addColorStop(0.8, '#3a506b');
      bodyGrad.addColorStop(1, '#0b132b');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#3a506b';
      ctx.lineWidth = 3;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Gold-ribbon joint grooves
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.3, -1000);
      ctx.lineTo(rx + rw * 0.3, rTop - 24);
      ctx.moveTo(rx + rw * 0.7, -1000);
      ctx.lineTo(rx + rw * 0.7, rTop - 24);
      ctx.moveTo(rx + rw * 0.3, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.3, height + 1000);
      ctx.moveTo(rx + rw * 0.7, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.7, height + 1000);
      ctx.stroke();

      // Ornate Gold Caps on upper & lower surfaces
      const capY1 = rTop - 24;
      const capY2 = height - rBottom;

      const goldGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
      goldGrad.addColorStop(0, '#b45309'); // bronze-gold shadow
      goldGrad.addColorStop(0.3, '#d97706');
      goldGrad.addColorStop(0.5, '#fef08a'); // golden reflection core
      goldGrad.addColorStop(0.8, '#d97706');
      goldGrad.addColorStop(1, '#78350f');
      ctx.fillStyle = goldGrad;
      ctx.strokeStyle = '#1e1b4b'; // dark blue contrast border
      ctx.lineWidth = 3.5;

      // Top Cap
      ctx.fillRect(rx - 6, capY1, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
      // Bottom Cap
      ctx.fillRect(rx - 6, capY2, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

      // Add elegant rivets on the gold caps
      ctx.fillStyle = '#1e293b'; // Steel color rivets
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.0;
      const rivetSpacing = (rw + 12) / 4;
      for (let j = 1; j < 4; j++) {
        const rivetX = rx - 6 + j * rivetSpacing;
        ctx.beginPath();
        ctx.arc(rivetX, capY1 + 12, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(rivetX, capY2 + 12, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      // Classic emerald forest green with bright cylindrical highlight
      if (isPerformance) {
        ctx.fillStyle = '#336633';
        ctx.strokeStyle = '#0e240e';
        ctx.lineWidth = 3;
        ctx.fillRect(rx, -1000, rw, rTop + 1000);
        ctx.strokeRect(rx, -1000, rw, rTop + 1000);
        ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
        ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

        ctx.fillStyle = '#55a855';
        ctx.fillRect(rx - 4, rTop - 20, rw + 8, 20);
        ctx.strokeRect(rx - 4, rTop - 20, rw + 8, 20);
        ctx.fillRect(rx - 4, height - rBottom, rw + 8, 20);
        ctx.strokeRect(rx - 4, height - rBottom, rw + 8, 20);
        return;
      }

      // Smooth multi-stop green cylindrical gradient
      const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bodyGrad.addColorStop(0, '#0a230a');
      bodyGrad.addColorStop(0.3, '#276227');
      bodyGrad.addColorStop(0.5, '#73e673'); // bright cylindrical specular highlight
      bodyGrad.addColorStop(0.7, '#1b4d1b');
      bodyGrad.addColorStop(1, '#051205');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#0e240e';
      ctx.lineWidth = 3;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Add vertical pipe groove lines
      ctx.strokeStyle = '#081708';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.25, -1000);
      ctx.lineTo(rx + rw * 0.25, rTop - 22);
      ctx.moveTo(rx + rw * 0.75, -1000);
      ctx.lineTo(rx + rw * 0.75, rTop - 22);
      ctx.moveTo(rx + rw * 0.25, height - rBottom + 22);
      ctx.lineTo(rx + rw * 0.25, height + 1000);
      ctx.moveTo(rx + rw * 0.75, height - rBottom + 22);
      ctx.lineTo(rx + rw * 0.75, height + 1000);
      ctx.stroke();

      // Flanged coupling caps with bright green reflection lip
      const capY1 = rTop - 22;
      const capY2 = height - rBottom;

      const capGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
      capGrad.addColorStop(0, '#123512');
      capGrad.addColorStop(0.3, '#3ca63c');
      capGrad.addColorStop(0.5, '#a3ffa3'); // bright reflection core
      capGrad.addColorStop(0.8, '#267326');
      capGrad.addColorStop(1, '#091c09');

      ctx.fillStyle = capGrad;
      ctx.strokeStyle = '#061406';
      ctx.lineWidth = 3.5;

      // Top Cap
      ctx.fillRect(rx - 6, capY1, rw + 12, 22);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 22);
      // Bottom Cap
      ctx.fillRect(rx - 6, capY2, rw + 12, 22);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 22);

      // Embedded shiny golden rivets for industrial feel
      ctx.fillStyle = '#ffd700';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffd700';
      const rivetSpacing = (rw + 12) / 3;
      for (let j = 1; j < 3; j++) {
        const rxPos = rx - 6 + j * rivetSpacing;
        ctx.beginPath();
        ctx.arc(rxPos, capY1 + 11, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(rxPos, capY2 + 11, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
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

      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(rx - 4, rTop - 20, rw + 8, 20);
      ctx.fillRect(rx - 4, height - rBottom, rw + 8, 20);
      return;
    }

    if (obs.isMutated) {
      // Vaporwave retro gradient
      const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bodyGrad.addColorStop(0, '#581c87'); // deep purple
      bodyGrad.addColorStop(0.5, '#db2777'); // vibrant hot pink
      bodyGrad.addColorStop(1, '#3b0764');
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#06b6d4'; // Cyan outline
      ctx.lineWidth = 3.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Vaporwave vertical grid lines
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.25, -1000);
      ctx.lineTo(rx + rw * 0.25, rTop - 24);
      ctx.moveTo(rx + rw * 0.5, -1000);
      ctx.lineTo(rx + rw * 0.5, rTop - 24);
      ctx.moveTo(rx + rw * 0.75, -1000);
      ctx.lineTo(rx + rw * 0.75, rTop - 24);

      ctx.moveTo(rx + rw * 0.25, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.25, height + 1000);
      ctx.moveTo(rx + rw * 0.5, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.5, height + 1000);
      ctx.moveTo(rx + rw * 0.75, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.75, height + 1000);
      ctx.stroke();

      // Vaporwave retro horizontal gridlines
      ctx.beginPath();
      for (let y = rTop - 120; y < rTop - 24; y += 24) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      for (let y = height - rBottom + 24; y < height - rBottom + 120; y += 24) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      ctx.stroke();

      // Blinking neon arcade cap on upper & lower surfaces
      const capY1 = rTop - 24;
      const capY2 = height - rBottom;

      const capGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
      capGrad.addColorStop(0, '#06b6d4');
      capGrad.addColorStop(0.5, '#ffffff'); // bright neon white core
      capGrad.addColorStop(1, '#0891b2');

      ctx.fillStyle = capGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3.0;

      // Top Cap
      ctx.fillRect(rx - 6, capY1, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
      // Bottom Cap
      ctx.fillRect(rx - 6, capY2, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

      // Blinking red/green neon lights on surface
      const blinkColor = Math.sin((obs.x || 0) * 0.12) > 0 ? '#f43f5e' : '#10b981';
      ctx.fillStyle = blinkColor;
      ctx.fillRect(rx + rw / 2 - 6, capY1 + 7, 12, 10);
      ctx.fillRect(rx + rw / 2 - 6, capY2 + 7, 12, 10);
      ctx.strokeRect(rx + rw / 2 - 6, capY1 + 7, 12, 10);
      ctx.strokeRect(rx + rw / 2 - 6, capY2 + 7, 12, 10);
    } else {
      // 8-bit retro green grid body with shiny cylindrical highlight
      const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bodyGrad.addColorStop(0, '#1b5e20');
      bodyGrad.addColorStop(0.3, '#73c93e'); // Classic Mario green
      bodyGrad.addColorStop(0.5, '#a3e635'); // Bright highlight band
      bodyGrad.addColorStop(0.8, '#387c12');
      bodyGrad.addColorStop(1, '#0f3204');

      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#000000'; // Classic black outline
      ctx.lineWidth = 3.5;

      // Top column
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      // Bottom column
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Retro brick divisions
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      // vertical lines
      ctx.moveTo(rx + rw * 0.33, -1000);
      ctx.lineTo(rx + rw * 0.33, rTop - 24);
      ctx.moveTo(rx + rw * 0.66, -1000);
      ctx.lineTo(rx + rw * 0.66, rTop - 24);
      ctx.moveTo(rx + rw * 0.33, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.33, height + 1000);
      ctx.moveTo(rx + rw * 0.66, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.66, height + 1000);

      // horizontal lines
      for (let y = rTop - 120; y < rTop - 24; y += 30) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      for (let y = height - rBottom + 24; y < height - rBottom + 120; y += 30) {
        ctx.moveTo(rx, y);
        ctx.lineTo(rx + rw, y);
      }
      ctx.stroke();

      // Gorgeous stepped 8-bit golden cap
      const capY1 = rTop - 24;
      const capY2 = height - rBottom;

      const goldGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
      goldGrad.addColorStop(0, '#b45309');
      goldGrad.addColorStop(0.5, '#fef08a');
      goldGrad.addColorStop(1, '#b45309');

      ctx.fillStyle = goldGrad;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3.5;

      // Top Cap
      ctx.fillRect(rx - 6, capY1, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
      // Bottom Cap
      ctx.fillRect(rx - 6, capY2, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

      // Red/Yellow flashing pixel bulbs on golden caps
      const bulbColor = Math.sin((obs.x || 0) * 0.15) > 0 ? '#ef4444' : '#eab308';
      ctx.fillStyle = bulbColor;
      ctx.fillRect(rx + 6, capY1 + 8, 8, 8);
      ctx.strokeRect(rx + 6, capY1 + 8, 8, 8);
      ctx.fillRect(rx + rw - 14, capY1 + 8, 8, 8);
      ctx.strokeRect(rx + rw - 14, capY1 + 8, 8, 8);

      ctx.fillRect(rx + 6, capY2 + 8, 8, 8);
      ctx.strokeRect(rx + 6, capY2 + 8, 8, 8);
      ctx.fillRect(rx + rw - 14, capY2 + 8, 8, 8);
      ctx.strokeRect(rx + rw - 14, capY2 + 8, 8, 8);
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
      // 1. Vibrant exotic emerald forest gradient body with light highlight
      const forestGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      forestGrad.addColorStop(0, '#062616');
      forestGrad.addColorStop(0.3, '#105232');
      forestGrad.addColorStop(0.5, '#39ff14'); // specular neon emerald core
      forestGrad.addColorStop(0.7, '#0c3d24');
      forestGrad.addColorStop(1, '#03140b');

      // Draw central organic wood-vine core
      ctx.fillStyle = 'rgba(120, 80, 60, 0.7)';
      ctx.fillRect(rx + rw * 0.4, -1000, rw * 0.2, rTop + 1000);
      ctx.fillRect(rx + rw * 0.4, height - rBottom, rw * 0.2, rBottom + 1000);

      ctx.fillStyle = forestGrad;
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Ornate copper collar lips overgrown with moss on surfaces
      const capY1 = rTop - 22;
      const capY2 = height - rBottom;

      const copperGrad = ctx.createLinearGradient(rx - 4, 0, rx + rw + 4, 0);
      copperGrad.addColorStop(0, '#7c2d12');
      copperGrad.addColorStop(0.5, '#ffd700'); // Shiny golden accent
      copperGrad.addColorStop(1, '#431407');
      ctx.fillStyle = copperGrad;
      ctx.strokeStyle = '#1a0500';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx - 4, capY1, rw + 8, 22);
      ctx.strokeRect(rx - 4, capY1, rw + 8, 22);
      ctx.fillRect(rx - 4, capY2, rw + 8, 22);
      ctx.strokeRect(rx - 4, capY2, rw + 8, 22);

      // Glowing pink wild forest blossoms on surface
      ctx.fillStyle = '#ff3385';
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY1 + 11, 6, 0, Math.PI * 2);
      ctx.arc(rx + rw / 2, capY2 + 11, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY1 + 11, 2, 0, Math.PI * 2);
      ctx.arc(rx + rw / 2, capY2 + 11, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Tree trunk bark brown base with warm orange highlights
      const barkGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      barkGrad.addColorStop(0, '#362215');
      barkGrad.addColorStop(0.3, '#573d27');
      barkGrad.addColorStop(0.5, '#ea580c'); // Sunlit amber-orange highlight
      barkGrad.addColorStop(0.8, '#3d2514');
      barkGrad.addColorStop(1, '#231208');
      ctx.fillStyle = barkGrad;

      // Draw wood trunks
      this.drawStoneColumn(ctx, rx, -1000, rw, rTop + 1000);
      this.drawStoneColumn(ctx, rx, height - rBottom, rw, rBottom + 1000);

      // Hanging ivy leaves and blossoms on the lips
      const capY1 = rTop - 22;
      const capY2 = height - rBottom;

      const ringGrad = ctx.createLinearGradient(rx - 4, 0, rx + rw + 4, 0);
      ringGrad.addColorStop(0, '#4e3629');
      ringGrad.addColorStop(0.5, '#d97706'); // Ancient bronze-gold cuff
      ringGrad.addColorStop(1, '#2d1c14');
      ctx.fillStyle = ringGrad;
      ctx.strokeStyle = '#1b110a';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx - 4, capY1, rw + 8, 22);
      ctx.strokeRect(rx - 4, capY1, rw + 8, 22);
      ctx.fillRect(rx - 4, capY2, rw + 8, 22);
      ctx.strokeRect(rx - 4, capY2, rw + 8, 22);

      // Draw hanging green leaves / ivy vines procedurally
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.ellipse(rx + 14, capY1 + 28, 8, 5, Math.PI / 4, 0, Math.PI * 2);
      ctx.ellipse(rx + rw - 14, capY2 - 6, 8, 5, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStoneColumn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // Horizontal cracks lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.3);
    ctx.lineTo(x + w * 0.6, y + h * 0.3);
    ctx.moveTo(x + w * 0.4, y + h * 0.7);
    ctx.lineTo(x + w, y + h * 0.7);
    ctx.stroke();

    // Moss highlights overlay
    ctx.fillStyle = 'rgba(34, 197, 94, 0.18)';
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
      return;
    }

    if (obs.isMutated) {
      // Matrix code columns with glowing green border
      const matrixGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      matrixGrad.addColorStop(0, '#020617');
      matrixGrad.addColorStop(0.5, '#052e16');
      matrixGrad.addColorStop(1, '#020617');
      ctx.fillStyle = matrixGrad;
      ctx.strokeStyle = '#22c55e'; // Matrix neon green outline
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Draw digital code grid lines
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.25)';
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

      // Cyber green cap on surfaces
      const capY1 = rTop - 24;
      const capY2 = height - rBottom;

      ctx.fillStyle = '#052e16';
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3.0;
      ctx.fillRect(rx - 6, capY1, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
      ctx.fillRect(rx - 6, capY2, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

      // Flashing node light in core of cap
      const blinkColor = Math.sin((obs.x || 0) * 0.15) > 0 ? '#39ff14' : '#052e16';
      ctx.fillStyle = blinkColor;
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY1 + 12, 4, 0, Math.PI * 2);
      ctx.arc(rx + rw / 2, capY2 + 12, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Futuristic cyber-neon dark alloy with hot pink and electric cyan neon lines
      const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bodyGrad.addColorStop(0, '#090714');
      bodyGrad.addColorStop(0.3, '#1e1b4b');
      bodyGrad.addColorStop(0.5, '#ff007f'); // neon hot-pink cylindrical highlight
      bodyGrad.addColorStop(0.7, '#0f172a');
      bodyGrad.addColorStop(1, '#050308');

      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#00f3ff'; // Cyber electric cyan outline
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Tech vertical circuits
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.35, -1000);
      ctx.lineTo(rx + rw * 0.35, rTop - 24);
      ctx.moveTo(rx + rw * 0.65, -1000);
      ctx.lineTo(rx + rw * 0.65, rTop - 24);
      ctx.moveTo(rx + rw * 0.35, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.35, height + 1000);
      ctx.moveTo(rx + rw * 0.65, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.65, height + 1000);
      ctx.stroke();

      // High-tech glowing carbon-fiber cap brackets
      const capY1 = rTop - 24;
      const capY2 = height - rBottom;

      const techCapGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
      techCapGrad.addColorStop(0, '#020617');
      techCapGrad.addColorStop(0.5, '#00f3ff'); // cyan glowing bracket
      techCapGrad.addColorStop(1, '#020617');

      ctx.fillStyle = techCapGrad;
      ctx.strokeStyle = '#ff007f'; // Hot pink border
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx - 6, capY1, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
      ctx.fillRect(rx - 6, capY2, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

      // Cyan neon nodes on tech caps
      ctx.fillStyle = '#00f3ff';
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#00f3ff';
      ctx.fillRect(rx + 8, capY1 + 10, 4, 4);
      ctx.fillRect(rx + rw - 12, capY1 + 10, 4, 4);
      ctx.fillRect(rx + 8, capY2 + 10, 4, 4);
      ctx.fillRect(rx + rw - 12, capY2 + 10, 4, 4);
      ctx.shadowBlur = 0;
    }

    // Render Laser warning beam if active
    if (obs.isLaser) {
      if (obs.laserActive) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rx + rw * 0.45, rTop, rw * 0.1, height - rTop - rBottom);
        ctx.fillStyle = obs.isMutated ? 'rgba(34, 197, 94, 0.9)' : 'rgba(255, 0, 85, 0.85)';
        ctx.fillRect(rx + rw * 0.42, rTop, rw * 0.16, height - rTop - rBottom);
      } else {
        ctx.strokeStyle = obs.isMutated ? 'rgba(34, 197, 94, 0.35)' : 'rgba(255, 0, 50, 0.35)';
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
      // Aurora light-refracting prism gradient body
      const prismGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      prismGrad.addColorStop(0, '#4f46e5'); // Deep blue-violet
      prismGrad.addColorStop(0.3, '#ec4899'); // Aurora pink
      prismGrad.addColorStop(0.6, '#3b82f6'); // Electric blue
      prismGrad.addColorStop(1, '#0891b2'); // Teal
      ctx.fillStyle = prismGrad;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Frost cracks
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.4, rTop - 30);
      ctx.lineTo(rx + rw * 0.6, rTop - 80);
      ctx.moveTo(rx + rw * 0.6, height - rBottom + 30);
      ctx.lineTo(rx + rw * 0.4, height - rBottom + 80);
      ctx.stroke();

      // Thick white snow crowns on lips
      const capY1 = rTop - 22;
      const capY2 = height - rBottom;

      ctx.fillStyle = '#f8fafc'; // Snowy white
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx - 5, capY1, rw + 10, 22);
      ctx.strokeRect(rx - 5, capY1, rw + 10, 22);
      ctx.fillRect(rx - 5, capY2, rw + 10, 22);
      ctx.strokeRect(rx - 5, capY2, rw + 10, 22);
    } else {
      // Aquamarine glisten prism ice column with light reflection
      const iceGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      iceGrad.addColorStop(0, '#0891b2');
      iceGrad.addColorStop(0.4, '#e0f7fa'); // Specular reflection band
      iceGrad.addColorStop(0.7, '#0e7490');
      iceGrad.addColorStop(1, '#164e63');

      ctx.fillStyle = iceGrad;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Frosty icicle snow caps with tiny spiky structures hanging down
      const capY1 = rTop - 22;
      const capY2 = height - rBottom;

      const snowGrad = ctx.createLinearGradient(rx - 5, 0, rx + rw + 5, 0);
      snowGrad.addColorStop(0, '#e0f2fe');
      snowGrad.addColorStop(0.5, '#ffffff'); // pure crystal white
      snowGrad.addColorStop(1, '#bae6fd');
      ctx.fillStyle = snowGrad;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.0;

      // Top Cap
      ctx.fillRect(rx - 5, capY1, rw + 10, 22);
      ctx.strokeRect(rx - 5, capY1, rw + 10, 22);
      // Bottom Cap
      ctx.fillRect(rx - 5, capY2, rw + 10, 22);
      ctx.strokeRect(rx - 5, capY2, rw + 10, 22);

      // Draw 3 tiny hanging ice spikes on the lips
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      // Spike 1 (Top)
      ctx.moveTo(rx + 12, capY1 + 22);
      ctx.lineTo(rx + 16, capY1 + 34);
      ctx.lineTo(rx + 20, capY1 + 22);
      // Spike 2 (Top)
      ctx.moveTo(rx + rw - 20, capY1 + 22);
      ctx.lineTo(rx + rw - 16, capY1 + 34);
      ctx.lineTo(rx + rw - 12, capY1 + 22);
      // Spike 3 (Bottom)
      ctx.moveTo(rx + rw / 2 - 4, capY2);
      ctx.lineTo(rx + rw / 2, capY2 - 12);
      ctx.lineTo(rx + rw / 2 + 4, capY2);
      ctx.fill();
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
      // Jeweled terracotta sandstone obelisk body
      const sandGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      sandGrad.addColorStop(0, '#78350f');
      sandGrad.addColorStop(0.3, '#d97706');
      sandGrad.addColorStop(0.5, '#fef08a'); // central shiny gold highlight
      sandGrad.addColorStop(0.8, '#b45309');
      sandGrad.addColorStop(1, '#451a03');

      ctx.fillStyle = sandGrad;
      ctx.strokeStyle = '#ef4444'; // Ruby red borders
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Embedded turquoise jewels on sandstone body
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5, rTop - 40, 6, 0, Math.PI * 2);
      ctx.arc(rx + rw * 0.5, height - rBottom + 40, 6, 0, Math.PI * 2);
      ctx.fill();

      // Ornate Ruby Cap on upper & lower surfaces
      const capY1 = rTop - 24;
      const capY2 = height - rBottom;

      ctx.fillStyle = '#b91c1c';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx - 6, capY1, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
      ctx.fillRect(rx - 6, capY2, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 24);
    } else {
      // Ancient Egyptian warm terracotta sandstone obelisks with cylindrical shadow
      const sandGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      sandGrad.addColorStop(0, '#5c401c');
      sandGrad.addColorStop(0.3, '#8e6d3c');
      sandGrad.addColorStop(0.5, '#ab8e60'); // bright dune highlight
      sandGrad.addColorStop(0.8, '#70542b');
      sandGrad.addColorStop(1, '#3e2c14');

      ctx.fillStyle = sandGrad;
      ctx.strokeStyle = '#3e2c14';
      ctx.lineWidth = 2.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Dune ripple contour grooves
      ctx.strokeStyle = 'rgba(62, 44, 20, 0.4)';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      for (let y = rTop - 120; y < rTop - 24; y += 35) {
        ctx.arc(rx + rw / 2, y, rw * 0.4, 0, Math.PI, false);
      }
      for (let y = height - rBottom + 24; y < height - rBottom + 120; y += 35) {
        ctx.arc(rx + rw / 2, y, rw * 0.4, 0, Math.PI, false);
      }
      ctx.stroke();

      // Sandstone fluted capitols with Egyptian winged sun disk moldings
      const capY1 = rTop - 24;
      const capY2 = height - rBottom;

      const goldSandGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
      goldSandGrad.addColorStop(0, '#78350f');
      goldSandGrad.addColorStop(0.5, '#ffd700'); // Shiny golden sand
      goldSandGrad.addColorStop(1, '#78350f');

      ctx.fillStyle = goldSandGrad;
      ctx.strokeStyle = '#3e2c14';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx - 6, capY1, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
      ctx.fillRect(rx - 6, capY2, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

      // Embedded red ruby sun disk in the center of sandstone cap
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY1 + 12, 5, 0, Math.PI * 2);
      ctx.arc(rx + rw / 2, capY2 + 12, 5, 0, Math.PI * 2);
      ctx.fill();
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
      return;
    }

    if (obs.isMutated) {
      // Obsidian body with superheated molten orange magma flowing core
      ctx.fillStyle = '#0a0505';
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 3.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Magma vein vein flowing core
      const magmaFlow = ctx.createLinearGradient(rx + rw * 0.38, 0, rx + rw * 0.62, 0);
      magmaFlow.addColorStop(0, '#ea580c');
      magmaFlow.addColorStop(0.5, '#facc15'); // glowing yellow core
      magmaFlow.addColorStop(1, '#f97316');
      ctx.fillStyle = magmaFlow;
      ctx.fillRect(rx + rw * 0.38, -1000, rw * 0.24, rTop + 1000);
      ctx.fillRect(rx + rw * 0.38, height - rBottom, rw * 0.24, rBottom + 1000);
    } else {
      // Dark columnar basalt igneous obsidian pillars
      const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bodyGrad.addColorStop(0, '#0c0505');
      bodyGrad.addColorStop(0.4, '#381108'); // magma dark core
      bodyGrad.addColorStop(0.7, '#140606');
      bodyGrad.addColorStop(1, '#050101');

      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = '#ff3c00'; // fiery red outline
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Magma crack lines
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.25, 0);
      ctx.lineTo(rx + rw * 0.4, rTop * 0.75);
      ctx.moveTo(rx + rw * 0.75, height - rBottom);
      ctx.lineTo(rx + rw * 0.6, height - rBottom + 70);
      ctx.stroke();
    }

    // Heavy iron-alloy heat-sink caps on upper & lower surfaces
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const ironCapGrad = ctx.createLinearGradient(rx - 5, 0, rx + rw + 5, 0);
    ironCapGrad.addColorStop(0, '#1e293b');
    ironCapGrad.addColorStop(0.5, '#ea580c'); // glowing lava-channel center
    ironCapGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = ironCapGrad;
    ctx.strokeStyle = '#ff4500';
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 5, capY1, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY1, rw + 10, 24);
    ctx.fillRect(rx - 5, capY2, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY2, rw + 10, 24);
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
      // Cosmic deep space black with starry nebula dust body
      ctx.fillStyle = '#020006';
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Star coordinates
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx + rw * 0.3, rTop - 40, 2.5, 2.5);
      ctx.fillRect(rx + rw * 0.75, rTop - 90, 2, 2);
      ctx.fillRect(rx + rw * 0.5, height - rBottom + 60, 3, 3);
    } else {
      // Deep space dark purple metallic gradient body
      const spaceGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      spaceGrad.addColorStop(0, '#090014');
      spaceGrad.addColorStop(0.3, '#2e0854');
      spaceGrad.addColorStop(0.5, '#da70d6'); // star-white orchid metallic reflection band
      spaceGrad.addColorStop(0.8, '#18022b');
      spaceGrad.addColorStop(1, '#05000c');

      ctx.fillStyle = spaceGrad;
      ctx.strokeStyle = '#da70d6';
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
    }

    // High-tech chrome telemetry cap pylons with blinking space beacons
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const chromeGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
    chromeGrad.addColorStop(0, '#0f172a');
    chromeGrad.addColorStop(0.5, '#da70d6'); // nebula pink chrome cap
    chromeGrad.addColorStop(1, '#0b0f19');
    ctx.fillStyle = chromeGrad;
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 6, capY1, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
    ctx.fillRect(rx - 6, capY2, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

    // Flashing magenta/blue telemetry lights on the space caps
    const beaconColor = Math.sin((obs.x || 0) * 0.15) > 0 ? '#ff1493' : '#00bfff';
    ctx.fillStyle = beaconColor;
    ctx.shadowBlur = 8;
    ctx.shadowColor = beaconColor;
    ctx.beginPath();
    ctx.arc(rx + rw / 2, capY1 + 12, 3.5, 0, Math.PI * 2);
    ctx.arc(rx + rw / 2, capY2 + 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
      // Deep sea navy stone body
      const navyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      navyGrad.addColorStop(0, '#040d12');
      navyGrad.addColorStop(0.5, '#0c2d3a');
      navyGrad.addColorStop(1, '#02070a');
      ctx.fillStyle = navyGrad;
      ctx.strokeStyle = '#f472b6'; // Glowing coral pink borders
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Glowing anemones polyps
      ctx.fillStyle = '#f472b6';
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#f472b6';
      ctx.beginPath();
      ctx.arc(rx + 15, rTop - 35, 5, 0, Math.PI * 2);
      ctx.arc(rx + rw - 15, height - rBottom + 35, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // Marine mossy teal stone with algae-crust texture
      const marineGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      marineGrad.addColorStop(0, '#001a14');
      marineGrad.addColorStop(0.3, '#004d40');
      marineGrad.addColorStop(0.5, '#0d9488'); // bioluminescent aquamarine highlight core
      marineGrad.addColorStop(0.8, '#0d5c52');
      marineGrad.addColorStop(1, '#000f0b');

      ctx.fillStyle = marineGrad;
      ctx.strokeStyle = '#0f766e';
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Seaweed leaves drawing
      ctx.fillStyle = 'rgba(13, 148, 136, 0.28)';
      ctx.beginPath();
      ctx.ellipse(rx + 16, rTop - 45, 10, 5, -Math.PI / 6, 0, Math.PI * 2);
      ctx.ellipse(rx + rw - 16, height - rBottom + 45, 10, 5, Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Gorgeous pearl-crusted golden crown collar caps on upper & lower surfaces
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const goldGrad = ctx.createLinearGradient(rx - 5, 0, rx + rw + 5, 0);
    goldGrad.addColorStop(0, '#a16207');
    goldGrad.addColorStop(0.5, '#fef08a'); // bright gold cap reflection
    goldGrad.addColorStop(1, '#854d0e');
    ctx.fillStyle = goldGrad;
    ctx.strokeStyle = '#004d40';
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 5, capY1, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY1, rw + 10, 24);
    ctx.fillRect(rx - 5, capY2, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY2, rw + 10, 24);

    // Glowing pink pearl cores
    ctx.fillStyle = '#f472b6';
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#f472b6';
    ctx.beginPath();
    ctx.arc(rx + 12, capY1 + 12, 3, 0, Math.PI * 2);
    ctx.arc(rx + rw - 12, capY1 + 12, 3, 0, Math.PI * 2);
    ctx.arc(rx + 12, capY2 + 12, 3, 0, Math.PI * 2);
    ctx.arc(rx + rw - 12, capY2 + 12, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
      // Celestial white marble with gold veins
      const heavGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      heavGrad.addColorStop(0, '#fef08a'); // gold vein
      heavGrad.addColorStop(0.3, '#ffffff');
      heavGrad.addColorStop(0.7, '#ffffff');
      heavGrad.addColorStop(1, '#ccfbf1'); // divine teal marble vein
      ctx.fillStyle = heavGrad;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3.5;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
    } else {
      // Fluted Corinthian white marble column with gentle sky-blue cylindrical vein
      const heavGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      heavGrad.addColorStop(0, '#f1f5f9');
      heavGrad.addColorStop(0.4, '#ffffff');
      heavGrad.addColorStop(0.7, '#e0f2fe'); // baby blue sky vein
      heavGrad.addColorStop(1, '#cbd5e1');

      ctx.fillStyle = heavGrad;
      ctx.strokeStyle = '#ffd700'; // Pure bright gold margins
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

      // Fluted lines of Corinthian capitols
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.25, -1000);
      ctx.lineTo(rx + rw * 0.25, rTop - 24);
      ctx.moveTo(rx + rw * 0.5, -1000);
      ctx.lineTo(rx + rw * 0.5, rTop - 24);
      ctx.moveTo(rx + rw * 0.75, -1000);
      ctx.lineTo(rx + rw * 0.75, rTop - 24);
      ctx.moveTo(rx + rw * 0.25, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.25, height + 1000);
      ctx.moveTo(rx + rw * 0.5, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.5, height + 1000);
      ctx.moveTo(rx + rw * 0.75, height - rBottom + 24);
      ctx.lineTo(rx + rw * 0.75, height + 1000);
      ctx.stroke();
    }

    // Golden fluted capitols flanked by celestial marble angelic wing ornaments
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const goldGrad = ctx.createLinearGradient(rx - 8, 0, rx + rw + 8, 0);
    goldGrad.addColorStop(0, '#ca8a04');
    goldGrad.addColorStop(0.5, '#fef08a'); // Star-white gold flash
    goldGrad.addColorStop(1, '#a16207');
    ctx.fillStyle = goldGrad;
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 8, capY1, rw + 16, 24);
    ctx.strokeRect(rx - 8, capY1, rw + 16, 24);
    ctx.fillRect(rx - 8, capY2, rw + 16, 24);
    ctx.strokeRect(rx - 8, capY2, rw + 16, 24);

    // Blinking halo star in capital core
    const starColor = Math.sin((obs.x || 0) * 0.12) > 0 ? '#ffd700' : '#ffffff';
    ctx.fillStyle = starColor;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffd700';
    ctx.beginPath();
    ctx.arc(rx + rw / 2, capY1 + 12, 4.5, 0, Math.PI * 2);
    ctx.arc(rx + rw / 2, capY2 + 12, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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

    const drawRetroBlock = (yStart: number, h: number, isTop: boolean) => {
      // 1. Hybrid Vaporwave/Arcade gradient body
      const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bodyGrad.addColorStop(0, '#120024'); // deep space black
      bodyGrad.addColorStop(0.3, '#3a005c'); // deep arcade purple
      bodyGrad.addColorStop(0.7, '#8e44ad'); // neon violet
      bodyGrad.addColorStop(1, '#0e001c');
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(rx, yStart, rw, h);

      // Pixelated grid lines
      ctx.strokeStyle = '#22003c';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, yStart, rw, h);

      // 2. Retro 8-bit green brick panels
      ctx.fillStyle = '#73c93e'; // Classic Mario green
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      const brickH = 16;
      const brickW = 24;
      
      for (let y = yStart + 10; y < yStart + h - 10; y += brickH) {
        if (y + brickH > yStart + h && isTop) continue;
        const rowShift = Math.floor((y - yStart) / brickH) % 2 === 0 ? 0 : brickW / 2;
        for (let x = rx + 6 - rowShift; x < rx + rw - 6; x += brickW) {
          const bx = Math.max(rx + 6, x);
          const bw = Math.min(rx + rw - 6 - bx, brickW - (bx - x));
          if (bw > 2) {
            ctx.fillRect(bx, y, bw, brickH - 2);
            ctx.strokeRect(bx, y, bw, brickH - 2);
          }
        }
      }

      // 3. Gorgeous 8-bit golden cap with blinking neon indicators on surface
      const capY = isTop ? yStart + h - 24 : yStart;
      const goldGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      goldGrad.addColorStop(0, '#ffd700');
      goldGrad.addColorStop(0.5, '#fffbeb');
      goldGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = goldGrad;
      ctx.fillRect(rx - 4, capY, rw + 8, 24);
      ctx.strokeRect(rx - 4, capY, rw + 8, 24);

      // Blinking red/green neon lights on surface
      const blinkColor = Math.sin((obs.x || 0) * 0.1) > 0 ? '#ff0000' : '#00ff00';
      ctx.fillStyle = blinkColor;
      ctx.fillRect(rx + rw / 2 - 4, capY + 8, 8, 8);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(rx + rw / 2 - 4, capY + 8, 8, 8);
    };
    
    drawRetroBlock(-1000, rTop + 1000, true);
    drawRetroBlock(height - rBottom, rBottom + 1000, false);
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

    const drawJungleBlock = (yStart: number, h: number, _isTop: boolean) => {
      // Tree trunk bark brown base with warm orange highlights
      const barkGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      barkGrad.addColorStop(0, '#3d2b1f');
      barkGrad.addColorStop(0.3, '#5c4033');
      barkGrad.addColorStop(0.7, '#d84315'); // warm amber/orange sunlit highlight
      barkGrad.addColorStop(1, '#2b1d14');
      ctx.fillStyle = barkGrad;
      ctx.fillRect(rx, yStart, rw, h);
      
      // Draw vertical bark texture lines
      ctx.strokeStyle = '#231812';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let xOffset = 15; xOffset < rw; xOffset += 18) {
        ctx.moveTo(rx + xOffset, yStart);
        ctx.lineTo(rx + xOffset + Math.sin(xOffset) * 5, yStart + h);
      }
      ctx.stroke();

      // Wrapped winding green ivy vines
      ctx.strokeStyle = '#1b5e20'; // dark forest green
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      let lastX = rx + rw / 2;
      ctx.moveTo(lastX, yStart);
      for (let y = yStart; y < yStart + h; y += 20) {
        const nextX = rx + rw / 2 + Math.sin(y * 0.05) * (rw * 0.4);
        ctx.lineTo(nextX, y);
      }
      ctx.stroke();

      // Draw beautiful green leaves
      ctx.fillStyle = '#4caf50'; // glowing green
      for (let y = yStart; y < yStart + h; y += 35) {
        const leafX = rx + rw / 2 + Math.sin(y * 0.05) * (rw * 0.4);
        ctx.beginPath();
        ctx.ellipse(leafX, y, 8, 4, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1b5e20';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Attractive golden ring collar overgrown with moss on surface
      const capY = _isTop ? yStart + h - 22 : yStart;
      const ringGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      ringGrad.addColorStop(0, '#8b5a2b');
      ringGrad.addColorStop(0.5, '#ffd700'); // Shiny gold
      ringGrad.addColorStop(1, '#5e3a1f');
      ctx.fillStyle = ringGrad;
      ctx.strokeStyle = '#231812';
      ctx.lineWidth = 2;
      ctx.fillRect(rx - 4, capY, rw + 8, 22);
      ctx.strokeRect(rx - 4, capY, rw + 8, 22);

      // Glowing pink wild forest blossoms on surface
      ctx.fillStyle = '#ff4081'; // bright pink wild forest blossoms
      const flowerX = rx + rw / 2;
      const flowerY = capY + 11;
      ctx.beginPath();
      ctx.arc(flowerX, flowerY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd700'; // gold core
      ctx.beginPath();
      ctx.arc(flowerX, flowerY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawJungleBlock(-1000, rTop + 1000, true);
    drawJungleBlock(height - rBottom, rBottom + 1000, false);
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

    const drawCyberBlock = (yStart: number, h: number, _isTop: boolean) => {
      // 1. Cyberpunk Holographic neon gradient body
      const holoGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      holoGrad.addColorStop(0, 'rgba(0, 243, 255, 0.15)'); // Electric cyan
      holoGrad.addColorStop(0.5, 'rgba(213, 0, 249, 0.35)'); // Hot purple
      holoGrad.addColorStop(1, 'rgba(255, 0, 127, 0.20)'); // Bright pink
      ctx.fillStyle = holoGrad;
      ctx.fillRect(rx, yStart, rw, h);
      
      // Cyber corner frames/brackets
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx, yStart, rw, h);

      // 2. Vertical glowing binary circuit/data stream lines
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.3, yStart);
      ctx.lineTo(rx + rw * 0.3, yStart + h);
      ctx.moveTo(rx + rw * 0.7, yStart);
      ctx.lineTo(rx + rw * 0.7, yStart + h);
      ctx.stroke();

      // Glowing pink nodes
      ctx.fillStyle = '#ff007f';
      ctx.beginPath();
      for (let y = yStart + 20; y < yStart + h; y += 40) {
        ctx.arc(rx + rw * 0.3, y, 3, 0, Math.PI * 2);
        ctx.arc(rx + rw * 0.7, y + 20, 3, 0, Math.PI * 2);
      }
      ctx.fill();

      // Pulsing central holographic core
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      const corePulse = 4 + Math.sin((obs.x || 0) * 0.05) * 1.5;
      ctx.fillRect(rx + rw / 2 - corePulse / 2, yStart, corePulse, h);
      ctx.restore();

      // 3. Gorgeous glowing neon cap bracket on surface
      const capY = _isTop ? yStart + h - 20 : yStart;
      const bracketGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      bracketGrad.addColorStop(0, '#d500f9');
      bracketGrad.addColorStop(0.5, '#00f3ff');
      bracketGrad.addColorStop(1, '#ff007f');
      ctx.fillStyle = bracketGrad;
      ctx.fillRect(rx - 2, capY, rw + 4, 20);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(rx - 2, capY, rw + 4, 20);
    };

    drawCyberBlock(-1000, rTop + 1000, true);
    drawCyberBlock(height - rBottom, rBottom + 1000, false);

    // Standard Cyberpunk Laser
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

    const drawIceBlock = (yStart: number, h: number, _isTop: boolean) => {
      // Light-refracting prism glacier crystal gradient (extremely gorgeous)
      const iceGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      iceGrad.addColorStop(0, 'rgba(165, 243, 252, 0.85)'); // Cyan aquamarine
      iceGrad.addColorStop(0.4, 'rgba(244, 114, 182, 0.75)'); // Soft prism pink
      iceGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.90)'); // Ice blue
      iceGrad.addColorStop(1, 'rgba(29, 78, 216, 0.85)'); // Sapphire blue
      ctx.fillStyle = iceGrad;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, yStart, rw, h);
      ctx.strokeRect(rx, yStart, rw, h);

      // Attractive spiky crown frost ridge with diamond glistening cap on surface
      const capY = _isTop ? yStart + h - 22 : yStart;
      
      // Draw glistening white snow caps
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rx - 2, capY, rw + 4, 14);
      ctx.strokeRect(rx - 2, capY, rw + 4, 14);

      // Light-refracting crystal facets
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.3, yStart);
      ctx.lineTo(rx + rw * 0.5, yStart + h * 0.45);
      ctx.lineTo(rx + rw * 0.7, yStart);
      ctx.stroke();

      // Hanging crystal icicles
      if (_isTop) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        // Icicle 1
        ctx.moveTo(rx + 10, yStart + h);
        ctx.lineTo(rx + 15, yStart + h + 18);
        ctx.lineTo(rx + 20, yStart + h);
        // Icicle 2
        ctx.moveTo(rx + rw - 25, yStart + h);
        ctx.lineTo(rx + rw - 18, yStart + h + 24);
        ctx.lineTo(rx + rw - 10, yStart + h);
        ctx.fill();
        ctx.stroke();
      }
    };

    drawIceBlock(-1000, rTop + 1000, true);
    drawIceBlock(height - rBottom, rBottom + 1000, false);
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

    const drawDesertBlock = (yStart: number, h: number, isTop: boolean) => {
      // Warm terracotta sandstone hybrid gradient
      const sandGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      sandGrad.addColorStop(0, '#c2410c'); // Terracotta red
      sandGrad.addColorStop(0.5, '#eab308'); // Egyptian gold
      sandGrad.addColorStop(1, '#7c2d12'); // Deep stone shadow
      ctx.fillStyle = sandGrad;
      ctx.strokeStyle = '#3e2c14';
      ctx.lineWidth = 2.5;

      // Draw tapered pillar obelisk shape
      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(rx - 8, yStart);
        ctx.lineTo(rx + rw + 8, yStart);
        ctx.lineTo(rx + rw - 6, yStart + h);
        ctx.lineTo(rx + 6, yStart + h);
      } else {
        ctx.moveTo(rx + 6, yStart);
        ctx.lineTo(rx + rw - 6, yStart);
        ctx.lineTo(rx + rw + 8, yStart + h);
        ctx.lineTo(rx - 8, yStart + h);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Winged golden sun disk cap on surface (attractive Egyptian architecture)
      const capY = isTop ? yStart + h - 22 : yStart;
      const goldGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      goldGrad.addColorStop(0, '#ffd700');
      goldGrad.addColorStop(0.5, '#fffbeb');
      goldGrad.addColorStop(1, '#d97706');
      ctx.fillStyle = goldGrad;
      ctx.fillRect(rx - 2, capY, rw + 4, 22);
      ctx.strokeRect(rx - 2, capY, rw + 4, 22);

      // Embedded ruby jewel inside the gold pylon cap
      ctx.fillStyle = '#ef4444'; // Glowing ruby red
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5, capY + 11, 5, 0, Math.PI * 2);
      ctx.fill();

      // Deeply carved ancient hieroglyphics glowing gold
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ffd700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const centerY = yStart + h / 2;
      ctx.arc(rx + rw * 0.5, centerY, 8, 0, Math.PI * 2);
      ctx.moveTo(rx + rw * 0.5 - 12, centerY + 15);
      ctx.lineTo(rx + rw * 0.5 + 12, centerY + 15);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw smooth sand-dune waves contour lines
      ctx.strokeStyle = 'rgba(62, 44, 20, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let y = yStart + 30; y < yStart + h - 30; y += 45) {
        ctx.moveTo(rx + 6, y);
        ctx.bezierCurveTo(rx + rw * 0.3, y - 10, rx + rw * 0.7, y + 10, rx + rw - 6, y);
      }
      ctx.stroke();
    };

    drawDesertBlock(-1000, rTop + 1000, true);
    drawDesertBlock(height - rBottom, rBottom + 1000, false);
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

    const drawVolcanoBlock = (yStart: number, h: number, isTop: boolean) => {
      // Hexagonal basalt joints (3 staggered vertical pillars)
      const colW = rw / 3;
      
      const drawJoint = (xOffset: number, heightOffset: number, baseColor: string) => {
        ctx.fillStyle = baseColor;
        ctx.strokeStyle = '#f97316'; // Lava orange outlines
        ctx.lineWidth = 2.5;
        
        const jy = isTop ? yStart : yStart + heightOffset;
        const jh = isTop ? h - heightOffset : h - heightOffset;
        
        ctx.fillRect(xOffset, jy, colW, jh);
        ctx.strokeRect(xOffset, jy, colW, jh);

        // Magma crack lines down the middle
        ctx.strokeStyle = '#ffd700'; // glowing gold
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#f97316';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(xOffset + colW / 2, jy);
        ctx.lineTo(xOffset + colW / 2 + Math.sin(jy) * 4, jy + jh);
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Jagged volcanic magma teeth/caps on the safe lips
        const capY = isTop ? jy + jh - 16 : jy;
        const magmaGrad = ctx.createLinearGradient(xOffset, 0, xOffset + colW, 0);
        magmaGrad.addColorStop(0, '#ea580c');
        magmaGrad.addColorStop(0.5, '#facc15'); // Yellow core
        magmaGrad.addColorStop(1, '#ff0000');
        ctx.fillStyle = magmaGrad;
        ctx.fillRect(xOffset, capY, colW, 16);
      };

      // Draw basalt joint bundle
      drawJoint(rx, 15, '#0f0d0d'); // left
      drawJoint(rx + colW, 0, '#1c1917'); // middle (longest)
      drawJoint(rx + colW * 2, 30, '#0a0909'); // right
    };

    drawVolcanoBlock(-1000, rTop + 1000, true);
    drawVolcanoBlock(height - rBottom, rBottom + 1000, false);
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

    const drawSpaceBlock = (yStart: number, h: number, _isTop: boolean) => {
      // Dark stellar carbon-alloy panel hybrid space gradient
      const carbonGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      carbonGrad.addColorStop(0, '#0c0722'); // Space indigo
      carbonGrad.addColorStop(0.4, '#ec4899'); // Cosmic pink nebula
      carbonGrad.addColorStop(0.7, '#6b21a8'); // Nebula violet
      carbonGrad.addColorStop(1, '#050211');
      ctx.fillStyle = carbonGrad;
      ctx.strokeStyle = '#da70d6'; // Neon cosmic purple borders
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, yStart, rw, h);
      ctx.strokeRect(rx, yStart, rw, h);

      // Pulsing stellar core (quantum warp-gate)
      ctx.save();
      const coreGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      coreGrad.addColorStop(0, 'rgba(218, 112, 214, 0.15)');
      coreGrad.addColorStop(0.5, 'rgba(0, 243, 255, 0.4)'); // glowing cyan core
      coreGrad.addColorStop(1, 'rgba(218, 112, 214, 0.15)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(rx + rw * 0.35, yStart, rw * 0.3, h);
      ctx.restore();

      // Constellation vectors (glowing starry geometric patterns)
      ctx.strokeStyle = '#e0f2fe'; // star white
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx + 10, yStart + 40);
      ctx.lineTo(rx + rw * 0.5, yStart + 80);
      ctx.lineTo(rx + rw - 10, yStart + 40);
      ctx.stroke();

      // Twinkling warp ring cap at safe boundaries (attractive futuristic design)
      const capY = _isTop ? yStart + h - 22 : yStart;
      const portalGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      portalGrad.addColorStop(0, '#00f3ff');
      portalGrad.addColorStop(0.5, '#ffffff'); // star bright core
      portalGrad.addColorStop(1, '#da70d6');
      ctx.fillStyle = portalGrad;
      ctx.fillRect(rx - 6, capY, rw + 12, 22);
      ctx.strokeRect(rx - 6, capY, rw + 12, 22);

      // Orbiting cosmic star
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY + 11, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    drawSpaceBlock(-1000, rTop + 1000, true);
    drawSpaceBlock(height - rBottom, rBottom + 1000, false);
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

    const drawUnderwaterBlock = (yStart: number, h: number, _isTop: boolean) => {
      // Mossy ocean teal to marine coral gradient
      const marineGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      marineGrad.addColorStop(0, '#004d40');
      marineGrad.addColorStop(0.4, '#008080'); // Deep turquoise coral
      marineGrad.addColorStop(0.7, '#2e7d32'); // sea kelp green
      marineGrad.addColorStop(1, '#001a14');
      ctx.fillStyle = marineGrad;
      ctx.strokeStyle = '#008b8b';
      ctx.lineWidth = 2.5;

      ctx.fillRect(rx, yStart, rw, h);
      ctx.strokeRect(rx, yStart, rw, h);

      // 2. Wavy seaweed/kelp wrapped around
      ctx.strokeStyle = '#00c853'; // seaweed green
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.3, yStart);
      for (let y = yStart; y < yStart + h; y += 25) {
        ctx.lineTo(rx + rw * 0.3 + Math.sin(y * 0.08) * 12, y);
      }
      ctx.stroke();

      // 3. Glowing pink coral/anemones polyps
      ctx.fillStyle = '#f472b6'; // Coral pink
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5, yStart + h * 0.4, 6, 0, Math.PI * 2);
      ctx.arc(rx + rw * 0.5 + 8, yStart + h * 0.4 + 6, 4, 0, Math.PI * 2);
      ctx.arc(rx + rw * 0.2, yStart + h * 0.7, 5, 0, Math.PI * 2);
      ctx.fill();

      // Pearl-crusted golden crown cap on surface
      const capY = _isTop ? yStart + h - 22 : yStart;
      const pearlGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      pearlGrad.addColorStop(0, '#ffd700'); // Gold frame
      pearlGrad.addColorStop(0.5, '#e0f2fe'); // Pearl white luster
      pearlGrad.addColorStop(1, '#b45309');
      ctx.fillStyle = pearlGrad;
      ctx.fillRect(rx - 4, capY, rw + 8, 22);
      ctx.strokeRect(rx - 4, capY, rw + 8, 22);

      // Pearl dots on the golden surface collar
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rx + 6, capY + 11, 3.5, 0, Math.PI * 2);
      ctx.arc(rx + rw - 6, capY + 11, 3.5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawUnderwaterBlock(-1000, rTop + 1000, true);
    drawUnderwaterBlock(height - rBottom, rBottom + 1000, false);
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

    const drawHeavenBlock = (yStart: number, h: number, isTop: boolean) => {
      // 1. Divine white marble gradient body
      const heavGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      heavGrad.addColorStop(0, '#fefcf0');
      heavGrad.addColorStop(0.5, '#ffffff'); // bright marble white
      heavGrad.addColorStop(1, '#f5f5f0');
      ctx.fillStyle = heavGrad;
      ctx.strokeStyle = '#ffd700'; // Pure shiny gold borders
      ctx.lineWidth = 3;

      ctx.fillRect(rx, yStart, rw, h);
      ctx.strokeRect(rx, yStart, rw, h);

      // Fluted marble grooved vertical details
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rx + rw * 0.33, yStart); ctx.lineTo(rx + rw * 0.33, yStart + h);
      ctx.moveTo(rx + rw * 0.66, yStart); ctx.lineTo(rx + rw * 0.66, yStart + h);
      ctx.stroke();

      // 2. Grand winged golden archways on surface (very attractive divine design)
      const wingY = isTop ? yStart + h - 22 : yStart;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      if (isTop) {
        ctx.arc(rx + rw * 0.5, wingY, rw * 0.7, Math.PI, 0, false);
        ctx.lineTo(rx + rw, wingY + 22);
        ctx.lineTo(rx, wingY + 22);
      } else {
        ctx.arc(rx + rw * 0.5, wingY + 22, rw * 0.7, 0, Math.PI, false);
        ctx.lineTo(rx, wingY);
        ctx.lineTo(rx + rw, wingY);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Blinking divine golden star in center
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5, wingY + (isTop ? 6 : 16), 4.5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawHeavenBlock(-1000, rTop + 1000, true);
    drawHeavenBlock(height - rBottom, rBottom + 1000, false);
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

    const drawTempleBlock = (yStart: number, h: number, isTop: boolean) => {
      // 1. Charcoal jade moss stone cylindrical gradient body
      const stoneGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      stoneGrad.addColorStop(0, '#101511');
      stoneGrad.addColorStop(0.3, '#2d3d31');
      stoneGrad.addColorStop(0.5, '#4ade80'); // specular mossy green highlight
      stoneGrad.addColorStop(0.8, '#1f2921');
      stoneGrad.addColorStop(1, '#0b0f0b');
      ctx.fillStyle = stoneGrad;
      ctx.strokeStyle = '#0a0d0b';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx, yStart, rw, h);
      ctx.strokeRect(rx, yStart, rw, h);

      // Aztec rune carvings
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.75)'; // Ancient gold
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const rY = yStart + h / 2;
      ctx.strokeRect(rx + rw * 0.3, rY - 12, 28, 24);
      ctx.moveTo(rx + rw * 0.3 + 7, rY);
      ctx.lineTo(rx + rw * 0.3 + 21, rY);
      ctx.stroke();

      // Embedded glowing emerald gems in carvings
      ctx.fillStyle = '#00ffaa';
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#00ffaa';
      ctx.beginPath();
      ctx.arc(rx + rw * 0.5, rY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Gorgeous stepped gold Aztec crown cap with central red ruby gem
      const capY = isTop ? yStart + h - 24 : yStart;
      const goldGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
      goldGrad.addColorStop(0, '#a16207');
      goldGrad.addColorStop(0.5, '#fef08a'); // central gold flash
      goldGrad.addColorStop(1, '#854d0e');
      ctx.fillStyle = goldGrad;
      ctx.strokeStyle = '#020617';
      ctx.lineWidth = 3.0;

      ctx.fillRect(rx - 6, capY, rw + 12, 24);
      ctx.strokeRect(rx - 6, capY, rw + 12, 24);

      // Flashing ruby in Aztec stepped cap
      const rubyColor = Math.sin((obs.x || 0) * 0.15) > 0 ? '#ef4444' : '#b91c1c';
      ctx.fillStyle = rubyColor;
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#ef4444';
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY + 12, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Hanging ivy leaves procedurally drawn
      ctx.fillStyle = '#166534';
      ctx.beginPath();
      if (isTop) {
        ctx.ellipse(rx + 14, yStart + h + 12, 8, 4, Math.PI / 6, 0, Math.PI * 2);
      } else {
        ctx.ellipse(rx + rw - 14, yStart - 12, 8, 4, -Math.PI / 6, 0, Math.PI * 2);
      }
      ctx.fill();
    };

    drawTempleBlock(-1000, rTop + 1000, true);
    drawTempleBlock(height - rBottom, rBottom + 1000, false);
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
