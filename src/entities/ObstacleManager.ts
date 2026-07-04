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
  isSpecialSplit?: boolean;
  approachAnimType?: 'open' | 'close';
  baseTopHeight?: number;
  baseBottomHeight?: number;
  obstacleIdx?: number;
  spawnScore?: number;
  hasEnergyBall?: boolean;
  energyBallY?: number;
  energyBallSpeedY?: number;
  energyBallRadius?: number;
  isOrbitalSway?: boolean;
  isGoldSplitGate?: boolean;
  isDestructible?: boolean;
  hp?: number;
  maxHp?: number;
  isDestroyed?: boolean;
}

export class ObstacleManager {
  private list: Obstacle[] = [];
  private freePool: Obstacle[] = [];
  private spawnTimer = 0;
  private obstacleWidth = 72;
  private currentScore = 0;
  private waveTime = 0;
  private nextSpawnDistance = 550;

  private activeLevelConfig: any = null;
  private currentPatternIdx = 0;
  private endlessPatternQueue: { centerYOffset: number, isMoving?: boolean, gapScale?: number, distScale?: number, isLaser?: boolean }[] = [];
  private currentEndlessDistScale = 1.0;
  private endlessObstacleCount = 0;
  private flockPatternIndices: number[] = [];

  constructor() { }

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
      obstacleIdx: undefined,
      spawnScore: undefined,
      isSpecialSplit: false,
      baseTopHeight: 0,
      baseBottomHeight: 0,
      hasEnergyBall: false,
      energyBallY: undefined,
      energyBallSpeedY: undefined,
      energyBallRadius: undefined,
      isOrbitalSway: false,
      isGoldSplitGate: false,
      isDestructible: false,
      hp: 0,
      maxHp: 0,
      isDestroyed: false
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
    this.nextSpawnDistance = 550;
    this.currentPatternIdx = 0;
    this.currentScore = 0;
    this.endlessPatternQueue = [];
    this.currentEndlessDistScale = 1.0;
    this.endlessObstacleCount = 0;
    this.flockPatternIndices = []; // Reset the flock pattern cycle
  }

  public update(
    deltaTime: number,
    scrollSpeed: number,
    score: number,
    worldId: string,
    width: number,
    height: number,
    timeScale: number,
    zone: 'classic' | 'wave' | 'chaos' = 'classic',
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    _birdX?: number,
    _particleEngine?: any,
    gameMode: 'endless' | 'level' | 'flock' | 'rescue' | 'formation' | 'chaos' = 'endless'
  ) {
    this.currentScore = score;
    const dtCoeff = deltaTime * 60 * timeScale;
    let activeEffectiveLevelNum = this.activeLevelConfig ? this.activeLevelConfig.levelNum : undefined;
    if (this.activeLevelConfig && this.activeLevelConfig.patterns && this.activeLevelConfig.patterns[0]) {
      const match = this.activeLevelConfig.patterns[0].match(/^level(\d+)/);
      if (match) {
        activeEffectiveLevelNum = parseInt(match[1], 10);
      }
    }
    const isLevel21or22 = this.activeLevelConfig && (activeEffectiveLevelNum === 21 || activeEffectiveLevelNum === 22);
    const isLevel31to40 = this.activeLevelConfig && (activeEffectiveLevelNum >= 31 && activeEffectiveLevelNum <= 40);
    let motionSpeedScale = isLevel31to40 ? 1.20 : (isLevel21or22 ? 0.90 : 1.0); // 20% increased difficulty/speed for Levels 31–40

    if (this.activeLevelConfig && activeEffectiveLevelNum >= 40 && activeEffectiveLevelNum <= 50) {
      const groupSize = Math.floor(this.activeLevelConfig.targetScore / 3);
      const groupIdx = Math.min(2, Math.floor(score / groupSize));
      if (groupIdx === 1) {
        motionSpeedScale *= 0.95; // 5% reduce
      } else if (groupIdx === 2) {
        motionSpeedScale *= 0.90; // 10% reduce
      }
    }

    if (this.activeLevelConfig && this.activeLevelConfig.levelNum === 47) {
      motionSpeedScale *= 0.82; // 18% reduce for Level 47
    }

    if (this.activeLevelConfig && this.activeLevelConfig.levelNum === 49) {
      motionSpeedScale *= 0.85; // 15% reduce for Level 49
    }

    if (this.activeLevelConfig && this.activeLevelConfig.levelNum === 50) {
      motionSpeedScale *= 0.80; // 20% reduce for Level 50
    }

    const gameEngine = (window as any).gameEngine;
    const isJadeLotusUltimate = gameEngine && gameEngine.ultimateActive && gameEngine.bird && 
      (gameEngine.bird.getSkin().id === 'articuno');

    if (!isJadeLotusUltimate) {
      this.waveTime += deltaTime * timeScale * motionSpeedScale;
    }

    // Endless progressive difficulty scaling math based on user specifications
    let pct = 0.0;
    if (score > 200 && score <= 300) {
      pct = 0.10 * ((score - 200) / 100.0);
    } else if (score > 300 && score <= 400) {
      pct = 0.10 + 0.05 * ((score - 300) / 100.0);
    } else if (score > 400 && score <= 500) {
      pct = 0.15 + 0.05 * ((score - 400) / 100.0) + 0.10; // Added 10% difficulty increase
    } else if (score > 500) {
      pct = 0.20;
      if (score >= 700) {
        pct = 0.20 + 0.10; // Added 10% difficulty increase
      }
    }

    // Smooth, step-by-step progressive difficulty scaling ratio over 60 points
    const progressRatio = Math.min(1.0, score / 60.0);

    // Dynamic difficulty limits (enforce the constant vertical gap of 281 - representing a 10% increase from 255)
    let startGap = 281;
    let minGap = 281;
    let distMultiplier = 1.0;

    if (gameMode === 'rescue') {
      startGap = 386;
      minGap = 386;
      distMultiplier = 1.45; // Generous horizontal spacing for the flock
    } else if (gameMode === 'flock') {
      startGap = 302; // Set minimum vertical gap to 302 (12% increase from 270)
      minGap = 302;   // Set minimum vertical gap to 302 (12% increase from 270)
      distMultiplier = 1.575; // 30% reduction from 2.25 (2.25 * 0.7 = 1.575)
    } else if (gameMode === 'formation') {
      startGap = 320;
      minGap = 320;
      distMultiplier = 1.25; // Slightly wider spacing for other multi-bird modes
    } else if (difficulty === 'easy') {
      startGap = 281;
      minGap = 281;
      distMultiplier = 1.3;
    } else if (difficulty === 'hard') {
      startGap = 281;
      minGap = 281;
      distMultiplier = 0.80;
    }

    // Scroll speed is already scaled progressively by GameEngine, so we use it directly to ensure perfect sync
    const actualScrollSpeed = scrollSpeed * dtCoeff;

    // Smooth horizontal distance spawning scaling
    const baseDistance = (width / 1.35) * distMultiplier;
    const minDistance = width / 2.0;

    // Scale horizontal distance according to bird horizontal scrollSpeed to maintain playable reaction times
    const speedFactor = scrollSpeed / 4.2;
    let targetDistance;
    if (zone === 'classic') {
      // Classic Mode standard spacing: Default (Medium/Hard) classic gap uses 0.80 multiplier
      const baseDistanceClassic = (width / 1.35) * 0.80;
      const defaultDistance = baseDistanceClassic * 1.15;

      if (difficulty === 'easy') {
        targetDistance = defaultDistance * 1.20 * speedFactor;
      } else {
        targetDistance = defaultDistance * speedFactor;
      }
    } else {
      // Wave Zone spacing
      targetDistance = (baseDistance - (baseDistance - minDistance) * progressRatio) * 0.60 * speedFactor;
    }

    // If not set or invalid, initialize nextSpawnDistance
    if (this.nextSpawnDistance <= 150 && zone !== 'wave') {
      this.nextSpawnDistance = this.activeLevelConfig ? this.obstacleWidth : targetDistance * (1.0 - pct);
    }

    // Update existing obstacles
    for (let i = this.list.length - 1; i >= 0; i--) {
      const obs = this.list[i];
      obs.x -= actualScrollSpeed;

      // Update moving energy ball Y position inside the gap
      if (obs.hasEnergyBall && obs.energyBallY !== undefined && obs.energyBallSpeedY !== undefined && !isJadeLotusUltimate) {
        let currentBallSpeed = obs.energyBallSpeedY * dtCoeff;
        if (obs.levelNum !== undefined && obs.levelNum >= 40 && obs.levelNum <= 60) {
          const groupSize = Math.floor((this.activeLevelConfig?.targetScore || 150) / 3);
          const actualIdx = obs.obstacleIdx || 0;
          const groupIdx = Math.min(2, Math.floor(actualIdx / groupSize));
          if (groupIdx === 1) {
            currentBallSpeed *= 0.95; // 5% reduce
          } else if (groupIdx === 2) {
            currentBallSpeed *= 0.90; // 10% reduce
          }
        }
        obs.energyBallY += currentBallSpeed;

        const rad = obs.energyBallRadius || 16;
        // Gap boundaries (top pipe bottom and bottom pipe top)
        const topBound = obs.topHeight + rad;
        const bottomBound = height - obs.bottomHeight - rad;

        // Bounce checks
        if (obs.energyBallY <= topBound) {
          obs.energyBallY = topBound;
          obs.energyBallSpeedY = Math.abs(obs.energyBallSpeedY); // Move down
        } else if (obs.energyBallY >= bottomBound) {
          obs.energyBallY = bottomBound;
          obs.energyBallSpeedY = -Math.abs(obs.energyBallSpeedY); // Move up
        }
      }

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
                  const pColor = obs.worldId === 'ice' ? '#e0ffff' : '#ffaa00';
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
          if (!isJadeLotusUltimate) {
            obs.animTimer! += deltaTime * timeScale;
            if (obs.animTimer! > obs.animDuration!) {
              obs.animTimer = obs.animDuration!;
            }
          }

          const progress = obs.animTimer! / obs.animDuration!;
          // Soft elastic easing open (default for most levels)
          const c4 = (2 * Math.PI) / 3;
          const elasticEase = progress === 0 ? 0 : progress === 1 ? 1 : Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * c4) + 1;
          // Smooth easeOutSine for Level 11 and Level 1 to avoid mid-animation split jitter
          const sineEase = Math.sin((progress * Math.PI) / 2);
          const easedOpen = (obs.levelNum === 11 || obs.levelNum === 1) ? sineEase : elasticEase;

          // Level 1-5 Custom Flight Path & Animation Updates
          // Level 1-10 Choreographed Animations Update Loop
          const groupSize = Math.floor(this.activeLevelConfig.targetScore / 3);
          const actualIdx = obs.obstacleIdx || 0;
          const groupIdx = Math.min(2, Math.floor(actualIdx / groupSize));
          if (obs.patternType === 'level1_funnel') {
            // LEVEL 1: "The Winding Cavern" - Gentle beginner friendly animations
            if (groupIdx === 1) {
              // Group 2: "Stepped Zig-Zag Cavern" - Pure horizontal shearing (no vertical bobbing)
              obs.isLaser = false;
              const shear = Math.sin(this.waveTime * 1.6 + actualIdx * 0.3) * 12;
              obs.shakeX = shear;
              obs.shakeX2 = -shear;
              obs.targetTopHeight = obs.baseTopHeight!;
              obs.targetBottomHeight = obs.baseBottomHeight!;
            } else if (groupIdx === 2) {
              // Group 3: "Spiral Cavern Twist" - Elastic pincer breathing on lasers (no horizontal shake)
              obs.isLaser = true;
              const breath = Math.sin(this.waveTime * 2.0 + actualIdx * 0.2) * 15;
              obs.targetTopHeight = obs.baseTopHeight! + breath;
              obs.targetBottomHeight = obs.baseBottomHeight! + breath;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else {
              // Group 1: Original behavior (smooth parallel vertical bobbing on standard pipes)
              obs.isLaser = false;
              const overallSway = Math.sin(this.waveTime * 0.8) * 10;
              const ripple = Math.sin(this.waveTime * 1.2 + actualIdx * 0.18) * 4;
              const slam = overallSway + ripple;
              obs.targetTopHeight = obs.baseTopHeight! + slam;
              obs.targetBottomHeight = obs.baseBottomHeight! - slam;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            }
          } else if (obs.patternType === 'level2_diamond') {
            // LEVEL 2: "The Wave Gauntlet"
            if (groupIdx === 1) {
              // Group 2: "Steep Peak-Valley Maze" - Parallel vertical bobbing (no horizontal shake)
              obs.isLaser = false;
              const verticalShift = Math.sin(this.waveTime * 2.2 + actualIdx * 0.4) * 18;
              obs.targetTopHeight = obs.baseTopHeight! + verticalShift;
              obs.targetBottomHeight = obs.baseBottomHeight! - verticalShift;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else if (groupIdx === 2) {
              // Group 3: "Funneling Spiral Tunnel" - Circular orbital spin on lasers (no vertical bobbing)
              obs.isLaser = true;
              const spinAngle = this.waveTime * 1.5 + actualIdx * 0.4;
              obs.shakeX = Math.sin(spinAngle) * 14;
              obs.shakeX2 = -Math.cos(spinAngle) * 14;
              obs.targetTopHeight = obs.baseTopHeight!;
              obs.targetBottomHeight = obs.baseBottomHeight!;
            } else {
              // Group 1: Original gentle wave (opposite horizontal shake + vertical bobbing)
              obs.isLaser = false;
              obs.shakeX = Math.sin(this.waveTime * 1.5 + actualIdx * 0.5) * 8;
              obs.shakeX2 = -Math.sin(this.waveTime * 1.5 + actualIdx * 0.5) * 8;
              const overallSway = Math.sin(this.waveTime * 0.8) * 12;
              const ripple = Math.sin(this.waveTime * 1.4 + actualIdx * 0.16) * 6;
              const slam = overallSway + ripple;
              obs.targetTopHeight = obs.baseTopHeight! + slam;
              obs.targetBottomHeight = obs.baseBottomHeight! - slam;
            }
          } else if (obs.patternType === 'level3_arc') {
            // Dimensional Distortion Warp Grid
            if (groupIdx === 1) {
              // Group 2: "Double-Step See-saw" - Pure vertical breathing on standard pipes (no horizontal shake)
              obs.isLaser = false;
              const rippleVal = Math.sin(this.waveTime * 1.4 + actualIdx * 0.5) * 16;
              obs.targetTopHeight = obs.baseTopHeight! + rippleVal;
              obs.targetBottomHeight = obs.baseBottomHeight! + rippleVal;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else if (groupIdx === 2) {
              // Group 3: "Void Singularity / Central Gate" - Pure horizontal shearing on lasers (no vertical bobbing)
              obs.isLaser = true;
              const shear = Math.sin(this.waveTime * 1.8 + actualIdx * 0.4) * 20;
              obs.shakeX = shear;
              obs.shakeX2 = -shear;
              obs.targetTopHeight = obs.baseTopHeight!;
              obs.targetBottomHeight = obs.baseBottomHeight!;
            } else {
              // Group 1: Original behavior (see-saw vertical bobbing + opposite shake on standard pipes)
              obs.isLaser = false;
              const phase = this.waveTime * 1.8 + (actualIdx % 3) * (Math.PI * 2 / 3);
              const shift = Math.sin(phase) * 18;
              const shake = Math.cos(this.waveTime * 2.0 + actualIdx * 0.5) * 6;
              obs.shakeX = shake;
              obs.shakeX2 = -shake;
              obs.targetTopHeight = obs.baseTopHeight! + shift;
              obs.targetBottomHeight = obs.baseBottomHeight! - shift;
            }
          } else if (obs.patternType === 'level4_snake') {
            // LEVEL 4: "The Laser Grid Gauntlet" - Gentle sentinel beams
            if (groupIdx === 1) {
              // Group 2: "Binary Switch Gates" - Alternating blocky elevator jumps on standard pipes (no horizontal shake)
              obs.isLaser = false;
              const timeBlock = Math.floor(this.waveTime * 0.67); // switches every 1.5 seconds
              const isUp = (timeBlock + (actualIdx % 2)) % 2 === 0;
              const jumpOffset = isUp ? 22 : -22;
              obs.targetTopHeight = obs.baseTopHeight! + jumpOffset;
              obs.targetBottomHeight = obs.baseBottomHeight! - jumpOffset;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else if (groupIdx === 2) {
              // Group 3: "Slanted Ramp Corridor" - Pure horizontal sweeping on lasers (no vertical bobbing)
              obs.isLaser = true;
              const sweep = Math.sin(this.waveTime * 1.6 + actualIdx * 0.3) * 24;
              obs.shakeX = sweep;
              obs.shakeX2 = sweep;
              obs.targetTopHeight = obs.baseTopHeight!;
              obs.targetBottomHeight = obs.baseBottomHeight!;
            } else {
              // Group 1: Original behavior (slow parallel vertical bobbing on lasers)
              obs.isLaser = true;
              const neonBlink = Math.sin(this.waveTime * 0.8 + actualIdx * 0.5) * 6;
              obs.targetTopHeight = obs.baseTopHeight! + neonBlink;
              obs.targetBottomHeight = obs.baseBottomHeight! - neonBlink;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            }
          } else if (obs.patternType === 'level5_hourglass') {
            // LEVEL 5: "The Helix Vortex" - Slow orbital shifts
            if (groupIdx === 1) {
              // Group 2: "Hourglass Squeeze Corridor" - Pure vertical breathing squeeze on lasers (no horizontal shake)
              obs.isLaser = true;
              const pulse = Math.sin(this.waveTime * 1.6 + actualIdx * 0.4) * 16;
              obs.targetTopHeight = obs.baseTopHeight! + pulse;
              obs.targetBottomHeight = obs.baseBottomHeight! + pulse;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else if (groupIdx === 2) {
              // Group 3: "Blocky Checkerboard Step" - Diagonal blocky step slides on standard pipes
              obs.isLaser = false;
              const timeBlock = Math.floor(this.waveTime * 0.67); // switches every 1.5 seconds
              const isUp = (timeBlock + (actualIdx % 2)) % 2 === 0;
              const stepY = isUp ? 22 : -22;
              obs.targetTopHeight = obs.baseTopHeight! + stepY;
              obs.targetBottomHeight = obs.baseBottomHeight! - stepY;
              const slideX = Math.sin(this.waveTime * 1.8 + actualIdx * 0.4) * 18;
              obs.shakeX = slideX;
              obs.shakeX2 = -slideX;
            } else {
              // Group 1: Original behavior (circular orbit shake, zero vertical animation on standard pipes)
              obs.isLaser = false;
              const angle = this.waveTime * 1.5 + actualIdx * 0.4;
              obs.shakeX = Math.sin(angle) * 10;
              obs.shakeX2 = Math.cos(angle) * 10;
              obs.targetTopHeight = obs.baseTopHeight!;
              obs.targetBottomHeight = obs.baseBottomHeight!;
            }
          } else if (obs.patternType === 'level6_infinity') {
            // LEVEL 6: "The Folding Accordion Gates"
            if (groupIdx === 1) {
              // Group 2: "Pendulum Swing Doors" - Top and bottom swing opposite like a pendulum (no vertical bob)
              obs.isLaser = false;
              const pendAngle = this.waveTime * 2.4 + actualIdx * 0.55;
              const pendAmp = Math.sin(pendAngle) * 22;
              obs.shakeX = pendAmp;
              obs.shakeX2 = -pendAmp;
              // Pendulum twist: top pipe and bottom pipe tilt in counter-rhythm
              const pendTilt = Math.cos(pendAngle) * 14;
              obs.targetTopHeight = obs.baseTopHeight! + pendTilt;
              obs.targetBottomHeight = obs.baseBottomHeight! - pendTilt;
            } else if (groupIdx === 2) {
              // Group 3: "Neon Pulse Zipper" - Lasers with ripple-wave zipper: alternating columns open/close in a travelling wave
              obs.isLaser = true;
              const zipPhase = this.waveTime * 2.8 - actualIdx * 0.6;
              const zipAmp = Math.sin(zipPhase) * 20;
              obs.targetTopHeight = obs.baseTopHeight! + zipAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - zipAmp;
              obs.shakeX = Math.cos(zipPhase * 0.5) * 10;
              obs.shakeX2 = -Math.cos(zipPhase * 0.5) * 10;
            } else {
              // Group 1: Original quadrature accordion motion
              const phaseTop = this.waveTime * 1.96 + actualIdx * 0.5;
              const phaseBottom = phaseTop + Math.PI / 2;
              obs.shakeX = Math.sin(phaseTop) * 26;
              obs.shakeX2 = Math.cos(phaseBottom) * 26;
              const topBob = Math.cos(phaseTop) * 53 * 0.20;
              const botBob = Math.sin(phaseBottom) * 53 * 0.20;
              obs.targetTopHeight = obs.baseTopHeight! + topBob;
              obs.targetBottomHeight = obs.baseBottomHeight! - botBob;
            }
          } else if (obs.patternType === 'level7_dna') {
            // LEVEL 7: "The Magnetic Pull Chambers"
            if (groupIdx === 1) {
              // Group 2: "Spiral Vortex Lasers" - Lasers with counter-rotating corkscrew spiral (horizontal+vertical spiral)
              obs.isLaser = true;
              const spiralAngle = this.waveTime * 2.2 + actualIdx * 0.7;
              obs.shakeX = Math.sin(spiralAngle) * 18;
              obs.shakeX2 = -Math.sin(spiralAngle + Math.PI * 0.6) * 18;
              const spiralY = Math.cos(spiralAngle * 0.8) * 16;
              obs.targetTopHeight = obs.baseTopHeight! + spiralY;
              obs.targetBottomHeight = obs.baseBottomHeight! - spiralY;
            } else if (groupIdx === 2) {
              // Group 3: "Clap & Release Gates" - Pipes snap shut and open in a slow rhythmic clap pattern
              obs.isLaser = false;
              const clapCycle = (this.waveTime * 1.1 + actualIdx * 0.3) % (Math.PI * 2);
              const clapAmp = Math.pow(Math.abs(Math.sin(clapCycle)), 0.4) * 26 * Math.sign(Math.sin(clapCycle));
              obs.targetTopHeight = obs.baseTopHeight! + clapAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - clapAmp;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else {
              // Group 1: Original magnetic pull
              const force = Math.sin(this.waveTime * 3.2 + actualIdx * 0.8) * 30;
              obs.targetTopHeight = obs.baseTopHeight! - force;
              obs.targetBottomHeight = obs.baseBottomHeight! - force;
            }
          } else if (obs.patternType === 'level8_lightning') {
            // LEVEL 8: "The Tremor Cascades"
            if (groupIdx === 1) {
              // Group 2: "Criss-Cross Laser Scissors" - Lasers that scissor cross diagonally in opposite directions
              obs.isLaser = true;
              const scissorT = this.waveTime * 1.8 + actualIdx * 0.5;
              obs.shakeX = Math.cos(scissorT) * 24;        // top pipe slides right
              obs.shakeX2 = -Math.cos(scissorT) * 24;     // bottom pipe slides left (opposite)
              const scissorY = Math.sin(scissorT * 1.3) * 14;
              obs.targetTopHeight = obs.baseTopHeight! + scissorY;
              obs.targetBottomHeight = obs.baseBottomHeight! + scissorY; // same direction = gap shifts up/down
            } else if (groupIdx === 2) {
              // Group 3: "Stacked Bounce Columns" - Alternating columns bounced in an outward-inward piston rhythm
              obs.isLaser = false;
              const isEven = (actualIdx % 2 === 0);
              const bounceT = this.waveTime * 2.6 + actualIdx * 0.35;
              const bounce = Math.abs(Math.sin(bounceT)) * 24 * (isEven ? 1 : -1);
              obs.targetTopHeight = obs.baseTopHeight! + bounce;
              obs.targetBottomHeight = obs.baseBottomHeight! - bounce;
              obs.shakeX = Math.sin(this.waveTime * 3.5 + actualIdx) * 6;
              obs.shakeX2 = -Math.sin(this.waveTime * 3.5 + actualIdx) * 6;
            } else {
              // Group 1: Original earthquake tremor
              obs.shakeX = Math.sin(this.waveTime * 20) * 8;
              obs.shakeX2 = -Math.sin(this.waveTime * 20) * 8;
              const tremorY = Math.sin(this.waveTime * 2.8 + actualIdx * 0.5) * 12;
              obs.targetTopHeight = obs.baseTopHeight! + tremorY;
              obs.targetBottomHeight = obs.baseBottomHeight! - tremorY;
            }
          } else if (obs.patternType === 'level9_magnetic') {
            // LEVEL 9: "The Quantum Entangled Gates"
            if (groupIdx === 1) {
              // Group 2: "Wave Cascade Lasers" - Lasers with a sinusoidal travelling ripple (each column offset in phase like a stadium wave)
              obs.isLaser = true;
              const wavePhase = this.waveTime * 2.0 - actualIdx * 0.5;
              const waveCrash = Math.sin(wavePhase) * 20;
              obs.targetTopHeight = obs.baseTopHeight! + waveCrash;
              obs.targetBottomHeight = obs.baseBottomHeight! - waveCrash;
              obs.shakeX = Math.cos(wavePhase * 0.7) * 14;
              obs.shakeX2 = -Math.cos(wavePhase * 0.7) * 14;
            } else if (groupIdx === 2) {
              // Group 3: "Tick-Tock Clock Gates" - Pipes swing like clock hands, alternating left-right pivot with vertical oscillation
              obs.isLaser = false;
              const tickPhase = this.waveTime * 1.5 + actualIdx * 0.4;
              const swingX = Math.sin(tickPhase) * 20;
              const swingY = -Math.abs(Math.cos(tickPhase)) * 18; // rises at extremes, falls at center
              obs.shakeX = swingX;
              obs.shakeX2 = swingX * 0.5; // slight different scale for visual depth
              obs.targetTopHeight = obs.baseTopHeight! + swingY;
              obs.targetBottomHeight = obs.baseBottomHeight! - swingY;
            } else {
              // Group 1: Original quantum entanglement
              const isEven = (actualIdx % 2 === 0);
              const entangleTime = this.waveTime * 1.57;
              const slide = Math.sin(entangleTime + (actualIdx * 0.5)) * 25 * 0.35;
              const dir = isEven ? 1 : -1;
              obs.targetTopHeight = obs.baseTopHeight! + (dir * slide);
              obs.targetBottomHeight = obs.baseBottomHeight! - (dir * slide);
              obs.shakeX = isEven ? Math.cos(entangleTime) * 20 : -Math.cos(entangleTime) * 20;
              obs.shakeX2 = isEven ? -Math.cos(entangleTime) * 20 : Math.cos(entangleTime) * 20;
            }
          } else if (obs.patternType === 'level10_miniboss') {
            // LEVEL 10: "The Chrono Warp Horizon"
            if (groupIdx === 1) {
              // Group 2: "Plasma Surge Lasers" - Lasers with high-frequency electric jolt bursts (rapid micro-stutter + slow drift)
              obs.isLaser = true;
              const surgeDrift = Math.sin(this.waveTime * 1.4 + actualIdx * 0.6) * 18;
              const surgeJolt = Math.sin(this.waveTime * 12 + actualIdx * 1.2) * 5; // rapid micro-jitter
              obs.targetTopHeight = obs.baseTopHeight! + surgeDrift + surgeJolt;
              obs.targetBottomHeight = obs.baseBottomHeight! - surgeDrift + surgeJolt;
              obs.shakeX = Math.cos(this.waveTime * 2.0 + actualIdx * 0.5) * 16;
              obs.shakeX2 = -Math.cos(this.waveTime * 2.0 + actualIdx * 0.5) * 16;
            } else if (groupIdx === 2) {
              // Group 3: "Orbital Figure-8 Pipes" - Standard pipes trace a figure-8 Lissajous path (2:1 frequency ratio)
              obs.isLaser = false;
              const figT = this.waveTime * 1.6 + actualIdx * 0.45;
              obs.shakeX = Math.sin(figT * 2) * 22;          // horizontal at 2x frequency
              obs.shakeX2 = Math.sin(figT * 2 + Math.PI) * 22;
              const figY = Math.sin(figT) * 20;              // vertical at 1x frequency
              obs.targetTopHeight = obs.baseTopHeight! + figY;
              obs.targetBottomHeight = obs.baseBottomHeight! - figY;
            } else {
              // Group 1: Original chrono warp ripple
              const timeDilation = 1.0 + Math.sin(this.waveTime * 0.84) * 0.4;
              const warpTime = this.waveTime * 1.96 * timeDilation;
              const ripplePhase = warpTime - actualIdx * 0.45;
              obs.shakeX = Math.sin(ripplePhase) * 26;
              obs.shakeX2 = Math.cos(ripplePhase) * 26;
              const compression = Math.sin(ripplePhase + Math.PI / 4) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + compression;
              obs.targetBottomHeight = obs.baseBottomHeight! - compression;
            }
          } else if (obs.patternType === 'level11_diamond') {
            // Level 11: Structure-Aligned Animations
            const idx = actualIdx % 12;
            if (groupIdx === 0) {
              // Group 1: "Sinking Valley" — center columns bob while edges stay stable
              obs.isLaser = false;
              const centerDist = Math.abs(idx - 5.5);
              const centerFactor = 1.0 - (centerDist / 5.5);
              const breath = Math.sin(this.waveTime * 2.5) * 22 * centerFactor;
              obs.targetTopHeight = obs.baseTopHeight! + breath;
              obs.targetBottomHeight = obs.baseBottomHeight! - breath;
            } else if (groupIdx === 1) {
              // Group 2: "Neon Ripple Curtain" — lasers with a slow travelling sine wave from left to right
              obs.isLaser = true;
              const ripT = this.waveTime * 1.9 - actualIdx * 0.55;
              const ripAmp = Math.sin(ripT) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + ripAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - ripAmp;
              obs.shakeX = Math.cos(ripT * 0.6) * 12;
              obs.shakeX2 = -Math.cos(ripT * 0.6) * 12;
            } else {
              // Group 3: "Accordion Clap Pipes" — standard pipes squeeze & release in alternating columns
              obs.isLaser = false;
              const isOdd = actualIdx % 2 === 1;
              const clapT = this.waveTime * 2.6 + (isOdd ? Math.PI : 0);
              const clap = Math.sin(clapT) * 20;
              obs.targetTopHeight = obs.baseTopHeight! + clap;
              obs.targetBottomHeight = obs.baseBottomHeight! - clap;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            }
          } else if (obs.patternType === 'level12_doublewave') {
            // Level 12: "The Pincer Maze"
            if (groupIdx === 1) {
              // Group 2: "Laser Tide Surge" — lasers drift together in slow tidal sway + horizontal shimmer
              obs.isLaser = true;
              const tide = Math.sin(this.waveTime * 1.4 + actualIdx * 0.35) * 20;
              obs.targetTopHeight = obs.baseTopHeight! + tide;
              obs.targetBottomHeight = obs.baseBottomHeight! + tide;
              obs.shakeX = Math.cos(this.waveTime * 2.0 + actualIdx * 0.5) * 14;
              obs.shakeX2 = -Math.cos(this.waveTime * 2.0 + actualIdx * 0.5) * 14;
            } else if (groupIdx === 2) {
              // Group 3: "Staggered Fan Sweep" — pipes sweep in alternating fan arcs (even columns up, odd columns down)
              obs.isLaser = false;
              const fanDir = actualIdx % 2 === 0 ? 1 : -1;
              const fanT = this.waveTime * 2.2 + actualIdx * 0.4;
              const fanAmp = Math.sin(fanT) * 24 * fanDir;
              obs.targetTopHeight = obs.baseTopHeight! + fanAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - fanAmp;
              obs.shakeX = Math.sin(fanT * 0.7) * 8;
              obs.shakeX2 = -Math.sin(fanT * 0.7) * 8;
            } else {
              // Group 1: Original pincer maze
              obs.isLaser = false;
              const tidal = Math.sin(this.waveTime * 1.6) * 14.5 * 0.80;
              const isOdd = (actualIdx % 2 === 1);
              const zigzag = Math.sin(this.waveTime * 3.0 + actualIdx * 0.9) * 11.3 * (isOdd ? 1 : -1) * 0.80;
              const pincerSqueeze = Math.pow(Math.sin(this.waveTime * 2.2 - actualIdx * 0.4), 2) * 16;
              obs.targetTopHeight = obs.baseTopHeight! + tidal + zigzag + pincerSqueeze;
              obs.targetBottomHeight = obs.baseBottomHeight! - tidal - zigzag + pincerSqueeze;
            }
          } else if (obs.patternType === 'level13_scurve') {
            // Level 13: "Double Peristaltic Wave"
            if (groupIdx === 1) {
              // Group 2: "Electric Lash Lasers" — lasers crack like a whip with fast horizontal snap + vertical drift
              obs.isLaser = true;
              const whipT = this.waveTime * 3.0 + actualIdx * 0.65;
              obs.shakeX = Math.sin(whipT) * 22;
              obs.shakeX2 = -Math.sin(whipT + 0.8) * 22;
              const drift = Math.cos(this.waveTime * 1.2 + actualIdx * 0.3) * 14;
              obs.targetTopHeight = obs.baseTopHeight! + drift;
              obs.targetBottomHeight = obs.baseBottomHeight! - drift;
            } else if (groupIdx === 2) {
              // Group 3: "Double Bounce Pistons" — pipes thrust outward at double the wave frequency, bouncing like pistons
              obs.isLaser = false;
              const pistonT = this.waveTime * 3.6 + actualIdx * 0.45;
              const piston = Math.abs(Math.sin(pistonT)) * 26 - 13; // oscillates 0→26 becoming -13 to +13
              obs.targetTopHeight = obs.baseTopHeight! + piston;
              obs.targetBottomHeight = obs.baseBottomHeight! - piston;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else {
              // Group 1: Original peristaltic ripple
              obs.isLaser = false;
              const rippleAngle = (actualIdx / 11) * Math.PI * 2;
              const ripple = Math.sin(this.waveTime * 2.8 + rippleAngle * 2) * 16;
              obs.targetTopHeight = obs.baseTopHeight! + ripple;
              obs.targetBottomHeight = obs.baseBottomHeight! - ripple;
            }
          } else if (obs.patternType === 'level14_zigzag') {
            // Level 14: Zigzag Orbital
            if (groupIdx === 1) {
              // Group 2: "Phase-Locked Laser Gate" — lasers oscillate vertically in two interlocked phases
              obs.isLaser = true;
              const lockPhase = this.waveTime * 2.4 + actualIdx * 0.6;
              const locked = Math.sin(lockPhase) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + locked;
              obs.targetBottomHeight = obs.baseBottomHeight! - locked;
              obs.shakeX = Math.cos(lockPhase * 0.5) * 14;
              obs.shakeX2 = -Math.cos(lockPhase * 0.5) * 14;
            } else if (groupIdx === 2) {
              // Group 3: "Tectonic Plate Shift" — pipes slide horizontally in block-steps, reversing direction every 1.2s
              obs.isLaser = false;
              const blockT = Math.floor(this.waveTime * 0.83); // toggles every 1.2s
              const slideDir = (blockT + (actualIdx % 2)) % 2 === 0 ? 1 : -1;
              obs.shakeX = slideDir * 20;
              obs.shakeX2 = slideDir * 20;
              const plateY = Math.sin(this.waveTime * 1.6 + actualIdx * 0.4) * 14;
              obs.targetTopHeight = obs.baseTopHeight! + plateY;
              obs.targetBottomHeight = obs.baseBottomHeight! - plateY;
            } else {
              // Group 1: Original orbital rotation
              obs.isLaser = false;
              const angle = this.waveTime * 2.0 + actualIdx * 0.5;
              obs.shakeX = Math.sin(angle) * (20 * 1.30);
              obs.shakeX2 = Math.cos(angle) * (20 * 1.30);
              const centerY = obs.spawnCenterY!;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level14_crossflow') {
            // Level 18 (swapped): "The Wormhole Vortex" — path gap shifting reduced 60% (×0.40)
            const p14group = Math.floor((actualIdx % 18) / 6); // 0=spiral, 1=shockwave, 2=gravity
            if (p14group === 0) {
              // Group 1 (Spiral Funnel): orbital spin — amplitude ×0.40: 22→8.8, shakeX 16→6.4
              const spinTop = this.waveTime * 2.1 + actualIdx * 0.55;
              const spinBot = this.waveTime * 2.1 + actualIdx * 0.55 + Math.PI * 0.6; // out of phase
              obs.targetTopHeight = obs.baseTopHeight! + Math.cos(spinTop) * 8.8;
              obs.targetBottomHeight = obs.baseBottomHeight! + Math.sin(spinBot) * 8.8;
              // Horizontal orbital shimmer — amplitude ×0.40: 16→6.4
              obs.shakeX = Math.sin(spinTop * 0.7) * 6.4;
              obs.shakeX2 = -Math.sin(spinBot * 0.7) * 6.4;
            } else if (p14group === 1) {
              // Group 2 (Shockwave Ring): radial pulse — amplitude ×0.40: 18→7.2
              const distFromCenter = Math.abs((actualIdx % 6) - 2.5) / 2.5;
              const pulse = Math.sin(this.waveTime * 2.8 - distFromCenter * 2.0) * 7.2;
              obs.targetTopHeight = obs.baseTopHeight! - pulse * (1 - distFromCenter);
              obs.targetBottomHeight = obs.baseBottomHeight! + pulse * (1 - distFromCenter);
            } else {
              // Group 3 (Gravity Flip): pendulum sway — amplitude ×0.40: 25→10
              const flipSway = Math.sin(this.waveTime * 1.4 + actualIdx * 0.8) * 10;
              obs.targetTopHeight = obs.baseTopHeight! + flipSway;
              obs.targetBottomHeight = obs.baseBottomHeight! - flipSway;
            }
          } else if (obs.patternType === 'level15_elevatorstair') {
            // Level 15: Diamond Chambers
            if (groupIdx === 1) {
              // Group 2: "Rotating Laser Vortex" — lasers spin in a corkscrew with counter-phase top/bottom
              obs.isLaser = true;
              const vortexT = this.waveTime * 2.0 + actualIdx * 0.7;
              obs.shakeX = Math.sin(vortexT) * 20;
              obs.shakeX2 = -Math.sin(vortexT + Math.PI * 0.5) * 20;
              const vortexY = Math.cos(vortexT * 0.8) * 18;
              obs.targetTopHeight = obs.baseTopHeight! + vortexY;
              obs.targetBottomHeight = obs.baseBottomHeight! - vortexY;
            } else if (groupIdx === 2) {
              // Group 3: "Galloping Gate Rush" — pipes jump in triplet rhythm: 3 fast hops then a pause
              obs.isLaser = false;
              const gallopCycle = (this.waveTime * 2.5 + actualIdx * 0.3) % (Math.PI * 2);
              const gallopAmp = (gallopCycle < Math.PI * 1.5)
                ? Math.sin(gallopCycle * 2) * 22
                : 0; // pause during the last quarter of the cycle
              obs.targetTopHeight = obs.baseTopHeight! + gallopAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - gallopAmp;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else {
              // Group 1: Original diamond pincer pulse
              obs.isLaser = false;
              const pulse = Math.sin(this.waveTime * 2.2) * 20;
              const sign = (actualIdx % 2 === 0 ? 1 : -1);
              obs.targetTopHeight = obs.baseTopHeight! + pulse * sign;
              obs.targetBottomHeight = obs.baseBottomHeight! + pulse * sign;
            }
          } else if (obs.patternType === 'level16_rotatingarc') {
            // Level 16: Infinity Loops
            if (groupIdx === 1) {
              // Group 2: "Heartbeat Pulse Lasers" — lasers throb in a heartbeat double-beat rhythm
              obs.isLaser = true;
              const beatT = (this.waveTime * 2.8 + actualIdx * 0.4) % (Math.PI * 2);
              // Heartbeat: sharp peak, quick second peak, then rest
              const beat1 = Math.exp(-Math.pow((beatT - 1.2), 2) / 0.15) * 22;
              const beat2 = Math.exp(-Math.pow((beatT - 2.0), 2) / 0.20) * 14;
              const heartbeat = beat1 + beat2;
              obs.targetTopHeight = obs.baseTopHeight! + heartbeat;
              obs.targetBottomHeight = obs.baseBottomHeight! - heartbeat;
              obs.shakeX = Math.sin(this.waveTime * 4.0 + actualIdx * 0.5) * 10;
              obs.shakeX2 = -Math.sin(this.waveTime * 4.0 + actualIdx * 0.5) * 10;
            } else if (groupIdx === 2) {
              // Group 3: "Twisting Braid Pipes" — top and bottom pipes sway in opposite arcs forming a braid
              obs.isLaser = false;
              const braidT = this.waveTime * 1.7 + actualIdx * 0.5;
              obs.shakeX = Math.sin(braidT) * 18;           // top pipe sways right
              obs.shakeX2 = -Math.sin(braidT + Math.PI) * 18; // bottom pipe sways left (opposite)
              const braidY = Math.cos(braidT * 0.9) * 16;
              obs.targetTopHeight = obs.baseTopHeight! + braidY;
              obs.targetBottomHeight = obs.baseBottomHeight! + braidY; // same direction = gap drifts together
            } else {
              // Group 1: Original lemniscate figure-eight
              obs.isLaser = false;
              const tVal = this.waveTime * 1.8 - actualIdx * 0.55;
              obs.shakeX = Math.sin(tVal * 2) * 10.5;
              obs.shakeX2 = -Math.sin(tVal * 2) * 10.5;
              const loopY = Math.sin(tVal) * 13.5;
              obs.targetTopHeight = obs.baseTopHeight! + loopY;
              obs.targetBottomHeight = obs.baseBottomHeight! - loopY;
            }
          } else if (obs.patternType === 'level17_heartbeat') {
            // Level 17: Volcanic Crags
            if (groupIdx === 1) {
              // Group 2: "Lava Pulse Lasers" — lasers surge upward like lava fountains with asymmetric burst
              obs.isLaser = true;
              const lavaBurst = Math.max(0, Math.sin(this.waveTime * 2.6 - actualIdx * 0.5)) * 28;
              obs.targetTopHeight = obs.baseTopHeight! - lavaBurst;
              obs.targetBottomHeight = obs.baseBottomHeight! + lavaBurst;
              obs.shakeX = Math.sin(this.waveTime * 18 + actualIdx) * 7;
              obs.shakeX2 = -Math.sin(this.waveTime * 18 + actualIdx) * 7;
            } else if (groupIdx === 2) {
              // Group 3: "Seismic Ripple Pipes" — pipes shake in a travelling seismic wave with growing amplitude
              obs.isLaser = false;
              const seismicT = this.waveTime * 2.4 - actualIdx * 0.55;
              const seismicAmp = 14 + Math.sin(this.waveTime * 0.5) * 8; // amplitude breathes slowly
              const seismic = Math.sin(seismicT) * seismicAmp;
              obs.targetTopHeight = obs.baseTopHeight! + seismic;
              obs.targetBottomHeight = obs.baseBottomHeight! - seismic;
              obs.shakeX = Math.cos(seismicT * 0.7) * 10;
              obs.shakeX2 = -Math.cos(seismicT * 0.7) * 10;
            } else {
              // Group 1: Original tectonic tremor
              obs.isLaser = false;
              const tremor = (Math.sin(this.waveTime * 14) * 4) + (Math.sin(this.waveTime * 2.2) * 10);
              obs.shakeX = Math.sin(this.waveTime * 22) * 6;
              obs.shakeX2 = -Math.sin(this.waveTime * 22) * 6;
              obs.targetTopHeight = obs.baseTopHeight! + tremor;
              obs.targetBottomHeight = obs.baseBottomHeight! - tremor;
            }
          } else if (obs.patternType === 'level18_serpent') {
            // Level 18: Magnetic Slingshots
            if (groupIdx === 1) {
              // Group 2: "Slipstream Lasers" — lasers flow in a smooth sinusoidal current, top and bottom out of phase
              obs.isLaser = true;
              const slipT = this.waveTime * 2.2 + actualIdx * 0.5;
              obs.targetTopHeight = obs.baseTopHeight! + Math.sin(slipT) * 22;
              obs.targetBottomHeight = obs.baseBottomHeight! - Math.sin(slipT + Math.PI * 0.6) * 22;
              obs.shakeX = Math.cos(slipT * 0.6) * 16;
              obs.shakeX2 = -Math.cos(slipT * 0.6) * 16;
            } else if (groupIdx === 2) {
              // Group 3: "Yo-Yo Chain Pipes" — alternating columns yo-yo up and down with elastic bounce feel
              obs.isLaser = false;
              const yoyoT = this.waveTime * 2.8 + actualIdx * 0.55;
              const yoyo = Math.pow(Math.sin(yoyoT), 3) * 26; // cubic gives snappy elastic feel
              const colDir = actualIdx % 2 === 0 ? 1 : -1;
              obs.targetTopHeight = obs.baseTopHeight! + yoyo * colDir;
              obs.targetBottomHeight = obs.baseBottomHeight! - yoyo * colDir;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else {
              // Group 1: Original magnetic slingshot
              obs.isLaser = false;
              const mag = Math.sin(this.waveTime * 3.5 - actualIdx * 0.3) * 24;
              obs.targetTopHeight = obs.baseTopHeight! - mag;
              obs.targetBottomHeight = obs.baseBottomHeight! - mag;
            }
          } else if (obs.patternType === 'level19_magnetic') {
            // Level 19: Crossflow Intercepting Gates
            if (groupIdx === 1) {
              // Group 2: "Storm Surge Lasers" — lasers heave with fast tidal-surge vertical motion + shimmering X sway
              obs.isLaser = true;
              const surgeT = this.waveTime * 3.2 - actualIdx * 0.45;
              const surge = Math.sin(surgeT) * 24;
              obs.targetTopHeight = obs.baseTopHeight! + surge;
              obs.targetBottomHeight = obs.baseBottomHeight! - surge;
              obs.shakeX = Math.sin(surgeT * 0.5) * 18;
              obs.shakeX2 = -Math.sin(surgeT * 0.5) * 18;
            } else if (groupIdx === 2) {
              // Group 3: "Swing & Lock Pipes" — pipes swing wide then lock in place briefly before swinging back
              obs.isLaser = false;
              const lockT = (this.waveTime * 1.8 + actualIdx * 0.4) % (Math.PI * 2);
              const swingVal = lockT < Math.PI
                ? Math.sin(lockT) * 26       // swing phase
                : Math.sin(Math.PI) * 26;    // lock phase (frozen at extreme)
              obs.targetTopHeight = obs.baseTopHeight! + swingVal;
              obs.targetBottomHeight = obs.baseBottomHeight! - swingVal;
              obs.shakeX = Math.cos(this.waveTime * 2.2 + actualIdx * 0.3) * 8;
              obs.shakeX2 = -Math.cos(this.waveTime * 2.2 + actualIdx * 0.3) * 8;
            } else {
              // Group 1: Original alternating gate
              obs.isLaser = false;
              const phaseSign = (actualIdx % 2 === 0 ? 1 : -1);
              const gateMove = Math.sin(this.waveTime * 2.8) * 24 * phaseSign;
              obs.targetTopHeight = obs.baseTopHeight! + gateMove;
              obs.targetBottomHeight = obs.baseBottomHeight! - gateMove;
            }
          } else if (obs.patternType === 'level20_masterhybrid') {
            // Level 20: Master Boss Hybrid
            if (groupIdx === 1) {
              // Group 2: "Quantum Flash Lasers" — lasers flicker with rapid sine bursts layered over a slow orbital drift
              obs.isLaser = true;
              const flashDrift = Math.sin(this.waveTime * 1.5 + actualIdx * 0.55) * 20;
              const flashBurst = Math.sin(this.waveTime * 9.0 + actualIdx * 0.8) * 6;
              obs.targetTopHeight = obs.baseTopHeight! + flashDrift + flashBurst;
              obs.targetBottomHeight = obs.baseBottomHeight! - flashDrift + flashBurst;
              obs.shakeX = Math.cos(this.waveTime * 2.2 + actualIdx * 0.5) * 18;
              obs.shakeX2 = -Math.cos(this.waveTime * 2.2 + actualIdx * 0.5) * 18;
            } else if (groupIdx === 2) {
              // Group 3: "Hyper Spiral Pipes" — pipes trace tight outward spirals with increasing radius over time
              obs.isLaser = false;
              const spiralBase = this.waveTime * 2.0 + actualIdx * 0.6;
              const spiralRadius = 16 + Math.sin(this.waveTime * 0.6) * 8; // slowly breathing radius
              obs.shakeX = Math.sin(spiralBase * 2) * spiralRadius;
              obs.shakeX2 = Math.sin(spiralBase * 2 + Math.PI) * spiralRadius;
              const spiralY = Math.cos(spiralBase) * (spiralRadius * 0.9);
              obs.targetTopHeight = obs.baseTopHeight! + spiralY;
              obs.targetBottomHeight = obs.baseBottomHeight! - spiralY;
            } else {
              // Group 1: Original master hybrid orbital
              obs.isLaser = false;
              const orbital = this.waveTime * 1.95 + actualIdx * 0.6;
              obs.shakeX = Math.sin(orbital) * 20;
              obs.shakeX2 = Math.cos(orbital) * 20;
              const hybridSign = (actualIdx % 2 === 0 ? 1 : -1);
              const hybridMove = Math.sin(this.waveTime * 2.028 - actualIdx * 0.4) * 16 + (Math.sin(this.waveTime * 2.496) * 8 * hybridSign);
              obs.targetTopHeight = obs.baseTopHeight! + hybridMove;
              obs.targetBottomHeight = obs.baseBottomHeight! - hybridMove;
            }
          } else if (obs.patternType === 'level30_hybridwave') {
            // Wave flow + breathing effect
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 10;
            const idx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            let waveShift = 0;
            if (idx < groupSize) {
              waveShift = Math.sin(this.waveTime * 1.8 + idx * 0.45) * 25; // Group 1 original waveShift
            } else if (idx < groupSize * 2) {
              waveShift = Math.sin(this.waveTime * 1.8 + idx * 0.45) * 31.25; // Group 2: 25% increase (25 * 1.25 = 31.25)
            } else {
              // Group 3: 25% increase to both base waveShift (31.25) and extra up/down motion (20 * 1.25 = 25)
              waveShift = Math.sin(this.waveTime * 1.8 + idx * 0.45) * 31.25 + Math.sin(this.waveTime * 2.4 + idx * 0.5) * 25;
            }
            const breathingGap = obs.gapHeight! + Math.sin(this.waveTime * 2.8) * 12;
            const centerY = obs.spawnCenterY! + waveShift;
            obs.targetTopHeight = centerY - breathingGap / 2;
            obs.targetBottomHeight = height - centerY - breathingGap / 2;
          } else if (obs.patternType === 'level31_snakemotion') {
            // LEVEL 31: Cyber Glitch
            // Character similarity: high-frequency horizontal-vertical glitchy shifts
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            const glitchTime = Math.floor(this.waveTime * 12);
            const glitchShake = Math.sin(glitchTime * 1.5) * 8;

            if (obstacleIdx < groupSize) {
              // Group 1: Gentle horizontal glitch vibration
              obs.shakeX = glitchShake;
              obs.shakeX2 = glitchShake;
              obs.targetTopHeight = obs.spawnCenterY! - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - obs.spawnCenterY! - obs.gapHeight! / 2;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Horizontal glitch + vertical sine wobble
              obs.shakeX = glitchShake * 1.5;
              obs.shakeX2 = glitchShake * 1.5;
              const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 3.5 + obstacleIdx * 0.4) * 22;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else {
              // Group 3: Dual glitch rotation + vertical step shift
              const angle = glitchTime * 0.8 + obstacleIdx * 0.5;
              obs.shakeX = Math.sin(angle) * 16;
              obs.shakeX2 = Math.cos(angle) * 16;
              const stepShift = (obstacleIdx % 2 === 0 ? -32 : 32) + Math.sin(this.waveTime * 4.0) * 15;
              const centerY = obs.spawnCenterY! + stepShift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level32_waterfall') {
            // LEVEL 32: Geyser Cascades
            // Character similarity: delayed cascading vertical geysers
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (obstacleIdx < groupSize) {
              // Group 1: Slower cascading waterfall
              const delay = (obstacleIdx * 0.5 - this.waveTime * 1.6) % 2.0;
              const cascade = delay * 20;
              const centerY = obs.spawnCenterY! + cascade;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Alternating cascading pincer movement
              const idx = obstacleIdx - groupSize;
              const delay = (idx * 0.4 - this.waveTime * 2.2) % 2.0;
              const pincerShift = delay * 16;
              obs.targetTopHeight = obs.baseTopHeight! + pincerShift;
              obs.targetBottomHeight = obs.baseBottomHeight! + pincerShift;
            } else {
              // Group 3: Geyser eruptions (fast reactive popups)
              const idx = obstacleIdx - groupSize * 2;
              const eruption = Math.max(0, Math.sin(this.waveTime * 3.0 - idx * 0.8)) * 50;
              const centerY = obs.spawnCenterY! - eruption;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level33_magneticpush') {
            // LEVEL 33: Quantum Entanglement
            // Character similarity: mirrored/symmetric breathing gap pulses
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (obstacleIdx < groupSize) {
              // Group 1: Slower symmetric breathing gap
              const breathingGap = obs.gapHeight! + Math.sin(this.waveTime * 2.2) * 15;
              obs.targetTopHeight = obs.spawnCenterY! - breathingGap / 2;
              obs.targetBottomHeight = height - obs.spawnCenterY! - breathingGap / 2;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Out-of-phase breathing (top/bottom invert)
              const shift = Math.sin(this.waveTime * 2.6 + obstacleIdx * 0.5) * 18;
              obs.targetTopHeight = obs.baseTopHeight! + shift;
              obs.targetBottomHeight = obs.baseBottomHeight! - shift;
            } else {
              // Group 3: New "Quantum Wave Vortex" dynamic animation
              // Odd/even columns oscillate vertically in opposite directions, while the whole wave sweeps up/down
              const idx = obstacleIdx - groupSize * 2;
              const waveSweep = Math.sin(this.waveTime * 1.8 + idx * 0.4) * 30;
              const antiPhase = Math.sin(this.waveTime * 3.0 + (obs.obstacleIdx! % 2) * Math.PI) * 25;
              const centerY = obs.spawnCenterY! + waveSweep + antiPhase;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level34_pendulum') {
            // LEVEL 34: Quantum Gravity Slipstreams (New Unique Redesign)
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (obstacleIdx < groupSize) {
              // Group 1: Breathing wave chamber tunnel
              const breathingGap = obs.gapHeight! + Math.sin(this.waveTime * 2.2 - obstacleIdx * 0.5) * 20;
              const centerY = obs.spawnCenterY!;
              obs.targetTopHeight = centerY - breathingGap / 2;
              obs.targetBottomHeight = height - centerY - breathingGap / 2;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Opposing horizontal zips and vertical squeeze (reduced by 70%)
              const hShift = Math.sin(this.waveTime * 2.8 + obstacleIdx) * 11;
              obs.shakeX = hShift;
              obs.shakeX2 = -hShift;
              const vSqueeze = Math.cos(this.waveTime * 2.5) * 8 * (obstacleIdx % 2 === 0 ? 1 : -1);
              const centerY = obs.spawnCenterY! + vSqueeze;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else {
              // Group 3: 3D orbital spin and vertical bobbing vortex (shake formulas swapped)
              const angle = this.waveTime * 3.0 + obstacleIdx * 0.5;
              obs.shakeX = Math.cos(angle) * 28;
              obs.shakeX2 = Math.sin(angle) * 28;
              const vBob = Math.cos(this.waveTime * 2.2 + obstacleIdx * 0.3) * 25;
              const centerY = obs.spawnCenterY! + vBob;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level35_triplestair') {
            // LEVEL 35: Magma Elevator
            // Character similarity: vertical elevator rises and steps
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (obstacleIdx < groupSize) {
              // Group 1: Alternating even/odd elevators
              const shift = Math.sin(this.waveTime * 2.0 + (obstacleIdx % 2) * Math.PI) * 28;
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Symmetrical group block elevators
              const blockIdx = Math.floor(obstacleIdx / 3);
              const shift = Math.sin(this.waveTime * 2.5 + blockIdx * Math.PI) * 35;
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else {
              // Group 3: Escalator wave (diagonal elevator steps) — animation speed reduced 20%
              const shift = Math.sin(this.waveTime * 2.4 + obstacleIdx * 0.6) * 45;
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level36_spiralflow') {
            // LEVEL 36: Wormhole Vortex
            // Character similarity: swirling, rotating paths with optical offsets
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            // Apply high-amplitude up-down animation globally for Level 26 / Level 36!
            const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 2.8 + (obs.obstacleIdx! % 2) * Math.PI) * 27;

            if (obstacleIdx < groupSize) {
              // Group 1: Single vortex rotation (increased by 35%) with up-down animation
              const angle = this.waveTime * 2.43 + obstacleIdx * 0.4;
              obs.shakeX = Math.sin(angle) * 24;
              obs.shakeX2 = Math.cos(angle) * 24;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Double spiral vortex with up-down animation
              const angle = this.waveTime * 3.37 + obstacleIdx * 0.5;
              obs.shakeX = Math.sin(angle) * 22.4; // reduced 30% from 32
              obs.shakeX2 = Math.cos(angle + Math.PI / 2) * 22.4; // reduced 30% from 32
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else {
              // Group 3: Black hole squeeze (shrinking vortex) with up-down animation
              const angle = this.waveTime * 4.32 + obstacleIdx * 0.6;
              obs.shakeX = Math.sin(angle) * 38;
              obs.shakeX2 = Math.cos(angle) * 38;
              const pulse = Math.sin(this.waveTime * 4.05) * 27;
              const breathingGap = obs.gapHeight! - Math.abs(pulse);
              obs.targetTopHeight = centerY - breathingGap / 2;
              obs.targetBottomHeight = height - centerY - breathingGap / 2;
            }
          } else if (obs.patternType === 'level37_elevator') {
            // LEVEL 37: Tectonic Cracks
            // Character similarity: asymmetrical slants, jagged blocks, tilting centers
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (obstacleIdx < groupSize) {
              // Group 1: Gentle tilting slanted path
              const tilt = Math.sin(this.waveTime * 1.6 + obstacleIdx * 0.3) * 24;
              obs.targetTopHeight = obs.baseTopHeight! + tilt;
              obs.targetBottomHeight = obs.baseBottomHeight! - tilt;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Symmetrical ridge peak wave (W-shape)
              const idx = obstacleIdx - groupSize;
              const tilt = Math.sin(this.waveTime * 2.2 + idx * (Math.PI / 3)) * 32;
              obs.targetTopHeight = obs.baseTopHeight! + tilt;
              obs.targetBottomHeight = obs.baseBottomHeight! + tilt;
            } else {
              // Group 3: Jagged pincer tilt shifts (independent caps)
              const idx = obstacleIdx - groupSize * 2;
              const tiltTop = Math.sin(this.waveTime * 2.8 + idx * 0.5) * 36;
              const tiltBottom = Math.cos(this.waveTime * 2.8 + idx * 0.5) * 36;
              obs.targetTopHeight = obs.baseTopHeight! + tiltTop;
              obs.targetBottomHeight = obs.baseBottomHeight! + tiltBottom;
            }
          } else if (obs.patternType === 'level38_scurve') {
            // LEVEL 38: Magnetic Tempest (Redesigned Storm Animations)
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (obstacleIdx < groupSize) {
              // Group 1: Electromagnetic Compression (Pincer Jaw Pulse) (speed reduced 15% from 3.5 to 2.975)
              const compress = Math.sin(this.waveTime * 2.975) * 35;
              const currentGap = obs.gapHeight! - compress;
              obs.targetTopHeight = obs.spawnCenterY! - currentGap / 2;
              obs.targetBottomHeight = height - obs.spawnCenterY! - currentGap / 2;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Polar Vortex (Opposing Rotational Wave with Out-Of-Phase Vertical Shifting) (speed reduced 15%: 3.6->3.06, 2.88->2.448)
              const idx = obstacleIdx - groupSize;
              const hShift = Math.sin(this.waveTime * 3.06 + idx * 0.8) * 35;
              obs.shakeX = hShift;
              obs.shakeX2 = -hShift;
              const vShift = Math.cos(this.waveTime * 2.448 + idx * 0.6) * 30;
              obs.targetTopHeight = obs.baseTopHeight! + vShift;
              obs.targetBottomHeight = obs.baseBottomHeight! - vShift;
            } else {
              // Group 3: Quantum Flux Storm (High-frequency Jitter + Synchronized Vertical Waves) (speed reduced 15%: 6.8->5.78, 4.25->3.6125)
              const idx = obstacleIdx - groupSize * 2;
              obs.shakeX = Math.sin(this.waveTime * 5.78 + idx) * 15;
              obs.shakeX2 = Math.cos(this.waveTime * 5.78 + idx) * 15;
              const vJitter = Math.sin(this.waveTime * 3.6125 + idx * 1.2) * 35;
              obs.targetTopHeight = obs.baseTopHeight! + vJitter;
              obs.targetBottomHeight = obs.baseBottomHeight! + vJitter;
            }
          } else if (obs.patternType === 'level39_orbit') {
            // LEVEL 39: Solar Flare
            // Character similarity: pulsating heat waves & firestorms
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (obstacleIdx < groupSize) {
              // Group 1: Exactly copy Level 3 (The Gravity Pitfalls) see-saw elevator shifts
              const activeScore = obs.spawnScore !== undefined ? obs.spawnScore : 0;
              const isExtreme = (obstacleIdx % 3 === 0 || obstacleIdx % 3 === 1);
              let swayAmp = 22; // Additional 20% reduction from 28 (28 * 0.8 = 22.4)
              if (activeScore >= 11 && activeScore <= 15 && isExtreme) {
                swayAmp = Math.round(22 * 0.70); // 30% reduction in see-saw shift amplitude relative to Group 1 (from 22 to 15)
              }
              const phase = this.waveTime * 1.95 + (obstacleIdx % 3) * (Math.PI * 2 / 3);
              const shift = Math.sin(phase) * swayAmp;
              obs.targetTopHeight = obs.baseTopHeight! + shift;
              obs.targetBottomHeight = obs.baseBottomHeight! - shift;
            } else if (obstacleIdx < groupSize * 2) {
              // Group 2: Escalating flame stairs with vertical motion (24% gap height up & down from spawn center - reduced by 20% from 30%)
              const idx = obstacleIdx - groupSize;
              const verticalShift = Math.sin(this.waveTime * 2.8 + idx * 0.5) * (obs.gapHeight! * 0.24);
              const centerY = obs.spawnCenterY! + verticalShift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else {
              // Group 3: Random vertical solar eruptions (spikes)
              const idx = obstacleIdx - groupSize * 2;
              const flare = Math.sin(this.waveTime * 3.6 + idx * 1.2) * 28.8; // 20% reduction from 36
              const centerY = obs.spawnCenterY! + flare;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level40_miniboss') {
            // LEVEL 40: Chrono Warp
            // Character similarity: dilated warp tunnels, helix + collapses
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const groupSize = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;

            if (this.activeLevelConfig?.levelNum === 30) {
              // Level 30 completely uniform up-down oscillation for the entire set of obstacles!
              const speed = 2;
              const amp = 45.5; // 30% reduce from 65
              const waveOffset = Math.sin(this.waveTime * speed) * amp;
              const centerY = obs.spawnCenterY! + waveOffset;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            } else if (obs.levelNum === 46 || obs.levelNum === 56) {
              // Single obstacles arrangement: always use Group 2 Chrono pincer layout and behavior
              const idx = obstacleIdx - groupSize;
              const pincer = Math.sin(this.waveTime * 3.0 + idx * 0.4) * 28;
              obs.targetTopHeight = obs.baseTopHeight! + pincer;
              obs.targetBottomHeight = obs.baseBottomHeight! + pincer;
            } else {
              if (obstacleIdx < groupSize) {
                // Group 1: Chrono helix (3D orbital)
                const speed = 2.4;
                const angle = this.waveTime * speed + obstacleIdx * 0.5;
                const shakeAmp = 22;
                obs.shakeX = Math.sin(angle) * shakeAmp;
                obs.shakeX2 = Math.cos(angle) * shakeAmp;
                obs.targetTopHeight = obs.spawnCenterY! - obs.gapHeight! / 2;
                obs.targetBottomHeight = height - obs.spawnCenterY! - obs.gapHeight! / 2;
              } else if (obstacleIdx < groupSize * 2) {
                // Group 2: Chrono pincer (vertical close-in)
                const idx = obstacleIdx - groupSize;
                const speed = 3.0;
                const pincerAmp = 28;
                const pincer = Math.sin(this.waveTime * speed + idx * 0.4) * pincerAmp;
                obs.targetTopHeight = obs.baseTopHeight! + pincer;
                obs.targetBottomHeight = obs.baseBottomHeight! + pincer;
              } else {
                // Group 3: Chrono collapse (extreme rotate/shrink maze)
                const idx = obstacleIdx - groupSize * 2;
                const speed = 3.8;
                const angle = this.waveTime * speed + idx * 0.6;
                const shakeAmp = 28;
                obs.shakeX = Math.sin(angle) * shakeAmp;
                obs.shakeX2 = Math.cos(angle) * shakeAmp;
                const pulseSpeed = 4.0;
                const pulse = Math.pow(Math.sin(this.waveTime * pulseSpeed), 2) * 24;
                const breathingGap = obs.gapHeight! - pulse;
                const shiftSpeed = 3.0;
                const shiftAmp = 20;
                const waveShift = Math.sin(this.waveTime * shiftSpeed + idx * 0.4) * shiftAmp;
                const centerY = obs.spawnCenterY! + waveShift;
                obs.targetTopHeight = centerY - breathingGap / 2;
                obs.targetBottomHeight = height - centerY - breathingGap / 2;
              }
            }
          } else if (obs.patternType === 'level41_doublew') {
            // LEVEL 41: Galactic Blackhole Horizon
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs41 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs41 && obsIdx < gs41 * 2) {
              // Group 2: "Polar Warp Lasers" — lasers twist in a counter-rotating double-helix pattern
              obs.isLaser = true;
              const helixT = this.waveTime * 2.6 + obsIdx * 0.55;
              obs.shakeX = Math.sin(helixT) * 28;
              obs.shakeX2 = -Math.sin(helixT + Math.PI * 0.75) * 28;
              const helixY = Math.cos(helixT * 0.8) * 24;
              obs.targetTopHeight = obs.baseTopHeight! + helixY;
              obs.targetBottomHeight = obs.baseBottomHeight! - helixY;
            } else if (obsIdx >= gs41 * 2) {
              // Group 3: "Gravity Collapse Pipes" — pipes slam toward center and rebound elastically
              obs.isLaser = false;
              const collapseT = this.waveTime * 1.8 + obsIdx * 0.4;
              const slam = Math.pow(Math.sin(collapseT), 3) * 32; // cubic snap feel
              obs.targetTopHeight = obs.baseTopHeight! + slam;
              obs.targetBottomHeight = obs.baseBottomHeight! - slam;
              obs.shakeX = Math.cos(collapseT * 1.4) * 14;
              obs.shakeX2 = -Math.cos(collapseT * 1.4) * 14;
            } else {
              // Group 1: Original orbiting vortex
              const angle = this.waveTime * 2.8 + obs.obstacleIdx! * 0.6;
              obs.shakeX = Math.cos(angle) * 25;
              obs.shakeX2 = Math.sin(angle) * 25;
              const gravityShift = Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.4) * 30;
              const centerY = obs.spawnCenterY! + gravityShift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level42_infinity') {
            // LEVEL 42: Cosmo-Quantum Gravity Singularity
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs42 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            const isLevel47 = (this.activeLevelConfig && this.activeLevelConfig.levelNum === 47);
            const speedScale = isLevel47 ? 0.80 : 1.0;
            if (obsIdx >= gs42 && obsIdx < gs42 * 2) {
              // Group 2: "Quantum Ribbon Lasers" — lasers flow in a ribbon wave with out-of-phase horizontal sliding
              obs.isLaser = true;
              const ribbonT = this.waveTime * (2.4 * speedScale) + obsIdx * 0.5;
              const ribbonY = Math.sin(ribbonT) * 28;
              obs.targetTopHeight = obs.baseTopHeight! + ribbonY;
              obs.targetBottomHeight = obs.baseBottomHeight! - ribbonY;
              obs.shakeX = Math.cos(ribbonT * 0.7) * 20;
              obs.shakeX2 = -Math.cos(ribbonT * 0.7) * 20;
            } else if (obsIdx >= gs42 * 2) {
              // Group 3: "Piston Crusher Pipes" — pipes slam open/shut rapidly with staggered timing per column
              obs.isLaser = false;
              const pistonT = this.waveTime * (3.8 * speedScale) + obsIdx * 0.6;
              const piston = Math.abs(Math.sin(pistonT)) * 30 - 15;
              obs.targetTopHeight = obs.baseTopHeight! + piston;
              obs.targetBottomHeight = obs.baseBottomHeight! - piston;
              obs.shakeX = Math.sin(pistonT * 0.5) * 10;
              obs.shakeX2 = -Math.sin(pistonT * 0.5) * 10;
            } else {
              // Group 1: Original Bernoulli figure-8
              const angle42 = this.waveTime * (3.2 * speedScale) + obs.obstacleIdx! * 0.65;
              const shiftY42 = Math.sin(angle42) * Math.cos(angle42) * 55;
              const breathingGap42 = obs.gapHeight! + Math.sin(this.waveTime * (4.5 * speedScale) + obs.obstacleIdx! * 0.5) * 20;
              const centerY42 = obs.spawnCenterY! + shiftY42;
              obs.targetTopHeight = centerY42 - breathingGap42 / 2;
              obs.targetBottomHeight = height - centerY42 - breathingGap42 / 2;
            }
          } else if (obs.patternType === 'level43_dnahelix') {
            // LEVEL 43: DNA Double Helix
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs43 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs43 && obsIdx < gs43 * 2) {
              // Group 2: "Pulse Laser Rings" — lasers throb in expanding/contracting rings with fast horizontal shimmer
              obs.isLaser = true;
              const ringT = this.waveTime * 3.0 + obsIdx * 0.55;
              const ring = Math.sin(ringT) * 26;
              obs.targetTopHeight = obs.baseTopHeight! + ring;
              obs.targetBottomHeight = obs.baseBottomHeight! - ring;
              obs.shakeX = Math.cos(ringT * 0.6) * 18;
              obs.shakeX2 = -Math.cos(ringT * 0.6) * 18;
            } else if (obsIdx >= gs43 * 2) {
              // Group 3: "Tidal Crush Pipes" — even/odd alternating columns slam downward/upward in heavy tide swings
              obs.isLaser = false;
              const tideDir = obsIdx % 2 === 0 ? 1 : -1;
              const tideT = this.waveTime * 2.2 + obsIdx * 0.45;
              const tide = Math.sin(tideT) * 32 * tideDir;
              obs.targetTopHeight = obs.baseTopHeight! + tide;
              obs.targetBottomHeight = obs.baseBottomHeight! - tide;
              obs.shakeX = Math.sin(tideT * 1.3) * 10;
              obs.shakeX2 = -Math.sin(tideT * 1.3) * 10;
            } else {
              // Group 1: Original DNA double helix
              const phase43 = obs.obstacleIdx! % 2 === 0 ? 0 : Math.PI;
              const helix43 = Math.sin(this.waveTime * 2.5 + obs.obstacleIdx! * 0.5 + phase43) * 35;
              const centerY43 = obs.spawnCenterY! + helix43;
              obs.targetTopHeight = centerY43 - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY43 - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level44_pendulum') {
            // LEVEL 44: High-amplitude Pendulum
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs44 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs44 && obsIdx < gs44 * 2) {
              // Group 2: "Vortex Storm Lasers" — lasers spin in a tight vortex with growing amplitude
              obs.isLaser = true;
              const vortexT = this.waveTime * 2.8 + obsIdx * 0.6;
              const vortexR = 20 + Math.sin(this.waveTime * 0.8) * 8;
              obs.shakeX = Math.sin(vortexT) * vortexR;
              obs.shakeX2 = -Math.sin(vortexT + Math.PI * 0.5) * vortexR;
              const vortexY = Math.cos(vortexT * 0.9) * (vortexR * 0.85);
              obs.targetTopHeight = obs.baseTopHeight! + vortexY;
              obs.targetBottomHeight = obs.baseBottomHeight! - vortexY;
            } else if (obsIdx >= gs44 * 2) {
              // Group 3: "Snapping Gate Pipes" — pipes snap open/close in pairs, every 2 columns in sync
              obs.isLaser = false;
              const pairPhase = Math.floor(obsIdx / 2) * 0.7;
              const snapT = this.waveTime * 2.4 + pairPhase;
              const snap = Math.sign(Math.sin(snapT)) * 28; // square wave snap
              obs.targetTopHeight = obs.baseTopHeight! + snap;
              obs.targetBottomHeight = obs.baseBottomHeight! - snap;
              obs.shakeX = Math.cos(this.waveTime * 3.0 + obsIdx * 0.4) * 12;
              obs.shakeX2 = -Math.cos(this.waveTime * 3.0 + obsIdx * 0.4) * 12;
            } else {
              // Group 1: Original pendulum swing
              const swingAngle44 = Math.sin(this.waveTime * 1.8 + obs.obstacleIdx! * 0.35) * 0.4;
              obs.shakeX = Math.sin(swingAngle44) * 35;
              obs.shakeX2 = obs.shakeX;
              const pulse44 = Math.sin(this.waveTime * 2.5) * 20;
              const finalGap44 = obs.gapHeight! + (obs.obstacleIdx! % 2 === 0 ? pulse44 : -pulse44);
              const centerY44 = obs.spawnCenterY!;
              obs.targetTopHeight = centerY44 - finalGap44 / 2;
              obs.targetBottomHeight = height - centerY44 - finalGap44 / 2;
            }
          } else if (obs.patternType === 'level45_scurve') {
            // LEVEL 45: Solar Flare Ignition Corridor
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs45 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs45 && obsIdx < gs45 * 2) {
              // Group 2: "Coronal Loop Lasers" — lasers arch up/down in coronal loop patterns with criss-cross shake
              obs.isLaser = true;
              const coronalT = this.waveTime * 2.8 + obsIdx * 0.5;
              const coronal = Math.sin(coronalT) * 30;
              obs.targetTopHeight = obs.baseTopHeight! + coronal;
              obs.targetBottomHeight = obs.baseBottomHeight! - coronal;
              obs.shakeX = Math.cos(coronalT * 0.6) * 20;
              obs.shakeX2 = -Math.cos(coronalT * 0.6) * 20;
            } else if (obsIdx >= gs45 * 2) {
              // Group 3: "Solar Wind Drift Pipes" — pipes caught in a solar wind, sweeping diagonally with slow oscillation
              obs.isLaser = false;
              const windT = this.waveTime * 1.6 + obsIdx * 0.4;
              obs.shakeX = Math.sin(windT) * 24;        // drift right
              obs.shakeX2 = Math.sin(windT + 0.9) * 24; // slight phase offset for depth
              const windY = Math.cos(windT * 1.2) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + windY;
              obs.targetBottomHeight = obs.baseBottomHeight! - windY;
            } else {
              // Group 1: Original solar flare vertical bob
              const solarWind45 = Math.sin(this.waveTime * 3.5 + obs.obstacleIdx! * 0.4) * 35;
              const breath45 = Math.sin(this.waveTime * 4.0) * 18;
              const finalGap45 = obs.gapHeight! + breath45;
              const centerY45 = obs.spawnCenterY! + solarWind45;
              obs.targetTopHeight = centerY45 - finalGap45 / 2;
              obs.targetBottomHeight = height - centerY45 - finalGap45 / 2;
            }
          } else if (obs.patternType === 'level46_triplespiral') {
            // LEVEL 46: Multi-layered 3D Rotational Illusion
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs46 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs46 && obsIdx < gs46 * 2) {
              // Group 2: "Plasma Braid Lasers" — two laser streams braid around each other in counter-rotating spirals
              obs.isLaser = true;
              const braidT = this.waveTime * 3.2 + obsIdx * 0.65;
              obs.shakeX = Math.sin(braidT) * 26;
              obs.shakeX2 = -Math.sin(braidT + Math.PI * 0.6) * 26;
              const braidY = Math.cos(braidT * 0.85) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + braidY;
              obs.targetBottomHeight = obs.baseBottomHeight! - braidY;
            } else if (obsIdx >= gs46 * 2) {
              // Group 3: "Compression Wave Pipes" — pipes squeeze inward in a compression wave travelling front-to-back
              obs.isLaser = false;
              const compT = this.waveTime * 2.4 - obsIdx * 0.5;
              const comp = Math.pow(Math.sin(compT), 2) * 30; // always positive = always squeezing toward center
              obs.targetTopHeight = obs.baseTopHeight! + comp;
              obs.targetBottomHeight = obs.baseBottomHeight! - comp;
              obs.shakeX = Math.cos(compT * 1.5) * 14;
              obs.shakeX2 = -Math.cos(compT * 1.5) * 14;
            } else {
              // Group 1: Original 3D rotation
              const rotateAngle46 = this.waveTime * 2.0 + obs.obstacleIdx! * 0.6;
              obs.shakeX = Math.sin(rotateAngle46) * 24;
              obs.shakeX2 = Math.cos(rotateAngle46) * 24;
              const shift46 = Math.sin(this.waveTime * 1.5) * 15;
              const centerY46 = obs.spawnCenterY! + shift46;
              obs.targetTopHeight = centerY46 - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY46 - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level47_diamond') {
            // LEVEL 47: Expanding/Contracting Diamond
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs47 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs47 && obsIdx < gs47 * 2) {
              // Group 2: "Phase Laser Arc" — lasers swing through arcs in opposing phases, like a clock pendulum
              obs.isLaser = true;
              const arcT = this.waveTime * 2.2 + obsIdx * 0.5;
              obs.shakeX = Math.sin(arcT) * 26;
              obs.shakeX2 = -Math.sin(arcT + Math.PI * 0.4) * 26;
              const arcY = Math.cos(arcT * 0.8) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + arcY;
              obs.targetBottomHeight = obs.baseBottomHeight! - arcY;
            } else if (obsIdx >= gs47 * 2) {
              // Group 3: "Stutter Step Pipes" — pipes jump in jittery step-function hops, pausing briefly between each
              obs.isLaser = false;
              const stepPhase = Math.floor(this.waveTime * 2.0 + obsIdx * 0.35);
              const stepAmt = (stepPhase % 5) * 10 - 20; // steps: -20,-10,0,10,20
              obs.targetTopHeight = obs.baseTopHeight! + stepAmt;
              obs.targetBottomHeight = obs.baseBottomHeight! - stepAmt;
              obs.shakeX = Math.sin(this.waveTime * 5.0 + obsIdx * 0.8) * 8;
              obs.shakeX2 = -Math.sin(this.waveTime * 5.0 + obsIdx * 0.8) * 8;
            } else {
              // Group 1: Original expanding diamond
              const expand47 = Math.sin(this.waveTime * 2.4) * 20;
              const shift47 = Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.5) * 25;
              const finalGap47 = obs.gapHeight! + expand47;
              const centerY47 = obs.spawnCenterY! + shift47;
              obs.targetTopHeight = centerY47 - finalGap47 / 2;
              obs.targetBottomHeight = height - centerY47 - finalGap47 / 2;
            }
          } else if (obs.patternType === 'level48_tornado') {
            // LEVEL 48: High-speed Tornado Swirl
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs48 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs48 && obsIdx < gs48 * 2) {
              // Group 2: "Eye of the Storm Lasers" — lasers create a calm vortex center then erupt outward
              obs.isLaser = true;
              const eyeT = this.waveTime * 2.0 + obsIdx * 0.45;
              const eyeRadius = 14 + Math.sin(this.waveTime * 1.2) * 10;
              obs.shakeX = Math.sin(eyeT) * eyeRadius;
              obs.shakeX2 = -Math.cos(eyeT) * eyeRadius;
              const eyeY = Math.cos(eyeT * 1.3) * 26;
              obs.targetTopHeight = obs.baseTopHeight! + eyeY;
              obs.targetBottomHeight = obs.baseBottomHeight! - eyeY;
            } else if (obsIdx >= gs48 * 2) {
              // Group 3: "Shockwave Blast Pipes" — pipes radiate outward in shockwave rings that compress and release
              obs.isLaser = false;
              const shockT = this.waveTime * 3.5 + obsIdx * 0.55;
              const shock = Math.sin(shockT) * 28;
              obs.targetTopHeight = obs.baseTopHeight! + shock;
              obs.targetBottomHeight = obs.baseBottomHeight! - shock;
              obs.shakeX = Math.cos(shockT * 1.8) * 16;
              obs.shakeX2 = Math.cos(shockT * 1.8 + Math.PI) * 16;
            } else {
              // Group 1: Original tornado swirl
              const swirl48 = this.waveTime * 3.0 + obs.obstacleIdx! * 0.8;
              obs.shakeX = Math.sin(swirl48) * 30;
              obs.shakeX2 = Math.cos(swirl48) * 30;
              const centerY48 = obs.spawnCenterY! + Math.sin(this.waveTime * 2.0) * 18;
              obs.targetTopHeight = centerY48 - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY48 - obs.gapHeight! / 2;
            }
          } else if (obs.patternType === 'level49_fractal') {
            // LEVEL 49: Multi-stage Fractal Staircase
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs49 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs49 && obsIdx < gs49 * 2) {
              // Group 2: "Recursive Laser Sine" — lasers oscillate with a nested double-frequency wave
              obs.isLaser = true;
              const fracT = this.waveTime * 2.4 + obsIdx * 0.5;
              const fracY = Math.sin(fracT) * 24 + Math.sin(fracT * 2.3) * 12;
              obs.targetTopHeight = obs.baseTopHeight! + fracY;
              obs.targetBottomHeight = obs.baseBottomHeight! - fracY;
              obs.shakeX = Math.cos(fracT * 0.8) * 18;
              obs.shakeX2 = -Math.cos(fracT * 0.8) * 18;
            } else if (obsIdx >= gs49 * 2) {
              // Group 3: "Zigzag Staircase Pipes" — pipes march up-right in stair steps and snap back to start
              obs.isLaser = false;
              const stairStep = Math.floor(this.waveTime * 1.5 + obsIdx * 0.4) % 5;
              const stairY = (stairStep - 2) * 14; // -28, -14, 0, +14, +28
              obs.targetTopHeight = obs.baseTopHeight! + stairY;
              obs.targetBottomHeight = obs.baseBottomHeight! - stairY;
              obs.shakeX = Math.sin(this.waveTime * 4.0 + obsIdx * 0.6) * 10;
              obs.shakeX2 = -Math.sin(this.waveTime * 4.0 + obsIdx * 0.6) * 10;
            } else {
              // Group 1: Original fractal recursive
              const recursive49 = Math.sin(this.waveTime * 2.0 + (obs.obstacleIdx! % 3) * Math.PI) * 25 + Math.cos(this.waveTime * 1.0) * 12;
              const centerY49 = obs.spawnCenterY! + recursive49;
              const breathingGap49 = obs.gapHeight! + Math.sin(this.waveTime * 2.5) * 10;
              obs.targetTopHeight = centerY49 - breathingGap49 / 2;
              obs.targetBottomHeight = height - centerY49 - breathingGap49 / 2;
            }
          } else if (obs.patternType === 'level50_finalboss') {
            // LEVEL 50: Ultimate Final Boss
            const obsIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const gs50 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (obsIdx >= gs50 && obsIdx < gs50 * 2) {
              // Group 2: "Chaos Cascade Lasers" — lasers combine 3 interference waves creating chaotic beating motion
              obs.isLaser = true;
              const wave1 = Math.sin(this.waveTime * 2.3 + obsIdx * 0.55) * 18;
              const wave2 = Math.sin(this.waveTime * 3.7 + obsIdx * 0.4) * 12;
              const wave3 = Math.sin(this.waveTime * 5.1 + obsIdx * 0.3) * 7;
              const chaos = wave1 + wave2 + wave3;
              obs.targetTopHeight = obs.baseTopHeight! + chaos;
              obs.targetBottomHeight = obs.baseBottomHeight! - chaos;
              obs.shakeX = Math.sin(this.waveTime * 4.5 + obsIdx * 0.6) * 18;
              obs.shakeX2 = -Math.sin(this.waveTime * 4.5 + obsIdx * 0.6) * 18;
            } else if (obsIdx >= gs50 * 2) {
              // Group 3: "Titan Crusher Pipes" — massive columns slam in alternating tectonic half-cycles with shockwave shake
              obs.isLaser = false;
              const titanT = this.waveTime * 1.9 + obsIdx * 0.5;
              const titan = Math.sin(titanT) * 36;
              obs.targetTopHeight = obs.baseTopHeight! + titan;
              obs.targetBottomHeight = obs.baseBottomHeight! - titan;
              obs.shakeX = Math.sin(this.waveTime * 6.0 + obsIdx * 0.7) * 14;  // fast tremor
              obs.shakeX2 = -Math.sin(this.waveTime * 6.0 + obsIdx * 0.7) * 14;
            } else {
              // Group 1: Original final boss synthesis
              const wave50 = Math.sin((obs.x * 0.01) - this.waveTime * 4.0) * 30;
              const pulse50 = Math.sin(this.waveTime * 3.0) * 15;
              const swing50 = Math.sin(this.waveTime * 1.5 + obs.obstacleIdx! * 0.5) * 0.3;
              const orbit50 = this.waveTime * 2.5 + obs.obstacleIdx! * 0.4;
              obs.shakeX = Math.sin(orbit50) * 24 + Math.sin(swing50) * 15;
              obs.shakeX2 = Math.cos(orbit50) * 24 + Math.sin(swing50) * 15;
              const finalGap50 = obs.gapHeight! + pulse50;
              const centerY50 = obs.spawnCenterY! + wave50 + Math.sin(this.waveTime * 2.0) * 15;
              obs.targetTopHeight = centerY50 - finalGap50 / 2;
              obs.targetBottomHeight = height - centerY50 - finalGap50 / 2;
            }

          // ===== HEAVEN CLOUD KINGDOM: Levels 51–60 =====
          } else if (obs.patternType === 'level51_cloudrift') {
            // L51: Cloud Rift
            const oIdx = obs.obstacleIdx ?? 0;
            const gs51 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs51) {
              // G1: Liquid staircase — columns float up/down like a slow river current
              obs.isLaser = false;
              const riverT = this.waveTime * 1.6 + oIdx * 0.42;
              const river = Math.sin(riverT) * 28 + Math.sin(riverT * 0.5) * 14;
              obs.targetTopHeight = obs.baseTopHeight! + river;
              obs.targetBottomHeight = obs.baseBottomHeight! - river;
              obs.shakeX = Math.cos(riverT * 0.7) * 12;
              obs.shakeX2 = -Math.cos(riverT * 0.7) * 12;
            } else if (oIdx < gs51 * 2) {
              // G2: Portal Arch Lasers — paired laser gates open/close in alternating arch rhythm
              obs.isLaser = true;
              const archT = this.waveTime * 2.4 + oIdx * 0.55;
              const archOpen = Math.abs(Math.sin(archT)) * 26 - 13;
              obs.targetTopHeight = obs.baseTopHeight! + archOpen;
              obs.targetBottomHeight = obs.baseBottomHeight! - archOpen;
              obs.shakeX = Math.sin(archT * 0.8) * 18;
              obs.shakeX2 = -Math.sin(archT * 0.8) * 18;
            } else {
              // G3: Diagonal Cascade Pipes — staggered columns cascade diagonally like falling dominoes
              obs.isLaser = false;
              const diaT = this.waveTime * 2.0 - oIdx * 0.5;
              obs.shakeX = Math.sin(diaT) * 22;
              obs.shakeX2 = Math.sin(diaT + 0.6) * 22;
              const diaY = Math.cos(diaT * 1.3) * 24;
              obs.targetTopHeight = obs.baseTopHeight! + diaY;
              obs.targetBottomHeight = obs.baseBottomHeight! - diaY;
            }
          } else if (obs.patternType === 'level52_aurorapulse') {
            // L52: Aurora Pulse
            const oIdx = obs.obstacleIdx ?? 0;
            const gs52 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs52) {
              // G1: Concentric ring ripple — laser rings expand/collapse inward
              obs.isLaser = true;
              const ringT = this.waveTime * 1.8 + oIdx * 0.48;
              const ringY = Math.sin(ringT) * 22 + Math.cos(ringT * 1.5) * 10;
              obs.targetTopHeight = obs.baseTopHeight! + ringY;
              obs.targetBottomHeight = obs.baseBottomHeight! - ringY;
              obs.shakeX = Math.cos(ringT * 0.6) * 16;
              obs.shakeX2 = -Math.cos(ringT * 0.6) * 16;
            } else if (oIdx < gs52 * 2) {
              // G2: Chevron wings — pipes sweep in synchronized V-shape arcs
              obs.isLaser = false;
              const chevT = this.waveTime * 2.2 + oIdx * 0.5;
              const chevAmp = Math.sin(chevT) * 28;
              const chevDir = oIdx % 2 === 0 ? 1 : -1;
              obs.targetTopHeight = obs.baseTopHeight! + chevAmp * chevDir;
              obs.targetBottomHeight = obs.baseBottomHeight! - chevAmp * chevDir;
              obs.shakeX = 0; obs.shakeX2 = 0;
            } else {
              // G3: Double-sine clash laser — two interference frequencies fighting each other
              obs.isLaser = true;
              const clashT1 = this.waveTime * 2.6 + oIdx * 0.45;
              const clashT2 = this.waveTime * 4.1 + oIdx * 0.3;
              const clash = Math.sin(clashT1) * 18 + Math.sin(clashT2) * 12;
              obs.targetTopHeight = obs.baseTopHeight! + clash;
              obs.targetBottomHeight = obs.baseBottomHeight! - clash;
              obs.shakeX = Math.sin(clashT1 * 0.7) * 14;
              obs.shakeX2 = -Math.sin(clashT2 * 0.7) * 14;
            }
          } else if (obs.patternType === 'level53_starlattice') {
            // L53: Star Lattice
            const oIdx = obs.obstacleIdx ?? 0;
            const gs53 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs53) {
              // G1: Crosshatch grid — every 3rd column is static, others tilt in opposite phases
              obs.isLaser = false;
              const gridT = this.waveTime * 2.0 + oIdx * 0.6;
              const tilt = oIdx % 3 === 1 ? 0 : Math.sin(gridT) * 24 * (oIdx % 3 === 0 ? 1 : -1);
              obs.targetTopHeight = obs.baseTopHeight! + tilt;
              obs.targetBottomHeight = obs.baseBottomHeight! - tilt;
              obs.shakeX = Math.cos(gridT * 0.5) * 10;
              obs.shakeX2 = -Math.cos(gridT * 0.5) * 10;
            } else if (oIdx < gs53 * 2) {
              // G2: Diagonal star lines — lasers trace diagonal paths with counter-motion
              obs.isLaser = true;
              const starT = this.waveTime * 2.4 - oIdx * 0.5;
              obs.shakeX = Math.sin(starT) * 24;
              obs.shakeX2 = -Math.sin(starT + Math.PI * 0.6) * 24;
              const starY = Math.cos(starT * 0.8) * 20;
              obs.targetTopHeight = obs.baseTopHeight! + starY;
              obs.targetBottomHeight = obs.baseBottomHeight! - starY;
            } else {
              // G3: Hexagonal pulse pipes — columns breathe in hexagonal cluster rhythm
              obs.isLaser = false;
              const hexT = this.waveTime * 1.9 + (oIdx % 6) * (Math.PI / 3);
              const hexPulse = Math.sin(hexT) * 26;
              obs.targetTopHeight = obs.baseTopHeight! + hexPulse;
              obs.targetBottomHeight = obs.baseBottomHeight! - hexPulse;
              obs.shakeX = Math.cos(hexT * 0.6) * 12;
              obs.shakeX2 = -Math.cos(hexT * 0.6) * 12;
            }
          } else if (obs.patternType === 'level54_celestialmaze') {
            // L54: Celestial Maze
            const oIdx = obs.obstacleIdx ?? 0;
            const gs54 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs54) {
              // G1: Inward spiral lasers — laser shrinks toward center in a tight corkscrew
              obs.isLaser = true;
              const spiralT = this.waveTime * 2.2 + oIdx * 0.65;
              const spiralR = 22 - (oIdx % gs54) * 0.4;
              obs.shakeX = Math.sin(spiralT) * Math.max(spiralR, 6);
              obs.shakeX2 = -Math.sin(spiralT + Math.PI * 0.5) * Math.max(spiralR, 6);
              const spiralY = Math.cos(spiralT * 0.9) * (Math.max(spiralR, 6) * 0.8);
              obs.targetTopHeight = obs.baseTopHeight! + spiralY;
              obs.targetBottomHeight = obs.baseBottomHeight! - spiralY;
            } else if (oIdx < gs54 * 2) {
              // G2: Labyrinth step pipes — pipes hop between preset vertical positions like maze walls
              obs.isLaser = false;
              const mazePhase = Math.floor(this.waveTime * 1.4 + oIdx * 0.3) % 5;
              const mazeSteps = [-28, -14, 0, 14, 28];
              obs.targetTopHeight = obs.baseTopHeight! + mazeSteps[mazePhase];
              obs.targetBottomHeight = obs.baseBottomHeight! - mazeSteps[mazePhase];
              obs.shakeX = Math.sin(this.waveTime * 3.5 + oIdx * 0.6) * 10;
              obs.shakeX2 = -Math.sin(this.waveTime * 3.5 + oIdx * 0.6) * 10;
            } else {
              // G3: Orbiting beacon lasers — each column orbits its own path like a celestial body
              obs.isLaser = true;
              const orbitT = this.waveTime * 1.7 + oIdx * 0.7;
              obs.shakeX = Math.cos(orbitT) * 20;
              obs.shakeX2 = -Math.cos(orbitT + Math.PI * 0.4) * 20;
              const orbitY = Math.sin(orbitT * 1.2) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + orbitY;
              obs.targetBottomHeight = obs.baseBottomHeight! - orbitY;
            }
          } else if (obs.patternType === 'level55_ethervortex') {
            // L55: Ether Vortex
            const oIdx = obs.obstacleIdx ?? 0;
            const gs55 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs55) {
              // G1: Dual helix twist — pipes spiral in two intertwined helixes
              obs.isLaser = false;
              const helixT = this.waveTime * 2.3 + oIdx * 0.6;
              const helixY = (oIdx % 2 === 0 ? 1 : -1) * Math.sin(helixT) * 28;
              obs.targetTopHeight = obs.baseTopHeight! + helixY;
              obs.targetBottomHeight = obs.baseBottomHeight! - helixY;
              obs.shakeX = Math.cos(helixT * 0.8) * 14;
              obs.shakeX2 = -Math.cos(helixT * 0.8) * 14;
            } else if (oIdx < gs55 * 2) {
              // G2: Plasma Zigzag Zippers — lasers with horizontal wave shift and dynamic breathing gaps
              obs.isLaser = true;
              const zipT = this.waveTime * 2.5 + oIdx * 0.45;
              obs.shakeX = Math.sin(zipT) * 16;
              obs.shakeX2 = -Math.sin(zipT + Math.PI / 2) * 16;
              const pulse = Math.sin(this.waveTime * 3.0) * 12;
              obs.targetTopHeight = obs.baseTopHeight! + pulse;
              obs.targetBottomHeight = obs.baseBottomHeight! + pulse;
            } else {
              // G3: Quantum Phase Portals — pipes weave in alternating gates that open/close dynamically
              obs.isLaser = false;
              const portalT = this.waveTime * 2.2 + oIdx * 0.6;
              const slide = Math.sin(portalT) * 24;
              obs.targetTopHeight = obs.baseTopHeight! + slide;
              obs.targetBottomHeight = obs.baseBottomHeight! + slide;
              obs.shakeX = Math.cos(portalT * 0.8) * 10;
              obs.shakeX2 = -Math.cos(portalT * 0.8) * 10;
            }
          } else if (obs.patternType === 'level56_prismaticwave') {
            // L56: Prismatic Wave
            const oIdx = obs.obstacleIdx ?? 0;
            const gs56 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs56) {
              // G1: Chromatic tier split — 3 tiers of pipes shift in separate color-coded phases
              obs.isLaser = false;
              const tier56 = oIdx % 3;
              const tierOffset = tier56 === 0 ? 0 : tier56 === 1 ? Math.PI * 0.667 : Math.PI * 1.333;
              const tierT = this.waveTime * 1.9 + tierOffset + oIdx * 0.3;
              obs.targetTopHeight = obs.baseTopHeight! + Math.sin(tierT) * 26;
              obs.targetBottomHeight = obs.baseBottomHeight! - Math.sin(tierT) * 26;
              obs.shakeX = Math.cos(tierT * 0.7) * 12;
              obs.shakeX2 = -Math.cos(tierT * 0.7) * 12;
            } else if (oIdx < gs56 * 2) {
              // G2: Ripple cascade lasers — laser wave pulses travel outward like a water ripple
              obs.isLaser = true;
              const ripT = this.waveTime * 2.5 - oIdx * 0.48;
              obs.shakeX = Math.sin(ripT) * 22;
              obs.shakeX2 = -Math.sin(ripT + Math.PI * 0.5) * 22;
              const ripY = Math.sin(ripT * 0.7 + 0.9) * 18;
              obs.targetTopHeight = obs.baseTopHeight! + ripY;
              obs.targetBottomHeight = obs.baseBottomHeight! - ripY;
            } else {
              // G3: Interference pattern — two perpendicular waves collide and create unpredictable beating
              obs.isLaser = false;
              const i56 = oIdx - gs56 * 2;
              const intT1 = this.waveTime * 2.1 + i56 * 0.6;
              const intT2 = this.waveTime * 3.3 + i56 * 0.4;
              const interference = Math.sin(intT1) * 18 + Math.sin(intT2) * 12;
              obs.targetTopHeight = obs.baseTopHeight! + interference;
              obs.targetBottomHeight = obs.baseBottomHeight! - interference;
              obs.shakeX = Math.cos(intT1 * 0.5) * 14;
              obs.shakeX2 = -Math.cos(intT2 * 0.5) * 14;
            }
          } else if (obs.patternType === 'level57_angelbraid') {
            // L57: Angel Braid
            const oIdx = obs.obstacleIdx ?? 0;
            const gs57 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs57) {
              // G1: Interleaved braid — two pipe streams braid over/under each other
              obs.isLaser = false;
              const braidT = this.waveTime * 2.0 + oIdx * 0.55;
              const braidSide = oIdx % 4 < 2 ? 1 : -1;
              const braidAmp = Math.sin(braidT) * 26 * braidSide;
              obs.targetTopHeight = obs.baseTopHeight! + braidAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - braidAmp;
              obs.shakeX = Math.cos(braidT * 0.8) * 14 * braidSide;
              obs.shakeX2 = -Math.cos(braidT * 0.8) * 14 * braidSide;
            } else if (oIdx < gs57 * 2) {
              // G2: Wing spread lasers — arc widens from center out then folds back like wings
              obs.isLaser = true;
              const wingT = this.waveTime * 2.4 + oIdx * 0.5;
              const wingSpan = 18 + Math.sin(this.waveTime * 0.9) * 10;
              obs.shakeX = Math.sin(wingT) * wingSpan;
              obs.shakeX2 = -Math.sin(wingT + Math.PI * 0.4) * wingSpan;
              const wingY = Math.cos(wingT * 0.85) * 22;
              obs.targetTopHeight = obs.baseTopHeight! + wingY;
              obs.targetBottomHeight = obs.baseBottomHeight! - wingY;
            } else {
              // G3: Feather cascade pipes — columns drop in a staggered feather-fall rhythm
              obs.isLaser = false;
              const featT = this.waveTime * 2.8 + oIdx * 0.45;
              const featFall = Math.cos(featT) * 24 + Math.cos(featT * 2.1) * 10;
              obs.targetTopHeight = obs.baseTopHeight! + featFall;
              obs.targetBottomHeight = obs.baseBottomHeight! - featFall;
              obs.shakeX = Math.sin(featT * 1.4) * 10;
              obs.shakeX2 = -Math.sin(featT * 1.4) * 10;
            }
          } else if (obs.patternType === 'level58_serenitystorm') {
            // L58: Serenity Storm
            const oIdx = obs.obstacleIdx ?? 0;
            const gs58 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs58) {
              // G1: Calm wide breath — pipes sway in a very slow wide peaceful oscillation
              obs.isLaser = false;
              const calmT = this.waveTime * 1.2 + oIdx * 0.35;
              obs.targetTopHeight = obs.baseTopHeight! + Math.sin(calmT) * 22;
              obs.targetBottomHeight = obs.baseBottomHeight! - Math.sin(calmT) * 22;
              obs.shakeX = Math.cos(calmT * 0.5) * 8;
              obs.shakeX2 = -Math.cos(calmT * 0.5) * 8;
            } else if (oIdx < gs58 * 2) {
              // G2: Sudden turbulence laser spikes — calm then sudden violent jolt
              obs.isLaser = true;
              const stormT = this.waveTime * 3.5 + oIdx * 0.6;
              const spike58 = Math.pow(Math.sin(stormT), 5) * 32; // 5th power = extreme sharp peak
              obs.targetTopHeight = obs.baseTopHeight! + spike58;
              obs.targetBottomHeight = obs.baseBottomHeight! - spike58;
              obs.shakeX = Math.sin(this.waveTime * 7 + oIdx) * 12;
              obs.shakeX2 = -Math.sin(this.waveTime * 7 + oIdx) * 12;
            } else {
              // G3: Eye-of-storm pipes — mostly calm center, with wild outer columns
              obs.isLaser = false;
              const eyeT = this.waveTime * 2.2 + oIdx * 0.5;
              const distFromEdge = Math.abs((oIdx % gs58) - gs58 / 2) / (gs58 / 2);
              const eyeAmp = 8 + distFromEdge * 24;
              obs.targetTopHeight = obs.baseTopHeight! + Math.sin(eyeT) * eyeAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - Math.sin(eyeT) * eyeAmp;
              obs.shakeX = Math.cos(eyeT * 0.7) * (4 + distFromEdge * 12);
              obs.shakeX2 = -Math.cos(eyeT * 0.7) * (4 + distFromEdge * 12);
            }
          } else if (obs.patternType === 'level59_ascendant') {
            // L59: Ascendant
            const oIdx = obs.obstacleIdx ?? 0;
            const gs59 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs59) {
              // G1: Ascending spiral — columns gradually rise in ever-higher sine arcs
              obs.isLaser = false;
              const ascT = this.waveTime * 1.8 + oIdx * 0.5;
              const ascRise = (oIdx / gs59) * 14; // slowly rising offset
              obs.targetTopHeight = obs.baseTopHeight! + Math.sin(ascT) * 26 - ascRise;
              obs.targetBottomHeight = obs.baseBottomHeight! - Math.sin(ascT) * 26 - ascRise;
              obs.shakeX = Math.cos(ascT * 0.7) * 14;
              obs.shakeX2 = -Math.cos(ascT * 0.7) * 14;
            } else if (oIdx < gs59 * 2) {
              // G2: Pinnacle peak lasers — lasers shoot up to extreme peaks and valley in sharp rhythm
              obs.isLaser = true;
              const peakT = this.waveTime * 3.0 + oIdx * 0.6;
              const peakAmp = Math.abs(Math.sin(peakT)) * 32 - 16;
              obs.targetTopHeight = obs.baseTopHeight! + peakAmp;
              obs.targetBottomHeight = obs.baseBottomHeight! - peakAmp;
              obs.shakeX = Math.sin(peakT * 0.5) * 18;
              obs.shakeX2 = -Math.sin(peakT * 0.5) * 18;
            } else {
              // G3: Transcendent orbit — columns trace complex multi-axis orbital paths
              obs.isLaser = false;
              const transT = this.waveTime * 2.1 + oIdx * 0.7;
              obs.shakeX = Math.sin(transT) * 20 + Math.sin(transT * 2.7) * 8;
              obs.shakeX2 = -Math.sin(transT + Math.PI * 0.4) * 20 + Math.sin(transT * 2.7 + 0.8) * 8;
              const transY = Math.cos(transT * 1.1) * 22 + Math.cos(transT * 2.3) * 10;
              obs.targetTopHeight = obs.baseTopHeight! + transY;
              obs.targetBottomHeight = obs.baseBottomHeight! - transY;
            }
          } else if (obs.patternType === 'level60_divineapex') {
            // L60: Divine Apex — the ultimate heaven level
            const oIdx = obs.obstacleIdx ?? 0;
            const gs60 = this.activeLevelConfig ? Math.floor(this.activeLevelConfig.targetScore / 3) : 50;
            if (oIdx < gs60) {
              // G1: Mandala rotation — all columns rotate in perfect mandala symmetry
              obs.isLaser = true;
              const mandalaT = this.waveTime * 2.4 + (oIdx % 8) * (Math.PI / 4);
              obs.shakeX = Math.sin(mandalaT) * 24;
              obs.shakeX2 = -Math.sin(mandalaT + Math.PI * 0.5) * 24;
              const mandalaY = Math.cos(mandalaT * 0.9) * 20;
              obs.targetTopHeight = obs.baseTopHeight! + mandalaY;
              obs.targetBottomHeight = obs.baseBottomHeight! - mandalaY;
            } else if (oIdx < gs60 * 2) {
              // G2: Judgment wave — massive combined 3-frequency interference creates unpredictable motion
              obs.isLaser = true;
              const j60 = oIdx - gs60;
              const jT1 = this.waveTime * 2.1 + j60 * 0.55;
              const jT2 = this.waveTime * 3.5 + j60 * 0.4;
              const jT3 = this.waveTime * 5.2 + j60 * 0.3;
              const judgment = Math.sin(jT1) * 16 + Math.sin(jT2) * 12 + Math.sin(jT3) * 8;
              obs.targetTopHeight = obs.baseTopHeight! + judgment;
              obs.targetBottomHeight = obs.baseBottomHeight! - judgment;
              obs.shakeX = Math.cos(jT1 * 0.6) * 18;
              obs.shakeX2 = -Math.cos(jT2 * 0.6) * 18;
            } else {
              // G3: Apex convergence pipes — all columns converge to center then explode outward
              obs.isLaser = false;
              const c60 = oIdx - gs60 * 2;
              const convT = this.waveTime * 1.9 + c60 * 0.5;
              const spreadAmp = 10 + Math.abs(Math.sin(this.waveTime * 0.7)) * 28;
              const conv = Math.sin(convT) * spreadAmp;
              obs.targetTopHeight = obs.baseTopHeight! + conv;
              obs.targetBottomHeight = obs.baseBottomHeight! - conv;
              obs.shakeX = Math.sin(this.waveTime * 5.5 + c60 * 0.7) * 14;
              obs.shakeX2 = -Math.sin(this.waveTime * 5.5 + c60 * 0.7) * 14;
            }

          } else if (obs.patternType === 'wave_10') {
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
            // Level 25: Waterfall — difficulty +25% (speed 80→100, span 240→300, offset 45→56)
            const totalSpan = 300; // 240×1.25=300
            const offset = ((obs.obstacleIdx! * 56 - this.waveTime * 100) % totalSpan) - totalSpan / 2; // 45→56, 80→100
            const centerY = height / 2 + offset;
            obs.targetTopHeight = centerY - obs.gapHeight! / 2;
            obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
          } else if (obs.patternType === 'elevator_26') {
            const centerY = obs.spawnCenterY! + Math.sin(this.waveTime * 2.8 + (obs.obstacleIdx! % 2) * Math.PI) * 7; // High amplitude up-down
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
          } else if (obs.patternType && obs.patternType.indexOf('_progress') !== -1) {
            // Retrieve dynamic subPattern for Levels 21-29
            const groupSize = Math.floor(this.activeLevelConfig.targetScore / 3);
            const obstacleIdx = obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0;
            const levelNum = obs.levelNum !== undefined ? obs.levelNum : this.activeLevelConfig.levelNum;
            const animScale = (levelNum === 21 || levelNum === 22) ? 1.30 : 1.0;

            let subPattern = 'wave_10';
            if (levelNum === 21) {
              subPattern = obstacleIdx < groupSize ? 'wave_10' : (obstacleIdx < groupSize * 2 ? 'breathing_12' : 'moving_stair_15');
            } else if (levelNum === 22) {
              const isLevel32 = (this.activeLevelConfig && this.activeLevelConfig.levelNum === 32);
              subPattern = obstacleIdx < groupSize ? 'rotating_17' : (obstacleIdx < groupSize * 2 ? 'dynamic_w_18' : (isLevel32 ? 'spiral_wave_32' : 'exp_shrink_19'));
            } else if (levelNum === 23) {
              subPattern = obstacleIdx < groupSize ? 'hybrid_20' : (obstacleIdx < groupSize * 2 ? 'snake_21' : 'pulse_22');
            } else if (levelNum === 24) {
              subPattern = obstacleIdx < groupSize ? 'gravity_23' : (obstacleIdx < groupSize * 2 ? 'rotating_24' : 'waterfall_25');
            } else if (levelNum === 25) {
              subPattern = obstacleIdx < groupSize ? 'pendulum_28' : (obstacleIdx < groupSize * 2 ? 'magnetic_27' : 'elevator_26');
            } else if (levelNum === 26) {
              const isLevel39 = (this.activeLevelConfig && this.activeLevelConfig.levelNum === 39);
              if (isLevel39) {
                subPattern = obstacleIdx < groupSize ? 'elevator_26' : (obstacleIdx < groupSize * 2 ? 'rotating_24' : 'pendulum_39');
              } else {
                subPattern = 'elevator_26'; // All groups use high-amplitude elevator_26 updown animation
              }
            } else if (levelNum === 27) {
              subPattern = obstacleIdx < groupSize ? 'moving_stair_15' : (obstacleIdx < groupSize * 2 ? 'rotating_17' : 'dynamic_w_18');
            } else if (levelNum === 28) {
              subPattern = obstacleIdx < groupSize ? 'exp_shrink_19' : (obstacleIdx < groupSize * 2 ? 'hybrid_20' : 'snake_21');
            } else if (levelNum === 29) {
              subPattern = obstacleIdx < groupSize ? 'pulse_22' : (obstacleIdx < groupSize * 2 ? 'gravity_23' : 'rotating_24');
            }

            if (subPattern === 'wave_10') {
              const centerY = height / 2 + Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.5) * (55 * animScale);
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'breathing_12') {
              const currentGap = obs.gapHeight! + Math.sin(this.waveTime * 2.5) * (30 * animScale);
              obs.targetTopHeight = obs.spawnCenterY! - currentGap / 2;
              obs.targetBottomHeight = height - obs.spawnCenterY! - currentGap / 2;
            } else if (subPattern === 'moving_stair_15') {
              const shift = Math.sin(this.waveTime * 1.8 + obs.obstacleIdx! * 0.4) * (45 * animScale);
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'rotating_17' || subPattern === 'rotating_24') {
              const angle = this.waveTime * 2.0 + obs.obstacleIdx! * 0.5;
              obs.shakeX = Math.sin(angle) * (20 * animScale);
              obs.shakeX2 = Math.cos(angle) * (20 * animScale);
              let centerY = obs.spawnCenterY!;
              if (levelNum === 24) {
                centerY += Math.sin(this.waveTime * 2.2 + obs.obstacleIdx! * 0.45) * 32; // Vertical up/down motion
              }
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'dynamic_w_18') {
              const shift = Math.sin(this.waveTime * 2.2 + obs.obstacleIdx! * 0.3) * (35 * animScale);
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'exp_shrink_19') {
              const currentGap = obs.gapHeight! + Math.sin(this.waveTime * 2.2) * (20 * animScale);
              obs.targetTopHeight = obs.spawnCenterY! - currentGap / 2;
              obs.targetBottomHeight = height - obs.spawnCenterY! - currentGap / 2;
            } else if (subPattern === 'spiral_wave_32') {
              const angle = this.waveTime * 2.5 + obstacleIdx * 0.6;
              obs.shakeX = Math.sin(angle) * (18 * animScale);
              obs.shakeX2 = Math.cos(angle) * (18 * animScale);
              const shift = Math.sin(this.waveTime * 2.0 + obstacleIdx * 0.45) * (25 * animScale);
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'hybrid_20') {
              const shift = Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.4) * 30;
              const currentGap = obs.gapHeight! + Math.sin(this.waveTime * 2.5) * 15;
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - currentGap / 2;
              obs.targetBottomHeight = height - centerY - currentGap / 2;
            } else if (subPattern === 'snake_21') {
              const wave = Math.sin((obs.x * 0.01) - this.waveTime * 3.5) * 35;
              const centerY = obs.spawnCenterY! + wave;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'pulse_22') {
              const pulseScale = (levelNum === 23) ? 1.15 : 1.0;
              const pulse = Math.pow(Math.sin(this.waveTime * 2.2), 4) * (25 * pulseScale);
              const currentGap = obs.gapHeight! - pulse;
              obs.targetTopHeight = obs.spawnCenterY! - currentGap / 2;
              obs.targetBottomHeight = height - obs.spawnCenterY! - currentGap / 2;
            } else if (subPattern === 'gravity_23') {
              const shift = Math.sin(this.waveTime * 2.4) * 28;
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'waterfall_25') {
              const delay = (obs.obstacleIdx! * 0.4 - this.waveTime * 1.8) % 2.0;
              const cascade = delay * 20;
              const centerY = obs.spawnCenterY! + cascade;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'elevator_26') {
              const isLevel35 = (this.activeLevelConfig && this.activeLevelConfig.levelNum === 35);
              const elevatorScale = (levelNum === 25) ? 0.56 : 1.0; // Reduced additional 20% for Level 25 (0.70 * 0.80 = 0.56)
              const shift = Math.sin(this.waveTime * 1.8 + (obs.obstacleIdx! % 2) * Math.PI) * (isLevel35 ? 30 : 7 * elevatorScale); // High amplitude up-down
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'magnetic_27') {
              const animSpeed = (this.activeLevelConfig && this.activeLevelConfig.levelNum === 39) ? 1.7 : 2.0;
              const magnet = Math.sin(this.waveTime * animSpeed) * 20;
              const verticalShift = levelNum === 25 ? Math.sin(this.waveTime * animSpeed + obs.obstacleIdx! * 0.5) * (obs.gapHeight! * 0.35) : 0;
              const centerY = obs.spawnCenterY! + verticalShift;
              obs.targetTopHeight = centerY - (obs.gapHeight! + magnet) / 2;
              obs.targetBottomHeight = height - centerY - (obs.gapHeight! - magnet) / 2;
            } else if (subPattern === 'pendulum_28') {
              const angle = Math.sin(this.waveTime * 1.6 + obs.obstacleIdx! * 0.4) * 0.3;
              obs.shakeX = Math.sin(angle) * 25;
              obs.shakeX2 = obs.shakeX;
              const verticalShift = levelNum === 25 ? Math.sin(this.waveTime * 2.0 + obs.obstacleIdx! * 0.5) * (obs.gapHeight! * 0.35) : 0;
              const centerY = obs.spawnCenterY! + verticalShift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'pendulum_39') {
              // High-speed, high-amplitude swinging pendulum + vertical wave bobbing
              const angle = Math.sin(this.waveTime * 2.8 + obs.obstacleIdx! * 0.6) * 0.5;
              obs.shakeX = Math.sin(angle) * (45 * animScale);
              obs.shakeX2 = obs.shakeX;
              const verticalShift = Math.sin(this.waveTime * 3.2 + obs.obstacleIdx! * 0.7) * (25 * animScale);
              const centerY = obs.spawnCenterY! + verticalShift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            } else if (subPattern === 'sliding_29') {
              const shift = Math.sin(this.waveTime * 2.0 + (obs.obstacleIdx! % 2) * (Math.PI / 2)) * 30;
              const centerY = obs.spawnCenterY! + shift;
              obs.targetTopHeight = centerY - obs.gapHeight! / 2;
              obs.targetBottomHeight = height - centerY - obs.gapHeight! / 2;
            }
          }

          // Apply custom different-direction split opening animation for special obstacles
          if (obs.isSpecialSplit && progress < 1) {
            // Horizontal left-right split movements removed as requested
            obs.shakeX = 0;
            obs.shakeX2 = 0;
          }

          // Smooth reveal interpolation
          obs.topHeight = obs.closedTopHeight! + (obs.targetTopHeight! - obs.closedTopHeight!) * easedOpen;
          obs.bottomHeight = obs.closedBottomHeight! + (obs.targetBottomHeight! - obs.closedBottomHeight!) * easedOpen;

          // Centralized Dynamic Gameplay Safeguard for Levels 11-20 (excluding level 13)
          if (obs.levelNum !== undefined && obs.levelNum >= 11 && obs.levelNum <= 20 && obs.levelNum !== 13) {
            let currentGap = height - obs.topHeight - obs.bottomHeight;
            if (currentGap < 165) {
              const center = obs.topHeight + currentGap / 2;
              obs.topHeight = center - 165 / 2;
              obs.bottomHeight = height - center - 165 / 2;
            }
            const minHeight = 40;
            if (obs.topHeight < minHeight) {
              obs.topHeight = minHeight;
              obs.bottomHeight = height - minHeight - 165;
            } else if (obs.bottomHeight < minHeight) {
              obs.bottomHeight = minHeight;
              obs.topHeight = height - minHeight - 165;
            }
          }

          // Centralized Dynamic Gameplay Safeguard for Levels 1-10 and Level 13
          if (obs.levelNum !== undefined && ((obs.levelNum >= 1 && obs.levelNum <= 10) || obs.levelNum === 13)) {
            const defaultMin = (obs.levelNum === 4) ? 107 : (obs.levelNum === 6 ? 93 : 125);
            const minAllowedGap = obs.gapHeight !== undefined ? Math.min(obs.gapHeight, defaultMin) : defaultMin;
            let currentGap = height - obs.topHeight - obs.bottomHeight;
            if (currentGap < minAllowedGap) {
              const center = obs.topHeight + currentGap / 2;
              obs.topHeight = center - minAllowedGap / 2;
              obs.bottomHeight = height - center - minAllowedGap / 2;
            }
            const minHeight = 35;
            if (obs.topHeight < minHeight) {
              obs.topHeight = minHeight;
              obs.bottomHeight = height - minHeight - minAllowedGap;
            } else if (obs.bottomHeight < minHeight) {
              obs.bottomHeight = minHeight;
              obs.topHeight = height - minHeight - minAllowedGap;
            }
          }

          // Centralized Dynamic Gameplay Safeguard for Levels 21-50
          if (obs.levelNum !== undefined && obs.levelNum >= 21 && obs.levelNum <= 50) {
            const hasCompression = (
              (obs.patternType && obs.patternType.indexOf('_progress') !== -1) ||
              obs.patternType === 'level38_scurve' ||
              obs.patternType === 'level40_miniboss' ||
              obs.patternType === 'breathing_12' ||
              obs.patternType === 'exp_shrink_19' ||
              obs.patternType === 'pulse_22' ||
              obs.patternType === 'level30_hybridwave' ||
              obs.patternType === 'level31_snakemotion' ||
              obs.patternType === 'level33_magneticpush' ||
              obs.patternType === 'level34_pendulum' ||
              obs.patternType === 'level36_spiralflow' ||
              obs.patternType === 'level42_infinity' ||
              obs.patternType === 'level44_pendulum' ||
              obs.patternType === 'level45_scurve' ||
              obs.patternType === 'level47_diamond' ||
              obs.patternType === 'level49_fractal' ||
              obs.patternType === 'level50_finalboss'
            );
            const minAllowedGap = obs.gapHeight !== undefined 
              ? (hasCompression ? 105 : Math.max(105, obs.gapHeight)) 
              : 125;
            let currentGap = height - obs.topHeight - obs.bottomHeight;
            if (currentGap < minAllowedGap) {
              const center = obs.topHeight + currentGap / 2;
              obs.topHeight = center - minAllowedGap / 2;
              obs.bottomHeight = height - center - minAllowedGap / 2;
            }
            const minHeight = 35;
            if (obs.topHeight < minHeight) {
              obs.topHeight = minHeight;
              obs.bottomHeight = height - minHeight - minAllowedGap;
            } else if (obs.bottomHeight < minHeight) {
              obs.bottomHeight = minHeight;
              obs.topHeight = height - minHeight - minAllowedGap;
            }
          }

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

            if (obs.patternType === 'level10_miniboss' || obs.patternType === 'level20_masterhybrid' || obs.patternType === 'level40_miniboss') {
              const colors = ['#ff007f', '#00f3ff', '#39ff14', '#ffff00', '#ffd700'];
              pColor = colors[Math.floor(Math.random() * colors.length)];
              pGlow = true;
              pGlowColor = pColor;
              pShape = Math.random() > 0.5 ? 'star' : 'spark';
            } else if (obs.worldId === 'jungle') {
              pColor = Math.random() < 0.5 ? '#228b22' : '#39ff14';
              pShape = 'spark';
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
      } else {
        // Endless mode obstacle movement
        const isEndlessAnimationZone = gameMode === 'endless' && (obs.spawnScore !== undefined ? obs.spawnScore : score) <= 80;
        const isStaticEndless = gameMode === 'endless' && (score < 50 || (obs.spawnScore !== undefined && obs.spawnScore < 50)) && !isEndlessAnimationZone;
        
        const isChaosMode = zone === 'chaos';
        if (isChaosMode) {
          obs.shakeX = 0;
          obs.shakeX2 = 0;
          let centerY = obs.spawnCenterY !== undefined ? obs.spawnCenterY : (obs.initialTopHeight + (height - obs.initialBottomHeight - obs.initialTopHeight) / 2);
          const currentGap = obs.gapHeight !== undefined ? obs.gapHeight : (height - obs.initialBottomHeight - obs.initialTopHeight);
          let verticalShift = 0;
          let breathingOffset = 0;
          const idx = obs.obstacleIdx || 0;
          const phaseSign = idx % 2 === 0 ? 1 : -1;

          if (score <= 30) {
            // 1. Drifting Breath (Horizontal Slide + Vertical Breathing)
            const t = this.waveTime * 1.5 + idx * 0.4;
            obs.shakeX = Math.sin(t) * 22;
            obs.shakeX2 = obs.shakeX;
            breathingOffset = Math.cos(t * 1.3) * 14; 
          } else if (score <= 60) {
            // 2. Springing Shear (Diagonal Shear + Counterphase Piston Spring)
            const t = this.waveTime * 1.6 + idx * 0.5;
            obs.shakeX = Math.sin(t) * 26 * phaseSign;
            obs.shakeX2 = -obs.shakeX;
            // Piston spring formula
            const period = 2.4;
            const pt = t % period;
            const spring = pt < 0.8 ? Math.sin((pt / 0.8) * Math.PI * 3.0) * 22 * Math.exp(-pt * 2.2) : 0;
            verticalShift = spring * phaseSign;
          } else if (score <= 100) {
            // 3. Glitch Elevator (Stepwise Elevator + Fast Glitch Shearing)
            const t = this.waveTime * 1.8 + idx * 0.5;
            // Stepwise vertical elevator
            const stepVal = Math.sin(t);
            verticalShift = Math.tanh(stepVal * 4.0) * 24;
            // Glitch horizontal shear
            if ((Math.floor(this.waveTime * 5.0) + idx) % 4 === 0) {
              obs.shakeX = phaseSign * 24;
              obs.shakeX2 = -phaseSign * 24;
            } else {
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            }
          } else if (score <= 150) {
            // 4. Trembling Lissajous Vortex (3:2 Orbit + High-Frequency Tremor)
            const t = this.waveTime * 1.8 + idx * 0.6;
            // Lissajous base
            const orbitX = Math.sin(t * 2.0) * 22;
            const orbitY = Math.cos(t * 3.0) * 18;
            // Tremor jitter
            const jitterX = Math.sin(this.waveTime * 25.0) * 6;
            const jitterY = Math.cos(this.waveTime * 25.0) * 6;
            obs.shakeX = orbitX + jitterX;
            obs.shakeX2 = obs.shakeX;
            verticalShift = orbitY + jitterY;
          } else if (score <= 220) {
            // 5. Elastic Sling-Surge (Slingshot vertical snap + Opposing horizontal jolting)
            const period = 2.2;
            const t = (this.waveTime * 1.2 + idx * 0.4) % period;
            // Slingshot pull/release
            if (t < 1.4) {
              verticalShift = (t / 1.4) * 26;
            } else {
              const progress = (t - 1.4) / 0.8;
              verticalShift = 26 - (progress * 52) + Math.sin(progress * Math.PI * 3.0) * 12 * Math.exp(-progress * 2.0);
            }
            // Opposing horizontal jolts
            const jt = this.waveTime % 2.5;
            if (jt < 0.4) {
              const progress = jt / 0.4;
              obs.shakeX = Math.sin(progress * Math.PI) * 32 * phaseSign;
            } else {
              obs.shakeX = 0;
            }
            obs.shakeX2 = -obs.shakeX;
          } else if (score <= 300) {
            // 6. Triple Phase Orbit (3-position vertical snap + Circular shearing orbit)
            const t = this.waveTime * 1.8 + idx * 0.5;
            // Orbit component
            const orbitX = Math.cos(t) * 24;
            const orbitY = Math.sin(t) * 18;
            // Snap component
            const positions = [-28, 0, 28];
            const posIdx = Math.floor((this.waveTime * 1.5 + idx * 0.7) % 3);
            const snapY = positions[Math.abs(posIdx) % 3];
            obs.shakeX = orbitX * phaseSign;
            obs.shakeX2 = -orbitX * phaseSign;
            verticalShift = orbitY + snapY;
          } else {
            // 7. Apocalyptic Chaos Storm (Tremor + Slingshot + Orbit + Surge + Phase Snap combined)
            let diffScale = 1.0;
            if (score >= 330 && score <= 400) {
              diffScale = 1.25;
            } else if (score > 400 && score <= 500) {
              diffScale = 1.35;
            } else if (score > 500 && score <= 700) {
              diffScale = 1.50;
            } else if (score > 700) {
              diffScale = 1.70;
            }

            let speedScale = 1.0;
            if (score >= 300 && score <= 400) {
              speedScale = 0.70; // 30% reduction
            } else if (score > 400 && score <= 500) {
              speedScale = 0.80; // 20% reduction
            }

            const t = this.waveTime * 2.0 * speedScale + idx * 0.6;
            // Orbit + Tremor Horizontal
            obs.shakeX = (Math.cos(t) * 28 + Math.sin(this.waveTime * 24.0 * speedScale) * 8) * diffScale * phaseSign;
            obs.shakeX2 = -obs.shakeX;
            // Slingshot + Phase Snap Vertical
            const positions = [-32, 0, 32];
            const posIdx = Math.floor((this.waveTime * 1.8 * speedScale + idx * 0.8) % 3);
            const snapY = positions[Math.abs(posIdx) % 3];
            const surgeY = Math.sin(t * 2.5) * 24 * diffScale;
            verticalShift = (snapY + surgeY) * diffScale;
          }

          // Apply 15% animation difficulty reduction
          verticalShift *= 0.85;
          obs.shakeX *= 0.85;
          obs.shakeX2 *= 0.85;
          breathingOffset *= 0.85;

          // Apply boundary clamping
          centerY += verticalShift;
          const minCY = 45 + currentGap / 2;
          const maxCY = height - 45 - currentGap / 2;
          centerY = Math.max(minCY, Math.min(maxCY, centerY));
          obs.topHeight = centerY - currentGap / 2 - breathingOffset;
          obs.bottomHeight = height - centerY - currentGap / 2 - breathingOffset;
        } else if (isStaticEndless) {
          obs.shakeX = 0;
          obs.shakeX2 = 0;
          const centerY = obs.spawnCenterY !== undefined ? obs.spawnCenterY : (obs.initialTopHeight + (height - obs.initialBottomHeight - obs.initialTopHeight) / 2);
          const currentGap = obs.gapHeight !== undefined ? obs.gapHeight : (height - obs.initialBottomHeight - obs.initialTopHeight);
          obs.topHeight = centerY - currentGap / 2;
          obs.bottomHeight = height - centerY - currentGap / 2;
        } else if (isEndlessAnimationZone) {
          const spawnScoreVal = obs.spawnScore !== undefined ? obs.spawnScore : score;
          let centerY = obs.spawnCenterY !== undefined ? obs.spawnCenterY : (obs.initialTopHeight + (height - obs.initialBottomHeight - obs.initialTopHeight) / 2);
          const currentGap = obs.gapHeight !== undefined ? obs.gapHeight : (height - obs.initialBottomHeight - obs.initialTopHeight);
          let verticalShift = 0;
          let isDirectHeightSet = false;
          
          obs.shakeX = 0;
          obs.shakeX2 = 0;
          
          if (spawnScoreVal <= 20) {
            // First Zone: Score <= 20 (every 5 obstacles, 4 patterns)
            const animGroup = Math.floor((obs.obstacleIdx || 0) / 5) % 4;
            if (animGroup === 0) {
              // Group 0: Piston Spring Bounce - periodic springy vertical bounce followed by static settle
              const period = 2.4; // cycle every 2.4 seconds
              const t = this.waveTime % period;
              if (t < 0.8) {
                const progress = t / 0.8;
                // Damped elastic wave
                verticalShift = Math.sin(progress * Math.PI * 3.0) * 25 * Math.exp(-progress * 2.2);
              } else {
                verticalShift = 0;
              }
            } else if (animGroup === 1) {
              // Group 1: Diagonal Shear Drift - opposing horizontal drifting (top goes left, bottom goes right, then swaps)
              const driftTime = this.waveTime * 1.8;
              const cycle = driftTime % (Math.PI * 2);
              const triangle = Math.abs((cycle / Math.PI) - 1.0) * 2.0 - 1.0; // range -1 to 1
              obs.shakeX = triangle * 28;
              obs.shakeX2 = -triangle * 28;
              verticalShift = 0;
            } else if (animGroup === 2) {
              // Group 2: Seismic Tremor - intense high-frequency vibration combined with a slow vertical wave
              // Slow heavy vertical wave
              verticalShift = Math.sin(this.waveTime * 0.9 + (obs.obstacleIdx || 0) * 0.4) * 14;
              // Tremor vibrations
              obs.shakeX = Math.sin(this.waveTime * 24.0) * 6;
              obs.shakeX2 = Math.cos(this.waveTime * 24.0) * 6;
            } else if (animGroup === 3) {
              // Group 3: Robotic Smooth Step Elevator - discrete snaps up and down, holding position in between
              const t = this.waveTime * 1.6;
              const stepVal = Math.sin(t + (obs.obstacleIdx || 0) * 0.5);
              // Math.tanh creates quick transitions between -1 and 1
              verticalShift = Math.tanh(stepVal * 4.0) * 22;
            }
          } else if (spawnScoreVal <= 40) {
            // Second Zone: Score 21 to 40 (every 5 obstacles, 4 patterns)
            const animGroup = Math.floor((obs.obstacleIdx || 0) / 5) % 4;
            if (animGroup === 0) {
              // Group 0: Elastic Rubberband Gap (Breathing Gap Height)
              const breathing = Math.sin(this.waveTime * 2.5) * 20; // Oscillates gap size dynamically
              obs.topHeight = (centerY - currentGap / 2) - breathing;
              obs.bottomHeight = height - (centerY + currentGap / 2) - breathing;
              isDirectHeightSet = true;
            } else if (animGroup === 1) {
              // Group 1: Circular Shearing Vortex (opposing circular phase lag)
              const t = this.waveTime * 2.2;
              obs.shakeX = Math.cos(t) * 22;
              obs.shakeX2 = Math.sin(t) * 22;
              verticalShift = Math.sin(t * 1.5) * 15;
            } else if (animGroup === 2) {
              // Group 2: Wave Speed Burst (accelerated vertical bobbing)
              const waveMod = Math.sin(this.waveTime * 1.2) * 0.5 + 0.5;
              const t = this.waveTime * (1.0 + waveMod * 3.5);
              verticalShift = Math.sin(t) * 18;
            } else if (animGroup === 3) {
              // Group 3: Diagonal Glitch Steps (L-shape step movements)
              const t = this.waveTime * 1.5;
              const stepX = Math.tanh(Math.sin(t) * 5.0) * 25;
              const stepY = Math.tanh(Math.cos(t) * 5.0) * 18;
              obs.shakeX = stepX;
              obs.shakeX2 = stepX;
              verticalShift = stepY;
            }
          } else {
            // Third Zone: Score 41 to 80 (every 5 obstacles, 8 patterns)
            const animGroup = Math.floor((obs.obstacleIdx || 0) / 5) % 8;
            if (animGroup === 0) {
              // Group 0: Gravity Wave (vertical bounce acceleration)
              const period = 2.0;
              const t = this.waveTime % period;
              if (t < 1.0) {
                verticalShift = -20 + (t * t * 40);
              } else {
                const progress = t - 1.0;
                verticalShift = Math.sin(progress * Math.PI) * 15;
              }
            } else if (animGroup === 1) {
              // Group 1: Sawtooth Wave (linear vertical sliding slider)
              const period = 2.2;
              const t = this.waveTime % period;
              const progress = t / period;
              const triangle = progress < 0.5 ? (progress * 4.0 - 1.0) : (3.0 - progress * 4.0);
              verticalShift = triangle * 25;
            } else if (animGroup === 2) {
              // Group 2: Horizontal Jolt (periodic sudden side dodge)
              const period = 2.5;
              const t = this.waveTime % period;
              if (t < 0.4) {
                const progress = t / 0.4;
                obs.shakeX = Math.sin(progress * Math.PI) * 35;
              } else {
                obs.shakeX = 0;
              }
              obs.shakeX2 = obs.shakeX;
              verticalShift = 0;
            } else if (animGroup === 3) {
              // Group 3: Chaotic Flutter (high-frequency flutter)
              verticalShift = Math.sin(this.waveTime * 15.0) * 8 + Math.sin(this.waveTime * 0.8) * 12;
              obs.shakeX = Math.cos(this.waveTime * 1.5) * 15;
              obs.shakeX2 = obs.shakeX;
            } else if (animGroup === 4) {
              // Group 4: Expand-Contract Loop (double shear horizontal shake + vertical wave)
              const t = this.waveTime * 3.0;
              obs.shakeX = Math.sin(t) * 20;
              obs.shakeX2 = -Math.sin(t) * 20;
              verticalShift = Math.sin(this.waveTime * 1.0) * 15;
            } else if (animGroup === 5) {
              // Group 5: Spiral Lissajous (3:2 frequency ratio bow shape path)
              const t = this.waveTime * 1.5;
              obs.shakeX = Math.sin(t * 2.0) * 20;
              obs.shakeX2 = obs.shakeX;
              verticalShift = Math.cos(t * 3.0) * 15;
            } else if (animGroup === 6) {
              // Group 6: Double-Step Ladder
              const t = this.waveTime * 1.5;
              const step = Math.sin(t) + Math.sin(t * 0.5);
              verticalShift = Math.tanh(step * 3.0) * 24;
            } else if (animGroup === 7) {
              // Group 7: Elastic Slingshot (slow pull up, sudden snap down)
              const period = 2.6;
              const t = this.waveTime % period;
              if (t < 1.8) {
                const progress = t / 1.8;
                verticalShift = progress * 25;
              } else {
                const progress = (t - 1.8) / 0.8;
                verticalShift = 25 - (progress * 50) + Math.sin(progress * Math.PI * 3.0) * 10 * Math.exp(-progress * 2.0);
              }
            }
          }
          
          if (!isDirectHeightSet) {
            centerY += verticalShift;
            // Playability Clamp boundary checking
            const minCenterY = 45 + currentGap / 2;
            const maxCenterY = height - 45 - currentGap / 2;
            centerY = Math.max(minCenterY, Math.min(maxCenterY, centerY));
            
            obs.topHeight = centerY - currentGap / 2;
            obs.bottomHeight = height - centerY - currentGap / 2;
          }
        } else if (obs.approachAnimType !== undefined) {
          // Check near approach trigger
          if (_birdX !== undefined) {
            const dx = obs.x - _birdX;
            if (!obs.isTriggered && dx <= obs.triggerDistance!) {
              obs.isTriggered = true;
              obs.animTimer = 0;
            }
          }

          // Calculate vertical shift if sways are active
          let verticalShift = 0;
          
          if (obs.isGoldSplitGate) {
            // Gold Split Gate gentle electric bobbing/sway once opened
            verticalShift = Math.sin(this.waveTime * 4.0 + (obs.obstacleIdx || 0) * 0.8) * 8;
          }

          const baseTargetTop = obs.spawnCenterY! - obs.gapHeight! / 2;
          const baseTargetBottom = height - obs.spawnCenterY! - obs.gapHeight! / 2;
          obs.targetTopHeight = baseTargetTop + verticalShift;
          obs.targetBottomHeight = baseTargetBottom - verticalShift;

          if (obs.isTriggered) {
            obs.animTimer! += deltaTime * timeScale;
            if (obs.animTimer! > obs.animDuration!) {
              obs.animTimer = obs.animDuration!;
            }
            const progress = obs.animTimer! / obs.animDuration!;
            // Smooth ease-out sine profile for extremely fluid visual transitions
            const ease = Math.sin((progress * Math.PI) / 2);
            obs.topHeight = obs.closedTopHeight! + (obs.targetTopHeight! - obs.closedTopHeight!) * ease;
            obs.bottomHeight = obs.closedBottomHeight! + (obs.targetBottomHeight! - obs.closedBottomHeight!) * ease;

            // Apply custom different-direction split opening animation for special obstacles in endless mode
            if (obs.isSpecialSplit) {
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            }
          } else {
            obs.topHeight = obs.closedTopHeight!;
            obs.bottomHeight = obs.closedBottomHeight!;
            if (obs.isSpecialSplit) {
              obs.shakeX = 0;
              obs.shakeX2 = 0;
            }
          }
        } else {
          // Standard endless mode obstacle movement (sways/oscillations)
          obs.shakeX = 0;
          obs.shakeX2 = 0;
          let centerY = obs.spawnCenterY !== undefined ? obs.spawnCenterY : (obs.initialTopHeight + (height - obs.initialBottomHeight - obs.initialTopHeight) / 2);
          let currentGap = obs.gapHeight !== undefined ? obs.gapHeight : (height - obs.initialBottomHeight - obs.initialTopHeight);

          // Pipe gaps are kept completely constant and unchanged as requested, only shifting centerY up and down!
          let verticalShift = 0;
          let breathingOffset = 0;

          // Use the score at spawn time to keep transitions completely smooth and stutter-free!
          const activeScore = obs.spawnScore !== undefined ? obs.spawnScore : score;
          const isFlockMode = gameMode === 'flock';
          const effectiveScore = isFlockMode ? Math.max(100, activeScore) : activeScore;

          // Slower/less extreme movement for flock mode to accommodate larger squad height spreads
          let motionSpeedMult = 1.0;
          let motionAmpMult = 1.0;
          if (gameMode === 'flock') {
            motionSpeedMult = 0.7;
            motionAmpMult = 2.24;  // 60% baseline increase + 40% additional increase = 2.24 (was 1.60)
          }

          if (obs.isOrbitalSway) {
            // Cosmic Vortex Orbital Gates (Circular orbital sway)
            const orbitSpeed = 2.2;
            const orbitRadius = 28;
            const angle = this.waveTime * orbitSpeed + (obs.obstacleIdx || 0) * 0.7;
            obs.shakeX = Math.cos(angle) * orbitRadius;
            obs.shakeX2 = obs.shakeX;
            verticalShift = Math.sin(angle) * orbitRadius;
          } else if (obs.isGoldSplitGate) {
            // Electric Gold Split Gate gentle electric bobbing/sway once opened
            verticalShift = Math.sin(this.waveTime * 4.0 + (obs.obstacleIdx || 0) * 0.8) * 8;
          } else {
            // Apply custom animations for squad (flock) mode in specific score ranges
            let isFlockCustomAnimApplied = false;
            if (gameMode === 'flock') {
              if (activeScore >= 50 && activeScore <= 100) {
                // Elastic Rubberband Gap animation
                breathingOffset = Math.sin(this.waveTime * 2.0) * 15;
                isFlockCustomAnimApplied = true;
              } else if (activeScore >= 101 && activeScore <= 150) {
                // Diagonal Glitch Steps
                const stepTime = 1.0;
                const t = (this.waveTime + (obs.obstacleIdx || 0) * 0.4) % (stepTime * 3);
                let stepDrift = 0;
                if (t < stepTime) {
                  stepDrift = -20;
                } else if (t < stepTime * 2) {
                  stepDrift = 0;
                } else {
                  stepDrift = 20;
                }
                obs.shakeX = stepDrift;
                obs.shakeX2 = -stepDrift;
                verticalShift = Math.sin(this.waveTime * 1.5) * 15;
                isFlockCustomAnimApplied = true;
              } else if (activeScore >= 151 && activeScore <= 200) {
                // Robotic Smooth Step Elevator
                const period = 3.0;
                const stepTime = period / 4;
                const t = (this.waveTime + (obs.obstacleIdx || 0) * 0.5) % period;
                const amp = 25;
                let targetPos = 0;
                if (t < stepTime) {
                  targetPos = -amp;
                } else if (t < stepTime * 2) {
                  const progress = (t - stepTime) / stepTime;
                  const smoothProgress = progress * progress * (3 - 2 * progress);
                  targetPos = -amp + smoothProgress * (2 * amp);
                } else if (t < stepTime * 3) {
                  targetPos = amp;
                } else {
                  const progress = (t - stepTime * 3) / stepTime;
                  const smoothProgress = progress * progress * (3 - 2 * progress);
                  targetPos = amp - smoothProgress * (2 * amp);
                }
                verticalShift = targetPos;
                isFlockCustomAnimApplied = true;
              } else if (activeScore >= 201 && activeScore <= 250) {
                // Horizontal Jolt
                const period = 2.0;
                const t = this.waveTime % period;
                if (t < 0.4) {
                  const progress = t / 0.4;
                  obs.shakeX = Math.sin(progress * Math.PI) * 28;
                } else {
                  obs.shakeX = 0;
                }
                obs.shakeX2 = obs.shakeX;
                verticalShift = Math.sin(this.waveTime * 1.8) * 18;
                isFlockCustomAnimApplied = true;
              }
            }

            if (!isFlockCustomAnimApplied && (gameMode !== 'flock' || activeScore >= 100)) {
              // Apply Progressive Cos-based Out-of-Phase Oscillation for Classic Endless Mode (Score 100 to 500)
              if (zone === 'classic' && effectiveScore >= 100 && effectiveScore < 500) {
              const phaseSign = (obs.obstacleIdx || 0) % 2 === 0 ? 1 : -1;
              if (effectiveScore < 150) {
                // Cos-based Out-of-Phase Oscillation (Standard: 100-150)
                verticalShift = Math.cos(this.waveTime * 1.8 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.5) * 35 * phaseSign * motionAmpMult;
              } else if (effectiveScore < 200) {
                // Cos-based Out-of-Phase Oscillation (Progressive Level 1: 150-200 - Faster & Higher Amplitude)
                verticalShift = Math.cos(this.waveTime * 2.1 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.6) * 42 * phaseSign * motionAmpMult;
              } else if (effectiveScore < 300) {
                // Cos-based Out-of-Phase Oscillation (Progressive Level 2: 200-300 - Dual Wave Harmonic, Out-of-Phase)
                const primary = Math.cos(this.waveTime * 2.4 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.7) * 38;
                const secondary = Math.cos(this.waveTime * 1.2 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.35) * 14;
                verticalShift = (primary + secondary) * phaseSign * motionAmpMult;
              } else {
                // Cos-based Out-of-Phase Oscillation (Progressive Level 3: 300-500 - Extreme High Frequency Dual Wave Ripple, Out-of-Phase)
                const primary = Math.cos(this.waveTime * 2.8 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.8) * 48;
                const secondary = Math.cos(this.waveTime * 1.4 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.4) * 17;
                verticalShift = (primary + secondary) * phaseSign * motionAmpMult;
              }

              // Layer additional animations as requested:
              if (effectiveScore >= 100 && effectiveScore <= 125) {
                // Diagonal Shear Drift (top goes left, bottom goes right, then swaps)
                const driftTime = this.waveTime * 1.8;
                const cycle = driftTime % (Math.PI * 2);
                const triangle = Math.abs((cycle / Math.PI) - 1.0) * 2.0 - 1.0;
                obs.shakeX = triangle * 28;
                obs.shakeX2 = -triangle * 28;
              } else if (effectiveScore >= 126 && effectiveScore < 150) {
                // Piston Spring Bounce (periodic springy vertical bounce)
                const period = 2.4;
                const t = this.waveTime % period;
                if (t < 0.8) {
                  const progress = t / 0.8;
                  verticalShift += Math.sin(progress * Math.PI * 3.0) * 25 * Math.exp(-progress * 2.2);
                }
              } else if (effectiveScore >= 150 && effectiveScore < 175) {
                // Seismic Tremor (high-frequency vibration combined with slow vertical wave)
                obs.shakeX = Math.sin(this.waveTime * 24.0) * 6;
                obs.shakeX2 = Math.cos(this.waveTime * 24.0) * 6;
                verticalShift += Math.sin(this.waveTime * 0.9 + (obs.obstacleIdx || 0) * 0.4) * 14;
              } else if (effectiveScore >= 175 && effectiveScore <= 200) {
                // Elastic Rubberband Gap (Breathing Gap Height)
                breathingOffset = Math.sin(this.waveTime * 2.5) * 20;
              } else if (effectiveScore >= 200 && effectiveScore <= 225) {
                // Horizontal Jolt (periodic sudden side dodge)
                const period = 2.5;
                const t = this.waveTime % period;
                if (t < 0.4) {
                  const progress = t / 0.4;
                  obs.shakeX = Math.sin(progress * Math.PI) * 35;
                } else {
                  obs.shakeX = 0;
                }
                obs.shakeX2 = obs.shakeX;
              } else if (effectiveScore >= 226 && effectiveScore < 250) {
                // Chaotic Flutter (high-frequency flutter)
                verticalShift += Math.sin(this.waveTime * 15.0) * 8 + Math.sin(this.waveTime * 0.8) * 12;
                obs.shakeX = Math.cos(this.waveTime * 1.5) * 15;
                obs.shakeX2 = obs.shakeX;
              } else if (effectiveScore >= 250 && effectiveScore < 275) {
                // Spiral Lissajous (3:2 frequency ratio bow shape path)
                const t = this.waveTime * 1.5;
                obs.shakeX = Math.sin(t * 2.0) * 20;
                obs.shakeX2 = obs.shakeX;
                verticalShift += Math.cos(t * 3.0) * 15;
              } else if (effectiveScore >= 275 && effectiveScore <= 300) {
                // Gravity Wave (vertical bounce acceleration)
                const period = 2.0;
                const t = this.waveTime % period;
                if (t < 1.0) {
                  verticalShift += -20 + (t * t * 40);
                } else {
                  const progress = t - 1.0;
                  verticalShift += Math.sin(progress * Math.PI) * 15;
                }
              } else if (effectiveScore >= 325 && effectiveScore <= 370) {
                // Seismic Tremor (Obstacle 325 to 370)
                obs.shakeX = Math.sin(this.waveTime * 24.0) * 6;
                obs.shakeX2 = Math.cos(this.waveTime * 24.0) * 6;
                verticalShift += Math.sin(this.waveTime * 0.9 + (obs.obstacleIdx || 0) * 0.4) * 14;
              } else if (effectiveScore >= 371 && effectiveScore <= 430) {
                // Robotic Smooth Step Elevator (Obstacle 371 to 430)
                const period = 3.0; // cycle period
                const stepTime = period / 4; // 4 stages: hold bottom, step up, hold top, step down
                const t = (this.waveTime + (obs.obstacleIdx || 0) * 0.5) % period;
                const amp = 35; // displacement amplitude
                
                let targetPos = 0;
                if (t < stepTime) {
                  targetPos = -amp;
                } else if (t < stepTime * 2) {
                  const progress = (t - stepTime) / stepTime;
                  const smoothProgress = progress * progress * (3 - 2 * progress); // smoothstep
                  targetPos = -amp + smoothProgress * (2 * amp);
                } else if (t < stepTime * 3) {
                  targetPos = amp;
                } else {
                  const progress = (t - stepTime * 3) / stepTime;
                  const smoothProgress = progress * progress * (3 - 2 * progress); // smoothstep
                  targetPos = amp - smoothProgress * (2 * amp);
                }
                verticalShift += targetPos;
              } else if (effectiveScore >= 431 && effectiveScore <= 500) {
                // Gravity Wave (Obstacle 431 to 500)
                const period = 2.0;
                const t = this.waveTime % period;
                if (t < 1.0) {
                  verticalShift += -20 + (t * t * 40);
                } else {
                  const progress = t - 1.0;
                  verticalShift += Math.sin(progress * Math.PI) * 15;
                }
              }
            } else {
              // Existing non-classic endless or other ranges logic (remains untouched!)
              if (effectiveScore >= 100 && effectiveScore < 200) {
                // Simple up-down (elevator) animation keeping gap constant for other zones
                const ampIncrease = effectiveScore < 150 ? 1.15 : 1.25; // 15% increase for score 100-150, 25% increase for score 150-200
                let flockMult = 1.0;
                if (gameMode === 'flock') {
                  flockMult = 1.10; // 10% increase
                }
                verticalShift = Math.sin(this.waveTime * 1.5 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.4) * (32 * ampIncrease) * motionAmpMult * flockMult;
              } else if (effectiveScore >= 200 && effectiveScore < 300) {
                // Added 8% difficulty: increase base amplitude from 50px to 54px
                let flockMult = 1.0;
                if (gameMode === 'flock') {
                  flockMult = 0.87; // 13% less
                }
                verticalShift = Math.sin(this.waveTime * 2.2 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.5) * 54 * motionAmpMult * flockMult;
              } else if (effectiveScore >= 300) {
                if (gameMode === 'flock') {
                  // Smooth up-down and zigzag animations with dynamic difficulty scaling (up to 20% increase at score 500, and additional 60% increase from 500 to 1000)
                  const progress = Math.max(0, Math.min(1, (effectiveScore - 300) / 200));
                  let diffScale = 1.0 + progress * 0.20; // 20% difficulty increase at score 500
                  if (effectiveScore >= 500) {
                    const progress500to1000 = Math.max(0, Math.min(1, (effectiveScore - 500) / 500));
                    diffScale = 1.20 * (1.0 + progress500to1000 * 0.60); // 60% increase at score 1000, kept constant above 1000
                  }
                  
                  let flockMult = 1.0;
                  if (effectiveScore < 400) {
                    flockMult = 0.92; // 8% reduction (85 typo for 8% on Nepali/Shift-5 layout)
                  }
                  
                  const speed = 2.0 * motionSpeedMult * diffScale;
                  const amp = 50 * motionAmpMult * diffScale * flockMult;
                  
                  const style = (obs.obstacleIdx !== undefined ? obs.obstacleIdx : 0) % 2;
                  if (style === 0) {
                    // Style 0: Smooth up-down animation (keeping gap constant)
                    verticalShift = Math.sin(this.waveTime * speed + (obs.obstacleIdx || 0) * 0.5) * amp;
                  } else {
                    // Style 1: Zigzag animation (opposing vertical directions, keeping gap constant)
                    const elevatorDir = ((obs.obstacleIdx || 0) % 2 === 0) ? 1 : -1;
                    verticalShift = Math.sin(this.waveTime * speed) * amp * elevatorDir;
                  }
                } else if (effectiveScore < 500) {
                  // Score 300-500: full high difficulty smooth up-down sways up to 60px
                  verticalShift = Math.sin(this.waveTime * 2.5 * motionSpeedMult + (obs.obstacleIdx || 0) * 0.5) * 60 * motionAmpMult;
                } else {
                  // Score >= 500 for non-flock modes (progressive sways)
                  let intervals = Math.floor((effectiveScore - 500) / 100);
                  if (intervals < 0) intervals = 0;

                  // Progressive difficulty: increase amplitude (starting at 1.3x) and frequency (starting at 1.25x)
                  const amplitudeMultiplier = Math.min(1.8, 1.3 + intervals * 0.10) * motionAmpMult;
                  const frequencyMultiplier = Math.min(1.5, 1.25 + intervals * 0.05) * motionSpeedMult;

                  // Smooth up-down animation with progressive difficulty
                  verticalShift = Math.sin(this.waveTime * 2.2 * frequencyMultiplier + (obs.obstacleIdx || 0) * 0.5) * 50 * amplitudeMultiplier;
                }
              }
            }
          }
          }

          // Playability Safeguard: Clamp vertical shift to prevent physically impossible transitions
          let isTightHorizontalGap = false;
          for (let j = 0; j < this.list.length; j++) {
            const other = this.list[j];
            if (other !== obs && Math.abs(obs.x - other.x) < 320) {
              isTightHorizontalGap = true;
              break;
            }
          }
          if (isTightHorizontalGap) {
            const maxClamp = effectiveScore >= 500 ? 70 : 40; // Relax clamp at score >= 500 so the movement can be felt clearly!
            verticalShift = Math.max(-maxClamp, Math.min(maxClamp, verticalShift));
          }

          centerY += verticalShift;

          // Intersection Safeguard (Score >= 200, specially 400+): Enforce minimum 30% gap overlap or highly parallel alignment for adjacent pipes
          if (effectiveScore >= 200) {
            let nearestOther: Obstacle | null = null;
            let minDistance = Infinity;
            for (let j = 0; j < this.list.length; j++) {
              const other = this.list[j];
              if (other !== obs) {
                const distX = Math.abs(obs.x - other.x);
                if (distX < minDistance) {
                  minDistance = distX;
                  nearestOther = other;
                }
              }
            }

            // Only apply safeguard correction to trailing pipes (obs.x > nearestOther.x) to completely eliminate mutual feedback loops and stutters!
            if (nearestOther && minDistance < 450 && obs.x > nearestOther.x) {
              const otherGap = height - nearestOther.bottomHeight - nearestOther.topHeight;
              const otherCenterY = nearestOther.topHeight + otherGap / 2;

              // Ensure at least 30% overlap (intersection) of the gap height
              const overlapPercentage = 0.30;
              const maxCenterDiff = currentGap * (1.0 - overlapPercentage);

              const diffY = centerY - otherCenterY;
              if (Math.abs(diffY) > maxCenterDiff) {
                const targetCenterY = otherCenterY + (diffY > 0 ? maxCenterDiff : -maxCenterDiff);
                // Smoothly interpolate (lerp) toward target position to prevent sudden visual snapping/stuttering
                centerY = centerY + (targetCenterY - centerY) * 0.15;
              }
            }
          }

          // Keep centerY within screen bounds so that both top and bottom pipes are at least 45px high
          const minCenterY = 45 + currentGap / 2;
          const maxCenterY = height - 45 - currentGap / 2;
          centerY = Math.max(minCenterY, Math.min(maxCenterY, centerY));

          // Apply coordinates
          obs.topHeight = centerY - currentGap / 2 - breathingOffset;
          obs.bottomHeight = height - centerY - currentGap / 2 - breathingOffset;
        }

        // 4. Visual effects - spawn dynamic movement particles
        if (_particleEngine) {
          if (obs.isOrbitalSway || obs.isGoldSplitGate) {
            // High-density particle effects for Special range (spawning from both lips)
            if (Math.random() < 0.16) {
              const pxTop = obs.x + Math.random() * obs.width;
              const pyTop = obs.topHeight;
              const pxBot = obs.x + Math.random() * obs.width;
              const pyBot = height - obs.bottomHeight;
              
              let pColor = '#39ff14'; // Default green
              let pShape: 'circle' | 'square' | 'snowflake' | 'star' | 'bubble' | 'spark' | 'leaf' | 'flower' = 'spark';
              let pGlow = true;
              let pGlowColor = 'rgba(57, 255, 20, 0.4)';

              if (obs.isGoldSplitGate) {
                // Group 3 (Electric Gold Stars & Sparks)
                pColor = Math.random() > 0.5 ? '#ffd700' : '#ffff00';
                pShape = Math.random() > 0.5 ? 'star' : 'spark';
                pGlowColor = 'rgba(255, 215, 0, 0.4)';
              } else if (obs.isOrbitalSway) {
                // Group 1 (Cosmic Vortex - violet/purple sparks & bubbles)
                pColor = Math.random() > 0.5 ? '#d946ef' : '#8b5cf6';
                pShape = Math.random() > 0.5 ? 'bubble' : 'spark';
                pGlowColor = 'rgba(217, 70, 239, 0.4)';
              }

              // Spawn top lip
              _particleEngine.spawn(
                pxTop, pyTop,
                -scrollSpeed * 0.4 + (Math.random() - 0.5) * 1.0,
                (Math.random() - 0.5) * 1.5,
                pColor,
                2.0 + Math.random() * 2.0,
                0.85,
                0.02,
                pShape,
                pGlow,
                pGlowColor
              );

              // Spawn bottom lip
              _particleEngine.spawn(
                pxBot, pyBot,
                -scrollSpeed * 0.4 + (Math.random() - 0.5) * 1.0,
                (Math.random() - 0.5) * 1.5,
                pColor,
                2.0 + Math.random() * 2.0,
                0.85,
                0.02,
                pShape,
                pGlow,
                pGlowColor
              );
            }
          } else {
            // Standard endless particles
            if (Math.random() < 0.08) {
              const pxTop = obs.x + Math.random() * obs.width;
              const pyTop = obs.topHeight;
              let pColor = '#39ff14';
              _particleEngine.spawn(
                pxTop, pyTop,
                -scrollSpeed * 0.4 + (Math.random() - 0.5) * 1.0,
                (Math.random() - 0.5) * 1.5,
                pColor,
                2.0 + Math.random() * 2.0,
                0.8,
                0.03,
                'spark'
              );
            }
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
      const gameEngine = (window as any).gameEngine;
      const isHummingbirdUltimate = gameEngine && gameEngine.ultimateActive && gameEngine.bird && gameEngine.bird.getSkin().id === 'jade_lotus';
      const offscreenLeftLimit = isHummingbirdUltimate ? -200 : -50;
      if (obs.x + obs.width < offscreenLeftLimit) {
        this.freePool.push(obs);
        this.list.splice(i, 1);
      }
    }

    // Procedural Spawning using distance-based logic (extremely robust)
    const maxPillars = this.activeLevelConfig ? this.activeLevelConfig.targetScore : 150;
    // For Levels 1–5: remove the last 2 standalone obstacles that appear at the end
    const levelNumForCap = this.activeLevelConfig ? this.activeLevelConfig.levelNum : undefined;
    const effectiveMaxPillars = (levelNumForCap !== undefined && levelNumForCap >= 1 && levelNumForCap <= 5)
      ? maxPillars - 2 : maxPillars;
    if (this.activeLevelConfig && this.currentPatternIdx >= effectiveMaxPillars) {
      return;
    }

    const isFirstSpawn = (this.activeLevelConfig ? this.currentPatternIdx === 0 : this.endlessObstacleCount === 0) && this.list.length === 0;
    if (isFirstSpawn) {
      let initialX = width > 0 ? width * 0.92 : 360;
      if (this.activeLevelConfig) {
        let zoom = 1.0;
        const gameEngine = (window as any).gameEngine;
        if (gameEngine && gameEngine.renderer) {
          zoom = gameEngine.renderer.zoomFactor || 1.0;
        }
        const visibleRightEdge = (width / 2) + (width / 2) / zoom;
        initialX = visibleRightEdge + 120;
      }
      const dynamicGap = zone === 'classic' ? startGap : (startGap - (startGap - minGap) * progressRatio);
      let gapWithDifficulty = this.activeLevelConfig ? this.activeLevelConfig.gapHeight : dynamicGap;
      if (zone === 'chaos') {
        gapWithDifficulty *= 1.10; // 10% vertical path gap increase
      }
      if (gameMode === 'endless') {
        if (score >= 300 && score < 500) {
          gapWithDifficulty *= 0.88;
        } else if (score >= 500) {
          gapWithDifficulty *= 0.85;
        }
      }
      this.spawnObstacle(worldId, width, height, gapWithDifficulty, zone, difficulty, progressRatio, score, gameMode, initialX);

      if (this.activeLevelConfig) {
        this.nextSpawnDistance = this.obstacleWidth;
      } else {
        let dist = 280 * 1.45;
        if (gameMode === 'flock') {
          dist = Math.max(490, Math.min(770, dist));
        } else if (gameMode === 'endless') {
          const isChaos = zone === 'chaos';
          const minClamp = isChaos ? 420 : 215;
          const maxClamp = isChaos ? 500 : 340;
          dist = Math.max(minClamp, Math.min(maxClamp, dist));
        }
        this.nextSpawnDistance = dist;
      }
      this.spawnTimer = 0;
    }

    this.spawnTimer += actualScrollSpeed;
    if (this.spawnTimer >= this.nextSpawnDistance) {
      this.spawnTimer = 0;

      // Smooth step-by-step gap height scaling (Classic Mode has a completely constant, generous gap)
      const dynamicGap = zone === 'classic'
        ? startGap
        : (startGap - (startGap - minGap) * progressRatio);

      // Apply endless progressive difficulty gap scaling (kept completely constant as requested)
      let gapWithDifficulty = this.activeLevelConfig ? this.activeLevelConfig.gapHeight : dynamicGap;

      if (zone === 'chaos') {
        gapWithDifficulty *= 1.10; // 10% vertical path gap increase
      }

      // Classic Mode (Endless) vertical path gap reduction:
      // Score 300 to 500: reduce by 12%
      // Score 500 to endless: reduce by 15%
      if (gameMode === 'endless') {
        if (score >= 300 && score < 500) {
          gapWithDifficulty *= 0.88;
        } else if (score >= 500) {
          gapWithDifficulty *= 0.85;
        }
      }

      this.spawnObstacle(worldId, width, height, gapWithDifficulty, zone, difficulty, progressRatio, score, gameMode);

      // Determine next spawn distance: Connected cavern spacing segments (0 distance horizontally) for all Levels in Level Mode
      if (this.activeLevelConfig) {
        const groupSize = Math.floor(this.activeLevelConfig.targetScore / 3);
        const idx = this.currentPatternIdx - 1;
        const isLevel6 = activeEffectiveLevelNum === 6;
        if (idx === groupSize - 1 || idx === (groupSize * 2) - 1) {
          this.nextSpawnDistance = this.obstacleWidth * 5.5; // Safe transition gap between obstacle groups (increased from 3.5)
        } else {
          // Level 6: horizontal path gap increased by 25% for more breathing room between pillars
          this.nextSpawnDistance = isLevel6 ? this.obstacleWidth * 1.25 : this.obstacleWidth; // Connected side-by-side inside group
        }
      } else {
        const baseDistanceClassic = (width / 1.35) * 0.80;
        const defaultDistance = baseDistanceClassic * 1.15;
        const baseDist = difficulty === 'easy' ? defaultDistance * 1.20 : defaultDistance;
        // Dynamically scale horizontal obstacle spacing with bird horizontal velocity to preserve constant reaction time
        const speedFactor = scrollSpeed / 4.2;
        // Scale by endless difficulty scaling factor & speed factor!
        let dist = baseDist * this.currentEndlessDistScale * (1.0 - pct) * speedFactor;
        if (gameMode === 'flock') {
          dist *= 1.134; // 10% reduction from 1.26 (1.26 * 0.90 = 1.134)
        }
        // Increase horizontal spacing by 45% to make pipes spawn much fewer/less frequently
        dist *= 1.45;

        // Dynamic Spacing Balance: Increase horizontal distance by 50% if the next pipe has a maximum vertical alignment difference
        if (this.list.length > 0) {
          const justSpawned = this.list[this.list.length - 1];
          if (this.endlessPatternQueue.length > 0) {
            const nextPat = this.endlessPatternQueue[0];
            let endlessShiftScale = 1.0;
            if (score >= 100 && score < 200) {
              endlessShiftScale = 1.15;
            } else if (score >= 200 && score < 300) {
              endlessShiftScale = 1.25;
            } else if (score >= 300) {
              endlessShiftScale = 1.30;
            }
            if (gameMode === 'flock') {
              endlessShiftScale *= 1.60; // 60% increase in vertical path gap shifting
            }
            const nextCenterY = height / 2 + nextPat.centerYOffset * endlessShiftScale;
            const diffY = Math.abs((justSpawned.spawnCenterY ?? (height / 2)) - nextCenterY);
            if (diffY >= 100) {
              dist *= 1.5; // 50% increase
            }
          }
        }
        // Dynamic Spacing Safeguard: Increase the horizontally minimum gap/distance dynamically by score
        if (this.currentEndlessDistScale <= 0.65) {
          let minimumGapScale = 1.10; // Default 10% increase (score < 300)
          if (score >= 300 && score <= 500) {
            minimumGapScale = 1.10; // 10% increase
          } else if (score > 500) {
            minimumGapScale = 1.18; // 18% increase
          }
          dist *= minimumGapScale;
        }

        // 15% increase for all minimum horizontal gaps starting from score 100
        if (score >= 100) {
          const isMinimumHorizontalGap = this.currentEndlessDistScale <= 0.65 || (1.0 - pct) <= 0.85;
          if (isMinimumHorizontalGap) {
            dist *= 1.15; // 15% increase
          }
        }

        if (gameMode === 'flock') {
          dist = Math.max(490, Math.min(770, dist)); // Clamp horizontal gap between 490px and 770px
        } else if (gameMode === 'endless') {
          const isChaos = zone === 'chaos';
          const minClamp = isChaos ? 420 : 215;
          const maxClamp = isChaos ? 500 : 340;
          dist = Math.max(minClamp, Math.min(maxClamp, dist));
        }

        this.nextSpawnDistance = dist;
      }
    }
  }

  private spawnObstacle(
    worldId: string,
    width: number,
    height: number,
    gapHeight: number,
    _zone: 'classic' | 'vertical' | 'wave' | 'chaos' = 'classic',
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
    _progressRatio = 0,
    score = 0,
    gameMode: 'endless' | 'level' | 'flock' | 'rescue' | 'formation' | 'chaos' = 'endless',
    customX?: number
  ) {
    let zoom = 1.0;
    const gameEngine = (window as any).gameEngine;
    if (gameEngine && gameEngine.renderer) {
      zoom = gameEngine.renderer.zoomFactor || 1.0;
    }
    const visibleRightEdge = (width / 2) + (width / 2) / zoom;
    const offscreenSpawnX = visibleRightEdge + 120;

    if (this.activeLevelConfig) {
      const levelNumPlayable = this.activeLevelConfig.levelNum;
      const patternsList = this.activeLevelConfig.patterns;
      const patternType = patternsList[this.currentPatternIdx % patternsList.length];
      let levelNum = levelNumPlayable;
      if (patternType) {
        const match = patternType.match(/^level(\d+)/);
        if (match) {
          levelNum = parseInt(match[1], 10);
        }
      }
      const actualPatternIdx = this.currentPatternIdx;
      const groupSize = Math.floor(this.activeLevelConfig.targetScore / 3);
      const groupIdx = Math.min(2, Math.floor(actualPatternIdx / groupSize));
      const idxInGroup = actualPatternIdx % groupSize;
      const scaleFactor = 6 / groupSize;
      const obstacleIdx = Math.min(17, Math.floor(groupIdx * 6 + idxInGroup * scaleFactor));
      this.currentPatternIdx++;

      let spawnX = offscreenSpawnX;
      if (this.activeLevelConfig) {
        if (idxInGroup === 0) {
          // Shift the start of each obstacle group to the right by 280px in Level Mode
          spawnX = offscreenSpawnX + 280;
        } else if (this.list.length > 0) {
          const prevObs = this.list[this.list.length - 1];
          spawnX = prevObs.x + this.obstacleWidth;
        }
      } else {
        if (customX !== undefined) {
          spawnX = customX;
        } else if (this.list.length > 0) {
          const prevObs = this.list[this.list.length - 1];
          if (idxInGroup !== 0) {
            spawnX = prevObs.x + this.obstacleWidth;
          }
        }
      }

      let triggerDistance = 220;
      let animDuration = 0.45;
      let targetCenterY = height / 2;
      let localGapHeight = gapHeight;
      let subPattern = '';
      let hasAsymmetricHeights = false;
      let targetTopHeight = 0;
      let targetBottomHeight = 0;

      if (patternType === 'level1_funnel') {
        // LEVEL 1: "The Winding Cavern" - Made very gentle and beginner friendly
        hasAsymmetricHeights = false;
        if (groupIdx === 1) {
          // Group 2: "Stepped Zig-Zag Cavern" - climbs up then descends gently
          const halfGroup = groupSize / 2;
          const step = (idxInGroup < halfGroup ? idxInGroup : groupSize - idxInGroup) - halfGroup / 2;
          targetCenterY = height / 2 + step * 3.5;
        } else {
          // Group 1 & 3: Gentle smooth sine wave path
          targetCenterY = height / 2 + Math.sin(idxInGroup * 0.35) * 32;
        }
        // Dynamically scale trigger distance to ensure the splitting animation starts on-screen on both mobile and desktop viewports (shifted 20% left)
        triggerDistance = Math.min(500, width * 0.65) * 0.80;
        animDuration = 0.675; // 35% slower and smooth animation (0.50 * 1.35 = 0.675)
      } else if (patternType === 'level2_diamond') {
        // LEVEL 2: "The Wave Gauntlet" - Widened gaps and reduced wave shifts
        if (groupIdx === 1) {
          // Group 2: "Steep Peak-Valley Maze" - very gentle peak/valley layout with wide gaps
          localGapHeight = gapHeight + 15;
          const peakValley = (Math.floor(idxInGroup / 3) % 2 === 0) ? -35 : 35;
          targetCenterY = height / 2 + peakValley;
        } else if (groupIdx === 2) {
          // Group 3: "Funneling Spiral Tunnel" - gradual and wide tunnel
          const narrowFactor = (idxInGroup / groupSize) * 15;
          localGapHeight = Math.max(160, gapHeight + 10 - narrowFactor);
          targetCenterY = height / 2 + Math.cos(idxInGroup * 0.4) * 35;
        } else {
          // Group 1: Gentle wave pattern with wide gaps
          localGapHeight = gapHeight + 10;
          const baseCenterY = height / 2 + Math.sin(idxInGroup * 0.28) * 45;

          // Alternating gap shift every 10 obstacles with a smooth transition over 3 obstacles
          const period = 20;
          const rampWidth = 3;
          const amplitude = localGapHeight * 0.15; // halved shift amplitude
          const t = actualPatternIdx % period;

          let verticalShift = 0;
          if (t < rampWidth) {
            // Smooth ramp from -amplitude to +amplitude
            const ratio = t / rampWidth;
            verticalShift = -amplitude + ratio * (2 * amplitude);
          } else if (t < period / 2) {
            verticalShift = amplitude;
          } else if (t < period / 2 + rampWidth) {
            // Smooth ramp from +amplitude to -amplitude
            const ratio = (t - period / 2) / rampWidth;
            verticalShift = amplitude - ratio * (2 * amplitude);
          } else {
            verticalShift = -amplitude;
          }
          targetCenterY = baseCenterY + verticalShift;
        }
        triggerDistance = 220;
        animDuration = 0.45;
      } else if (patternType === 'level3_arc') {
        // Playable Level 46: Dimensional Distortion Warp Grid - smoothed out
        if (groupIdx === 1) {
          // Group 2: "Double-Step See-saw" - pairs of two stepping gently (different layout)
          const stepIdx = Math.floor(idxInGroup / 2) % 3;
          const stepOffset = (stepIdx === 0) ? -35 : (stepIdx === 1) ? 0 : 35;
          targetCenterY = height / 2 + stepOffset;
          localGapHeight = gapHeight + 20;
          hasAsymmetricHeights = false;
        } else if (groupIdx === 2) {
          // Group 3: "Void Singularity / Central Gate" - straight wide central tunnel (very easy)
          targetCenterY = height / 2;
          localGapHeight = gapHeight + 25;
          hasAsymmetricHeights = false;
        } else {
          // Group 1: original warp grid flattened
          if (obstacleIdx <= 5) {
            targetCenterY = height / 2 + Math.sin(obstacleIdx * 1.1) * 25;
          } else if (obstacleIdx <= 11) {
            targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -25 : 25) + Math.cos(obstacleIdx * 0.8) * 10;
          } else {
            targetCenterY = height / 2 + Math.sin(obstacleIdx * 1.6) * 20;
          }
          localGapHeight = gapHeight + 10;
          hasAsymmetricHeights = false;
        }
        triggerDistance = 180;
        animDuration = 0.32;
      } else if (patternType === 'level4_snake') {
        // LEVEL 4: "The Laser Grid Gauntlet" - beginner friendly lasers
        if (groupIdx === 1) {
          // Group 2: "Binary Switch Gates" - alternate gently with wide gaps
          localGapHeight = gapHeight + 15;
          targetCenterY = height / 2 + (Math.floor(idxInGroup / 3) % 2 === 0 ? -35 : 35);
        } else if (groupIdx === 2) {
          // Group 3: "Slanted Ramp Corridor" - straight ramp slanting gently (different from sine wave, very easy)
          const ramp = Math.min(45, idxInGroup * 2.5);
          targetCenterY = height / 2 + ramp - 22;
          localGapHeight = gapHeight + 20;
        } else {
          // Group 1: Gentle sine wave
          localGapHeight = gapHeight + 10;
          targetCenterY = height / 2 + Math.sin(idxInGroup) * 25;
        }
        triggerDistance = 320;
        animDuration = 0.42;
      } else if (patternType === 'level5_hourglass') {
        // LEVEL 5: Stair-step arrangement
        if (groupIdx === 1) {
          // Group 2: "Hourglass Squeeze Corridor" - straight corridor with wider gaps, never narrows below base
          localGapHeight = gapHeight + (idxInGroup % 2 === 0 ? 30 : 10);
          targetCenterY = height / 2;
        } else if (groupIdx === 2) {
          // Group 3: "Blocky Checkerboard Step" - alternates height in blocky step pattern (different, very easy)
          const step = (Math.floor(idxInGroup / 4) % 2 === 0) ? -25 : 25;
          targetCenterY = height / 2 + step;
          localGapHeight = gapHeight + 20;
        } else {
          // Group 1: Gentle stair-step arrangement
          localGapHeight = gapHeight + 10;
          const cycleIdx = actualPatternIdx % 10;
          let stepOffset = 0;
          if (cycleIdx < 5) {
            stepOffset = 40 - cycleIdx * 20; // gentle steps
          } else {
            stepOffset = -40 + (cycleIdx - 5) * 20;
          }
          targetCenterY = height / 2 + stepOffset;
        }
        triggerDistance = 300;
        animDuration = 0.45;
      } else if (patternType === 'level6_infinity') {
        // LEVEL 6: "The Folding Accordion Gates" (Clean triangle-wave folding layout)
        const baseGap = Math.round((gapHeight - 5) * 0.7 * 1.5); // Base gap increased 25% vertically (approx 163px)
        const blockIdx = Math.floor(actualPatternIdx / 20); // Block of 20 pillars
        const isShiftedBlock = (blockIdx % 2 === 1); // After 20 obstacles (obstacles 20-39, 60-79, etc.)

        // Gap is 25% less only for the shifted-down block after 20 obstacles, otherwise 163px
        localGapHeight = isShiftedBlock ? Math.round(baseGap * 0.75) : baseGap;

        const modIdx = obstacleIdx % 20;
        // Triangle wave across 20 pillars: rises from -37 to +37 over first 10, falls back to -37 over next 10 (reduced 80%)
        const halfCycle = 10;
        const normT = modIdx < halfCycle ? modIdx / (halfCycle - 1) : (19 - modIdx) / (halfCycle - 1);
        const triangleOffset = Math.round((normT * 75 - 37) * 0.20); // 80% flatter (plane)

        // Alternates path offset UP and DOWN by 24% of the gap height every 20 obstacles (reduced 80%)
        const shiftSign = isShiftedBlock ? 1 : -1; // Alternating UP (-1) and DOWN (+1)
        const pathShift = shiftSign * (baseGap * 0.24) * 0.20; // 80% flatter (plane)

        targetCenterY = height / 2 + triangleOffset + pathShift;
        triggerDistance = 280;
        animDuration = 0.38;
      } else if (patternType === 'level7_dna') {
        // LEVEL 7: "The Magnetic Pull Chambers" (Alternating tiny narrow squeeze gates and massive open chambers)
        if (obstacleIdx % 2 === 0) {
          localGapHeight = gapHeight - 35;
          targetCenterY = height / 2 - 40;
        } else {
          localGapHeight = gapHeight + 40;
          targetCenterY = height / 2 + 40;
        }
        triggerDistance = 260;
        animDuration = 0.35;
      } else if (patternType === 'level8_lightning') {
        // LEVEL 8: "The Tremor Cascades" (Slanted ridges and misaligned asymmetrical top/bottom blocks)
        hasAsymmetricHeights = true;
        targetTopHeight = 60 + Math.sin(obstacleIdx * 1.5) * 75;
        targetBottomHeight = 60 + Math.cos(obstacleIdx * 1.5) * 75;
        triggerDistance = 250;
        animDuration = 0.36;
      } else if (patternType === 'level9_magnetic') {
        // LEVEL 9: "The Quantum Entangled Gates" (Interlaced high-low paired gates)
        // Path shift amplitudes reduced 65%: base 75→26px, sine wobble 37→13px
        localGapHeight = gapHeight - 10;
        const isEven = (obstacleIdx % 2 === 0);
        if (isEven) {
          targetCenterY = height / 2 - Math.round(75 * 0.35) + Math.sin(obstacleIdx * 0.4) * Math.round(37 * 0.35);
        } else {
          targetCenterY = height / 2 + Math.round(75 * 0.35) - Math.sin((obstacleIdx - 1) * 0.4) * Math.round(37 * 0.35);
        }
        triggerDistance = 240;
        animDuration = 0.34;
      } else if (patternType === 'level10_miniboss') {
        // LEVEL 10: "The Chrono Warp Horizon" (Sci-fi roller-coaster plunging and rising warp tunnel)
        localGapHeight = gapHeight - 12;
        const normIdx = (obstacleIdx % 6) / 5.0;
        const warpOffset = Math.sin(normIdx * Math.PI * 2) * 95;
        targetCenterY = height / 2 + warpOffset;
        triggerDistance = 200;
        animDuration = 0.32;
      } else if (patternType === 'level11_diamond') {
        // LEVEL 11: Deep V-Shape & Symmetrical/Asymmetrical Variations (repeating every 12 columns side-by-side)
        hasAsymmetricHeights = true;
        const idx = idxInGroup % 12;
        if (obstacleIdx <= 5) {
          // Group 1: Symmetrical Deep V-shape profile (Exact match to the user's image)
          localGapHeight = gapHeight - 20;
          const centerDist = Math.abs(idx - 5.5);
          targetTopHeight = (height / 2 - localGapHeight / 2) + 90 - centerDist * 28;
        } else if (obstacleIdx <= 11) {
          // Group 2: Asymmetric Sloped Ridge Peak (Up steeply on left, down gently on right)
          localGapHeight = gapHeight - 20;
          if (idx <= 4) {
            targetTopHeight = (height / 2 - localGapHeight / 2) - 80 + (4 - idx) * 35;
          } else {
            targetTopHeight = (height / 2 - localGapHeight / 2) - 80 + (idx - 4) * 22;
          }
        } else {
          // Group 3: Asymmetric Sloped Ridge Peak (same as Group 2)
          localGapHeight = gapHeight - 20;
          if (idx <= 4) {
            targetTopHeight = (height / 2 - localGapHeight / 2) - 80 + (4 - idx) * 35;
          } else {
            targetTopHeight = (height / 2 - localGapHeight / 2) - 80 + (idx - 4) * 22;
          }
        }
        triggerDistance = 240;
        animDuration = 0.72;
      } else if (patternType === 'level12_doublewave') {
        // LEVEL 12: Cross-diagonal sweep (Group 3 expanded to ALL obstacles)
        hasAsymmetricHeights = true;
        const dStep = obstacleIdx % 6;
        localGapHeight = Math.max(168, gapHeight - 5);
        const sweepArc = Math.sin((dStep / 5) * Math.PI * 2) * 52;
        targetTopHeight = height / 2 - localGapHeight / 2 + sweepArc;
        triggerDistance = 230;
        animDuration = 0.55;
      } else if (patternType === 'level13_scurve') {
        // LEVEL 13: Symmetrical W-shape (Level 11 Group 3 — all obstacles)
        hasAsymmetricHeights = true;
        const idx = obstacleIdx % 12;
        localGapHeight = gapHeight - 15;
        const angle = (idx / 11) * Math.PI * 2;
        targetTopHeight = (height / 2 - localGapHeight / 2) + Math.cos(angle * 2) * 70;
        triggerDistance = 240;
        animDuration = 0.72;
      } else if (patternType === 'level14_zigzag') {
        // Replaced with Level 22 first group behavior (rotating_17 with animScale = 1.30)
        hasAsymmetricHeights = false;
        targetCenterY = height / 2 + Math.sin(obstacleIdx * (Math.PI / 4)) * (40 * 1.30);
        localGapHeight = gapHeight;
        triggerDistance = 210;
        animDuration = 0.45;
      } else if (patternType === 'level14_crossflow') {
        // LEVEL 18 (swapped): "The Wormhole Vortex" — vertical shifts from midline reduced 40% (×0.60), triggerDistance increased for surface alignment
        // Group 1: Spiral Funnel — gap center orbits asymmetrically (cos top, -sin bottom)
        // Group 2: Shockwave Ring — center cols narrow, edge cols wide (radial dome cross-section)
        // Group 3: Gravity Flip — gap alternates ceiling-hug ↔ floor-hug every 3 cols (blended 40% toward center)
        hasAsymmetricHeights = true;
        const p14idx = obstacleIdx % 18;
        if (p14idx <= 5) {
          // Group 1: Spiral funnel — orbitRadius ×0.60: 55→33
          const angle = (p14idx / 5) * Math.PI * 2; // full 360° spread
          localGapHeight = Math.max(168, gapHeight - 8);
          const orbitRadius = 33; // was 55, reduced 40% toward midline
          const topOrbit = Math.cos(angle) * orbitRadius;
          const botOrbit = -Math.sin(angle) * orbitRadius;
          targetTopHeight = height / 2 - localGapHeight / 2 + topOrbit;
          targetBottomHeight = height / 2 - localGapHeight / 2 - botOrbit;
        } else if (p14idx <= 11) {
          // Group 2: Shockwave ring — centerBias factor ×0.60: 40→24
          const rStep = p14idx - 6; // 0..5
          const distFromCenter = Math.abs(rStep - 2.5) / 2.5; // 0 at center, 1 at edge
          const shockGapAdd = distFromCenter * 45; // edges get wider gap
          localGapHeight = Math.max(165, gapHeight - 30 + shockGapAdd);
          // Center bias reduced 40% toward midline
          const centerBias = (1 - distFromCenter) * 24; // was 40
          targetTopHeight = height / 2 - localGapHeight / 2 - centerBias;
        } else {
          // Group 3: Gravity flip — ceiling/floor positions blended 40% toward screen center
          const gStep = p14idx - 12; // 0..5
          localGapHeight = Math.max(168, gapHeight - 5);
          const flipGroup = Math.floor(gStep / 3); // 0 or 1
          const posWithinFlip = (gStep % 3) / 2; // 0..1
          const t = posWithinFlip * posWithinFlip * (3 - 2 * posWithinFlip); // smoothstep
          // Blend original positions 40% toward center (center = height/2 - localGapHeight/2)
          const midPos = height / 2 - localGapHeight / 2;
          const topPos = height * 0.08 + (midPos - height * 0.08) * 0.40; // ceiling pos → 40% toward mid
          const botPos = (height - localGapHeight - height * 0.08) - ((height - localGapHeight - height * 0.08) - midPos) * 0.40; // floor pos → 40% toward mid
          const fromPos = (flipGroup === 0) ? topPos : botPos;
          const toPos = (flipGroup === 0) ? botPos : topPos;
          targetTopHeight = fromPos + (toPos - fromPos) * t;
        }
        triggerDistance = 340; // increased from 240 for earlier pipe alignment with surface
        animDuration = 0.52;
      } else if (patternType === 'level15_elevatorstair') {
        // LEVEL 15: Diamond Chambers (Diamond-shaped corridors and pincer chambers)
        hasAsymmetricHeights = true;
        if (obstacleIdx <= 5) {
          // Group 1: Narrowing Diamond Chamber
          const di = obstacleIdx;
          localGapHeight = gapHeight - 35 + (2.5 - Math.abs(di - 2.5)) * 30;
          targetTopHeight = height / 2 - localGapHeight / 2 - (2.5 - Math.abs(di - 2.5)) * 25;
        } else if (obstacleIdx <= 11) {
          // Group 2: Widening Diamond Chamber
          const di = obstacleIdx - 6;
          localGapHeight = gapHeight + 25 - (2.5 - Math.abs(di - 2.5)) * 30;
          targetTopHeight = height / 2 - localGapHeight / 2 + (2.5 - Math.abs(di - 2.5)) * 25;
        } else {
          // Group 3: Hexagonal Gate
          const di = obstacleIdx - 12;
          localGapHeight = gapHeight + (di % 2 === 0 ? 25 : -25);
          targetTopHeight = height / 2 - localGapHeight / 2 + (di % 2 === 0 ? -30 : 30);
        }
        triggerDistance = 210;
        animDuration = 0.42;
      } else if (patternType === 'level16_rotatingarc') {
        // LEVEL 16: Infinity Loops (Lemniscate figure-eight loop patterns) (spawning layout shifts reduced by 25%)
        hasAsymmetricHeights = true;
        if (obstacleIdx <= 5) {
          // Group 1: Lemniscate X-Y mapping
          const t = (obstacleIdx / 5) * Math.PI * 2;
          localGapHeight = gapHeight + 10;
          targetTopHeight = height / 2 - localGapHeight / 2 + Math.sin(t) * Math.cos(t) * 56.25; // was 75
        } else if (obstacleIdx <= 11) {
          // Group 2: Inverted Lemniscate
          const t = ((obstacleIdx - 6) / 5) * Math.PI * 2;
          localGapHeight = gapHeight + 10;
          targetTopHeight = height / 2 - localGapHeight / 2 - Math.sin(t) * Math.cos(t) * 56.25; // was 75
        } else {
          // Group 3: Double infinity crossover
          const t = ((obstacleIdx - 12) / 5) * Math.PI * 4;
          localGapHeight = gapHeight - 15;
          targetTopHeight = height / 2 - localGapHeight / 2 + Math.sin(t) * 33.75; // was 45
        }
        triggerDistance = 200;
        animDuration = 0.45;
      } else if (patternType === 'level17_heartbeat') {
        // LEVEL 17: Volcanic Crags (Jagged crag profiles and tectonic tremors)
        hasAsymmetricHeights = true;
        if (obstacleIdx <= 5) {
          // Group 1: Jagged Crag peaks
          localGapHeight = gapHeight - 15;
          const step = (obstacleIdx % 2 === 0 ? 60 : -60) + (obstacleIdx * 5);
          targetTopHeight = height / 2 - localGapHeight / 2 + step;
        } else if (obstacleIdx <= 11) {
          // Group 2: Crater basin
          localGapHeight = gapHeight + 15;
          const idx = obstacleIdx - 6;
          const step = -50 + Math.pow(Math.abs(idx - 2.5), 2) * 14;
          targetTopHeight = height / 2 - localGapHeight / 2 + step;
        } else {
          // Group 3: Chaotic Magma Spikes
          localGapHeight = gapHeight - 20;
          const idx = obstacleIdx - 12;
          const spikes = [70, -65, 45, -55, 60, -40];
          targetTopHeight = height / 2 - localGapHeight / 2 + spikes[idx % spikes.length];
        }
        triggerDistance = 230;
        animDuration = 0.4;
      } else if (patternType === 'level18_serpent') {
        // LEVEL 18: Magnetic Slingshots (Proximity magnetic repulsion/attraction)
        hasAsymmetricHeights = true;
        if (obstacleIdx <= 5) {
          // Group 1: Symmetric Magnetic Horns — shift 60% reduced (40→16)
          localGapHeight = gapHeight - 20;
          targetTopHeight = height / 2 - localGapHeight / 2 - Math.sin((obstacleIdx / 5) * Math.PI) * 16;
        } else if (obstacleIdx <= 11) {
          // Group 2: Repelling Poles — gap neutral
          const idx = obstacleIdx - 6;
          localGapHeight = gapHeight;
          targetTopHeight = height / 2 - localGapHeight / 2 + Math.sin((idx / 5) * Math.PI) * 40;
        } else {
          // Group 3: Alternating Pole Pairs — gap neutral
          localGapHeight = gapHeight;
          targetTopHeight = height / 2 - localGapHeight / 2;
        }
        triggerDistance = 195;
        animDuration = 0.38;
      } else if (patternType === 'level19_magnetic') {
        // LEVEL 19: Crossflow Intercepting Gates — path straightened (all offsets zeroed)
        hasAsymmetricHeights = true;
        if (obstacleIdx <= 5) {
          // Group 1: straight center
          localGapHeight = gapHeight - 20;
          targetTopHeight = height / 2 - localGapHeight / 2;
        } else if (obstacleIdx <= 11) {
          // Group 2: straight center — gap 10% reduced
          localGapHeight = Math.round((gapHeight - 15) * 0.90);
          targetTopHeight = height / 2 - localGapHeight / 2;
        } else {
          // Group 3: straight center — gap 18% reduced
          localGapHeight = Math.round((gapHeight + 20) * 0.82);
          targetTopHeight = height / 2 - localGapHeight / 2;
        }
        triggerDistance = 220;
        animDuration = 0.45;
      } else if (patternType === 'level20_masterhybrid') {
        // LEVEL 20: Master Boss Hybrid (Synthesis of all unique mechanisms)
        hasAsymmetricHeights = true;
        if (obstacleIdx <= 5) {
          // Group 1: Escalator Stairs + Peak Wave Hybrid
          localGapHeight = gapHeight;
          targetTopHeight = 110 + obstacleIdx * 20 + Math.sin(obstacleIdx * 1.5) * 30;
        } else if (obstacleIdx <= 11) {
          // Group 2: Exponential Gap + Symmetrical W Peaks Hybrid
          const idx = obstacleIdx - 6;
          localGapHeight = Math.max(165, gapHeight + 40 - Math.pow(1.6, idx) * 8);
          targetTopHeight = height / 2 - localGapHeight / 2 + Math.abs(idx - 2.5) * 30 - 30;
        } else {
          // Group 3: Helix Spiral + Crossflow Intercepting Gates Hybrid
          const idx = obstacleIdx - 12;
          localGapHeight = gapHeight + (idx % 2 === 0 ? -20 : 20);
          targetTopHeight = height / 2 - localGapHeight / 2 + Math.sin(idx * (Math.PI / 2.5)) * 50 + (idx % 2 === 0 ? 30 : -30);
        }
        triggerDistance = 180;
        animDuration = 0.35;
      } else if (patternType === 'level30_hybridwave') {
        // Obstacle 1: Wave, Obstacle 2: Stair, Obstacle 3: Pulse
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 + Math.sin(obstacleIdx * (Math.PI / 3)) * 45;
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 + 56.25 - (obstacleIdx - 6) * 22.5;
        } else {
          targetCenterY = height / 2 - 56.25;
        }
        triggerDistance = 210;
        animDuration = 0.45;
      } else if (patternType === 'level31_snakemotion') {
        // LEVEL 31: Cyber Glitch
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2;
          localGapHeight = Math.round(gapHeight * 0.75); // 25% reduce
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -30 : 30);
          localGapHeight = Math.round(gapHeight * 0.85); // 15% reduce
        } else {
          targetCenterY = height / 2 - 30 + (obstacleIdx - 12) * 15;
          localGapHeight = Math.round(gapHeight * 0.92); // 15% increase from 0.80 (0.80 * 1.15 = 0.92)
        }
        triggerDistance = 200;
        animDuration = 0.44;
      } else if (patternType === 'level32_waterfall') {
        // LEVEL 32: Geyser Cascades
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 - 50 + obstacleIdx * 15;
          localGapHeight = Math.round(gapHeight * 0.75); // 25% reduce
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 + 44 - (obstacleIdx - 6) * 16; // 20% reduction in Y displacement amplitude (55 -> 44, 20 -> 16)
          localGapHeight = Math.round(gapHeight * 0.85 * 1.20); // 15% reduce, increased by 20% (net 1.02)
        } else {
          targetCenterY = height / 2 - 45 + Math.sin((obstacleIdx - 12) * (Math.PI / 3)) * 30;
          localGapHeight = Math.round(gapHeight * 0.78 * 1.20); // 22% reduce, increased by 20% (net 0.936)
        }
        triggerDistance = 215;
        animDuration = 0.43;
      } else if (patternType === 'level33_magneticpush') {
        // LEVEL 33: Quantum Entanglement
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2;
          localGapHeight = Math.round(gapHeight * 0.70); // 30% reduce
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 + (obstacleIdx <= 8 ? -30 : 30);
          localGapHeight = Math.round(gapHeight * 0.80); // 20% reduce
        } else {
          // New Group 3: "Quantum Wave Vortex" layout - center Y follows a smooth wave and odd/even columns are offset vertically
          const idx = obstacleIdx - 12;
          targetCenterY = height / 2 + Math.sin(idx * 0.7) * 45 + (obstacleIdx % 2 === 0 ? -20 : 20);
          localGapHeight = Math.round(gapHeight * 0.80); // 20% reduce
        }
        triggerDistance = 220;
        animDuration = 0.45;
      } else if (patternType === 'level34_pendulum') {
        // LEVEL 34: Quantum Gravity Slipstreams (New Unique Redesign)
        if (actualPatternIdx < groupSize) {
          // Group 1: Gravitational Wave Chamber (Parabolic Valley)
          const normIdx = (obstacleIdx % 6) / 5.0;
          targetCenterY = height / 2 + 55 - Math.sin(normIdx * Math.PI) * 85;
          localGapHeight = Math.round(gapHeight * 0.85); // 15% reduce
        } else if (actualPatternIdx < groupSize * 2) {
          // Group 2: Sliding Interlocking Keys (Alternating high/low blocks)
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -20 : 20);
          localGapHeight = Math.round(gapHeight * 0.76); // 24% reduce
        } else {
          // Group 3: Magnetic Helix Vortex (Circular helix path)
          targetCenterY = height / 2 + Math.sin((obstacleIdx - 12) * 0.9) * 45;
          localGapHeight = Math.round(gapHeight * 0.66); // 34% reduce
        }
        triggerDistance = 220;
        animDuration = 0.40;
      } else if (patternType === 'level35_triplestair') {
        // LEVEL 35: Magma Elevator (Plays on Level 40 due to level swaps)
        // Level 40 gap adjustment: increase path gap of all three groups by 15%
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 - 45 + (obstacleIdx % 3) * 30;
          localGapHeight = Math.round(gapHeight * 0.80 * 1.15); // 20% reduce, increased by 15% (net 0.92)
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -35 : 35);
          localGapHeight = Math.round(gapHeight * 0.85 * 1.15); // 15% reduce, increased by 15% (net 0.9775)
        } else {
          targetCenterY = height / 2 + Math.sin((obstacleIdx - 12) * (Math.PI / 3)) * 40;
          localGapHeight = Math.round(gapHeight * 0.75 * 0.85 * 1.08); // 25% reduce, decreased by 15%, then increased by 8% (net ~0.6885)
        }
        triggerDistance = 205;
        animDuration = 0.42;
      } else if (patternType === 'level36_spiralflow') {
        // LEVEL 36: Wormhole Vortex
        targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -7 : 7); // High-amplitude up-down spawn for all groups
        if (actualPatternIdx < groupSize) {
          localGapHeight = Math.round(gapHeight * 0.775 * 0.93); // reduced by 7%
        } else if (actualPatternIdx < groupSize * 2) {
          localGapHeight = Math.round(gapHeight * 0.725); // 17% increase (0.62 * 1.17 = 0.7254)
        } else {
          localGapHeight = Math.round(gapHeight * 0.65 * 1.12); // increased by 12%
        }
        triggerDistance = 210;
        animDuration = 0.44;
      } else if (patternType === 'level37_elevator') {
        // LEVEL 37: Tectonic Cracks
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -35 : 35);
          localGapHeight = Math.round(gapHeight * 0.8625); // increased 15% (from 0.75 to 0.8625)
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 + Math.sin((obstacleIdx - 6) * 0.9) * 45;
          localGapHeight = Math.round(gapHeight * 0.7225); // reduced 15% (from 0.85 to 0.7225)
        } else {
          targetCenterY = height / 2;
          localGapHeight = Math.round(gapHeight * 0.7225); // reduced 15% (from 0.85 to 0.7225)
        }
        triggerDistance = 190;
        animDuration = 0.4;
      } else if (patternType === 'level38_scurve') {
        // LEVEL 38: Magnetic Tempest (Redesigned Storm Layout)
        if (actualPatternIdx < groupSize) {
          // Group 1: Electromagnetic Compression (Jagged Alternating Layout) (offset reduced 60% from 50 to 20)
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -20 : 20);
          localGapHeight = Math.round(gapHeight * 0.82); // 18% reduce
        } else if (actualPatternIdx < groupSize * 2) {
          // Group 2: Polar Vortex (Steep Cosine Wave Layout)
          targetCenterY = height / 2 + Math.cos(obstacleIdx * 1.1) * 60;
          localGapHeight = Math.round(gapHeight * 0.78); // 22% reduce
        } else {
          // Group 3: Quantum Flux Storm (Challenging Step/Staircase Layout)
          targetCenterY = height / 2 - 60 + (obstacleIdx % 6) * 24;
          localGapHeight = Math.round(gapHeight * 0.87); // 13% reduce
        }
        triggerDistance = 200;
        animDuration = 0.48; // speed reduced 15% (duration increased from 0.42 to 0.48)
      } else if (patternType === 'level39_orbit') {
        // LEVEL 39: Solar Flare
        if (actualPatternIdx < groupSize) {
          // Group 1: Copy Level 3 (The Gravity Pitfalls) layout (stairs dropping and rising) (offset reduced 60% from 51 to 20)
          let shiftVal = 20; // Reduced 60% from 51
          const isExtreme = (obstacleIdx % 3 === 0 || obstacleIdx % 3 === 1);

          localGapHeight = Math.round(gapHeight * 0.904); // 13% increase from 0.80 (0.80 * 1.13 = 0.904)
          if (score >= 11 && score <= 15 && isExtreme) {
            shiftVal = Math.round(20 * 0.70); // 30% reduction in shift displacement (from 20 to 14)
            localGapHeight = Math.round(gapHeight * 0.904 * 1.30); // 30% increase relative to Group 1's gap (0.904 * 1.30 = 1.1752)
          }

          if (obstacleIdx % 3 === 0) {
            targetCenterY = height / 2 - shiftVal;
          } else if (obstacleIdx % 3 === 1) {
            targetCenterY = height / 2 + shiftVal;
          } else {
            targetCenterY = height / 2;
          }
          triggerDistance = 350;
          animDuration = 0.40;
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 - 40 + (obstacleIdx - 6) * 16; // 20% reduction from -50 + ... * 20
          if (levelNumPlayable === 37) {
            localGapHeight = Math.round(gapHeight * 0.80 * 1.15); // increased 15% for Level 37
          } else {
            localGapHeight = Math.round(gapHeight * 0.80); // 20% reduce
          }
          triggerDistance = 195;
          animDuration = 0.44;
        } else {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -24 : 24); // 20% reduction from +/-30
          if (levelNumPlayable === 37) {
            localGapHeight = Math.round(gapHeight * 0.84 * 1.15); // increased 15% for Level 37
          } else {
            localGapHeight = Math.round(gapHeight * 0.84); // 20% increase (from 0.70 to 0.84)
          }
          triggerDistance = 195;
          animDuration = 0.44;
        }
      } else if (patternType === 'level40_miniboss') {
        // LEVEL 40: Chrono Warp Mini-Boss
        if (levelNum === 46) {
          // Playable Level 46 uses Group 2 layout and settings throughout
          targetCenterY = height / 2 + 50 - (obstacleIdx - 6) * 20 + Math.sin((obstacleIdx - 6) * 0.8) * 15;
          localGapHeight = Math.round(gapHeight * 0.75);
          triggerDistance = 175;
          animDuration = 0.32;
        } else {
          if (actualPatternIdx < groupSize) {
            // Ascending staircase layout: center rises by 20px per step (for playable Level 30, increase by 40% from 32.5/13: 45.5 / 18.2)
            const baseShift = levelNumPlayable === 30 ? 45.5 : 50;
            const stepShift = levelNumPlayable === 30 ? 18.2 : 20;
            targetCenterY = height / 2 + baseShift - obstacleIdx * stepShift;
            localGapHeight = Math.round(gapHeight * (levelNumPlayable === 30 ? 0.816 : 0.85)); // 20% increase for level 30 (0.68 * 1.20 = 0.816)
            triggerDistance = 210; // Extra reaction time for split motion
            animDuration = 0.40;   // Smooth split duration
          } else if (actualPatternIdx < groupSize * 2) {
            const baseShift = levelNumPlayable === 30 ? 45.5 : 50;
            const stepShift = levelNumPlayable === 30 ? 18.2 : 20;
            const sineAmp = levelNumPlayable === 30 ? 13.65 : 15;
            targetCenterY = height / 2 + baseShift - (obstacleIdx - 6) * stepShift + Math.sin((obstacleIdx - 6) * 0.8) * sineAmp;
            localGapHeight = Math.round(gapHeight * (levelNumPlayable === 30 ? 0.66 : 0.615)); // 20% increase for level 30 (0.55 * 1.20 = 0.66)
            triggerDistance = 175;
            animDuration = 0.32;
          } else {
            // For playable Level 30, increase by 40% from 42.25/19.5: 59.15 / 27.3
            const offset = levelNumPlayable === 30 ? 59.15 : 65;
            const wobble = levelNumPlayable === 30 ? 27.3 : 30;
            targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -offset : offset) + Math.cos((obstacleIdx - 12) * 1.2) * wobble;
            localGapHeight = Math.round(gapHeight * (levelNumPlayable === 30 ? 0.66 : 0.65)); // 20% increase for level 30 (0.55 * 1.20 = 0.66)
            triggerDistance = 175;
            animDuration = 0.32;
          }
        }
      } else if (patternType === 'level41_doublew') {
        // Group 1: Orbiting Helix, Group 2: Gravity Wells corridor, Group 3: Horizon Slanted Slip
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 + Math.sin(obstacleIdx * (Math.PI / 3)) * 50;
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -45 : 45) * (1 - (obstacleIdx % 4) * 0.15);
        } else {
          targetCenterY = height / 2 - 40 + (obstacleIdx - 12) * 16 + Math.sin(obstacleIdx * 1.5) * 15;
        }
        triggerDistance = 180;
        animDuration = 0.35;
      } else if (patternType === 'level42_infinity') {
        // Playable Level 45: Cosmo-Quantum Gravity singularity
        // Group 1: Singular Orbit, Group 2: Gravity Waves, Group 3: Quantum Singular Corridor
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 + Math.sin(obstacleIdx * 1.5) * 55;
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 + Math.cos(obstacleIdx * 0.9) * 45 + (obstacleIdx % 2 === 0 ? -15 : 15);
        } else {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -30 : 30) * (1.1 + (obstacleIdx % 3) * 0.25);
        }
        triggerDistance = 180;
        animDuration = (levelNumPlayable === 47) ? 0.44 : 0.35; // Slowed down by 20% for Level 47
      } else if (patternType === 'level43_dnahelix') {
        // Group 1: Helix strands, Group 2: Sliding Zigzag, Group 3: Curved Tunnel
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -30 : 30);
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? 35 : -35);
        } else {
          targetCenterY = height / 2 + Math.cos((obstacleIdx - 12) * 0.8) * 35;
        }
        triggerDistance = 185;
        animDuration = 0.34;
      } else if (patternType === 'level44_pendulum') {
        // Group 1: Pendulum, Group 2: Magnetic corridor, Group 3: W Stair hybrid
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2;
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2;
        } else {
          targetCenterY = height / 2 + 40 - (obstacleIdx - 12) * 15 + (obstacleIdx % 2 === 0 ? 10 : -10);
        }
        triggerDistance = 190;
        animDuration = 0.36;
      } else if (patternType === 'level45_scurve') {
        // Group 1: Solar Flares wave, Group 2: Coronal Step Loops, Group 3: Ignition Zone
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 + Math.sin(obstacleIdx * 0.95) * 55;
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 + (obstacleIdx % 3 - 1) * 35;
        } else {
          targetCenterY = height / 2 + Math.cos(obstacleIdx * 0.5) * 25;
        }
        triggerDistance = 175;
        animDuration = 0.38; // speed reduced 18% (duration increased from 0.32 to 0.38)
      } else if (patternType === 'level46_triplespiral') {
        // Single obstacles arrangement: all groups use the middle group's Snake Wave layout
        targetCenterY = height / 2 - Math.sin((obstacleIdx - 6) * 0.8) * 40;
        triggerDistance = 180;
        animDuration = 0.34;
      } else if (patternType === 'level47_diamond') {
        // Group 1: Diamond pattern, Group 2: Sliding Stair, Group 3: Dynamic Gap
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 + (obstacleIdx <= 2 ? -30 : 30);
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 - 40 + (obstacleIdx - 6) * 16;
        } else {
          targetCenterY = height / 2;
        }
        triggerDistance = 180;
        animDuration = 0.35;
      } else if (patternType === 'level48_tornado') {
        // Group 1: Tornado swirl, Group 2: Reverse Spiral, Group 3: Magnetic Snake
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 + Math.sin(obstacleIdx * (Math.PI * 2 / 6)) * 30;
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 + Math.cos((obstacleIdx - 6) * 0.8) * 35;
        } else {
          targetCenterY = height / 2;
        }
        triggerDistance = 170;
        animDuration = 0.3;
      } else if (patternType === 'level49_fractal') {
        // Group 1: Fractal stair, Group 2: Infinity wave, Group 3: Orbit Maze
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 - 35 + (obstacleIdx % 3) * 20 - (obstacleIdx % 2) * 10;
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 + Math.sin((obstacleIdx - 6) * 0.8) * 40;
        } else {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -25 : 25);
        }
        triggerDistance = 175;
        animDuration = 0.32;
      } else if (patternType === 'level50_finalboss') {
        // Ultimate Final Boss Layout: Group 1 (DNA + Snake Wave), Group 2 (Spiral + Magnetic), Group 3 (Infinity + Orbit)
        if (obstacleIdx <= 5) {
          targetCenterY = height / 2 + Math.sin(obstacleIdx * 0.8) * 40 + (obstacleIdx % 2 === 0 ? -15 : 15);
        } else if (obstacleIdx <= 11) {
          targetCenterY = height / 2 - 40 + (obstacleIdx - 6) * 15 + Math.sin((obstacleIdx - 6) * (Math.PI / 3)) * 15;
        } else {
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -30 : 30) + Math.cos((obstacleIdx - 12) * 0.8) * 15;
        }
        triggerDistance = 160;
        animDuration = 0.28;
      } else if (patternType === 'level51_cloudrift') {
        // L51: Cloud Rift — G1: Rising staircase with wide zigzag, G2: Paired arch portals, G3: Diagonal cascade
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 - 60 + (obstacleIdx % 4) * 40; // 4-step stair: -60,-20,+20,+60
        } else if (actualPatternIdx < groupSize * 2) {
          const pair = Math.floor((obstacleIdx % 6) / 2);
          targetCenterY = height / 2 + [-45, 0, 45][pair]; // arch portal pairs
        } else {
          targetCenterY = height / 2 + Math.sin(obstacleIdx * 0.7) * 55 - (obstacleIdx % 3) * 12;
        }
        triggerDistance = 168;
        animDuration = 0.30;
      } else if (patternType === 'level52_aurorapulse') {
        // L52: Aurora Pulse — G1: Concentric wave rings, G2: Chevron V-shapes, G3: Double sine clash
        if (actualPatternIdx < groupSize) {
          const ring = Math.floor(obstacleIdx / 2);
          targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? 1 : -1) * (ring * 18 + 10);
        } else if (actualPatternIdx < groupSize * 2) {
          const chevron = obstacleIdx % 6;
          const chevronOffset = chevron <= 2 ? -55 + chevron * 22 : 55 - (chevron - 3) * 22;
          targetCenterY = height / 2 + chevronOffset;
        } else {
          const phase1 = Math.sin(obstacleIdx * 0.9) * 40;
          const phase2 = Math.cos(obstacleIdx * 1.4) * 25;
          targetCenterY = height / 2 + phase1 + phase2;
        }
        triggerDistance = 172;
        animDuration = 0.31;
      } else if (patternType === 'level53_starlattice') {
        // L53: Star Lattice — G1: Crosshatch grid, G2: Diagonal star lines, G3: Pulsing hexagon
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 + (obstacleIdx % 3 === 0 ? -50 : obstacleIdx % 3 === 1 ? 0 : 50);
        } else if (actualPatternIdx < groupSize * 2) {
          targetCenterY = height / 2 + (obstacleIdx - groupSize) * 14 - 42;
        } else {
          const hex = obstacleIdx % 6;
          const hexY = [0, 30, 52, 60, 52, 30][hex];
          targetCenterY = height / 2 - 30 + hexY;
        }
        triggerDistance = 175;
        animDuration = 0.32;
      } else if (patternType === 'level54_celestialmaze') {
        // L54: Celestial Maze — G1: Spiral inward, G2: Labyrinth steps, G3: Orbiting beacons
        if (actualPatternIdx < groupSize) {
          const t = obstacleIdx / 5;
          targetCenterY = height / 2 + Math.sin(t * Math.PI * 2) * (55 - t * 8);
        } else if (actualPatternIdx < groupSize * 2) {
          const idx2 = obstacleIdx % 8;
          const steps = [-60, -30, 0, 30, 60, 30, 0, -30];
          targetCenterY = height / 2 + steps[idx2];
        } else {
          const angle = (obstacleIdx % 5) * (2 * Math.PI / 5);
          targetCenterY = height / 2 + Math.sin(angle) * 52;
        }
        triggerDistance = 170;
        animDuration = 0.29;
      } else if (patternType === 'level55_ethervortex') {
        // L55: Ether Vortex — G1: Double helix twist, G2: Plasma Zigzag Zippers, G3: Quantum Phase Portals
        if (actualPatternIdx < groupSize) {
          localGapHeight = Math.round(gapHeight * 1.10);
          targetCenterY = height / 2 + (idxInGroup % 2 === 0 ? -1 : 1) * (20 + (idxInGroup % 3) * 20);
        } else if (actualPatternIdx < groupSize * 2) {
          const stepIndex = idxInGroup % 8;
          const offsets = [-55, -28, 0, 28, 55, 28, 0, -28];
          targetCenterY = height / 2 + offsets[stepIndex];
        } else {
          localGapHeight = Math.round(gapHeight * 1.20);
          targetCenterY = height / 2 + (idxInGroup % 2 === 0 ? -55 : 55);
        }
        triggerDistance = 165;
        animDuration = 0.28;
      } else if (patternType === 'level56_prismaticwave') {
        // L56: Prismatic Wave — G1: Chromatic split (3-tier), G2: Ripple cascade, G3: Interference pattern
        if (actualPatternIdx < groupSize) {
          const tier = idxInGroup % 3;
          targetCenterY = height / 2 + (tier === 0 ? -50 : tier === 1 ? 0 : 50);
        } else if (actualPatternIdx < groupSize * 2) {
          localGapHeight = Math.round(gapHeight * 0.75); // 25% reduction
          targetCenterY = height / 2 + Math.sin(idxInGroup * 0.9) * 50 + Math.cos(idxInGroup * 1.4) * 20;
        } else {
          localGapHeight = Math.round(gapHeight * 0.75); // 25% reduction
          targetCenterY = height / 2 + Math.sin(idxInGroup * 1.1) * 35 + Math.sin(idxInGroup * 2.3) * 20;
        }
        triggerDistance = 172;
        animDuration = 0.30;
      } else if (patternType === 'level57_angelbraid') {
        // L57: Angel Braid — G1: Interleaved braid paths, G2: Wing spread arc, G3: Feather cascade
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 + (idxInGroup % 4 < 2 ? -40 : 40) * (1 - (idxInGroup % 2) * 0.3);
        } else if (actualPatternIdx < groupSize * 2) {
          const wing = idxInGroup % 8;
          const wingOffsets = [-65, -45, -20, 0, 20, 45, 65, 45];
          targetCenterY = height / 2 + wingOffsets[wing];
        } else {
          targetCenterY = height / 2 + Math.cos(idxInGroup * 0.8) * 42 + (idxInGroup % 3 - 1) * 18;
        }
        triggerDistance = 168;
        animDuration = 0.31;
      } else if (patternType === 'level58_serenitystorm') {
        // L58: Serenity Storm — G1: Calm wide wave, G2: Sudden turbulence spikes, G3: Eye of the storm
        if (actualPatternIdx < groupSize) {
          targetCenterY = height / 2 + Math.sin(idxInGroup * 0.5) * 30;
        } else if (actualPatternIdx < groupSize * 2) {
          const spike = idxInGroup % 4;
          targetCenterY = height / 2 + [0, -65, 0, 65][spike];
        } else {
          const t3 = idxInGroup % 8;
          targetCenterY = height / 2 + (t3 === 4 ? 0 : Math.sin(t3 * 0.78) * 50);
        }
        triggerDistance = 162;
        animDuration = 0.28;
      } else if (patternType === 'level59_ascendant') {
        // L59: Ascendant — G1: Ascending spiral columns, G2: Pinnacle peaks, G3: Transcendent orbit
        if (actualPatternIdx < groupSize) {
          const cycle = idxInGroup % 18;
          targetCenterY = height / 2 + 55 - cycle * 10; // ascends from bottom to top
        } else if (actualPatternIdx < groupSize * 2) {
          const peakIdx = idxInGroup % 6;
          const peaks = [-60, -30, 30, 60, 30, -30];
          targetCenterY = height / 2 + peaks[peakIdx];
        } else {
          const angle59 = idxInGroup * 0.7;
          const radius59 = 42 + Math.sin(angle59) * 12;
          targetCenterY = height / 2 + Math.sin(angle59 * 1.8) * radius59;
        }
        triggerDistance = 158;
        animDuration = 0.27;
      } else if (patternType === 'level60_divineapex') {
        // L60: Divine Apex — G1: Mandala rotation, G2: Judgment wave, G3: Apex convergence
        if (actualPatternIdx < groupSize) {
          const a60 = (idxInGroup % 8) * (Math.PI / 4);
          targetCenterY = height / 2 + Math.sin(a60) * 55;
        } else if (actualPatternIdx < groupSize * 2) {
          const j60 = idxInGroup;
          targetCenterY = height / 2 + Math.sin(j60 * 0.9) * 45 + Math.sin(j60 * 1.7) * 20;
        } else {
          const c60 = idxInGroup;
          const spread = Math.max(0, 60 - c60 * 6); // converges toward center
          targetCenterY = height / 2 + (c60 % 2 === 0 ? -spread : spread);
        }
        triggerDistance = 155;
        animDuration = 0.25;
      } else if (patternType.indexOf('_progress') !== -1) {
        // Levels 21 to 29: 3 completely different wave patterns per level!
        subPattern = 'wave_10';
        if (levelNum === 21) {
          subPattern = actualPatternIdx < groupSize ? 'wave_10' : (actualPatternIdx < groupSize * 2 ? 'breathing_12' : 'moving_stair_15');
          if (actualPatternIdx < groupSize) {
            localGapHeight = Math.round(localGapHeight * 0.94185 * 0.80); // reduced 20% (from 0.94185 to 0.75348)
          } else if (actualPatternIdx < groupSize * 2) {
            localGapHeight = Math.round(localGapHeight * 0.805 * 0.75); // reduced 25% (from 0.805 to 0.60375)
          } else {
            localGapHeight = Math.round(localGapHeight * 0.94185); // Group 3 remains at original scale
          }
          if (levelNumPlayable === 31) {
            localGapHeight = Math.round(localGapHeight * 0.85); // reduce path gap by 15%
          }
        } else if (levelNum === 22) {
          subPattern = actualPatternIdx < groupSize ? 'rotating_17' : (actualPatternIdx < groupSize * 2 ? 'dynamic_w_18' : (levelNumPlayable === 32 ? 'spiral_wave_32' : 'exp_shrink_19'));
          if (actualPatternIdx < groupSize) {
            localGapHeight = Math.round(localGapHeight * 0.7475); // Group 1 remains 0.7475
          } else if (actualPatternIdx < groupSize * 2) {
            localGapHeight = Math.round(localGapHeight * 0.859625); // Group 2 remains 0.859625
          } else {
            if (levelNumPlayable === 32) {
              localGapHeight = Math.round(localGapHeight * 0.7475 * 0.70 * 1.10); // Group 3 increased by 10% for Level 32
            } else {
              localGapHeight = Math.round(localGapHeight * 0.7475 * 0.70); // Group 3 reduced 30% (from 0.7475 to 0.52325)
            }
          }
        } else if (levelNum === 23) {
          subPattern = actualPatternIdx < groupSize ? 'hybrid_20' : (actualPatternIdx < groupSize * 2 ? 'snake_21' : 'pulse_22');
          localGapHeight = Math.round(localGapHeight * 0.85); // 15% less gap area
        } else if (levelNum === 24) {
          subPattern = actualPatternIdx < groupSize ? 'gravity_23' : (actualPatternIdx < groupSize * 2 ? 'rotating_24' : 'waterfall_25');
          if (actualPatternIdx < groupSize) {
            localGapHeight = Math.round(localGapHeight * 0.85); // 15% less gap area for starting group
          } else if (actualPatternIdx < groupSize * 2) {
            if (levelNumPlayable === 34) {
              localGapHeight = Math.round(localGapHeight * 0.82 * 1.12); // Group 2 gap increased by 12% for Level 34
            } else {
              localGapHeight = Math.round(localGapHeight * 0.82); // 18% reduction for Group 2
            }
          } else {
            localGapHeight = Math.round(localGapHeight * 0.82); // 18% reduction for last group
          }
        } else if (levelNum === 25) {
          subPattern = actualPatternIdx < groupSize ? 'pendulum_28' : (actualPatternIdx < groupSize * 2 ? 'magnetic_27' : 'elevator_26'); // Swapped first and last group
        } else if (levelNum === 26) {
          if (levelNumPlayable === 39 || levelNumPlayable === 35) {
            subPattern = actualPatternIdx < groupSize ? 'elevator_26' : (actualPatternIdx < groupSize * 2 ? 'rotating_24' : 'pendulum_39');
          } else {
            subPattern = 'elevator_26'; // All groups use high-amplitude elevator_26 updown animation
          }
        } else if (levelNum === 27) {
          subPattern = actualPatternIdx < groupSize ? 'moving_stair_15' : (actualPatternIdx < groupSize * 2 ? 'rotating_17' : 'dynamic_w_18');
        } else if (levelNum === 28) {
          subPattern = actualPatternIdx < groupSize ? 'exp_shrink_19' : (actualPatternIdx < groupSize * 2 ? 'hybrid_20' : 'snake_21');
        } else if (levelNum === 29) {
          subPattern = actualPatternIdx < groupSize ? 'pulse_22' : (actualPatternIdx < groupSize * 2 ? 'gravity_23' : 'rotating_24');
        }

        const spawnAnimScale = (levelNum === 21 || levelNum === 22) ? 1.30 : 1.0;

        // Retrieve values for standard wave subPattern
        if (subPattern === 'wave_10') {
          const step = actualPatternIdx % 12;
          targetCenterY = height / 2 + Math.sin(step * (Math.PI * 2 / 12)) * (55 * spawnAnimScale);
        } else if (subPattern === 'breathing_12' || subPattern === 'exp_shrink_19') {
          targetCenterY = height / 2;
        } else if (subPattern === 'spiral_wave_32') {
          targetCenterY = height / 2 + Math.sin(actualPatternIdx * 0.8) * (45 * spawnAnimScale);
        } else if (subPattern === 'moving_stair_15') {
          const offsets = [80, 40, 0, -40, -80, -40, 0, 40];
          targetCenterY = height / 2 + offsets[actualPatternIdx % offsets.length] * spawnAnimScale;
        } else if (subPattern === 'rotating_17' || subPattern === 'rotating_24') {
          targetCenterY = height / 2 + Math.sin(actualPatternIdx * (Math.PI / 4)) * (40 * spawnAnimScale);
        } else if (subPattern === 'dynamic_w_18') {
          const offsets = [-80, -40, 0, 40, 80, 40, 0, -40];
          targetCenterY = height / 2 + offsets[actualPatternIdx % offsets.length] * spawnAnimScale;
        } else if (subPattern === 'hybrid_20') {
          const offsets = [-60, -30, 0, 30, 60, 30, 0, -30];
          targetCenterY = height / 2 + offsets[actualPatternIdx % offsets.length];
        } else if (subPattern === 'snake_21') {
          targetCenterY = height / 2 + Math.sin(actualPatternIdx * 0.7) * 45;
        } else if (subPattern === 'pulse_22') {
          const pulseSpawnScale = (levelNum === 23) ? 1.15 : 1.0;
          targetCenterY = height / 2 + (actualPatternIdx % 2 === 0 ? -25 : 25) * pulseSpawnScale;
        } else if (subPattern === 'gravity_23') {
          targetCenterY = height / 2 + (actualPatternIdx % 3 === 0 ? -40 : 20);
        } else if (subPattern === 'waterfall_25') {
          const offsets = [-80, -40, 0, 40, 80, 80, 40, 0, -40, -80];
          targetCenterY = height / 2 + offsets[actualPatternIdx % offsets.length];
        } else if (subPattern === 'elevator_26') {
          const elevatorSpawnScale = (levelNum === 25) ? 0.56 : 1.0; // Reduced additional 20% for Level 25 (0.70 * 0.80 = 0.56)
          const shiftVal = (levelNumPlayable === 35) ? 30 : 7 * elevatorSpawnScale;
          targetCenterY = height / 2 + (actualPatternIdx % 2 === 0 ? -1 : 1) * shiftVal; // High-amplitude spawn
        } else if (subPattern === 'magnetic_27') {
          targetCenterY = height / 2 + (actualPatternIdx % 4 === 0 ? -40 : 40);
        } else if (subPattern === 'pendulum_28') {
          targetCenterY = height / 2 + 20;
        } else if (subPattern === 'pendulum_39') {
          // Challenging wave layout for spawn center
          targetCenterY = height / 2 + Math.sin(actualPatternIdx * 1.2) * (55 * spawnAnimScale);
        } else if (subPattern === 'sliding_29') {
          const offsets = [-50, 0, 50, 0];
          const isLevel36Group3 = (levelNum === 26 && actualPatternIdx >= groupSize * 2);
          // Wavy staircase offsets (plays on Level 39 now due to Level 36 <-> 39 swap)
          const level36Offset = Math.sin(actualPatternIdx * 1.15) * 65;
          targetCenterY = height / 2 + (isLevel36Group3 ? level36Offset : offsets[actualPatternIdx % offsets.length]);
        }

        triggerDistance = 210;
        animDuration = 0.45;
      } else if (patternType === 'wave_10') {
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
        const rawOffset = offsets[obstacleIdx % offsets.length];
        // G1 (idx 0-5) and G2 (idx 6-11): vertical offset +20%
        const offsetScale = (obstacleIdx <= 11) ? 1.20 : 1.0;
        targetCenterY = height / 2 + rawOffset * offsetScale;
      } else if (patternType === 'elevator_26') {
        targetCenterY = height / 2 + (obstacleIdx % 2 === 0 ? -7 : 7); // High-amplitude spawn
      } else if (patternType === 'sliding_29') {
        const offsets = [-50, 0, 50, 0];
        targetCenterY = height / 2 + offsets[obstacleIdx % offsets.length];
      }

      // Gap height reductions for Levels 25 to 30 based on animation types
      if (levelNum !== undefined && levelNum >= 25 && levelNum <= 30) {
        let isStatic = false;
        let isHorizontal = false;
        let isVertical = false;

        if (patternType === 'level30_hybridwave') {
          if (obstacleIdx <= 5) {
            isVertical = true;
          } else if (obstacleIdx <= 11) {
            isVertical = true;
          } else {
            isStatic = true; // Group 3 is static straight line arrangement at spawn time
          }
        } else if (patternType.indexOf('_progress') !== -1) {
          // For levels 25-29 progress levels, check subPattern
          if (subPattern === 'rotating_17' || subPattern === 'rotating_24' || subPattern === 'pendulum_28' || subPattern === 'pendulum_39') {
            isHorizontal = true;
          } else {
            isVertical = true;
          }
        }

        if (levelNum === 25 && subPattern === 'elevator_26') {
          if (levelNumPlayable === 39) {
            localGapHeight = Math.round(localGapHeight * 0.92 * 0.70); // G3: reduced 30% for Level 39
          } else {
            localGapHeight = Math.round(localGapHeight * 0.92); // 15% increase for Level 25 Group 3 (0.80 * 1.15 = 0.92)
          }
        } else if (levelNum === 25 && subPattern === 'pendulum_28') {
          localGapHeight = Math.round(localGapHeight * 0.594); // G1: 0.675×0.88=0.594 (12% reduced)
        } else if (levelNum === 25 && subPattern === 'magnetic_27') {
          if (levelNumPlayable === 35) {
            localGapHeight = Math.round(localGapHeight * 0.6336 * 1.20); // 20% increase for Level 35 Group 2
          } else if (levelNumPlayable === 39) {
            localGapHeight = Math.round(localGapHeight * 0.6336 * 1.15); // G2: increased 15% for Level 39
          } else {
            localGapHeight = Math.round(localGapHeight * 0.6336); // G2: 0.72×0.88=0.6336 (12% reduced)
          }
        } else if (levelNum === 26) {
          if (levelNumPlayable === 39 || levelNumPlayable === 35) {
            if (actualPatternIdx < groupSize) {
              localGapHeight = Math.round(localGapHeight * 0.60); // Group 1 reduced 40%
            } else if (actualPatternIdx < groupSize * 2) {
              localGapHeight = Math.round(localGapHeight * 0.75 * 0.88); // Group 2 reduced 12% on top of horizontal scale
            } else {
              localGapHeight = Math.round(localGapHeight * 0.75 * 0.92); // Group 3 remains 25% reduce, then reduced by 8%
            }
          } else if (subPattern === 'elevator_26') {
            if (actualPatternIdx < groupSize) {
              localGapHeight = Math.round(localGapHeight * 1.15); // Group 1 increased by 15%
            } else if (actualPatternIdx >= groupSize * 2) {
              localGapHeight = Math.round(localGapHeight * 0.78 * 1.20); // Group 3 (last group) increased by 20% (net 0.936)
            }
          }
        } else if (levelNum === 27) {
          if (actualPatternIdx < groupSize) {
            localGapHeight = Math.round(localGapHeight * 0.82); // Group 1 path gap 18% reduce
          } else if (actualPatternIdx >= groupSize * 2) {
            localGapHeight = Math.round(localGapHeight * 0.87); // Group 3 path gap 13% reduce
          } else {
            localGapHeight = Math.round(localGapHeight * 0.78); // Group 2 path gap 22% reduce
          }
        } else if (levelNum === 28 && actualPatternIdx < groupSize) {
          // Plays on Level 36 now due to Level 36 <-> 39 swap
          localGapHeight = Math.round(localGapHeight * 0.70 * 0.80); // Group 1 reduced by 20% (net 0.56)
        } else if (levelNum === 28 && actualPatternIdx >= groupSize && actualPatternIdx < groupSize * 2) {
          // Plays on Level 36 now due to Level 36 <-> 39 swap
          localGapHeight = Math.round(localGapHeight * 0.80 * 0.90); // Group 2 reduced by 10% (net 0.72)
        } else if (isVertical) {
          localGapHeight = Math.round(localGapHeight * 0.80); // 20% reduce
        } else if (isHorizontal) {
          localGapHeight = Math.round(localGapHeight * 0.75); // 25% reduce
        } else if (isStatic) {
          localGapHeight = Math.round(localGapHeight * 0.70); // 30% reduce
        }
      }

      // Gap height adjustments for Levels 41 to 50
      if (levelNumPlayable !== undefined && levelNumPlayable >= 41 && levelNumPlayable <= 50) {
        let mult = 0.85;
        if (levelNumPlayable === 50 || levelNumPlayable === 49) {
          mult = 1.22;
        } else if (levelNumPlayable === 45) {
          mult = 1.25;
        } else if (levelNumPlayable >= 41 && levelNumPlayable <= 44) {
          mult = 1.17;
        }

        const group1Gap = Math.round(gapHeight * mult);
        if (obstacleIdx <= 5) {
          localGapHeight = group1Gap;
        } else if (obstacleIdx <= 11) {
          localGapHeight = Math.round(group1Gap * 0.93); // Group 2: 7% decrease from Group 1
        } else {
          localGapHeight = Math.round(group1Gap * 0.88); // Group 3: 12% decrease from Group 1
        }
        // Reduce path gap for Levels 41 to 50 by 8%
        localGapHeight = Math.round(localGapHeight * 0.92);
        if (levelNumPlayable === 48) {
          localGapHeight = Math.round(localGapHeight * 1.15); // Increase Level 48 path gap by 15%
        }
        if (levelNumPlayable === 47) {
          localGapHeight = Math.round(localGapHeight * 0.80 * 1.18 * 1.15); // Reduce Level 47 path gap by 20%, then increase by 18%, then increase by 15% (net ~1.0856)
        }
      }

      // Apply Level 40-45 path gap adjustments (5% increase for middle group, 10% increase for last/3rd group)
      const isLevel40To45 = (levelNum !== undefined && levelNum >= 40 && levelNum <= 45) ||
        (patternType === 'level40_miniboss' ||
          patternType === 'level41_doublew' ||
          patternType === 'level42_infinity' ||
          patternType === 'level43_dnahelix' ||
          patternType === 'level44_pendulum' ||
          patternType === 'level45_scurve');

      if (isLevel40To45) {
        if (groupIdx === 1) {
          localGapHeight = Math.round(localGapHeight * 1.05);
        } else if (groupIdx === 2) {
          localGapHeight = Math.round(localGapHeight * 1.10);
        }
      }



      // Apply Level 43 & 45 path gap adjustments (additional 10% increase)
      if (levelNumPlayable === 43 || levelNumPlayable === 45) {
        localGapHeight = Math.round(localGapHeight * 1.10);
      }

      // Apply Level 48 path gap adjustments (15% increase)
      if (levelNumPlayable === 48) {
        localGapHeight = Math.round(localGapHeight * 1.15);
      }

      // Safeguard boundaries and calculate target heights
      if (levelNum !== undefined && levelNum >= 11 && levelNum <= 20) {
        localGapHeight = Math.max(165, localGapHeight);
      }

      if (hasAsymmetricHeights) {
        // Asymmetric edges are bounded directly using minimum clearance
        const minTopHeight = 40;
        const minBottomHeight = 40;
        targetTopHeight = Math.max(minTopHeight, Math.min(height - minBottomHeight - localGapHeight, targetTopHeight));
        targetBottomHeight = height - targetTopHeight - localGapHeight;
        targetCenterY = targetTopHeight + localGapHeight / 2;
      } else {
        const minCenterY = 75 + localGapHeight / 2;
        const maxCenterY = height - 75 - localGapHeight / 2;
        targetCenterY = Math.max(minCenterY, Math.min(maxCenterY, targetCenterY));

        targetTopHeight = targetCenterY - localGapHeight / 2;
        targetBottomHeight = height - targetCenterY - localGapHeight / 2;
      }

      // Enable special split opening animation only for Level 1
      let isSpecialSplit = (levelNum === 1);

      // Level 11 gets a dedicated smooth slide-in from edges (not a split) - disabled to spawn fully open
      const isLevel11SmoothEntry = false;

      let closedTopHeight = 0;
      let closedBottomHeight = 0;
      let initTriggered = true;
      let initAnimTimer = animDuration;

      if (isSpecialSplit) {
        initTriggered = false;
        initAnimTimer = 0;
        // Start closed exactly at the center of the gap (targetCenterY) to show the slide apart on approach
        closedTopHeight = targetCenterY;
        closedBottomHeight = height - targetCenterY;
      } else if (isLevel11SmoothEntry) {
        // Level 11: pillars start flush with screen edges, then smoothly slide inward
        initTriggered = false;
        initAnimTimer = 0;
        closedTopHeight = 0;          // top pillar starts at zero height (flush with ceiling)
        closedBottomHeight = 0;       // bottom pillar starts at zero height (flush with floor)
      } else {
        closedTopHeight = targetTopHeight;
        closedBottomHeight = targetBottomHeight;
      }

      const isMutated = (levelNum % 2 === 0);
      const isStructured = (levelNum % 3 === 0);

      let hasEnergyBall = false;
      let initEnergyBallY: number | undefined = undefined;
      let initEnergyBallSpeedY: number | undefined = undefined;
      if (levelNumPlayable !== undefined && levelNumPlayable >= 41 && levelNumPlayable <= 60 && levelNumPlayable !== 3) {
        if (levelNumPlayable === 45 || levelNumPlayable === 55) {
          // Level 45 / 55: Increased rate (~70% from base rate)
          const subIdx = actualPatternIdx % 180;
          const isBaseBall = (actualPatternIdx % 9 === 0);
          const isSupplementalBall = [5, 14, 23, 32, 41, 50, 59, 68, 77, 86, 95, 104, 113, 122].includes(subIdx);
          hasEnergyBall = isBaseBall || isSupplementalBall;
        } else if (levelNumPlayable === 50) {
          // Level 50: Reduced rate (1 in 9 with extra)
          hasEnergyBall = (actualPatternIdx % 9 === 0 || actualPatternIdx % 180 === 5);
        } else if (levelNumPlayable === 60) {
          // Level 60: Group 1 has base rate, Group 2 & Group 3 have double rate
          if (actualPatternIdx < groupSize) {
            hasEnergyBall = (actualPatternIdx % 9 === 0 || actualPatternIdx % 180 === 5);
          } else {
            // Group 2 & 3: Double quantity (doubled 1-in-9 rate)
            hasEnergyBall = (actualPatternIdx % 9 === 0 || actualPatternIdx % 9 === 4 || actualPatternIdx % 180 === 5);
          }
        } else if (levelNumPlayable >= 51 && levelNumPlayable <= 54) {
          // Levels 51-54: 35% increase (approx 1 in 16 + 1 in 160 rate)
          hasEnergyBall = (actualPatternIdx % 16 === 0 || actualPatternIdx % 160 === 8);
        } else if (levelNumPlayable >= 46 && levelNumPlayable <= 49) {
          // Levels 46-49: 25% increase (approx 1 in 10 rate)
          hasEnergyBall = (actualPatternIdx % 10 === 0);
        } else {
          // Others (41-44 / 56-59 / etc.)
          const mirroredLevel = levelNumPlayable <= 50 ? levelNumPlayable : levelNumPlayable - 10;
          if (mirroredLevel >= 46) {
            hasEnergyBall = (actualPatternIdx % 13 === 0);
          } else {
            hasEnergyBall = (actualPatternIdx % 22 === 0 || actualPatternIdx % 220 === 11);
          }
        }

        if (hasEnergyBall) {
          initEnergyBallY = targetCenterY;
          // Alternate direction and randomize speed: reduced by 25% (now moving between 0.9 and 1.575 pixels per frame)
          const dir = (actualPatternIdx % 2 === 0 ? 1 : -1);
          initEnergyBallSpeedY = dir * (0.9 + Math.random() * 0.675);
        }
      }

      this.list.push(this.acquireObstacle({
        x: spawnX,
        width: this.obstacleWidth,
        topHeight: closedTopHeight,
        bottomHeight: closedBottomHeight,
        passed: false,
        worldId,
        isMoving: true, // active dynamic pattern
        movingDir: Math.random() > 0.5 ? 1 : -1,
        speedY: 0.4 + Math.random() * 0.6,
        rangeY: difficulty === 'hard' ? 70 : (difficulty === 'easy' ? 30 : 50),
        initialTopHeight: closedTopHeight,
        initialBottomHeight: closedBottomHeight,
        isLaser: false, // Cyberpunk neon lasers disabled
        laserActive: true,
        laserTimer: 0,
        isMutated,
        isStructured,

        patternType,
        isTriggered: initTriggered,
        isSpecialSplit,
        animTimer: initAnimTimer,
        animDuration,
        triggerDistance,
        closedTopHeight,
        closedBottomHeight,
        targetTopHeight,
        targetBottomHeight,
        baseTopHeight: targetTopHeight,
        baseBottomHeight: targetBottomHeight,
        levelNum,
        shakeX: 0,
        shakeX2: 0,
        gapHeight: localGapHeight,
        spawnCenterY: targetCenterY,
        obstacleIdx: actualPatternIdx,
        spawnScore: score,
        hasEnergyBall,
        energyBallY: initEnergyBallY,
        energyBallSpeedY: initEnergyBallSpeedY,
        energyBallRadius: 16
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

    // Populate the endless pattern queue if it's empty
    if (this.endlessPatternQueue.length === 0) {
      this.generateEndlessPattern(gameMode);
    }
    const nextPattern = this.endlessPatternQueue.shift()!;

    // Set the endless layout spacing scaling multiplier for the NEXT spawned pipe!
    this.currentEndlessDistScale = nextPattern.distScale !== undefined ? nextPattern.distScale : 1.0;

    const isFlockMode = gameMode === 'flock';
    const effectiveScore = isFlockMode ? Math.max(100, score) : score;

    let endlessShiftScale = 1.0;
    if (effectiveScore >= 100 && effectiveScore < 200) {
      endlessShiftScale = 1.0;
      isMoving = !!nextPattern.isMoving;
    } else if (effectiveScore >= 200 && effectiveScore < 300) {
      endlessShiftScale = 1.35; // Added 8% difficulty (increased from 1.25 to 1.35)
      isMoving = !!nextPattern.isMoving;
    } else if (effectiveScore >= 300) {
      endlessShiftScale = 1.30;
      isMoving = !!nextPattern.isMoving;
    }

    if (gameMode === 'flock') {
      endlessShiftScale *= 2.24; // 60% baseline increase + 40% additional increase = 2.24 (was 1.60)
    }

    let targetCenterY = height / 2 + nextPattern.centerYOffset * endlessShiftScale;

    // Apply safe gap height scaling per step
    let gapScaleFactor = nextPattern.gapScale !== undefined ? nextPattern.gapScale : 1.0;

    // Playability Safeguard: Increase the vertical gap height by 10% if the horizontal spacing is at its minimum
    if (nextPattern.distScale !== undefined && nextPattern.distScale <= 0.65) {
      gapScaleFactor *= 1.10;
    }

    let currentStepGap = gapHeight * gapScaleFactor;
    if (gameMode === 'flock') {
      currentStepGap = Math.max(270, currentStepGap); // Enforce vertical gap minimum of 270px
    }

    // Safeguard boundaries to keep safe gap consistent and within bounds
    const minCenterY = margin + currentStepGap / 2;
    const maxCenterY = height - margin - currentStepGap / 2;
    targetCenterY = Math.max(minCenterY, Math.min(maxCenterY, targetCenterY));

    topHeight = targetCenterY - currentStepGap / 2;
    bottomHeight = height - topHeight - currentStepGap;

    isLaser = false; // Cyberpunk neon lasers disabled

    const levelNum = this.activeLevelConfig ? this.activeLevelConfig.levelNum : undefined;
    const isMutated = this.activeLevelConfig ? (this.activeLevelConfig.levelNum % 2 === 0) : (score >= 20 && score < 50);
    const isStructured = this.activeLevelConfig ? (this.activeLevelConfig.levelNum % 3 === 0) : (score >= 50 && score <= 70);

    let approachAnimType: 'open' | 'close' | undefined = undefined;
    let closedTopHeight = topHeight;
    let closedBottomHeight = bottomHeight;
    let animDuration = 0.35;
    let triggerDistance = this.nextSpawnDistance * 0.50;

    let isOrbitalSway = false;
    let isGoldSplitGate = false;

    // Check for random distribution of Group 1 (Orbital Sway) and Group 3 (Gold Split Gate) in score 1-99 range
    const isSpecialAnimAllowed = gameMode === 'flock' ? (score >= 1 && score < 100) : (gameMode === 'endless' ? (score >= 50 && score < 100) : false);
    if (isSpecialAnimAllowed) {
      if (Math.random() < 0.35) { // 35% chance of applying a special animation
        if (Math.random() < 0.50) {
          isOrbitalSway = true;
        } else {
          isGoldSplitGate = true;
          approachAnimType = 'open';
          closedTopHeight = targetCenterY;
          closedBottomHeight = height - targetCenterY;
          animDuration = 0.45;
          triggerDistance = 260; // trigger opening 260px before bird reaches the pipe
        }
      }
    }

    const isChaos = _zone === 'chaos';
    const isDestructible = isChaos && Math.random() < 0.35;
    const hp = isDestructible ? 3 : 0;
    const maxHp = isDestructible ? 3 : 0;

    this.list.push(this.acquireObstacle({
      x: customX !== undefined ? customX : offscreenSpawnX,
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
      levelNum: isGoldSplitGate
        ? 1 + (this.endlessObstacleCount % 5) * 5
        : levelNum,
      gapHeight: currentStepGap,
      spawnCenterY: targetCenterY,
      obstacleIdx: this.endlessObstacleCount++,
      isDestructible,
      hp,
      maxHp,
      isDestroyed: false,
      spawnScore: score,
      approachAnimType,
      targetTopHeight: targetCenterY - currentStepGap / 2,
      targetBottomHeight: height - targetCenterY - currentStepGap / 2,
      closedTopHeight,
      closedBottomHeight,
      animTimer: 0,
      animDuration,
      triggerDistance,
      isTriggered: false,
      isSpecialSplit: false,
      isOrbitalSway,
      isGoldSplitGate
    }));
  }

  private generateEndlessPattern(gameMode: 'endless' | 'level' | 'flock' | 'rescue' | 'formation' | 'chaos' = 'endless') {
    interface EndlessPatternDef {
      name: string;
      offsets: number[];
      gapScales?: number[];
      distScales?: number[];
      isLasers?: boolean[];
      isMovings?: boolean[];
      forceMoving?: boolean;
    }

    let patterns: EndlessPatternDef[];

    if (gameMode === 'flock') {
      // Slightly more dynamic but still flock-friendly patterns
      patterns = [
        {
          name: 'Flock W-Shape',
          offsets: [-75, 45, -15, 45, -75],
          distScales: [1.1, 1.1, 1.1, 1.1, 1.1], // min ~500px horizontal gap
          gapScales: [1.1, 1.0, 0.95, 1.0, 1.1]
        },
        {
          name: 'Flock M-Shape',
          offsets: [75, -45, 15, -45, 75],
          distScales: [1.1, 1.1, 1.1, 1.1, 1.1], // min ~500px horizontal gap
          gapScales: [1.1, 1.0, 0.95, 1.0, 1.1]
        },
        {
          name: 'Flock Wave',
          offsets: [0, 30, 55, 30, 0, -30, -55, -30],
          distScales: [1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1], // min ~500px horizontal gap
          gapScales: [1.15, 1.0, 0.9, 1.0, 1.15, 1.0, 0.9, 1.0]
        },
        {
          name: 'Flock Staircase',
          offsets: [50, 25, 0, -25, -50, -25, 0, 25],
          distScales: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85],
          gapScales: [1.05, 1.0, 0.95, 1.0, 1.05, 1.0, 0.95, 1.0]
        },
        {
          name: 'Flock Arch',
          offsets: [-60, -40, -15, 10, -15, -40, -60],
          distScales: [1.0, 0.9, 0.85, 0.85, 0.9, 1.0, 1.1],
          gapScales: [1.1, 1.0, 0.95, 0.95, 1.0, 1.1, 1.15]
        },
        {
          name: 'Flock Diamond',
          offsets: [0, 35, 60, 35, 0, -35, 0],
          distScales: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
          gapScales: [1.2, 1.05, 0.9, 1.05, 1.2, 1.05, 1.15]
        },
        {
          name: 'Flock Zigzag',
          offsets: [65, -65, 65, -65, 65, -65],
          distScales: [0.95, 1.0, 0.95, 1.0, 0.95, 1.0],
          gapScales: [1.15, 1.1, 1.15, 1.1, 1.15, 1.2]
        }
      ];
    } else {
      // Classic endless mode patterns (exactly unchanged)
      patterns = [
        // 16 Spatial Hazard Formations
        {
          name: 'Staircase',
          offsets: [60, 40, 20, 0, -20, -40, -60],
          distScales: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55],
          gapScales: [1.0, 0.95, 0.9, 0.9, 0.9, 0.95, 1.05],
          isMovings: [false, false, true, false, true, false, false]
        },
        {
          name: 'Zigzag',
          offsets: [70, -70, 70, -70, 70, -70],
          distScales: [0.75, 1.25, 0.75, 1.25, 0.75, 1.25],
          gapScales: [1.15, 1.1, 1.15, 1.1, 1.15, 1.2],
          isMovings: [false, true, false, true, false, false]
        },
        {
          name: 'Wave',
          offsets: [0, 40, 70, 40, 0, -40, -70, -40],
          distScales: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85],
          gapScales: [1.2, 0.95, 0.85, 0.95, 1.2, 0.95, 0.85, 1.1]
        },
        {
          name: 'Tunnel',
          offsets: [0, 0, 0, 0, 0, 0],
          distScales: [0.9, 0.8, 0.8, 0.8, 0.9, 1.0],
          gapScales: [1.25, 1.0, 0.82, 0.82, 1.0, 1.25]
        },
        {
          name: 'Spiral Curve',
          offsets: [-60, -30, 0, 30, 60, 30, -30],
          distScales: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
          gapScales: [1.1, 0.95, 0.8, 0.9, 1.1, 1.0, 1.15]
        },
        {
          name: 'Diamond',
          offsets: [0, 45, 75, 45, 0, -45, 0],
          distScales: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
          gapScales: [1.3, 1.0, 0.8, 1.0, 1.3, 1.0, 1.2]
        },
        {
          name: 'Snake Path',
          offsets: [-50, 50, -30, 30, -50, 50, 0],
          distScales: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 1.0],
          gapScales: [1.0, 1.1, 1.0, 1.1, 1.0, 1.1, 1.2]
        },
        {
          name: 'Arch Bridge',
          offsets: [-80, -50, -20, 10, -20, -50, -80],
          distScales: [1.0, 0.8, 0.7, 0.7, 0.8, 1.0, 1.1],
          gapScales: [1.15, 0.9, 0.85, 0.9, 1.15, 1.1, 1.2]
        },
        {
          name: 'Vertical Shift',
          offsets: [-95, 95, -95, 95],
          distScales: [1.4, 1.4, 1.4, 1.4],
          gapScales: [1.25, 1.25, 1.25, 1.25]
        },
        {
          name: 'Cross Flow',
          offsets: [40, -40, 40, -40, 40],
          distScales: [1.0, 1.0, 1.0, 1.0, 1.0],
          isMovings: [true, true, true, true, true],
          forceMoving: true
        },
        {
          name: 'Laser Gauntlet',
          offsets: [0, -40, 40, -40, 0],
          distScales: [1.3, 1.3, 1.3, 1.3, 1.3],
          gapScales: [1.1, 1.1, 1.1, 1.1, 1.1],
          isLasers: [true, false, true, false, true]
        },
        {
          name: 'Pincer Attack',
          offsets: [0, 20, 0, -20, 0],
          distScales: [0.6, 0.6, 0.6, 0.6, 0.6],
          gapScales: [1.3, 0.78, 1.3, 0.78, 1.3]
        },
        {
          name: 'Heartbeat Pulse',
          offsets: [0, 25, -85, 85, 0, 0],
          distScales: [0.9, 0.8, 0.7, 0.8, 1.0, 1.0],
          gapScales: [1.0, 0.9, 0.75, 0.8, 1.15, 1.0]
        },
        {
          name: 'Double Peak',
          offsets: [-70, 70, 0, -70, 70],
          distScales: [0.85, 0.85, 1.1, 0.85, 0.85],
          gapScales: [1.1, 1.1, 1.25, 1.1, 1.1]
        },
        {
          name: 'Castle Battlement',
          offsets: [-60, 60, -60, 60, -60, 60],
          distScales: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
          gapScales: [1.15, 1.15, 1.15, 1.15, 1.15, 1.15]
        },
        {
          name: 'The Viper',
          offsets: [-45, 45, -45, 45, -45, 45],
          distScales: [0.58, 0.58, 0.58, 0.58, 0.58, 0.58],
          gapScales: [1.2, 1.2, 1.2, 1.2, 1.2, 1.2]
        },

        // 10 Stylized Letter Path Shapes (safe gap traces)
        {
          name: 'Letter S',
          offsets: [-60, -30, 15, 60, 30, -15, -45, -60],
          distScales: [0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
          gapScales: [1.15, 1.0, 0.9, 0.9, 1.0, 1.15, 1.15, 1.2]
        },
        {
          name: 'Letter W',
          offsets: [-75, 45, -15, 45, -75],
          distScales: [0.85, 0.85, 0.85, 0.85, 0.85],
          gapScales: [1.05, 1.15, 1.05, 1.15, 1.05]
        },
        {
          name: 'Letter C',
          offsets: [0, -65, -65, 0, 65, 65, 0],
          distScales: [0.62, 0.62, 0.62, 0.62, 0.62, 0.62, 0.62],
          gapScales: [1.1, 0.95, 0.9, 1.1, 0.9, 0.95, 1.15]
        },
        {
          name: 'Letter M',
          offsets: [65, -45, 15, -45, 65],
          distScales: [0.72, 0.72, 0.72, 0.72, 0.72],
          gapScales: [1.05, 1.15, 1.05, 1.15, 1.05]
        },
        {
          name: 'Letter Z',
          offsets: [-65, -65, 0, 65, 65],
          distScales: [0.88, 0.58, 0.58, 0.88, 0.88],
          gapScales: [1.1, 1.0, 1.0, 1.1, 1.1]
        },
        {
          name: 'Letter U',
          offsets: [-65, 45, 45, -65],
          distScales: [1.05, 0.58, 1.05, 1.05],
          gapScales: [1.1, 1.15, 1.15, 1.1]
        },
        {
          name: 'Letter V',
          offsets: [-75, 65, -75],
          distScales: [0.78, 0.78, 0.78],
          gapScales: [1.0, 1.25, 1.0]
        },
        {
          name: 'Letter X',
          offsets: [-65, 65, 0, -65, 65],
          distScales: [0.68, 0.68, 0.68, 0.68, 0.68],
          gapScales: [1.1, 1.1, 1.2, 1.1, 1.1]
        },
        {
          name: 'Letter O',
          offsets: [0, -65, 65, 0],
          distScales: [0.62, 0.62, 0.62, 0.62],
          gapScales: [1.1, 1.0, 1.0, 1.1]
        },
        {
          name: 'Letter N',
          offsets: [65, -65, 65, -65],
          distScales: [0.92, 0.52, 0.92, 0.92],
          gapScales: [1.1, 1.0, 1.1, 1.1]
        }
      ];
    }

    // Pick a pattern using a shuffled cycle for flock mode, or random selection for classic
    let randPattern;
    if (gameMode === 'flock') {
      if (this.flockPatternIndices.length === 0) {
        this.flockPatternIndices = [0, 1, 2, 3, 4, 5, 6];
        // Fisher-Yates shuffle
        for (let i = this.flockPatternIndices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = this.flockPatternIndices[i];
          this.flockPatternIndices[i] = this.flockPatternIndices[j];
          this.flockPatternIndices[j] = temp;
        }
      }
      const nextIdx = this.flockPatternIndices.pop()!;
      randPattern = patterns[nextIdx];
    } else {
      randPattern = patterns[Math.floor(Math.random() * patterns.length)];
    }

    // Procedural variation: vertical height scale multiplier (0.85 to 1.15)
    const heightScale = 0.85 + Math.random() * 0.30;

    // Copy and scale the offsets
    let offsets = randPattern.offsets.map(o => o * heightScale);

    // Random vertical inversion to make it completely fresh (50% chance)
    const invert = Math.random() > 0.5 ? -1 : 1;
    offsets = offsets.map(o => o * invert);

    // Random vertical shift offset (+-20px) disabled as requested
    const shift = 0;

    // Procedural variation: tempo spacing scale multiplier (0.9 to 1.1)
    const tempoScale = 0.90 + Math.random() * 0.20;

    // Apply moving effect randomly to standard patterns (20% chance)
    const isMovingPattern = randPattern.forceMoving || (Math.random() < 0.2);

    // Populate the queue
    for (let i = 0; i < offsets.length; i++) {
      const stepGapScale = (randPattern.gapScales && randPattern.gapScales[i] !== undefined) ? randPattern.gapScales[i] : 1.0;
      const stepDistScale = (randPattern.distScales && randPattern.distScales[i] !== undefined) ? randPattern.distScales[i] : 1.0;
      const stepIsLaser = (randPattern.isLasers && randPattern.isLasers[i] !== undefined) ? randPattern.isLasers[i] : undefined;
      const stepIsMoving = (randPattern.isMovings && randPattern.isMovings[i] !== undefined) ? randPattern.isMovings[i] : isMovingPattern;

      this.endlessPatternQueue.push({
        centerYOffset: offsets[i] + shift,
        isMoving: stepIsMoving,
        gapScale: stepGapScale,
        distScale: stepDistScale * tempoScale,
        isLaser: stepIsLaser
      });
    }
  }

  // Enforces invisible vertical boundaries and evaluates collisions
  public enforceBoundariesAndCheckCollisions(
    bird: Bird,
    height: number,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ): Obstacle | null {
    let effectiveRadius = bird.radius * 0.48;
    let effectiveRadiusBottom = bird.vy > 0 ? bird.radius * 0.192 : bird.radius * 0.312;

    if (difficulty === 'easy') {
      effectiveRadius = bird.radius * 0.336;
      effectiveRadiusBottom = bird.vy > 0 ? bird.radius * 0.096 : bird.radius * 0.216;
    } else if (difficulty === 'hard') {
      effectiveRadius = bird.radius * 0.696;
      effectiveRadiusBottom = bird.vy > 0 ? bird.radius * 0.456 : bird.radius * 0.576;
    }

    // 1. Check floor/ceiling boundaries with generous collision tolerance
    const isChaos = (window as any).gameEngine && ((window as any).gameEngine.gameMode === 'chaos' || (window as any).gameEngine.progressManager.getState().selectedZone === 'chaos');

    if (bird.y - effectiveRadius <= 5) {
      bird.y = 5 + effectiveRadius;
      if (bird.vy < 0) bird.vy = 0;
    } else if (bird.y + effectiveRadiusBottom >= height - 35) {
      if (isChaos) {
        bird.y = height - 35 - effectiveRadiusBottom;
        if (bird.vy > 0) bird.vy = 0;
      } else {
        console.log("COLLIDED WITH FLOOR! bird.y =", bird.y, "effectiveRadiusBottom =", effectiveRadiusBottom, "height =", height);
        return {} as Obstacle; // Collided with floor
      }
    }

    for (let i = 0; i < this.list.length; i++) {
      const obs = this.list[i];
      if (obs.isDestroyed) {
        continue;
      }

      // Circle-to-circle collision with the moving energy ball
      if (obs.hasEnergyBall && obs.energyBallY !== undefined) {
        const ballX = obs.x + obs.width / 2;
        const ballY = obs.energyBallY;
        const ballRad = obs.energyBallRadius || 16;

        const dx = bird.x - ballX;
        const dy = bird.y - ballY;
        const distSq = dx * dx + dy * dy;
        const radiusSum = effectiveRadius + ballRad;

        if (distSq <= radiusSum * radiusSum) {
          return obs; // Collided with the moving ball obstacle!
        }
      }

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
        console.log("COLLIDED WITH OBSTACLE!", {
          obstacleIdx: obs.obstacleIdx,
          x: obs.x,
          width: obs.width,
          topHeight: obs.topHeight,
          bottomHeight: obs.bottomHeight,
          isCollidingTop,
          isCollidingBottom,
          birdY: bird.y
        });
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
    }

    return null;
  }


  // Draw procedural themed obstacle pillars
  public render(ctx: CanvasRenderingContext2D, height: number) {
    ctx.shadowBlur = 0; // Disable shadows for high performance
    for (let i = 0; i < this.list.length; i++) {
      const obs = this.list[i];
      if (obs.isDestroyed) {
        continue;
      }
      const scoreForStyle = obs.spawnScore !== undefined ? obs.spawnScore : this.currentScore;

      // Use original float values for sub-pixel accuracy and ultra-smooth motion

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
              colorTop = '#701a75';
              colorBottom = '#1e3a8a';
              outlineColor = '#06b6d4';
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
        } else if (scoreForStyle >= 350 && scoreForStyle <= 500) {
          // Score 350-500: 3D Pillars (was score 50-75)
          this.draw3DPillars(ctx, obs, height);
        } else {
          // Style selection: 4 style slots → [styleIdx 0, styleIdx 1, styleIdx 3, 3D pillars]
          // Score   1-100 → fixed styleIdx 0
          // Score 100-200 → fixed styleIdx 1
          // Score 200-350 → fixed styleIdx 3
          // Score 500-600 → alternate every 4 obstacles
          // Score 600-700 → alternate every 2 obstacles
          // Score 700-1000→ alternate every 1 obstacle
          let styleSlot: number; // 0-3, where 3 = 3D pillars
          if (scoreForStyle <= 100) {
            styleSlot = 0;
          } else if (scoreForStyle <= 200) {
            styleSlot = 1;
          } else if (scoreForStyle <= 350) {
            styleSlot = 2; // maps to styleIdx 3
          } else if (scoreForStyle <= 600) {
            // 500-600: change style every 4 obstacles (use persistent spawn index)
            const idx = obs.obstacleIdx || 0;
            styleSlot = Math.floor(idx / 4) % 4;
          } else if (scoreForStyle <= 700) {
            // 600-700: change style every 2 obstacles
            const idx = obs.obstacleIdx || 0;
            styleSlot = Math.floor(idx / 2) % 4;
          } else {
            // 700-1000+: change style every 1 obstacle
            const idx = obs.obstacleIdx || 0;
            styleSlot = idx % 4;
          }

          // Map slot to actual style: slots 0,1,2 → styleIdx 0,1,3; slot 3 → 3D pillars
          const slotToStyle = [0, 1, 3]; // slots 0-2
          if (styleSlot === 3) {
            // 3D Pillars
            this.draw3DPillars(ctx, obs, height);
          } else {
            const styleIdx = slotToStyle[styleSlot];
            switch (obs.worldId) {
              case 'jungle':
                this.drawJunglePillars(ctx, obs, height, styleIdx);
                break;
              case 'ice':
                this.drawIcePillars(ctx, obs, height, styleIdx);
                break;
              case 'desert':
                this.drawDesertPillars(ctx, obs, height, styleIdx);
                break;
              case 'volcano':
                this.drawVolcanoPillars(ctx, obs, height, styleIdx);
                break;
              case 'space':
                this.drawSpaceObstacles(ctx, obs, height, styleIdx);
                break;
              case 'underwater':
                this.drawUnderwaterPillars(ctx, obs, height, styleIdx);
                break;
              case 'heaven':
                this.drawHeavenPillars(ctx, obs, height, styleIdx);
                break;
              case 'retro':
                this.drawRetroPillars(ctx, obs, height, styleIdx);
                break;
              default:
                this.drawDefaultPillars(ctx, obs, height, styleIdx);
            }
          }
        }
      };

      // Save context state for drawing this obstacle
      ctx.save();

      const topShift = obs.shakeX || 0;
      const bottomShift = obs.shakeX2 !== undefined ? obs.shakeX2 : (obs.shakeX || 0);

      // Fast-path Optimization: If top and bottom columns shift by the same amount,
      // we can draw them in a single call without using expensive canvas clipping masks!
      if (topShift === bottomShift) {
        ctx.save();
        ctx.translate(topShift, 0);
        drawPillars();
        ctx.restore();
      } else {
        // Draw Top Column (Shifted by shakeX) - Extended upwards by 1000px to prevent visual cut-off during camera pans
        ctx.save();
        ctx.beginPath();
        ctx.rect(obs.x - 200, -1000, obs.width + 400, obs.topHeight + 40 + 1000);
        ctx.clip();
        ctx.translate(topShift, 0);
        drawPillars();
        ctx.restore();

        // Draw Bottom Column (Shifted by shakeX2) - Extended downwards by 1000px to prevent visual cut-off during camera pans
        ctx.save();
        ctx.beginPath();
        ctx.rect(obs.x - 200, height - obs.bottomHeight - 40, obs.width + 400, obs.bottomHeight + 40 + 1000);
        ctx.clip();
        ctx.translate(bottomShift, 0);
        drawPillars();
        ctx.restore();
      }

      this.drawDestructibleOverlay(ctx, obs, height);

      // Pulsing neon gap-border glow along inner lips of moving Level columns
      if (obs.levelNum !== undefined && obs.isMoving && !(window as any).gameDisableShadows) {
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
        if (obs.worldId === 'ice') glowColor = '#00f3ff';
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
        if (!(window as any).gameDisableShadows) {
          ctx.rotate(this.waveTime * 2.0);
        }
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeRect(-18, -18, 36, 36);
        ctx.restore();
      } else if (obs.patternType === 'boss_30') {
        const centerY = obs.topHeight + (height - obs.bottomHeight - obs.topHeight) / 2;
        ctx.save();
        ctx.translate(obs.x + obs.width / 2, centerY);

        const isPerformance = (window as any).gameDisableShadows;
        if (isPerformance) {
          ctx.fillStyle = '#ff8800';
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(255, 69, 0, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 25, 0, Math.PI * 1.5);
          ctx.stroke();
        } else {
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
        }
        ctx.restore();
      } else if (obs.patternType === 'level40_miniboss') {
        const centerY = obs.topHeight + (height - obs.bottomHeight - obs.topHeight) / 2;
        ctx.save();
        ctx.translate(obs.x + obs.width / 2, centerY);

        const isPerformance = (window as any).gameDisableShadows;
        if (isPerformance) {
          ctx.fillStyle = '#ff007f';
          ctx.beginPath();
          ctx.arc(0, 0, 26, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 2.0;
          ctx.strokeRect(-20, -20, 40, 40);

          ctx.strokeStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(0, 0, 28, 0, Math.PI * 1.8);
          ctx.stroke();
        } else {
          // Chromatic rainbow core
          const pulse = 26 + Math.sin(this.waveTime * 8.0) * 8;
          const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, pulse);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.2, '#ff007f'); // Neon Pink
          grad.addColorStop(0.4, '#00f3ff'); // Neon Cyan
          grad.addColorStop(0.7, '#ffff00'); // Neon Yellow
          grad.addColorStop(1, 'rgba(57, 255, 20, 0)'); // Fading green glow

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, pulse, 0, Math.PI * 2);
          ctx.fill();

          // Rotating concentric geometric lines
          ctx.rotate(this.waveTime * 3.5);
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 2.0;
          ctx.strokeRect(-20, -20, 40, 40);

          ctx.rotate(-this.waveTime * 7.0);
          ctx.strokeStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(0, 0, 28, 0, Math.PI * 1.8);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw moving energy ball obstacle if active
      if (obs.hasEnergyBall && obs.energyBallY !== undefined) {
        ctx.save();
        const ballX = obs.x + obs.width / 2;
        const ballY = obs.energyBallY;
        const radius = obs.energyBallRadius || 16;

        ctx.translate(ballX, ballY);

        // Draw glow aura
        const isPerformance = (window as any).gameDisableShadows;
        let colorCore = '#ffffff';
        let colorGlow = '#ff007f'; // Default hot pink

        if (obs.worldId === 'volcano') {
          colorGlow = '#ff4500'; // Fire orange
        } else if (obs.worldId === 'ice') {
          colorGlow = '#00f3ff'; // Ice blue
        } else if (obs.worldId === 'space') {
          colorGlow = '#a200ff'; // Quantum purple
        } else if (obs.worldId === 'heaven') {
          colorGlow = '#ffd700'; // Heavenly gold
        }

        if (isPerformance) {
          ctx.fillStyle = colorGlow;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = colorCore;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Radial glow gradient
          const pulse = radius + Math.sin(this.waveTime * 10.0) * 4;
          const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, pulse);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, colorCore);
          grad.addColorStop(0.6, colorGlow);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, pulse, 0, Math.PI * 2);
          ctx.fill();

          // Rotating orbit ring
          ctx.rotate(this.waveTime * 4.0);
          ctx.strokeStyle = colorGlow;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 1.1, 0, Math.PI * 1.5);
          ctx.stroke();

          // Reverse rotating inner orbit ring
          ctx.rotate(-this.waveTime * 8.0);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 1.2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Restore context state back to standard
      ctx.restore();

    }
  }

  private draw3DPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;
    const depth = 12; // 3D depth offset
    const collarH = 24; // height of the 3D collar cap

    // 1. Get colors based on active world environment
    let tStop0 = '#4caf50', tStop3 = '#81c784', tStop5 = '#ffffff', tStop7 = '#1b5e20', tStop1 = '#0f3813'; // Trunk stops
    let sideColor = '#0f3813'; // Shadow side
    let capColor = '#ffd700';  // Cap/Surface color
    let strokeColor = '#000000';

    switch (obs.worldId) {
      case 'jungle':
        tStop0 = '#36180b'; tStop3 = '#5c2c16'; tStop5 = '#d84315'; tStop7 = '#271005'; tStop1 = '#150802';
        sideColor = '#150802';
        capColor = '#22c55e';
        strokeColor = '#1b110a';
        break;
      case 'ice':
        tStop0 = '#00363a'; tStop3 = '#006064'; tStop5 = '#00acc1'; tStop7 = '#001d20'; tStop1 = '#000a0b';
        sideColor = '#000a0b';
        capColor = '#e0f7fa';
        strokeColor = '#004d40';
        break;
      case 'desert':
        tStop0 = '#5d3e1d'; tStop3 = '#a76f35'; tStop5 = '#f5b041'; tStop7 = '#3e2813'; tStop1 = '#1f1307';
        sideColor = '#1f1307';
        capColor = '#ffc107';
        strokeColor = '#3e2723';
        break;
      case 'volcano':
        tStop0 = '#0d0e10'; tStop3 = '#1c1d21'; tStop5 = '#ff3d00'; tStop7 = '#08090a'; tStop1 = '#030404';
        sideColor = '#030404';
        capColor = '#ff3d00';
        strokeColor = '#ff1a00';
        break;
      case 'space':
        tStop0 = '#080321'; tStop3 = '#5b21b6'; tStop5 = '#8b5cf6'; tStop7 = '#06b6d4'; tStop1 = '#03001e';
        sideColor = '#03001e';
        capColor = '#ffd700';
        strokeColor = '#06b6d4';
        break;
      case 'underwater':
        tStop0 = '#001f3f'; tStop3 = '#0f3057'; tStop5 = '#008891'; tStop7 = '#001428'; tStop1 = '#000a14';
        sideColor = '#000a14';
        capColor = '#00ffd2';
        strokeColor = '#001e35';
        break;
      case 'heaven':
        tStop0 = '#bbdefb'; tStop3 = '#e3f2fd'; tStop5 = '#ffffff'; tStop7 = '#90caf9'; tStop1 = '#64b5f6';
        sideColor = '#64b5f6';
        capColor = '#ffd700';
        strokeColor = '#3f51b5';
        break;
      default:
        tStop0 = '#1b5e20'; tStop3 = '#4caf50'; tStop5 = '#81c784'; tStop7 = '#0f3813'; tStop1 = '#051807';
        sideColor = '#051807';
        capColor = '#ffd700';
        strokeColor = '#000000';
    }

    // 2. Trunk Gradients
    const topTrunkGrad = ctx.createLinearGradient(rx, 0, rx + rw - depth, 0);
    topTrunkGrad.addColorStop(0, tStop0);
    topTrunkGrad.addColorStop(0.3, tStop3);
    topTrunkGrad.addColorStop(0.5, tStop5);
    topTrunkGrad.addColorStop(0.8, tStop7);
    topTrunkGrad.addColorStop(1, tStop1);

    const botTrunkGrad = ctx.createLinearGradient(rx, 0, rx + rw - depth, 0);
    botTrunkGrad.addColorStop(0, tStop0);
    botTrunkGrad.addColorStop(0.3, tStop3);
    botTrunkGrad.addColorStop(0.5, tStop5);
    botTrunkGrad.addColorStop(0.8, tStop7);
    botTrunkGrad.addColorStop(1, tStop1);

    // Helper to draw 3D extruded side
    const drawExtrusionSide = (x1: number, y1: number, x2: number, y2: number, wExt: number, hExt: number) => {
      ctx.fillStyle = sideColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + wExt, y1 + hExt);
      ctx.lineTo(x2 + wExt, y2 + hExt);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    // Helper to draw 3D cap surface
    const drawCapSurface = (x: number, y: number, w: number, d: number) => {
      ctx.fillStyle = capColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w + d, y + d);
      ctx.lineTo(x + d, y + d);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    // ==========================================
    // 3. DRAW TOP PILLAR (spans -1000 to rTop)
    // ==========================================
    ctx.save();
    // A. Main Front Trunk
    ctx.fillStyle = topTrunkGrad;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.fillRect(rx, -1000, rw - depth, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw - depth, rTop + 1000);

    // B. Right Side Extrusion (from y=-1000 to y=rTop)
    drawExtrusionSide(rx + rw - depth, -1000, rx + rw - depth, rTop, depth, depth);

    // C. 3D Edge / Surface Cap (Collar Lip) at the gap surface
    const capY1 = rTop - collarH;
    
    // Front Collar Cap
    ctx.fillStyle = capColor;
    ctx.fillRect(rx, capY1, rw - depth, collarH);
    ctx.strokeRect(rx, capY1, rw - depth, collarH);

    // Right Collar Cap Extrusion
    drawExtrusionSide(rx + rw - depth, capY1, rx + rw - depth, rTop, depth, depth);

    // Bottom Cap Surface facing the gap
    drawCapSurface(rx, rTop, rw - depth, depth);
    ctx.restore();

    // ==========================================
    // 4. DRAW BOTTOM PILLAR (spans height-rBottom to height+1000)
    // ==========================================
    ctx.save();
    const botY = height - rBottom;

    // A. Main Front Trunk (Starts below Cap and Collar)
    ctx.fillStyle = botTrunkGrad;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.fillRect(rx, botY + depth + collarH, rw - depth, rBottom + 1000 - depth - collarH);
    ctx.strokeRect(rx, botY + depth + collarH, rw - depth, rBottom + 1000 - depth - collarH);

    // B. Right Side Extrusion (from y=botY+depth+collarH to y=height+1000)
    drawExtrusionSide(rx + rw - depth, botY + depth + collarH, rx + rw - depth, height + 1000, depth, depth);

    // C. 3D Edge / Surface Cap (Collar Lip & Cap Surface)
    // Top Cap Surface facing the gap
    drawCapSurface(rx, botY, rw - depth, depth);

    // Front Collar Cap (sits directly below Cap Surface)
    ctx.fillStyle = capColor;
    ctx.fillRect(rx, botY + depth, rw - depth, collarH);
    ctx.strokeRect(rx, botY + depth, rw - depth, collarH);

    // Right Collar Cap Extrusion
    drawExtrusionSide(rx + rw - depth, botY + depth, rx + rw - depth, botY + depth + collarH, depth, depth);
    // Blinking donut — heaven world only
    if (obs.worldId === 'heaven') {
      const timeVal = (window as any).gameEngine ? (window as any).gameEngine.weatherTime : Date.now() * 0.001;
      const blink = Math.abs(Math.sin(timeVal * 3.5));
      const pulse = 0.5 + 0.5 * Math.sin(timeVal * 5.0);

      const hue = (timeVal * 80) % 360;
      const donutColor = `hsl(${hue}, 100%, 65%)`;
      const donutGlowColor = `hsla(${hue}, 100%, 70%, ${0.3 + pulse * 0.5})`;

      const drawDonut = (cx: number, cy: number) => {
        ctx.save();
        const outerR = Math.min(rw * 0.22, 14);
        const innerR = outerR * 0.45;

        if (!(window as any).gameDisableShadows) {
          ctx.shadowBlur = 12 + pulse * 8;
          ctx.shadowColor = donutColor;
        }
        ctx.globalAlpha = 0.55 + blink * 0.45;

        ctx.fillStyle = donutGlowColor;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 0.7 + blink * 0.3;
        ctx.strokeStyle = donutColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR - 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, innerR + 1, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      };

      const capCenterX = rx + (rw - depth) / 2;
      drawDonut(capCenterX, rTop + depth / 2);
      drawDonut(capCenterX, height - rBottom + depth / 2);
    }
    ctx.restore();
  }

  // Visual Pillar Painters
  private drawDefaultPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredDefaultPillars(ctx, obs, height);
      return;
    }

    let stop0 = '#0a230a', stop3 = '#276227', stop5 = '#73e673', stop7 = '#1b4d1b', stop1 = '#051205'; // Style 1: Emerald Green
    let borderCol = '#0e240e', lineWidth = 3;
    let capStop0 = '#123512', capStop3 = '#3ca63c', capStop5 = '#a3ffa3', capStop7 = '#267326', capStop1 = '#091c09'; // Style 1 Caps: Green
    let capBorderCol = '#061406', rivetCol = '#ffd700', rivetGlow = true; // gold rivets

    if (styleIdx === 1) {
      // Style 2: Cobalt Sapphire Metallic Blue
      stop0 = '#0b132b'; stop3 = '#1c2541'; stop5 = '#5bc0be'; stop7 = '#3a506b'; stop1 = '#0b132b';
      borderCol = '#1e293b'; lineWidth = 3.5;
      capStop0 = '#1e293b'; capStop3 = '#475569'; capStop5 = '#94a3b8'; capStop7 = '#334155'; capStop1 = '#0f172a'; // Chrome silver caps
      capBorderCol = '#0f172a'; rivetCol = '#ffffff'; rivetGlow = false; // silver rivets
    } else if (styleIdx === 3) {
      // Style 4: Solar Flare Golden Orange
      stop0 = '#431407'; stop3 = '#7c2d12'; stop5 = '#ea580c'; stop7 = '#9a3412'; stop1 = '#270e04';
      borderCol = '#431407'; lineWidth = 3.5;
      capStop0 = '#451a03'; capStop3 = '#b45309'; capStop5 = '#fef08a'; capStop7 = '#d97706'; capStop1 = '#1a0500'; // Dark copper-gold caps
      capBorderCol = '#1a0500'; rivetCol = '#ff4500'; rivetGlow = true; // solar orange rivets
    }

    // Cylindrical gradient body
    const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    bodyGrad.addColorStop(0, stop0);
    bodyGrad.addColorStop(0.3, stop3);
    bodyGrad.addColorStop(0.5, stop5);
    bodyGrad.addColorStop(0.7, stop7);
    bodyGrad.addColorStop(1, stop1);
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = lineWidth;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Decorative Flanged Rims/Caps
    const capY1 = rTop - 22;
    const capY2 = height - rBottom;

    const capGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
    capGrad.addColorStop(0, capStop0);
    capGrad.addColorStop(0.3, capStop3);
    capGrad.addColorStop(0.5, capStop5);
    capGrad.addColorStop(0.8, capStop7);
    capGrad.addColorStop(1, capStop1);

    ctx.fillStyle = capGrad;
    ctx.strokeStyle = capBorderCol;
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 6, capY1, rw + 12, 22);
    ctx.strokeRect(rx - 6, capY1, rw + 12, 22);
    ctx.fillRect(rx - 6, capY2, rw + 12, 22);
    ctx.strokeRect(rx - 6, capY2, rw + 12, 22);

    // Dynamic but optimized rivets
    ctx.fillStyle = rivetCol;
    if (rivetGlow && !(window as any).gameDisableShadows) {
      ctx.shadowBlur = 4;
      ctx.shadowColor = rivetCol;
    }
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

  private drawRetroPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredRetroPillars(ctx, obs, height);
      return;
    }

    let stop0 = '#1b5e20', stop3 = '#73c93e', stop5 = '#a3e635', stop7 = '#387c12', stop1 = '#0f3204'; // Style 1: Retro Green
    let capStop0 = '#b45309', capStop5 = '#fef08a', capStop1 = '#b45309'; // Style 1 Cap: Gold stepped
    let borderCol = '#000000', capBorder = '#000000';
    const isPerf = (window as any).gameDisableShadows;
    let bulbColor = isPerf ? '#ef4444' : (Math.sin((obs.x || 0) * 0.15) > 0 ? '#ef4444' : '#eab308'); // red/yellow pixel bulbs

    if (styleIdx === 1) {
      // Style 2: Cyber Blue/Cyan 8-Bit
      stop0 = '#082f49'; stop3 = '#0284c7'; stop5 = '#38bdf8'; stop7 = '#0369a1'; stop1 = '#0c4a6e';
      capStop0 = '#0c4a6e'; capStop5 = '#ffffff'; capStop1 = '#0369a1';
      borderCol = '#020617'; capBorder = '#020617';
      bulbColor = isPerf ? '#00f3ff' : (Math.sin((obs.x || 0) * 0.15) > 0 ? '#00f3ff' : '#06b6d4');
    } else if (styleIdx === 3) {
      // Style 4: Vaporwave Pink/Purple Grid
      stop0 = '#3b0764'; stop3 = '#a21caf'; stop5 = '#f0abfc'; stop7 = '#86198f'; stop1 = '#300a24';
      capStop0 = '#06b6d4'; capStop5 = '#ffffff'; capStop1 = '#0891b2'; // cyan caps
      borderCol = '#db2777'; capBorder = '#020617';
      bulbColor = isPerf ? '#ff007f' : (Math.sin((obs.x || 0) * 0.12) > 0 ? '#ff007f' : '#00f3ff');
    }

    const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    bodyGrad.addColorStop(0, stop0);
    bodyGrad.addColorStop(0.3, stop3);
    bodyGrad.addColorStop(0.5, stop5);
    bodyGrad.addColorStop(0.8, stop7);
    bodyGrad.addColorStop(1, stop1);

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = 3.5;

    // Top column
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    // Bottom column
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Retro brick grid lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.33, -1000);
    ctx.lineTo(rx + rw * 0.33, rTop - 24);
    ctx.moveTo(rx + rw * 0.66, -1000);
    ctx.lineTo(rx + rw * 0.66, rTop - 24);
    ctx.moveTo(rx + rw * 0.33, height - rBottom + 24);
    ctx.lineTo(rx + rw * 0.33, height + 1000);
    ctx.moveTo(rx + rw * 0.66, height - rBottom + 24);
    ctx.lineTo(rx + rw * 0.66, height + 1000);

    for (let y = rTop - 120; y < rTop - 24; y += 30) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    for (let y = height - rBottom + 24; y < height - rBottom + 120; y += 30) {
      ctx.moveTo(rx, y);
      ctx.lineTo(rx + rw, y);
    }
    ctx.stroke();

    // Stepped Golden/Arcade Cap
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const capGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
    capGrad.addColorStop(0, capStop0);
    capGrad.addColorStop(0.5, capStop5);
    capGrad.addColorStop(1, capStop1);

    ctx.fillStyle = capGrad;
    ctx.strokeStyle = capBorder;
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 6, capY1, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
    ctx.fillRect(rx - 6, capY2, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

    // Flashing pixel bulbs
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

  private drawJunglePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredJunglePillars(ctx, obs, height);
      return;
    }

    let stop0 = '#362215', stop3 = '#573d27', stop5 = '#ea580c', stop7 = '#3d2514', stop1 = '#231208'; // Style 0: Bark Brown
    let ringStop0 = '#4e3629', ringStop5 = '#d97706', ringStop1 = '#2d1c14'; // Bronze cuff
    let leafColor = '#22c55e', flowerColor = '', flowerCore = '';

    if (styleIdx === 1) {
      // Style 1: Golden Teak
      stop0 = '#45290a'; stop3 = '#8c5213'; stop5 = '#f59e0b'; stop7 = '#783d06'; stop1 = '#2e1702';
      ringStop0 = '#064e3b'; ringStop5 = '#10b981'; ringStop1 = '#022c22'; // Emerald cuff
      leafColor = '#34d399'; flowerColor = '#fbbf24'; flowerCore = '#ffffff'; // Amber flowers
    } else if (styleIdx === 3) {
      // Style 3: Dark Redwood
      stop0 = '#3b0712'; stop3 = '#881337'; stop5 = '#fb7185'; stop7 = '#4c0519'; stop1 = '#27030c';
      ringStop0 = '#2e1065'; ringStop5 = '#7c3aed'; ringStop1 = '#1e1b4b'; // Mystical violet cuff
      leafColor = '#8b5cf6'; flowerColor = '#ff4081'; flowerCore = '#ffd700'; // Pink flowers
    }

    // Cylindrical wood bark gradient
    const barkGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    barkGrad.addColorStop(0, stop0);
    barkGrad.addColorStop(0.3, stop3);
    barkGrad.addColorStop(0.5, stop5);
    barkGrad.addColorStop(0.8, stop7);
    barkGrad.addColorStop(1, stop1);
    ctx.fillStyle = barkGrad;

    // Draw wood trunks
    this.drawStoneColumn(ctx, rx, -1000, rw, rTop + 1000);
    this.drawStoneColumn(ctx, rx, height - rBottom, rw, rBottom + 1000);

    // Collar Lips
    const capY1 = rTop - 22;
    const capY2 = height - rBottom;

    const ringGrad = ctx.createLinearGradient(rx - 4, 0, rx + rw + 4, 0);
    ringGrad.addColorStop(0, ringStop0);
    ringGrad.addColorStop(0.5, ringStop5);
    ringGrad.addColorStop(1, ringStop1);
    ctx.fillStyle = ringGrad;
    ctx.strokeStyle = '#1b110a';
    ctx.lineWidth = 3.0;

    ctx.fillRect(rx - 4, capY1, rw + 8, 22);
    ctx.strokeRect(rx - 4, capY1, rw + 8, 22);
    ctx.fillRect(rx - 4, capY2, rw + 8, 22);
    ctx.strokeRect(rx - 4, capY2, rw + 8, 22);

    // Leaves / ivy
    ctx.fillStyle = leafColor;
    ctx.beginPath();
    ctx.ellipse(rx + 14, capY1 + 28, 8, 5, Math.PI / 4, 0, Math.PI * 2);
    ctx.ellipse(rx + rw - 14, capY2 - 6, 8, 5, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Flowers if styled
    if (flowerColor) {
      ctx.fillStyle = flowerColor;
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY1 + 11, 5, 0, Math.PI * 2);
      ctx.arc(rx + rw / 2, capY2 + 11, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flowerCore;
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY1 + 11, 2, 0, Math.PI * 2);
      ctx.arc(rx + rw / 2, capY2 + 11, 2, 0, Math.PI * 2);
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

  private drawIcePillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredIcePillars(ctx, obs, height);
      return;
    }

    let stop0 = '#0891b2', stop3 = '#e0f7fa', stop5 = '#0e7490', stop7 = '#0e7490', stop1 = '#164e63'; // Style 0: Aqua Ice
    let capGrad0 = '#e0f2fe', capGrad5 = '#ffffff', capGrad1 = '#bae6fd';
    let outlineCol = 'rgba(255, 255, 255, 0.9)';
    let icicleColor = '#ffffff';

    if (styleIdx === 1) {
      // Style 1: Frozen Sapphire
      stop0 = '#1e3a8a'; stop3 = '#3b82f6'; stop5 = '#93c5fd'; stop7 = '#1d4ed8'; stop1 = '#172554';
      capGrad0 = '#1d4ed8'; capGrad5 = '#93c5fd'; capGrad1 = '#172554';
      outlineCol = '#0f172a'; // Dark solid border like other obstacles
      icicleColor = '#93c5fd';
    } else if (styleIdx === 3) {
      // Style 3: Amethyst Purple
      stop0 = '#3b0764'; stop3 = '#701a75'; stop5 = '#f0abfc'; stop7 = '#4a044e'; stop1 = '#2e0134';
      capGrad0 = '#4a044e'; capGrad5 = '#f0abfc'; capGrad1 = '#2e0134';
      outlineCol = 'rgba(240, 171, 252, 0.9)';
      icicleColor = '#f0abfc';
    }

    const iceGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    iceGrad.addColorStop(0, stop0);
    iceGrad.addColorStop(0.3, stop3);
    iceGrad.addColorStop(0.5, stop5);
    iceGrad.addColorStop(0.7, stop7);
    iceGrad.addColorStop(1, stop1);

    ctx.fillStyle = iceGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 2.5;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Frosty icicle snow caps
    const capY1 = rTop - 22;
    const capY2 = height - rBottom;

    const snowGrad = ctx.createLinearGradient(rx - 5, 0, rx + rw + 5, 0);
    snowGrad.addColorStop(0, capGrad0);
    snowGrad.addColorStop(0.5, capGrad5);
    snowGrad.addColorStop(1, capGrad1);
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
    ctx.fillStyle = icicleColor;
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

  private drawDesertPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredDesertPillars(ctx, obs, height);
      return;
    }

    let stop0 = '#5c401c', stop3 = '#8e6d3c', stop5 = '#ab8e60', stop7 = '#70542b', stop1 = '#3e2c14'; // Style 0: Terracotta
    let capGrad0 = '#78350f', capGrad5 = '#ffd700', capGrad1 = '#78350f';
    let outlineCol = '#3e2c14';
    let rippleColor = 'rgba(62, 44, 20, 0.4)';
    let rubyColor = '#ef4444';

    if (styleIdx === 1) {
      // Style 1: Golden Egyptian
      stop0 = '#78350f'; stop3 = '#eab308'; stop5 = '#fef08a'; stop7 = '#d97706'; stop1 = '#451a03';
      capGrad0 = '#1e3a8a'; capGrad5 = '#60a5fa'; capGrad1 = '#1d4ed8'; // blue lapis caps
      outlineCol = '#1e3a8a';
      rippleColor = 'rgba(30, 64, 175, 0.45)'; // Lapis blue ripples
      rubyColor = '#facc15'; // yellow sun disk
    } else if (styleIdx === 3) {
      // Style 3: White Limestone
      stop0 = '#cbd5e1'; stop3 = '#f1f5f9'; stop5 = '#ffffff'; stop7 = '#cbd5e1'; stop1 = '#94a3b8';
      capGrad0 = '#78350f'; capGrad5 = '#ffd700'; capGrad1 = '#78350f';
      outlineCol = '#475569';
      rippleColor = 'rgba(234, 179, 8, 0.35)'; // golden ripples hieroglyphics
      rubyColor = '#10b981'; // emerald green gem
    }

    const sandGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    sandGrad.addColorStop(0, stop0);
    sandGrad.addColorStop(0.3, stop3);
    sandGrad.addColorStop(0.5, stop5);
    sandGrad.addColorStop(0.8, stop7);
    sandGrad.addColorStop(1, stop1);

    ctx.fillStyle = sandGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 2.0;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Dune ripple contour grooves
    ctx.strokeStyle = rippleColor;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    for (let y = rTop - 120; y < rTop - 24; y += 35) {
      ctx.arc(rx + rw / 2, y, rw * 0.4, 0, Math.PI, false);
    }
    for (let y = height - rBottom + 24; y < height - rBottom + 120; y += 35) {
      ctx.arc(rx + rw / 2, y, rw * 0.4, 0, Math.PI, false);
    }
    ctx.stroke();

    // Sandstone fluted capitols
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const capGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
    capGrad.addColorStop(0, capGrad0);
    capGrad.addColorStop(0.5, capGrad5);
    capGrad.addColorStop(1, capGrad1);

    ctx.fillStyle = capGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 3.0;

    ctx.fillRect(rx - 6, capY1, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
    ctx.fillRect(rx - 6, capY2, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

    // Embedded jewel center
    ctx.fillStyle = rubyColor;
    ctx.beginPath();
    ctx.arc(rx + rw / 2, capY1 + 12, 5, 0, Math.PI * 2);
    ctx.arc(rx + rw / 2, capY2 + 12, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawVolcanoPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredVolcanoPillars(ctx, obs, height);
      return;
    }

    let stop0 = '#0c0505', stop3 = '#381108', stop5 = '#140606', stop7 = '#140606', stop1 = '#050101'; // Style 0: Basalt Lava
    let capGrad0 = '#1e293b', capGrad5 = '#ea580c', capGrad1 = '#0f172a'; // iron cap with lava
    let outlineCol = '#ff3c00';
    let crackColor = '#f97316';

    if (styleIdx === 1) {
      // Style 1: Electric Blue Basalt
      stop0 = '#050814'; stop3 = '#111827'; stop5 = '#0f172a'; stop7 = '#020617'; stop1 = '#020617';
      capGrad0 = '#0f172a'; capGrad5 = '#00f3ff'; capGrad1 = '#020617';
      outlineCol = '#00f3ff';
      crackColor = '#38bdf8';
    } else if (styleIdx === 3) {
      // Style 3: Radioactive Green Basalt
      stop0 = '#020804'; stop3 = '#061c0d'; stop5 = '#022c22'; stop7 = '#020617'; stop1 = '#020617';
      capGrad0 = '#020617'; capGrad5 = '#39ff14'; capGrad1 = '#020617';
      outlineCol = '#39ff14';
      crackColor = '#22c55e';
    }

    const bodyGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    bodyGrad.addColorStop(0, stop0);
    bodyGrad.addColorStop(0.3, stop3);
    bodyGrad.addColorStop(0.5, stop5);
    bodyGrad.addColorStop(0.7, stop7);
    bodyGrad.addColorStop(1, stop1);

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 3.0;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Magma crack lines
    ctx.strokeStyle = crackColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(rx + rw * 0.25, 0);
    ctx.lineTo(rx + rw * 0.4, rTop * 0.75);
    ctx.moveTo(rx + rw * 0.75, height - rBottom);
    ctx.lineTo(rx + rw * 0.6, height - rBottom + 70);
    ctx.stroke();

    // Heavy iron-alloy heat-sink caps
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const ironCapGrad = ctx.createLinearGradient(rx - 5, 0, rx + rw + 5, 0);
    ironCapGrad.addColorStop(0, capGrad0);
    ironCapGrad.addColorStop(0.5, capGrad5);
    ironCapGrad.addColorStop(1, capGrad1);
    ctx.fillStyle = ironCapGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 5, capY1, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY1, rw + 10, 24);
    ctx.fillRect(rx - 5, capY2, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY2, rw + 10, 24);
  }

  private drawSpaceObstacles(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredSpaceObstacles(ctx, obs, height);
      return;
    }

    let stop0 = '#080321', stop3 = '#5b21b6', stop5 = '#8b5cf6', stop7 = '#06b6d4', stop1 = '#03001e'; // Style 0: Cosmic Violet & Neon Cyan
    let capGrad0 = '#06b6d4', capGrad5 = '#c084fc', capGrad1 = '#080321';
    let outlineCol = '#06b6d4';
    let beaconCol1 = '#06b6d4', beaconCol2 = '#8b5cf6';

    if (styleIdx === 1) {
      // Style 1: Premium Dark Red & Crimson (Score 100-200)
      stop0 = '#1a0005'; stop3 = '#7f1d1d'; stop5 = '#ef4444'; stop7 = '#991b1b'; stop1 = '#4c0519';
      capGrad0 = '#991b1b'; capGrad5 = '#ffd700'; capGrad1 = '#4c0519';
      outlineCol = '#ffd700';
      beaconCol1 = '#ef4444'; beaconCol2 = '#ffd700';
    } else if (styleIdx === 3) {
      // Style 3: Premium Dark Blue & Sapphire (Score 200-350)
      stop0 = '#030712'; stop3 = '#1d4ed8'; stop5 = '#3b82f6'; stop7 = '#1e3a8a'; stop1 = '#020617';
      capGrad0 = '#cbd5e1'; capGrad5 = '#f8fafc'; capGrad1 = '#1d4ed8';
      outlineCol = '#3b82f6';
      beaconCol1 = '#3b82f6'; beaconCol2 = '#ffffff';
    }

    ctx.save();

    // 1. Draw Semi-Transparent Holographic Pillar Fills
    const spaceGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    spaceGrad.addColorStop(0, stop0);
    spaceGrad.addColorStop(0.3, stop3);
    spaceGrad.addColorStop(0.5, stop5);
    spaceGrad.addColorStop(0.8, stop7);
    spaceGrad.addColorStop(1, stop1);

    ctx.fillStyle = spaceGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 2.5;

    // Fill with transparency
    ctx.globalAlpha = 0.72;
    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);

    // Stroke with higher opacity
    ctx.globalAlpha = 0.9;
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // 2. Draw Dynamic Holographic Effects (Clipping inside the pillars)
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, 0, rw, rTop);
    ctx.rect(rx, height - rBottom, rw, rBottom);
    ctx.clip();

    // A. Scrolling Horizontal Scanlines
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 1.5;
    const scanlineSpacing = 16;
    const timeVal = (window as any).gameEngine ? (window as any).gameEngine.weatherTime : Date.now() * 0.001;
    const scrollOffset = (obs.x * 0.15 - timeVal * 45) % scanlineSpacing;
    
    ctx.globalAlpha = 0.22;
    for (let y = 0; y < height; y += scanlineSpacing) {
      const currY = y + scrollOffset;
      ctx.beginPath();
      ctx.moveTo(rx, currY);
      ctx.lineTo(rx + rw, currY);
      ctx.stroke();
    }

    // B. Bright Rising/Falling Energy Pulse Line
    const pulseY = (timeVal * 110) % height;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55;
    
    const isPerfSpace = (window as any).gameDisableShadows;
    if (!isPerfSpace) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = outlineCol;
    }
    ctx.beginPath();
    ctx.moveTo(rx, pulseY);
    ctx.lineTo(rx + rw, pulseY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore(); // end of clipping

    // 3. High-tech cap pylons
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const chromeGrad = ctx.createLinearGradient(rx - 6, 0, rx + rw + 6, 0);
    chromeGrad.addColorStop(0, capGrad0);
    chromeGrad.addColorStop(0.5, capGrad5);
    chromeGrad.addColorStop(1, capGrad1);
    ctx.fillStyle = chromeGrad;
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 3.5;

    ctx.globalAlpha = 0.85;
    ctx.fillRect(rx - 6, capY1, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY1, rw + 12, 24);
    ctx.fillRect(rx - 6, capY2, rw + 12, 24);
    ctx.strokeRect(rx - 6, capY2, rw + 12, 24);

    // 4. Flashing beacons
    const beaconColor = isPerfSpace ? beaconCol1 : (Math.sin((obs.x || 0) * 0.15) > 0 ? beaconCol1 : beaconCol2);
    ctx.fillStyle = beaconColor;
    ctx.globalAlpha = 1.0;
    if (!isPerfSpace) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = beaconColor;
    }
    ctx.beginPath();
    ctx.arc(rx + rw / 2, capY1 + 12, 3.5, 0, Math.PI * 2);
    ctx.arc(rx + rw / 2, capY2 + 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore(); // restore all
  }

  private drawUnderwaterPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredUnderwaterPillars(ctx, obs, height);
      return;
    }

    let stop0 = '#001a14', stop3 = '#004d40', stop5 = '#0d9488', stop7 = '#0d5c52', stop1 = '#000f0b'; // Style 0: Marine Moss
    let capGrad0 = '#a16207', capGrad5 = '#fef08a', capGrad1 = '#854d0e'; // pearl crusted gold
    let outlineCol = '#0f766e';
    let seaweedCol = 'rgba(13, 148, 136, 0.28)';
    let pearlColor = '#f472b6';

    if (styleIdx === 1) {
      // Style 1: Coral Pink Reef
      stop0 = '#500724'; stop3 = '#9d174d'; stop5 = '#f43f5e'; stop7 = '#be185d'; stop1 = '#25010f';
      capGrad0 = '#0d9488'; capGrad5 = '#fef08a'; capGrad1 = '#0f766e';
      outlineCol = '#be185d';
      seaweedCol = 'rgba(244, 63, 94, 0.28)';
      pearlColor = '#e0f2fe'; // white pearl
    } else if (styleIdx === 3) {
      // Style 3: Abyssal Navy
      stop0 = '#020617'; stop3 = '#0f172a'; stop5 = '#1e293b'; stop7 = '#0f172a'; stop1 = '#020617';
      capGrad0 = '#020617'; capGrad5 = '#facc15'; capGrad1 = '#020617'; // black iron with glowing yellow
      outlineCol = '#1e293b';
      seaweedCol = 'rgba(250, 204, 21, 0.2)'; // glowing yellow algae
      pearlColor = '#facc15'; // yellow bioluminescent dots
    }

    const marineGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    marineGrad.addColorStop(0, stop0);
    marineGrad.addColorStop(0.3, stop3);
    marineGrad.addColorStop(0.5, stop5);
    marineGrad.addColorStop(0.8, stop7);
    marineGrad.addColorStop(1, stop1);

    ctx.fillStyle = marineGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 2.5;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Seaweed leaves drawing
    ctx.fillStyle = seaweedCol;
    ctx.beginPath();
    ctx.ellipse(rx + 16, rTop - 45, 10, 5, -Math.PI / 6, 0, Math.PI * 2);
    ctx.ellipse(rx + rw - 16, height - rBottom + 45, 10, 5, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    // pearl-crusted capitols
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const goldGrad = ctx.createLinearGradient(rx - 5, 0, rx + rw + 5, 0);
    goldGrad.addColorStop(0, capGrad0);
    goldGrad.addColorStop(0.5, capGrad5);
    goldGrad.addColorStop(1, capGrad1);
    ctx.fillStyle = goldGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 5, capY1, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY1, rw + 10, 24);
    ctx.fillRect(rx - 5, capY2, rw + 10, 24);
    ctx.strokeRect(rx - 5, capY2, rw + 10, 24);

    // Glowing pearls
    ctx.fillStyle = pearlColor;
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 4;
      ctx.shadowColor = pearlColor;
    }
    ctx.beginPath();
    ctx.arc(rx + 12, capY1 + 12, 3, 0, Math.PI * 2);
    ctx.arc(rx + rw - 12, capY1 + 12, 3, 0, Math.PI * 2);
    ctx.arc(rx + 12, capY2 + 12, 3, 0, Math.PI * 2);
    ctx.arc(rx + rw - 12, capY2 + 12, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawHeavenPillars(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number, styleIdx = 0) {
    const rx = obs.x;
    const rw = obs.width;
    const rTop = obs.topHeight;
    const rBottom = obs.bottomHeight;

    if (styleIdx === 2) {
      this.drawStructuredHeavenPillars(ctx, obs, height);
      return;
    }

    let stop0 = '#f1f5f9', stop3 = '#ffffff', stop5 = '#e0f2fe', stop7 = '#cbd5e1', stop1 = '#cbd5e1'; // Style 0: Baby blue sky veins
    let capGrad0 = '#ca8a04', capGrad5 = '#fef08a', capGrad1 = '#a16207'; // gold cap
    let outlineCol = '#ffd700';
    let fluteColor = 'rgba(253, 224, 71, 0.45)';
    let starColorVal = '#ffffff';

    if (styleIdx === 1) {
      // Style 1: Rose Quartz Pink
      stop0 = '#fdf2f8'; stop3 = '#fbcfe8'; stop5 = '#f472b6'; stop7 = '#db2777'; stop1 = '#9d174d';
      capGrad0 = '#ca8a04'; capGrad5 = '#fbcfe8'; capGrad1 = '#a16207'; // rose gold cap
      outlineCol = '#ff0000'; // Red border
      fluteColor = 'rgba(244, 114, 182, 0.45)';
      starColorVal = '#ffd700'; // yellow star
    } else if (styleIdx === 3) {
      // Style 3: Radiant Solid Gold
      stop0 = '#854d0e'; stop3 = '#eab308'; stop5 = '#fef08a'; stop7 = '#ca8a04'; stop1 = '#451a03';
      capGrad0 = '#f1f5f9'; capGrad5 = '#ffffff'; capGrad1 = '#cbd5e1'; // white platinum cap
      outlineCol = '#fef08a';
      fluteColor = 'rgba(255, 255, 255, 0.45)';
      starColorVal = '#ffffff'; // diamond star
    }

    const heavGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
    heavGrad.addColorStop(0, stop0);
    heavGrad.addColorStop(0.3, stop3);
    heavGrad.addColorStop(0.5, stop5);
    heavGrad.addColorStop(0.7, stop7);
    heavGrad.addColorStop(1, stop1);

    ctx.fillStyle = heavGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 3.0;

    ctx.fillRect(rx, -1000, rw, rTop + 1000);
    ctx.strokeRect(rx, -1000, rw, rTop + 1000);
    ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
    ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);

    // Fluted lines of Corinthian capitols
    ctx.strokeStyle = fluteColor;
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

    // capitols
    const capY1 = rTop - 24;
    const capY2 = height - rBottom;

    const goldGrad = ctx.createLinearGradient(rx - 8, 0, rx + rw + 8, 0);
    goldGrad.addColorStop(0, capGrad0);
    goldGrad.addColorStop(0.5, capGrad5);
    goldGrad.addColorStop(1, capGrad1);
    ctx.fillStyle = goldGrad;
    ctx.strokeStyle = outlineCol;
    ctx.lineWidth = 3.5;

    ctx.fillRect(rx - 8, capY1, rw + 16, 24);
    ctx.strokeRect(rx - 8, capY1, rw + 16, 24);
    ctx.fillRect(rx - 8, capY2, rw + 16, 24);
    ctx.strokeRect(rx - 8, capY2, rw + 16, 24);

    // Blinking halo star
    const isPerfHeaven = (window as any).gameDisableShadows;
    const starColor = isPerfHeaven ? starColorVal : (Math.sin((obs.x || 0) * 0.12) > 0 ? starColorVal : '#ffffff');
    ctx.fillStyle = starColor;
    if (!isPerfHeaven) {
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#ffd700';
    }
    ctx.beginPath();
    ctx.arc(rx + rw / 2, capY1 + 12, 4.5, 0, Math.PI * 2);
    ctx.arc(rx + rw / 2, capY2 + 12, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawDestructibleOverlay(ctx: CanvasRenderingContext2D, obs: Obstacle, height: number) {
    if (!obs.isDestructible || obs.isDestroyed) return;

    const topShift = obs.shakeX || 0;
    const bottomShift = obs.shakeX2 !== undefined ? obs.shakeX2 : (obs.shakeX || 0);

    const drawOverlayForColumn = (x: number, y: number, w: number, h: number) => {
      ctx.save();
      
      const gameEngine = (window as any).gameEngine;
      const isVolcano = gameEngine && gameEngine.progressManager && gameEngine.progressManager.getState().activeWorld === 'volcano';
      
      // Set up deep glowing shadow for 3D depth (reduced by 30% if not volcano)
      if (!(window as any).gameDisableShadows) {
        ctx.shadowColor = '#ff1a00';
        ctx.shadowBlur = isVolcano ? 8 : 5.6;
      }
      
      // Draw a pulsing crimson warning border (reduced by 30% in thickness and opacity if not volcano)
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.007);
      const borderThickness = isVolcano ? 3.9 : 2.7;
      const minOpacity = isVolcano ? 0.45 : 0.31;
      const maxOpacityOffset = isVolcano ? 0.55 : 0.38;
      
      ctx.strokeStyle = `rgba(255, 10, 0, ${minOpacity + pulse * maxOpacityOffset})`;
      ctx.lineWidth = borderThickness;
      
      ctx.beginPath();
      // Left vertical line
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      // Right vertical line
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      
      // Horizontal edge facing the gap
      if (y === 0) {
        // Top column: draw bottom horizontal cap
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
      } else {
        // Bottom column: draw top horizontal cap
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
      }
      ctx.stroke();
      
      // Draw cracks based on current HP (hp = 3, 2, 1) - reverted back to gray
      const hp = obs.hp || 3;
      if (hp === 3) {
        ctx.strokeStyle = 'rgba(210, 210, 210, 0.75)'; // Light gray
        ctx.lineWidth = 2.4;
      } else if (hp === 2) {
        ctx.strokeStyle = 'rgba(180, 180, 180, 0.85)'; // Medium gray
        ctx.lineWidth = 2.4;
      } else {
        ctx.strokeStyle = 'rgba(140, 140, 140, 0.95)'; // Dark steel gray
        ctx.lineWidth = 3.9;
      }
      
      ctx.beginPath();
      // Crack 1 (always present)
      ctx.moveTo(x + w * 0.2, y + h * 0.15);
      ctx.lineTo(x + w * 0.4, y + h * 0.45);
      ctx.lineTo(x + w * 0.25, y + h * 0.75);
      
      // Crack 2 (HP <= 2)
      if (hp <= 2) {
        ctx.moveTo(x + w * 0.8, y + h * 0.25);
        ctx.lineTo(x + w * 0.55, y + h * 0.55);
        ctx.lineTo(x + w * 0.7, y + h * 0.85);
      }
      
      // Crack 3 (HP <= 1)
      if (hp <= 1) {
        ctx.moveTo(x + w * 0.5, y + h * 0.05);
        ctx.lineTo(x + w * 0.35, y + h * 0.5);
        ctx.lineTo(x + w * 0.6, y + h * 0.95);
      }
      ctx.stroke();
      
      ctx.restore();
    };

    // Draw top column overlay
    drawOverlayForColumn(obs.x + topShift, 0, obs.width, obs.topHeight);
    
    // Draw bottom column overlay
    drawOverlayForColumn(obs.x + bottomShift, height - obs.bottomHeight, obs.width, obs.bottomHeight);
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
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = '#15062b';
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2.5;
      ctx.fillRect(rx, -1000, rw, rTop + 1000);
      ctx.strokeRect(rx, -1000, rw, rTop + 1000);
      ctx.fillRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.strokeRect(rx, height - rBottom, rw, rBottom + 1000);
      ctx.restore();
      return;
    }

    ctx.save();

    const drawSpaceBlock = (yStart: number, h: number, _isTop: boolean) => {
      // Dark stellar carbon-alloy panel hybrid space gradient
      const carbonGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      carbonGrad.addColorStop(0, '#080321'); // Space dark violet
      carbonGrad.addColorStop(0.4, '#8b5cf6'); // Purple nebula
      carbonGrad.addColorStop(0.7, '#06b6d4'); // Cyan highlight
      carbonGrad.addColorStop(1, '#03001e');
      
      // Fill with transparency
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = carbonGrad;
      ctx.fillRect(rx, yStart, rw, h);
      ctx.restore();

      // Stroke with higher opacity
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#06b6d4'; // Cyan border
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx, yStart, rw, h);
      ctx.restore();

      // Pulsing stellar core (quantum warp-gate)
      ctx.save();
      ctx.globalAlpha = 0.55;
      const coreGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      coreGrad.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
      coreGrad.addColorStop(0.5, 'rgba(6, 182, 212, 0.4)'); // glowing cyan core
      coreGrad.addColorStop(1, 'rgba(139, 92, 246, 0.15)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(rx + rw * 0.35, yStart, rw * 0.3, h);
      ctx.restore();

      // Constellation vectors (glowing starry geometric patterns)
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#e0f2fe'; // star white
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx + 10, yStart + 40);
      ctx.lineTo(rx + rw * 0.5, yStart + 80);
      ctx.lineTo(rx + rw - 10, yStart + 40);
      ctx.stroke();
      ctx.restore();

      // Twinkling warp ring cap at safe boundaries (attractive futuristic design)
      const capY = _isTop ? yStart + h - 22 : yStart;
      const portalGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      portalGrad.addColorStop(0, '#06b6d4'); // Cyan
      portalGrad.addColorStop(0.5, '#ffffff'); // star bright core
      portalGrad.addColorStop(1, '#701a75'); // Purple
      
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = portalGrad;
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.fillRect(rx - 6, capY, rw + 12, 22);
      ctx.strokeRect(rx - 6, capY, rw + 12, 22);
      ctx.restore();

      // Orbiting cosmic star
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(rx + rw / 2, capY + 11, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    drawSpaceBlock(-1000, rTop + 1000, true);
    drawSpaceBlock(height - rBottom, rBottom + 1000, false);

    // 2. Draw Dynamic Holographic Effects (Clipping inside the pillars)
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, 0, rw, rTop);
    ctx.rect(rx, height - rBottom, rw, rBottom);
    ctx.clip();

    // A. Scrolling Horizontal Scanlines
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5;
    const scanlineSpacing = 16;
    const timeVal = (window as any).gameEngine ? (window as any).gameEngine.weatherTime : Date.now() * 0.001;
    const scrollOffset = (obs.x * 0.15 - timeVal * 45) % scanlineSpacing;
    
    ctx.globalAlpha = 0.22;
    for (let y = 0; y < height; y += scanlineSpacing) {
      const currY = y + scrollOffset;
      ctx.beginPath();
      ctx.moveTo(rx, currY);
      ctx.lineTo(rx + rw, currY);
      ctx.stroke();
    }

    // B. Bright Rising/Falling Energy Pulse Line
    const pulseY = (timeVal * 110) % height;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.55;
    
    if (!isPerformance) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#06b6d4';
    }
    ctx.beginPath();
    ctx.moveTo(rx, pulseY);
    ctx.lineTo(rx + rw, pulseY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.restore(); // end of clipping

    ctx.restore(); // restore all
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




}
