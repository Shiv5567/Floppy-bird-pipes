import { SoundManager } from './SoundManager.ts';
import { ParticleEngine } from './ParticleEngine.ts';
import { Renderer } from './Renderer.ts';
import { ProgressManager } from '../systems/ProgressManager.ts';
import { Bird } from '../entities/Bird.ts';
import { ObstacleManager } from '../entities/ObstacleManager.ts';
import { PowerupManager } from '../entities/PowerupManager.ts';
import { BossManager } from '../entities/BossManager.ts';
import { LevelManager } from '../systems/LevelManager.ts';
import type { LevelConfig } from '../systems/LevelManager.ts';

export type GameState = 'PRELOADING' | 'MENU' | 'PLAYING' | 'PAUSED' | 'BOSS_WARNING' | 'BOSS_FIGHT' | 'GAMEOVER' | 'PHOTO_MODE' | 'REVIVE_CHOICE' | 'DEMO_COMPLETE';

export interface ActivePowerup {
  type: string;
  durationLeft: number;
  maxDuration: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isRocket?: boolean;
}

export class GameEngine {
  public state: GameState = 'MENU';
  public firstTapDone = false;
  public hasRevivedThisRun = false;
  public revivesUsedThisRun = 0;
  public reviveCountdown = 5.0;
  public reviveCardVisible = false;
  private preReviveState: GameState = 'PLAYING';
  public waitingForDoubleTapAfterRevive = false;
  public reviveFloatY = 300;
  
  // Level Mode systems
  public gameMode: 'endless' | 'level' | 'flock' | 'chaos' = 'endless';
  public currentLevelNum = 1;
  public activeLevelConfig: LevelConfig | null = null;
  public shieldBrokenThisRun = false;
  
  // Ultimate Skill state variables (Visual Upgrade Option 2)
  public ultimateEnergy = 0; // 0 to 100
  public ultimateActive = false;
  public ultimateDurationLeft = 0;
  public ultimateMaxDuration = 6.0;
  private preUltimateFlockLength = 0;

  // Chaos Mode state variables
  public gravityFlipped = false;
  public weaponActive = false;
  public weaponLevel = 0;
  public weaponTimer = 0.0;
  public lastShotTimer = 0.0;
  public bullets: Bullet[] = [];
  public weaponType: 'bullet' | 'laser' | 'rocket' | 'blade' = 'bullet';
  public bladeRotation = 0;

  // Chaos Events state variables
  public activeChaosEvent: 'none' | 'gravity' | 'mirror' | 'earthquake' = 'none';
  public chaosEventTimer = 0.0;
  public chaosEventCycleTimer = 12.0; // Trigger every 12 seconds
  public chaosEventAnnounceTimer = 0.0; // Show warning banner
  public chaosObstaclesPassed = 0;
  public destroyedPipesCount = 0;
  
  // High-performance engines references
  public soundManager: SoundManager;
  public particleEngine: ParticleEngine;
  public renderer: Renderer;
  public progressManager: ProgressManager;

  // Entities
  public bird: Bird;
  public flock: Bird[] = [];

  // Flock Evolution (Rescue Mode)
  public evolvedBirdTier: number = 0;        // 0=none, 1–3=evolution level
  public rescuedBirdsTotal: number = 0;      // total cages rescued this run
  public mergeReadyCount: number = 0;        // birds in flock available to merge
  private rescueMilestoneNext: number = 5;   // next milestone checkpoint
  // expose read-only for UIManager
  public get nextRescueMilestone(): number { return this.rescueMilestoneNext; }
  public get weatherTime(): number { return this.renderer.weatherTime; }

  // Active Skill Evolution System
  public activeSkillUnlocked: string | null = null; // 'shield' | 'slowmo' | 'booster' | null
  public activeSkillCooldown: number = 0;           // current cooldown in seconds
  public activeSkillMaxCooldown: number = 0;        // max cooldown

  // Auto-Hyper Boost: fires every 6 birds joined across all flock modes
  public birdsJoinedThisRun = 0;
  public nextBossScore = 100;
  public playerBossHP = 0;
  public maxPlayerBossHP = 0;
  public obstacleManager: ObstacleManager;
  public powerupManager: PowerupManager;
  public bossManager: BossManager;

  // Game metrics
  public score = 0;
  public coinsCollectedThisRun = 0;
  public gemsCollectedThisRun = 0;
  public squadSurvivalTime = 0.0;
  public scrollSpeed = 4.2;
  private baseScrollSpeed = 4.2;

  // Multipliers & Delays
  public timeScale = 1.0;
  private scoreMultiplier = 1;
  
  // Booster System state variables
  public boosterActive = false;
  public boosterTimer = 0.0;
  public boosterDeactivating = false;
  public boosterDeactivateTimer = 0.0;
  public boosterSpawnTimer = 1.0;
  private boosterScoreAccumulator = 0.0;
  private falconScoreAccumulator = 0.0;
  public falconObstaclesPassed = 0;
  public boosterTapsThisRun = 0;
  
  // Powerups timers
  private activePowerupsList: Record<string, ActivePowerup> = {};

  // Skin-specific passive & active ability timers
  public whiteDragonShieldTimer = 35;
  public dreadOwlGhostTimer = 18;
  public dreadFalconTurboTimer = 22;
  public angryBirdDemolitionTimer = 0;
  
  // Auto-Pilot Spectator mode
  public isSpectatorMode = false;

  // Photo mode visual filters
  public photoFilters = {
    contrast: 100,
    brightness: 100,
    sepia: 0,
    blur: 0,
    saturate: 100
  };

  private bossWarningTimer = 0;
  // private bossScoreMilestone = 50; // Spawn a boss every 50 points!
  private fpsLowFrameStreak = 0;
  private preloadingTimer = 0.0;


  constructor(
    canvas: HTMLCanvasElement,
    progressManager: ProgressManager,
    soundManager: SoundManager
  ) {
    this.progressManager = progressManager;
    this.soundManager = soundManager;
    
    this.particleEngine = new ParticleEngine();
    this.renderer = new Renderer(canvas, this.particleEngine);
    
    const skin = this.progressManager.getActiveSkinInfo();
    this.bird = new Bird(skin);
    
    this.obstacleManager = new ObstacleManager();
    this.powerupManager = new PowerupManager();
    this.bossManager = new BossManager();
    
    this.renderer.setWeather(this.progressManager.getState().activeWorld);

    // Initialize global performance detector to bypass expensive shadow blurs
    // ALWAYS disable canvas shadows by default on ALL devices (PC and mobile) to solve lag completely
    (window as any).gameDisableShadows = true;
    (window as any).gameEngine = this;
  }

  public startGame() {
    this.state = 'PLAYING';
    this.preloadingTimer = 0.0;
    this.firstTapDone = false;
    this.soundManager.init(); // Warm up Web Audio context on user gesture
    this.hasRevivedThisRun = false;
    this.revivesUsedThisRun = 0;
    this.reviveCardVisible = false;
    this.shieldBrokenThisRun = false;
    this.score = 0;
    this.coinsCollectedThisRun = 0;
    this.gemsCollectedThisRun = 0;
    this.squadSurvivalTime = 0.0;

    if (this.gameMode === 'level') {
      const levelConfig = LevelManager.getLevel(this.currentLevelNum);
      if (levelConfig) {
        this.activeLevelConfig = levelConfig;
        this.scrollSpeed = levelConfig.scrollSpeed;
        this.baseScrollSpeed = levelConfig.scrollSpeed;
        
        // Keep currently active/selected world and apply its weather/theme to level mode
        const activeWorld = this.progressManager.getState().activeWorld;
        this.renderer.setWeather(activeWorld);
        this.renderer.activeLevelNum = this.currentLevelNum;
        this.progressManager.trackLevelPlay(this.currentLevelNum);
      }
    } else {
      this.activeLevelConfig = null;
      this.scrollSpeed = this.baseScrollSpeed;
      this.renderer.activeLevelNum = 0;
    }

    this.timeScale = 1.0;
    this.scoreMultiplier = 1;
    this.activePowerupsList = {};
    
    // Reset booster system variables
    this.boosterActive = false;
    this.boosterTimer = 0.0;
    this.boosterDeactivating = false;
    this.boosterDeactivateTimer = 0.0;
    this.boosterSpawnTimer = 0.0; // Button starts fully charged and ready at start!
    this.boosterScoreAccumulator = 0.0;
    this.falconScoreAccumulator = 0.0;
    this.falconObstaclesPassed = 0;
    this.boosterTapsThisRun = 0;

    // Reset revive waiting state
    this.waitingForDoubleTapAfterRevive = false;
    this.reviveFloatY = 300;
    
    // Reset ultimate skill status
    this.ultimateEnergy = 0;
    this.ultimateActive = false;
    this.ultimateDurationLeft = 0;

    // Reset Chaos Mode states
    this.gravityFlipped = false;
    this.weaponActive = false;
    this.weaponLevel = 0;
    this.weaponTimer = 0.0;
    this.lastShotTimer = 0.0;
    this.bullets = [];
    this.chaosObstaclesPassed = 0;
    this.destroyedPipesCount = 0;
    
    this.bird.y = 300;
    this.bird.vy = 0;
    this.bird.angle = 0;
    this.bird.isCrashing = false;
    this.bird.isInvincible = false;
    this.bird.hasShield = false;
    this.bird.isGhost = false;
    this.bird.sizeMultiplier = 1.0;

    const currentSkin = this.progressManager.getActiveSkinInfo();
    this.bird.setSkin(currentSkin);
    this.bird.setDifficulty(this.progressManager.getState().selectedDifficulty);

    // Reset evolution state
    this.evolvedBirdTier = 0;
    this.rescuedBirdsTotal = 0;
    this.mergeReadyCount = 0;
    this.rescueMilestoneNext = 5;
    this.birdsJoinedThisRun = 0;
    this.activeSkillUnlocked = null;
    this.activeSkillCooldown = 0;
    this.activeSkillMaxCooldown = 0;
    this.nextBossScore = this.gameMode === 'flock' ? 75 : 100;
    this.playerBossHP = 0;
    this.maxPlayerBossHP = 0;
    this.bossManager.reset();

    // Reset skin passive/active ability timers
    this.whiteDragonShieldTimer = 35;
    this.dreadOwlGhostTimer = 18;
    this.dreadFalconTurboTimer = 22;
    this.angryBirdDemolitionTimer = 0;

    // Starting shield passive removed - all control from Ultimate button only

    if (this.gameMode === 'flock') {
      const width = this.renderer.canvas.width / this.renderer.dpr;
      this.bird.x = width > 0 ? width * 0.40 : 192;
      this.flock = [this.bird];
    } else {
      this.bird.x = 120;
      this.flock = [];
    }

    this.obstacleManager.clear();
    if (this.gameMode === 'level' && this.activeLevelConfig) {
      this.obstacleManager.setLevelMode(true, this.activeLevelConfig);
    } else {
      this.obstacleManager.setLevelMode(false, null);
    }
    this.powerupManager.clear();
    if (this.gameMode === 'level' && this.activeLevelConfig) {
      this.powerupManager.initLevelCollectibles(this.currentLevelNum, this.activeLevelConfig.targetScore);
    }
    
    this.soundManager.stopMusic();
    this.soundManager.startMusic(this.progressManager.getState().activeWorld);
  }

  public update(deltaTime: number) {
    // FPS performance governor
    if (deltaTime > 0) {
      const currentFps = 1 / deltaTime;
      // If frame rate drops below 45 FPS
      if (currentFps < 45) {
        this.fpsLowFrameStreak++;
        if (this.fpsLowFrameStreak >= 120 && !(window as any).gameDisableShadows) {
          (window as any).gameDisableShadows = true;
          window.dispatchEvent(new CustomEvent('achievement_unlocked', {
            detail: {
              name: 'PERFORMANCE MODE ENABLED ⚡',
              desc: 'Graphics simplified to maintain target 60 FPS!'
            }
          }));
        }
      } else {
        // Slowly cool down the low frame streak
        if (this.fpsLowFrameStreak > 0) this.fpsLowFrameStreak--;
      }
    }

    // Apply delta-time cap to avoid giant skips when tabbing away and use exact raw delta time
    const dt = Math.min(0.1, deltaTime);

    // Sync bird size multiplier dynamically if squad survival boss HP is active (3% size change per HP)
    if (this.gameMode === 'flock' && this.playerBossHP > 0) {
      if (!this.activePowerupsList['mini']) {
        this.bird.sizeMultiplier = 1.0 + this.playerBossHP * 0.03;
      }
    }


    // 1. Update visual engines
    this.particleEngine.update(dt);

    if (this.state === 'PRELOADING') {
      this.preloadingTimer -= dt;
      this.renderer.update(dt, this.scrollSpeed * 0.1, this.bird.y, 1.0, this.state);
      
      // Dispatch preloading progress event
      window.dispatchEvent(new CustomEvent('preloading_progress', {
        detail: {
          progress: Math.max(0, Math.min(1.0, (0.4 - this.preloadingTimer) / 0.4))
        }
      }));

      if (this.preloadingTimer <= 0) {
        this.state = 'PLAYING';
        this.soundManager.stopMusic();
        this.soundManager.startMusic(this.progressManager.getState().activeWorld);
        window.dispatchEvent(new CustomEvent('preloading_complete'));
      }
      return;
    }

    if (this.state === 'REVIVE_CHOICE') {
      this.bird.update(dt, this.particleEngine, true, 1.0, this.score);
      if (this.gameMode === 'flock') {
        this.updateFlockFollowers(dt, 1.0);
      }
      this.renderer.update(dt, 0, this.bird.y, 1.0, this.state);

      // Bounce once hit floor or ceiling
      const height = this.renderer.canvas.height / this.renderer.dpr;
      if (this.bird.y >= height - 40) {
        this.bird.y = height - 40;
        this.bird.vy = 0;
      } else if (this.bird.y - this.bird.radius < 5) {
        this.bird.y = 5 + this.bird.radius;
        this.bird.vy = 0;
      }
      return;
    }

    if (this.state === 'DEMO_COMPLETE') {
      this.renderer.update(dt, 0, this.bird.y, 1.0, this.state);
      return;
    }

    if (this.state === 'PHOTO_MODE') return;

    const width = this.renderer.canvas.width / this.renderer.dpr;
    const height = this.renderer.canvas.height / this.renderer.dpr;

    // Smoothly adjust bird's horizontal position depending on game state and mode
    let targetX = 120;
    if (this.state === 'BOSS_WARNING' || this.state === 'BOSS_FIGHT') {
      targetX = 120; // Reverted to 120 to increase bird-boss gap by 20%
    } else {
      if (this.gameMode === 'flock') {
        targetX = width > 0 ? width * 0.40 : 192;
      } else {
        targetX = 120;
      }
    }
    const lerpSpeed = 0.05 * (dt * 60);
    this.bird.x += (targetX - this.bird.x) * lerpSpeed;


    // Update active powerups durations
    if (!this.waitingForDoubleTapAfterRevive) {
      this.updatePowerupTimers(dt);
    }

    // Active skill cooldown tick was removed

    // 2. Update state machine
    if (this.state === 'PLAYING' || this.state === 'BOSS_FIGHT') {
      if (this.gameMode === 'flock') {
        this.squadSurvivalTime += dt;
      }

      let activeTimeScale = this.timeScale;
      let birdTimeScale = (this.ultimateActive && this.bird.getSkin().id === 'jade_lotus') ? 1.0 : activeTimeScale;
      this.bird.update(dt, this.particleEngine, true, birdTimeScale, this.score);

      // Follower birds only come from cage rescues in flock mode

      // Update follower birds positions and logic in flocking modes
      this.updateFlockFollowers(dt, birdTimeScale);
      
      // Booster automatic vertical centering cruised flight
      if (this.boosterActive) {
        const targetCenterY = height / 2;
        this.bird.y += (targetCenterY - this.bird.y) * 0.12 * (dt * 60);
        this.bird.vy = 0;
        this.bird.angle = 0.05 * Math.sin(performance.now() * 0.05);
      }
      
      // Update Ultimate Ability Energy Charging & Durations (Visual Upgrade Option 2)
      if (this.ultimateActive) {
        // Spawn active neon stardust trailing particles matching the skin color
        const skinColor = this.bird.getSkin().glowColor || '#00f3ff';
        if (Math.random() < 0.45 * dt * 60) {
          this.particleEngine.spawn(
            this.bird.x + (Math.random() - 0.5) * 15,
            this.bird.y + (Math.random() - 0.5) * 15,
            -this.scrollSpeed * 0.4 - Math.random() * 2,
            (Math.random() - 0.5) * 2,
            skinColor,
            3.5 + Math.random() * 3.5,
            1.0,
            0.035,
            'star',
            true,
            skinColor
          );
        }
        
        if (this.bird.getSkin().id === 'neon_crow') {
          // Indefinite duration: keep duration full
          this.ultimateDurationLeft = this.ultimateMaxDuration;
          
          // Deactivate only if the clone bird (or leader) died
          const targetLimit = this.gameMode === 'flock' ? this.preUltimateFlockLength : 1;
          if (this.flock.length <= targetLimit) {
            this.deactivateUltimate();
          }
        } else if (this.bird.getSkin().id === 'dread_falcon') {
          // Deactivate when 20 obstacles are passed (previously 50 in design)
          this.ultimateDurationLeft = (1.0 - this.falconObstaclesPassed / 20) * this.ultimateMaxDuration;
          if (this.falconObstaclesPassed >= 20) {
            this.deactivateUltimate();
          }
        } else {
          this.ultimateDurationLeft -= dt;
          if (this.ultimateDurationLeft <= 0) {
            this.deactivateUltimate();
          }
        }
      } else {
        // Regenerate energy organically by 2% per second (only outside endless/flock modes)
        if (this.gameMode !== 'endless' && this.gameMode !== 'flock') {
          this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 2 * dt);
        }
      }

      // Spawn glowing pink stardust trail from the merged bird in Squad Survival
      if (this.gameMode === 'flock' && this.playerBossHP > 0) {
        if (Math.random() < 0.25 * dt * 60) {
          this.particleEngine.spawn(
            this.bird.x - this.bird.radius,
            this.bird.y + (Math.random() - 0.5) * 16,
            -this.scrollSpeed * 0.3 - Math.random() * 1.5,
            (Math.random() - 0.5) * 2,
            '#ff007f',
            3.0 + Math.random() * 3.0,
            0.8,
            0.03,
            'spark',
            true,
            '#ff007f'
          );
        }
      }
      
      // Keep bird within screen boundaries for all playing states (including powerups)
      // Top boundary (ceiling) is always clamped so you cannot fly above the screen
      if (this.gameMode === 'flock') {
        for (const b of this.flock) {
          if (b.y - b.radius < 5) {
            b.y = 5 + b.radius;
            if (b.vy < 0) b.vy = 0;
          }
          if (this.state !== 'PLAYING' || b.isInvincible || b.isGhost || this.boosterActive || this.boosterDeactivating || this.ultimateActive || this.progressManager.getState().selectedZone === 'chaos') {
            if (b.y + b.radius > height - 35) {
              b.y = height - 35 - b.radius;
              if (b.vy > 0) b.vy = 0;
            }
          }
        }
      } else {
        if (this.bird.y - this.bird.radius < 5) {
          this.bird.y = 5 + this.bird.radius;
          if (this.bird.vy < 0) this.bird.vy = 0;
        }
        if (this.state !== 'PLAYING' || this.bird.isInvincible || this.bird.isGhost || this.boosterActive || this.boosterDeactivating || this.ultimateActive || this.progressManager.getState().selectedZone === 'chaos') {
          if (this.bird.y + this.bird.radius > height - 35) {
            this.bird.y = height - 35 - this.bird.radius;
            if (this.bird.vy > 0) this.bird.vy = 0;
          }
        }
      }
      
      // Auto-pilot spectator logic
      if (this.isSpectatorMode) {
        this.runAutopilotAI(height);
      }

      // Calculate and set unified progressive scroll speed before updating visual backgrounds or physics managers
      if (this.state === 'PLAYING') {
        if (this.gameMode === 'level' && this.activeLevelConfig) {
          if (this.ultimateActive && this.bird.getSkin().id === 'articuno') {
            this.scrollSpeed = 0.0;
          } else if (this.ultimateActive && this.bird.getSkin().id === 'dread_falcon') {
            this.scrollSpeed = this.activeLevelConfig.scrollSpeed * 3.64;
          } else if (this.activePowerupsList['turbo']) {
            this.scrollSpeed = this.activeLevelConfig.scrollSpeed * 2.3;
          } else {
            const progressiveFactor = 1.0 + Math.floor(this.score / 5) * 0.02;
            let currentSpeed = this.activeLevelConfig.scrollSpeed * progressiveFactor;

            // For levels 40-60, reduce scrollSpeed based on the current obstacle block/group (5% in middle group, 10% in last group)
            const levelNum = this.activeLevelConfig.levelNum;
            if (levelNum >= 40 && levelNum <= 60) {
              const groupSize = Math.floor(this.activeLevelConfig.targetScore / 3);
              const groupIdx = Math.min(2, Math.floor(this.score / groupSize));
              if (groupIdx === 1) {
                currentSpeed *= 0.95; // 5% reduce
              } else if (groupIdx === 2) {
                currentSpeed *= 0.90; // 10% reduce
              }
            }
            this.scrollSpeed = currentSpeed;
          }
        } else {
          const selectedZone = this.progressManager.getState().selectedZone;
          const selectedDifficulty = this.progressManager.getState().selectedDifficulty;
          
          let startSpeed = 1.0;
          
          if (selectedZone === 'classic') {
            startSpeed = 0.72; // Start very comfortable and slow to allow longer survival
          } else if (selectedDifficulty === 'easy') {
            startSpeed = 0.75;
          } else if (selectedDifficulty === 'hard') {
            startSpeed = 1.20;
          }
          
          // Custom speed multiplier intervals:
          // For squad mode (flock), restore the previous speed tier scaling (base 1.0).
          // For other modes, keep the starting speed increased by 8% (1.08) and scaled subsequent tiers.
          let speedMultiplier = 1.08;
          if (this.gameMode === 'flock') {
            if (this.score <= 100) {
              speedMultiplier = 1.0;
            } else if (this.score <= 200) {
              const progress = (this.score - 100) / 100;
              speedMultiplier = 1.0 + progress * 0.05;
            } else if (this.score <= 300) {
              const progress = (this.score - 200) / 100;
              speedMultiplier = 1.05 * (1.0 + progress * 0.03);
            } else if (this.score <= 400) {
              const progress = (this.score - 300) / 100;
              speedMultiplier = 1.0815 * (1.0 + progress * 0.02);
            } else {
              speedMultiplier = 1.05 * 1.03 * 1.02; // Fixed maximum multiplier: 1.10313
              // Scale horizontal scroll speed progressively: 5% increase every 100 obstacles passed from score 500
              if (this.score >= 500) {
                const over500Factor = Math.floor((this.score - 500) / 100);
                speedMultiplier *= (1.0 + over500Factor * 0.05);
              }
            }
            // Increase speed of squad mode gameplay by 8%
            speedMultiplier *= 1.08;
          } else {
            if (this.score <= 100 || (this.gameMode === 'level' && (this.currentLevelNum === 7 || this.currentLevelNum === 15))) {
              speedMultiplier = 1.08;
            } else if (this.score <= 200) {
              const progress = (this.score - 100) / 100;
              speedMultiplier = 1.08 * (1.0 + progress * 0.05);
            } else if (this.score <= 300) {
              const progress = (this.score - 200) / 100;
              speedMultiplier = 1.08 * 1.05 * (1.0 + progress * 0.03);
            } else if (this.score <= 400) {
              const progress = (this.score - 300) / 100;
              speedMultiplier = 1.08 * 1.0815 * (1.0 + progress * 0.02);
            } else {
              speedMultiplier = 1.08 * 1.05 * 1.03 * 1.02; // Fixed maximum multiplier: 1.19138
              // Scale horizontal scroll speed progressively: 5% increase every 100 obstacles passed from score 500
              if (this.score >= 500) {
                const over500Factor = Math.floor((this.score - 500) / 100);
                speedMultiplier *= (1.0 + over500Factor * 0.05);
              }
            }
          }

          if (this.ultimateActive && this.bird.getSkin().id === 'articuno') {
            this.scrollSpeed = 0.0;
          } else if (this.ultimateActive && this.bird.getSkin().id === 'dread_falcon') {
            this.scrollSpeed = this.baseScrollSpeed * 3.64;
          } else if (this.activePowerupsList['turbo']) {
            this.scrollSpeed = this.baseScrollSpeed * 2.3;
          } else {
            this.scrollSpeed = this.baseScrollSpeed * startSpeed * speedMultiplier;
            if (this.gameMode === 'endless' && this.score >= 1 && this.score <= 50) {
              this.scrollSpeed *= 0.93; // 7% reduction
            }
            // Squad mode scroll speed progression:
            // - Score 500 to 1000: up to +20% speed (at 1000)
            // - Score >= 1000: +3% speed for every 50 points of score increment (endless)
            if (this.gameMode === 'flock' && this.score >= 500) {
              if (this.score >= 1000) {
                const over1000Gap = Math.floor((this.score - 1000) / 50);
                const gapMultiplier = 1.0 + over1000Gap * 0.03;
                this.scrollSpeed *= 1.20 * gapMultiplier;
              } else {
                const progress500to1000 = (this.score - 500) / 500;
                this.scrollSpeed *= (1.0 + progress500to1000 * 0.20);
              }
            }
          }
        }
        
        // Ice Phoenix passive Blizzard Chill 20% slow-down removed
      }

      if (!this.firstTapDone || this.waitingForDoubleTapAfterRevive) {
        this.scrollSpeed = 0.0;
      }

      // Booster overrides scroll speed and active effects
      if (this.boosterActive) {
        // Suppress collisions and enforce invincibility
        this.bird.isInvincible = true;
        
        // Smoothly pull bird to the vertical center of the screen
        this.bird.y += (height / 2 - this.bird.y) * 0.25 * (dt * 60);
        this.bird.vy = 0;

        // Count obstacles passed via score accumulation (25 obstacles in 1 second)
        this.boosterScoreAccumulator += dt * 25;
        if (this.boosterScoreAccumulator >= 1.0) {
          const pointsToAdd = Math.floor(this.boosterScoreAccumulator);
          this.boosterScoreAccumulator -= pointsToAdd;
          this.score += pointsToAdd;
          this.boosterTimer -= pointsToAdd; // Decrement obstacle counter
          this.particleEngine.emitCoinSparkle(this.bird.x + 30, this.bird.y, '#ffd700');
        }

        if (this.boosterTimer <= 0) {
          // 25 obstacles passed — enter deactivation cooldown phase
          this.boosterActive = false;
          this.boosterDeactivating = true;
          this.boosterDeactivateTimer = 0.5;
          this.boosterSpawnTimer = 1.0; // Recharge cooldown time is 1 second
        } else {
          // Set speed to 20.0x for Hyper Boost speed (25 obstacles/s visual)
          this.scrollSpeed = this.baseScrollSpeed * 20.0;

          // Emit supersonic speed sparks from bird
          if (Math.random() < 0.8) {
            this.particleEngine.spawn(
              this.bird.x - this.bird.radius,
              this.bird.y + (Math.random() - 0.5) * 12,
              -this.scrollSpeed * 0.3 - Math.random() * 5,
              (Math.random() - 0.5) * 3,
              Math.random() > 0.3 ? '#ffd700' : '#ffffff',
              4 + Math.random() * 5,
              1.0,
              0.04,
              'spark',
              true,
              '#ffd700'
            );
          }

          // Trigger screen shake on every frame during booster mode
          this.renderer.triggerScreenShake(6, 0.05);
        }
      } else if (this.boosterDeactivating) {
        this.boosterDeactivateTimer -= dt;
        
        // Maintain invincibility for safety
        this.bird.isInvincible = true;

        if (this.boosterDeactivateTimer <= 0) {
          this.boosterDeactivating = false;
          this.bird.isInvincible = false;
        } else {
          // Smoothly lerp scrollSpeed multiplier from 15.0x back to 1.0x
          const lerpFactor = this.boosterDeactivateTimer / 0.5; // 1.0 down to 0.0
          const speedMult = 1.0 + (15.0 - 1.0) * lerpFactor;
          this.scrollSpeed = this.scrollSpeed * speedMult;
        }
      }

      // Smooth score accumulator for Charan Falcon ultimate
      if (this.ultimateActive && this.bird.getSkin().id === 'dread_falcon') {
        this.falconScoreAccumulator += dt * 3.75; // 15 obstacles / 4 seconds = 3.75 obstacles/sec
        if (this.falconScoreAccumulator >= 1.0) {
          const pointsToAdd = Math.floor(this.falconScoreAccumulator);
          this.falconScoreAccumulator -= pointsToAdd;
          const pointsToReallyAdd = Math.min(pointsToAdd, 20 - this.falconObstaclesPassed);
          if (pointsToReallyAdd > 0) {
            this.score += pointsToReallyAdd;
            this.falconObstaclesPassed += pointsToReallyAdd;
            this.particleEngine.emitCoinSparkle(this.bird.x + 30, this.bird.y, '#00f3ff');
          }
        }
      }
      
      this.renderer.update(dt, this.scrollSpeed, this.bird.y, activeTimeScale);

      if (this.state === 'PLAYING') {
        const selectedZone = this.progressManager.getState().selectedZone;
        const selectedDifficulty = this.progressManager.getState().selectedDifficulty;

         // --- Chaos Events Cycle ---
        if (this.progressManager.getState().selectedZone === 'chaos') {
          if (this.activeChaosEvent !== 'none') {
            this.chaosEventTimer -= dt;
            if (this.chaosEventTimer <= 0) {
              this.activeChaosEvent = 'none';
            }
          }

          if (this.chaosEventAnnounceTimer > 0) {
            this.chaosEventAnnounceTimer -= dt;
          }
        }

        // Tick booster button charge timer in Endless Mode & Flock Mode
        if ((this.gameMode === 'endless' || this.gameMode === 'flock') && !this.boosterActive && !this.boosterDeactivating) {
          this.boosterSpawnTimer = Math.max(0, this.boosterSpawnTimer - dt);
        }

        // Standard scrolling hazards
        this.obstacleManager.update(dt, this.scrollSpeed, this.score, this.progressManager.getState().activeWorld, width, height, activeTimeScale, selectedZone, selectedDifficulty, this.bird.x, undefined, this.gameMode);
        this.powerupManager.update(dt, this.scrollSpeed, this.bird.x, this.bird.y, !!this.activePowerupsList['magnet'], width, height, activeTimeScale, this.obstacleManager.getList(), this.gameMode, this.particleEngine, this.flock);

        // Update shooting & weapons in Chaos Mode
        if (this.weaponActive && !this.waitingForDoubleTapAfterRevive && this.state === 'PLAYING') {
          this.lastShotTimer += dt;
          
          // Blade rotates continuously
          if (this.weaponType === 'blade') {
            this.bladeRotation += dt * 10;
            const bladeRadius = 55 + this.weaponLevel * 10;
            const bx = this.bird.x;
            const by = this.bird.y;
            const obstaclesList = this.obstacleManager.getList();
            
            obstaclesList.forEach(obs => {
              if (obs.isDestroyed || !obs.isDestructible) return;
              const topShift = obs.shakeX || 0;
              const bottomShift = obs.shakeX2 !== undefined ? obs.shakeX2 : (obs.shakeX || 0);
              
              const inTop = bx + bladeRadius >= obs.x + topShift && 
                            bx - bladeRadius <= obs.x + obs.width + topShift && 
                            by - bladeRadius <= obs.topHeight;
                            
              const inBottom = bx + bladeRadius >= obs.x + bottomShift && 
                               bx - bladeRadius <= obs.x + obs.width + bottomShift && 
                               by + bladeRadius >= height - obs.bottomHeight;
                               
              if (inTop || inBottom) {
                obs.hp = (obs.hp || 3) - dt * 7;
                if (Math.random() < 0.15) {
                  this.particleEngine.emitExplosion(bx + (inTop ? 30 : 0), by + (inTop ? -20 : 20), '#ffd700', 3);
                  this.soundManager.playShieldDeflect();
                }
                if (obs.hp <= 0) {
                  obs.isDestroyed = true;
                  if (this.gameMode === 'flock' || this.progressManager.getState().selectedZone === 'chaos') this.destroyedPipesCount++;
                  this.triggerStoneDebris(obs, height);
                }
              }
            });
          }
          
          // Laser deals continuous damage directly ahead from the bird's eye
          if (this.weaponType === 'laser') {
            const angle = this.bird.angle;
            const scale = this.bird.radius / this.bird.baseRadius;
            const localLaserX = 10 * scale;
            const localLaserY = -3 * scale;
            
            const startX = this.bird.x + (localLaserX * Math.cos(angle) - localLaserY * Math.sin(angle));
            const startY = this.bird.y + (localLaserX * Math.sin(angle) + localLaserY * Math.cos(angle));
            const obstaclesList = this.obstacleManager.getList();
            
            obstaclesList.forEach(obs => {
              if (obs.isDestroyed || !obs.isDestructible) return;
              const topShift = obs.shakeX || 0;
              const bottomShift = obs.shakeX2 !== undefined ? obs.shakeX2 : (obs.shakeX || 0);
              
              const hitsTop = startX < obs.x + obs.width + topShift && startY <= obs.topHeight;
              const hitsBottom = startX < obs.x + obs.width + bottomShift && startY >= height - obs.bottomHeight;
              
              if (hitsTop || hitsBottom) {
                obs.hp = (obs.hp || 3) - dt * (5 + this.weaponLevel * 3);
                if (Math.random() < 0.2) {
                  this.particleEngine.emitExplosion(obs.x + obs.width / 2, startY, '#00ffff', 3);
                  this.soundManager.playShieldDeflect();
                }
                if (obs.hp <= 0) {
                  obs.isDestroyed = true;
                  if (this.gameMode === 'flock' || this.progressManager.getState().selectedZone === 'chaos') this.destroyedPipesCount++;
                  this.triggerStoneDebris(obs, height);
                }
              }
            });
          }
          
          // Cooldown for firing projectiles
          let cooldown = this.weaponLevel === 3 ? 0.22 : (this.weaponLevel === 2 ? 0.30 : 0.35);
          if (this.weaponType === 'rocket') {
            cooldown = 0.65 - this.weaponLevel * 0.1;
          }
          
          if (this.lastShotTimer >= cooldown) {
            this.lastShotTimer = 0.0;
            
            const startX = this.bird.x + this.bird.radius;
            const startY = this.bird.y;
            
            if (this.weaponType === 'bullet') {
              this.soundManager.playZap();
              if (this.weaponLevel === 1) {
                this.bullets.push({ x: startX, y: startY, vx: 12, vy: 0, radius: 6, color: '#00f3ff' });
              } else if (this.weaponLevel === 2) {
                this.bullets.push({ x: startX, y: startY - 4, vx: 12, vy: -1.5, radius: 6, color: '#d946ef' });
                this.bullets.push({ x: startX, y: startY + 4, vx: 12, vy: 1.5, radius: 6, color: '#d946ef' });
              } else if (this.weaponLevel === 3) {
                this.bullets.push({ x: startX, y: startY, vx: 14, vy: 0, radius: 7, color: '#00f3ff' });
                this.bullets.push({ x: startX, y: startY - 6, vx: 12, vy: -3.0, radius: 6, color: '#d946ef' });
                this.bullets.push({ x: startX, y: startY + 6, vx: 12, vy: 3.0, radius: 6, color: '#d946ef' });
              }
              this.particleEngine.emitExplosion(startX, startY, this.weaponLevel === 3 ? '#d946ef' : '#00f3ff', 4);
            } else if (this.weaponType === 'rocket') {
              this.soundManager.playZap();
              if (this.weaponLevel === 1) {
                this.bullets.push({ x: startX, y: startY, vx: 7, vy: 0, radius: 10, color: '#d946ef', isRocket: true });
              } else if (this.weaponLevel === 2) {
                this.bullets.push({ x: startX, y: startY - 5, vx: 7, vy: -0.8, radius: 11, color: '#d946ef', isRocket: true });
                this.bullets.push({ x: startX, y: startY + 5, vx: 7, vy: 0.8, radius: 11, color: '#d946ef', isRocket: true });
              } else if (this.weaponLevel === 3) {
                this.bullets.push({ x: startX, y: startY, vx: 8, vy: 0, radius: 12, color: '#00f3ff', isRocket: true });
                this.bullets.push({ x: startX, y: startY - 8, vx: 7, vy: -1.8, radius: 10, color: '#d946ef', isRocket: true });
                this.bullets.push({ x: startX, y: startY + 8, vx: 7, vy: 1.8, radius: 10, color: '#d946ef', isRocket: true });
              }
              this.particleEngine.emitExplosion(startX, startY, '#d946ef', 6);
            }
          }
        }

        // Update active bullets
        const speedCoeff = dt * 60;
        const obstaclesList = this.obstacleManager.getList();
        for (let bIdx = this.bullets.length - 1; bIdx >= 0; bIdx--) {
          const bullet = this.bullets[bIdx];
          bullet.x += bullet.vx * speedCoeff;
          bullet.y += bullet.vy * speedCoeff;

          // Remove if off-screen
          if (bullet.x > width + 100) {
            this.bullets.splice(bIdx, 1);
            continue;
          }

          // Collision with obstacles
          let hit = false;
          for (let oIdx = 0; oIdx < obstaclesList.length; oIdx++) {
            const obs = obstaclesList[oIdx];
            if (obs.isDestroyed || obs.passed) continue;

            const topShift = obs.shakeX || 0;
            const bottomShift = obs.shakeX2 !== undefined ? obs.shakeX2 : (obs.shakeX || 0);

            // Check Top Column collision
            const inTopCol = bullet.x >= obs.x + topShift && 
                             bullet.x <= obs.x + obs.width + topShift && 
                             bullet.y <= obs.topHeight;

            // Check Bottom Column collision
            const inBottomCol = bullet.x >= obs.x + bottomShift && 
                                bullet.x <= obs.x + obs.width + bottomShift && 
                                bullet.y >= height - obs.bottomHeight;

            if (inTopCol || inBottomCol) {
              hit = true;
              
              if (bullet.isRocket) {
                this.triggerRocketExplosion(bullet.x, bullet.y);
              } else if (obs.isDestructible) {
                obs.hp = (obs.hp || 3) - 1;
                
                // Spawn hit spark particles
                 this.particleEngine.emitExplosion(bullet.x, bullet.y, '#00f3ff', 8);
                this.soundManager.playShieldDeflect();
                this.renderer.triggerScreenShake(3, 0.1);

                if (obs.hp <= 0) {
                  obs.isDestroyed = true;
                  if (this.gameMode === 'flock' || this.progressManager.getState().selectedZone === 'chaos') this.destroyedPipesCount++;
                  // Spawn massive stone debris explosion!
                  for (let d = 0; d < 16; d++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 1.5 + Math.random() * 4.5;
                    const size = 6 + Math.random() * 8;
                    this.particleEngine.spawn(
                      obs.x + obs.width / 2,
                      obs.topHeight,
                      Math.cos(angle) * speed,
                      Math.sin(angle) * speed,
                      '#7f8c8d',
                      size,
                      1.0,
                      0.012 + Math.random() * 0.008,
                      'square',
                      false,
                      undefined,
                      -0.03
                    );
                    this.particleEngine.spawn(
                      obs.x + obs.width / 2,
                      height - obs.bottomHeight,
                      Math.cos(angle) * speed,
                      Math.sin(angle) * speed,
                      '#95a5a6',
                      size,
                      1.0,
                      0.012 + Math.random() * 0.008,
                      'square',
                      false,
                      undefined,
                      -0.03
                    );
                  }
                  this.soundManager.playExplosion();
                  this.renderer.triggerScreenShake(6, 0.25);
                }
              } else {
                // Non-destructible obstacle hit: just spawn small sparks
                this.particleEngine.emitExplosion(bullet.x, bullet.y, '#95a5a6', 4);
              }
              break;
            }
          }

          if (hit) {
            this.bullets.splice(bIdx, 1);
          }
        }

        // Check near-miss grazes
        const obstacles = this.obstacleManager.getList();
        const obsLen = obstacles.length;
        for (let i = 0; i < obsLen; i++) {
          const obs = obstacles[i];
          if (!obs.grazed && !this.bird.isCrashing && this.state === 'PLAYING') {
            const birdLeft = this.bird.x - this.bird.radius;
            const birdRight = this.bird.x + this.bird.radius;
            const pipeLeft = obs.x;
            const pipeRight = obs.x + obs.width;
            
            // Is bird horizontally aligned with/near the pipe width?
            if (birdRight >= pipeLeft - 12 && birdLeft <= pipeRight + 12) {
              const topPipeBottom = obs.topHeight;
              const bottomPipeTop = height - obs.bottomHeight;
              
              // Vertical distance to pipe edge
              const topDist = Math.abs(this.bird.y - topPipeBottom);
              const bottomDist = Math.abs(this.bird.y - bottomPipeTop);
              const grazeThreshold = 42; // generous and premium graze trigger distance
              
              if (topDist <= grazeThreshold || bottomDist <= grazeThreshold) {
                obs.grazed = true;
                
                // Play sound
                this.soundManager.playCoin();
                
                // 3. Update Quest & Achievement Progress
                this.progressManager.updateQuestProgress('graze', 1);
                this.progressManager.incrementAchievement('near_miss', 1);
                
                // Reward Ultimate energy for high skill near-miss grazes (only outside endless/flock modes)
                if (!this.ultimateActive && this.gameMode !== 'endless' && this.gameMode !== 'flock') {
                  this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 5);
                }
              }
            }
          }
        }

        // Check score triggers for obstacles
        for (let i = 0; i < obsLen; i++) {
          const obs = obstacles[i];
          if (!obs) continue; // Safety guard in case obstacles list is cleared dynamically
          if (!obs.passed && obs.x + obs.width < this.bird.x) {
            obs.passed = true;
            this.incrementScore();
            this.progressManager.updateQuestProgress('obstacles', 1);
            if (this.progressManager.getState().selectedZone === 'classic') {
              this.progressManager.updateQuestProgress('obstacles_classic', 1);
            }
            
            // Ultimate charging: exactly 2.5% per obstacle passed in endless/flock modes (reaches 100% every 40 obstacles)
            if ((this.gameMode === 'endless' || this.gameMode === 'flock') && !this.ultimateActive) {
              this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 2.5);
            }
            
            // If the state changes from PLAYING (e.g., entered BOSS_WARNING), break out of the loop immediately
            if (this.state !== 'PLAYING') {
              break;
            }
          }
        }

        // Evaluate standard collisions & enforce boundaries
        if (this.gameMode === 'flock') {
          for (let i = this.flock.length - 1; i >= 0; i--) {
            const b = this.flock[i];
            if (!b.isInvincible && !b.isGhost && !this.boosterActive && !this.boosterDeactivating) {
              const collidedObs = this.obstacleManager.enforceBoundariesAndCheckCollisions(
                b,
                height,
                selectedDifficulty
              );
              
              if (collidedObs) {
                // Collided. Check Shield safety
                if (b.hasShield) {
                  b.hasShield = false;
                  this.shieldBrokenThisRun = true;
                  delete this.activePowerupsList['shield'];
                  
                  // Temporary invincibility safety delay for the whole flock
                  for (const fb of this.flock) {
                    fb.isInvincible = true;
                    fb.hasShield = false;
                  }
                  
                  this.soundManager.playShieldDeflect();
                  
                  setTimeout(() => {
                    for (const fb of this.flock) {
                      fb.isInvincible = false;
                    }
                  }, 1500);
                } else {
                  // Eliminate this specific bird
                  this.soundManager.playExplosion();
                  this.particleEngine.emitExplosion(b.x, b.y, b.getSkin().glowColor || '#ff5500', 20);
                  this.renderer.triggerScreenShake(12, 0.25);
                  
                  this.flock.splice(i, 1);
                  
                  // If leader bird died, promote next one in line
                  if (i === 0 && this.flock.length > 0) {
                    this.bird = this.flock[0];
                    this.bird.isInvincible = true;
                    setTimeout(() => {
                      this.bird.isInvincible = false;
                    }, 1500);
                  }
                  
                  // If all birds are dead, trigger crash/game over
                  if (this.flock.length === 0) {
                    this.handleCrash();
                  }
                  break;
                }
              }
            }
          }
        } else {
          if (!this.bird.isInvincible && !this.bird.isGhost && !this.boosterActive && !this.boosterDeactivating) {
            const collidedObs = this.obstacleManager.enforceBoundariesAndCheckCollisions(
              this.bird,
              height,
              selectedDifficulty
            );

            if (collidedObs) {
              if (this.bird.hasShield) {
                this.bird.hasShield = false;
                this.shieldBrokenThisRun = true;
                delete this.activePowerupsList['shield'];
                this.bird.isInvincible = true;
                
                // Explode shield wave
                if (this.gameMode === 'level') {
                  this.particleEngine.emitRing(this.bird.x, this.bird.y, '#00f3ff', 24);
                  this.renderer.triggerScreenShake(20, 0.4);
                }
                this.soundManager.playShieldDeflect();
                
                // Temporary invincibility safety delay
                setTimeout(() => {
                  this.bird.isInvincible = false;
                }, 1500);
              } else {
                // Crash
                this.handleCrash();
              }
            }
          }
        }

        // Trigger Level Completion sequence directly once all Level Mode obstacles have been passed and cleared from screen
        // For Levels 1–5: effective score cap is targetScore - 2 (last 2 obstacles removed)
        const _levelNumForComplete = this.activeLevelConfig ? this.activeLevelConfig.levelNum : -1;
        const _effectiveTargetScore = (_levelNumForComplete >= 1 && _levelNumForComplete <= 5)
          ? this.activeLevelConfig!.targetScore - 2
          : (this.activeLevelConfig ? this.activeLevelConfig.targetScore : 0);
        if (this.gameMode === 'level' && this.activeLevelConfig && this.score >= _effectiveTargetScore) {
          if (this.obstacleManager.getList().length === 0) {
            this.triggerLevelComplete();
          }
        }

        // Trigger Boss Warning in Squad Survival (Flock) mode every 75 obstacles (score gap)
        if (this.gameMode === 'flock' && this.score >= this.nextBossScore) {
          this.triggerBossWarning();
        }
      } else if (this.state === 'BOSS_FIGHT') {
        // Boss battle phase
        const bossDefeated = this.bossManager.update(
          dt,
          this.bird.x,
          this.bird.y,
          this.bird.radius,
          width,
          height,
          this.particleEngine,
          this.soundManager,
          activeTimeScale
        );

        if (bossDefeated) {
          // Boss defeated trigger
          if (this.gameMode === 'level') {
            this.triggerLevelComplete();
          } else {
            this.progressManager.incrementAchievement('boss_slayer', 1);
            this.progressManager.updateQuestProgress('boss', 1);
            this.soundManager.playLevelUp();
            this.particleEngine.emitRing(width * 0.7, height * 0.5, '#ffd700', 40);

            this.state = 'PLAYING';
            this.incrementScore(10); // Massive points
            if (this.gameMode === 'flock') {
              this.nextBossScore = Math.ceil((this.score + 1) / 75) * 75;
            }
          }
        }

        // Check boss or bullet hitting bird / flock
        if (this.gameMode === 'flock') {
          // Loop through all birds in the flock (both leader and followers)
          for (let i = this.flock.length - 1; i >= 0; i--) {
            const b = this.flock[i];
            if (!b.isInvincible) {
              const bossHit = this.bossManager.checkCollisions(b.x, b.y, b.radius);
              if (bossHit) {
                if (b.hasShield) {
                  b.hasShield = false;
                  this.shieldBrokenThisRun = true;
                  delete this.activePowerupsList['shield'];
                  
                  // Temporary invincibility safety delay for the whole flock
                  for (const fb of this.flock) {
                    fb.isInvincible = true;
                    fb.hasShield = false;
                  }
                  
                  this.particleEngine.emitRing(b.x, b.y, '#00f3ff', 24);
                  this.soundManager.playShieldDeflect();
                  this.renderer.triggerScreenShake(20, 0.4);
                  
                  setTimeout(() => {
                    for (const fb of this.flock) {
                      fb.isInvincible = false;
                    }
                  }, 1500);
                } else {
                  // No shield.
                  if (i === 0 && this.playerBossHP > 0) {
                    // Leader bird is hit and has merged boss HP
                    this.playerBossHP -= 1;
                    
                    this.particleEngine.emitExplosion(b.x, b.y, b.getSkin().glowColor, 20);
                    this.soundManager.playExplosion();
                    this.renderer.triggerScreenShake(12, 0.25);
                    window.dispatchEvent(new CustomEvent('bird_damaged'));

                    // Check if HP reached 0, reset size multiplier
                    if (this.playerBossHP <= 0) {
                      this.playerBossHP = 0;
                      b.sizeMultiplier = 1.0;
                    }

                    // Temporary invincibility safety delay for the leader
                    b.isInvincible = true;
                    setTimeout(() => {
                      b.isInvincible = false;
                    }, 1500);
                  } else {
                    // Leader with 0 HP, or a follower bird is hit
                    this.particleEngine.emitExplosion(b.x, b.y, b.getSkin().glowColor, 20);
                    this.soundManager.playExplosion();
                    this.renderer.triggerScreenShake(12, 0.25);
                    
                    this.flock.splice(i, 1);
                    
                    // If leader bird died, promote next one in line
                    if (i === 0 && this.flock.length > 0) {
                      this.bird = this.flock[0];
                      this.bird.isInvincible = true;
                      
                      // Reset merged HP since the new leader wasn't part of the original merge HP
                      this.playerBossHP = 0;
                      this.bird.sizeMultiplier = 1.0;

                      setTimeout(() => {
                        this.bird.isInvincible = false;
                      }, 1500);
                    }
                    
                    // If all birds are dead, trigger crash/game over
                    if (this.flock.length === 0) {
                      this.handleCrash();
                    }
                  }
                }
                break; // Break the flock loop for this frame to avoid multiple simultaneous hits
              }
            }
          }
        } else {
          if (!this.bird.isInvincible) {
            const bossHit = this.bossManager.checkCollisions(this.bird.x, this.bird.y, this.bird.radius);
            if (bossHit) {
              if (this.bird.hasShield) {
                this.bird.hasShield = false;
                this.shieldBrokenThisRun = true;
                delete this.activePowerupsList['shield'];
                this.bird.isInvincible = true;
                this.particleEngine.emitRing(this.bird.x, this.bird.y, '#00f3ff', 20);
                this.soundManager.playShieldDeflect();
                this.renderer.triggerScreenShake(15, 0.3);
                setTimeout(() => { this.bird.isInvincible = false; }, 1500);
              } else {
                this.handleCrash();
              }
            }
          }
        }
      }

      // Check items pickup — all birds in flock collect all objects in their path
      const isNeonCrowUltimate = this.ultimateActive && this.bird.getSkin().id === 'neon_crow';
      if (this.gameMode === 'flock' || isNeonCrowUltimate) {
        const flockLen = this.flock.length;
        for (let idx = 0; idx < flockLen; idx++) {
          const b = this.flock[idx];
          if (!b) continue;
          // Keep collecting until no more items are in range for this bird (with 1.15x sensitivity boost)
          let collectedType = this.powerupManager.checkItemCollisions(
            b.x,
            b.y,
            b.radius * b.sizeMultiplier * 1.15,
            this.particleEngine,
            this.soundManager
          );
          while (collectedType) {
            this.activatePowerup(collectedType);
            collectedType = this.powerupManager.checkItemCollisions(
              b.x,
              b.y,
              b.radius * b.sizeMultiplier * 1.15,
              this.particleEngine,
              this.soundManager
            );
          }
        }
      } else {
        const collectedType = this.powerupManager.checkItemCollisions(
          this.bird.x,
          this.bird.y,
          this.bird.radius * this.bird.sizeMultiplier,
          this.particleEngine,
          this.soundManager
        );
        if (collectedType) {
          this.activatePowerup(collectedType);
        }
      }

    } else if (this.state === 'GAMEOVER') {
      // Crash spinning physics update
      this.bird.update(dt, this.particleEngine, true, 1.0, this.score);
      this.renderer.update(dt, 0, this.bird.y, 1.0, this.state);

      // Bounce once hit floor or ceiling
      if (this.bird.y >= height - 40) {
        this.bird.y = height - 40;
        this.bird.vy = 0;
      } else if (this.bird.y - this.bird.radius < 5) {
        this.bird.y = 5 + this.bird.radius;
        this.bird.vy = 0;
      }
    } else if (this.state === 'BOSS_WARNING') {
      // Cinematic Boss warning sequence
      this.bossWarningTimer += dt;
      this.bird.update(dt, this.particleEngine, true, 1.0, this.score);
      
      // Keep follower birds updated during boss warning cinematic so they do not freeze
      this.updateFlockFollowers(dt, 1.0);
      
      // Keep bird within screen boundaries during boss warning
      if (this.bird.y - this.bird.radius < 5) {
        this.bird.y = 5 + this.bird.radius;
        if (this.bird.vy < 0) this.bird.vy = 0;
      }
      if (this.bird.y + this.bird.radius > height - 35) {
        this.bird.y = height - 35 - this.bird.radius;
        if (this.bird.vy > 0) this.bird.vy = 0;
      }

      this.renderer.update(dt, this.scrollSpeed * 0.5, this.bird.y, 1.0, this.state);
      
      if (Math.random() < 0.1) {
        this.renderer.triggerScreenShake(8, 0.15);
      }

      if (this.bossWarningTimer >= 2.5) {
        this.state = 'BOSS_FIGHT';
        this.bossManager.triggerBossFight(this.progressManager.getState().activeWorld, width, height);
      }
    } else if (this.state === 'MENU') {
      // Floating bird on main menu
      this.bird.y = 300 + Math.sin(Date.now() * 0.003) * 15;
      this.bird.angle = Math.sin(Date.now() * 0.003) * 0.1;
    }
  }

  private triggerRocketExplosion(rx: number, ry: number) {
    this.soundManager.playExplosion();
    this.renderer.triggerScreenShake(8, 0.25);
    this.particleEngine.emitRing(rx, ry, '#00f3ff', 33);
    this.particleEngine.emitExplosion(rx, ry, '#d946ef', 21);
    
    const obstaclesList = this.obstacleManager.getList();
    const radius = 130;
    const height = this.renderer.canvas.height / this.renderer.dpr;
    
    obstaclesList.forEach(obs => {
      if (obs.isDestroyed || !obs.isDestructible) return;
      
      const distToTop = Math.min(
        Math.hypot(rx - (obs.x + obs.width / 2), ry - obs.topHeight / 2),
        Math.hypot(rx - (obs.x + obs.width / 2), ry - obs.topHeight)
      );
      
      const distToBottom = Math.min(
        Math.hypot(rx - (obs.x + obs.width / 2), ry - (height - obs.bottomHeight / 2)),
        Math.hypot(rx - (obs.x + obs.width / 2), ry - (height - obs.bottomHeight))
      );
      
      if (distToTop < radius || distToBottom < radius) {
        obs.hp = 0;
        obs.isDestroyed = true;
        if (this.gameMode === 'flock' || this.progressManager.getState().selectedZone === 'chaos') this.destroyedPipesCount++;
        this.triggerStoneDebris(obs, height);
      }
    });
  }

  private triggerStoneDebris(obs: any, height: number) {
    for (let d = 0; d < 16; d++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      const size = 6 + Math.random() * 8;
      this.particleEngine.spawn(
        obs.x + obs.width / 2,
        obs.topHeight,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        '#7f8c8d',
        size,
        1.0,
        0.012 + Math.random() * 0.008,
        'square',
        false,
        undefined,
        -0.03
      );
      this.particleEngine.spawn(
        obs.x + obs.width / 2,
        height - obs.bottomHeight,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        '#95a5a6',
        size,
        1.0,
        0.012 + Math.random() * 0.008,
        'square',
        false,
        undefined,
        -0.03
      );
    }
    this.soundManager.playExplosion();
    this.renderer.triggerScreenShake(6, 0.25);
  }

  // Auto-Pilot Spectator Neural Simulator
  private runAutopilotAI(height: number) {
    // Look at nearest obstacle
    const obstacles = this.obstacleManager.getList();
    let targetY = height / 2; // Default safe screen center
    
    const nextObstacle = obstacles.find(obs => obs.x + obs.width > this.bird.x - this.bird.radius);
    
    if (nextObstacle) {
      // Find gap coordinates
      const gapTop = nextObstacle.topHeight;
      const gapBottom = height - nextObstacle.bottomHeight;
      targetY = gapTop + (gapBottom - gapTop) * 0.5;
    } else if (this.state === 'BOSS_FIGHT') {
      // Target floating charge pulse or hover at safe height
      targetY = this.bossManager.isBossActive() ? this.bossManager.getBossY() + (Math.sin(Date.now() * 0.005) * 50) : height / 2;
    }

    // AI triggers wing jump when below target line
    if (this.bird.y > targetY + 6 && this.bird.vy > 1.2) {
      this.jump();
    }
  }

  private handleCrash() {
    console.log("DEBUG CRASH DETECTED! score =", this.score, "bird =", {x: this.bird.x, y: this.bird.y, vy: this.bird.vy, isInvincible: this.bird.isInvincible});
    console.trace();
    this.bird.isCrashing = true;
    this.soundManager.playExplosion();
    
    // Crash animation effects in all game modes (reduced by 45%)
    this.renderer.triggerScreenShake(16, 0.33);
    const skinGlow = this.bird.getSkin().glowColor || '#ff3c2e';
    this.particleEngine.emitExplosion(this.bird.x, this.bird.y, skinGlow, 22);
    this.particleEngine.emitRing(this.bird.x, this.bird.y, '#ffffff', 11);
    this.particleEngine.emitRing(this.bird.x, this.bird.y, skinGlow, 19);
    
    // Check if player owns an automatic Revive safety feather powerup active
    if (this.activePowerupsList['revive']) {
      delete this.activePowerupsList['revive'];
      
      // Auto trigger spectacular revive burst
      this.bird.isCrashing = false;
      this.bird.isInvincible = true;
      this.bird.vy = -5.0;
      this.particleEngine.emitRing(this.bird.x, this.bird.y, '#ffa07a', 30);
      
      setTimeout(() => {
        this.bird.isInvincible = false;
      }, 2000);
      return;
    }

    // Stop world music during revive screen as per user request
    this.soundManager.stopMusic();
    // Unlimited revives allowed!
    this.preReviveState = this.state === 'BOSS_WARNING' || this.state === 'BOSS_FIGHT' ? this.state : 'PLAYING';
    this.state = 'REVIVE_CHOICE';
    this.reviveCountdown = 5.0;
    this.reviveCardVisible = false;
    setTimeout(() => {
      if (this.state === 'REVIVE_CHOICE') {
        this.reviveCardVisible = true;
        window.dispatchEvent(new CustomEvent('game_revived'));
      }
    }, 2000);
  }

  public confirmGameOver() {
    this.state = 'GAMEOVER';
    this.soundManager.stopMusic();

    // Process highscores
    this.progressManager.addScore(this.score, this.gameMode);
    
    // Progress Squad Survival time achievement on game over
    if (this.gameMode === 'flock') {
      this.progressManager.incrementAchievement('survival_legend', Math.floor(this.squadSurvivalTime));
    }

    // Chaos Zone bonus: convert every destroyed obstacle into a coin
    if (this.progressManager.getState().selectedZone === 'chaos' && this.destroyedPipesCount > 0) {
      this.progressManager.addCoins(this.destroyedPipesCount);
      this.coinsCollectedThisRun += this.destroyedPipesCount;
    }

    // Save
    this.progressManager.save();

    // Custom UI trigger
    window.dispatchEvent(new CustomEvent('game_over_state', { detail: { score: this.score } }));
  }

  public attemptRevive(): boolean {
    const progress = this.progressManager.getState();
    if (progress.gems < 5) return false;

    // Deduct gems
    this.progressManager.addGems(-5);
    this.progressManager.save();

    this.revivesUsedThisRun++;
    this.hasRevivedThisRun = false; // Unlimited revives!
    
    // Ensure flock is restored in flock modes so collisions and collections resume
    if (this.gameMode === 'flock') {
      this.flock = [this.bird];
      this.mergeReadyCount = 1;
    }
    
    this.bird.isCrashing = false;
    this.bird.isInvincible = true;
    this.bird.vy = 0;
    this.bird.hasShield = false;

    // Find the next obstacle ahead of the bird to float in the center of the path gap
    const obstacles = this.obstacleManager.getList();
    let nextObstacle = null;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.x + obs.width > this.bird.x) {
        nextObstacle = obs;
        break;
      }
    }
    
    const height = this.renderer.canvas.height / this.renderer.dpr;
    let gapCenterY = height / 2;
    if (nextObstacle) {
      const gapTop = nextObstacle.topHeight;
      const gapBottom = height - nextObstacle.bottomHeight;
      gapCenterY = gapTop + (gapBottom - gapTop) * 0.5;
    }
    
    this.bird.y = gapCenterY;
    this.reviveFloatY = gapCenterY;
    
    // Trigger double tap waiting mode
    this.waitingForDoubleTapAfterRevive = true;

    // Sparkles and deflect sound effect
    this.particleEngine.emitRing(this.bird.x, this.bird.y, '#ffd700', 30);
    this.particleEngine.emitExplosion(this.bird.x, this.bird.y, '#00ffcc', 25);
    this.soundManager.playShieldDeflect();

    // Resume gameplay state
    this.state = this.preReviveState;
    this.soundManager.startMusic(this.progressManager.getState().activeWorld);

    // Dispatch event
    window.dispatchEvent(new CustomEvent('game_revived'));
    return true;
  }

  public attemptReviveFree(): void {
    this.revivesUsedThisRun++;
    this.hasRevivedThisRun = false;
    
    // Ensure flock is restored in flock modes so collisions and collections resume
    if (this.gameMode === 'flock') {
      this.flock = [this.bird];
      this.mergeReadyCount = 1;
    }
    
    this.bird.isCrashing = false;
    this.bird.isInvincible = true;
    this.bird.vy = 0;
    this.bird.hasShield = false;

    // Find the next obstacle ahead of the bird to float in the center of the path gap
    const obstacles = this.obstacleManager.getList();
    let nextObstacle = null;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.x + obs.width > this.bird.x) {
        nextObstacle = obs;
        break;
      }
    }
    
    const height = this.renderer.canvas.height / this.renderer.dpr;
    let gapCenterY = height / 2;
    if (nextObstacle) {
      const gapTop = nextObstacle.topHeight;
      const gapBottom = height - nextObstacle.bottomHeight;
      gapCenterY = gapTop + (gapBottom - gapTop) * 0.5;
    }
    
    this.bird.y = gapCenterY;
    this.reviveFloatY = gapCenterY;
    
    // Trigger double tap waiting mode
    this.waitingForDoubleTapAfterRevive = true;

    // Sparkles and deflect sound effect
    this.particleEngine.emitRing(this.bird.x, this.bird.y, '#ffd700', 30);
    this.particleEngine.emitExplosion(this.bird.x, this.bird.y, '#00ffcc', 25);
    this.soundManager.playShieldDeflect();

    // Resume gameplay state
    this.state = this.preReviveState;
    this.soundManager.startMusic(this.progressManager.getState().activeWorld);

    // Save progression
    this.progressManager.save();

    // Dispatch event
    window.dispatchEvent(new CustomEvent('game_revived'));
  }

  // private transitionToNextWorld() {
  //   const worlds = ['jungle', 'ice', 'desert', 'volcano', 'space', 'underwater', 'heaven'];
  //   const currentIdx = worlds.indexOf(this.progressManager.getState().activeWorld);
  //   const nextIdx = (currentIdx + 1) % worlds.length;
  //   const nextWorld = worlds[nextIdx];
  //   
  //   this.progressManager.getState().activeWorld = nextWorld;
  //   this.renderer.setWeather(nextWorld);
  //   
  //   // Switch music smoothly
  //   this.soundManager.stopMusic();
  //   this.soundManager.startMusic(nextWorld);
  //   
  //   // Show a floating text notification
  //   window.dispatchEvent(new CustomEvent('achievement_unlocked', {
  //     detail: { name: `WORLD TRANSITION`, desc: `Entering the ${nextWorld.toUpperCase()} atmosphere!` }
  //   }));
  // }

  private incrementScore(amt = 1) {
    let multiplier = this.scoreMultiplier;
    if (this.bird.getSkin().id === 'legendary_eagle_king' && this.ultimateActive) {
      multiplier *= 2; // Legendary Eagle King gets 2x score only when ultimate is active!
    }
    this.score += amt * multiplier;
    
    // Trigger earthquake every 20 obstacles in Chaos Mode (Squad Mode only)
    if (this.progressManager.getState().selectedZone === 'chaos' && this.gameMode === 'flock') {
      this.chaosObstaclesPassed += amt;
      if (this.chaosObstaclesPassed >= 20) {
        this.chaosObstaclesPassed = 0;
        this.triggerEarthquake();
      }
    }
    
    if (this.ultimateActive && this.bird.getSkin().id === 'dread_falcon') {
      this.falconObstaclesPassed += amt;
    }
    this.progressManager.incrementAchievement('first_flight', this.score);

    // Quest progression for high score pass
    this.progressManager.updateQuestProgress('score', this.score, true);
    
    // Custom quests: Kingfisher score of 300
    if (this.bird.getSkin().id === 'kingfisher') {
      this.progressManager.updateQuestProgress('kingfisher_pts', this.score, true);
    }

    // Custom quests: Volcanic Spring score of 100
    if (this.progressManager.getState().activeWorld === 'volcano') {
      this.progressManager.updateQuestProgress('volcano_pts', this.score, true);
    }
    
    // Play subtle chime on score pass
    this.soundManager.playCoin();

    // Demo completion checks were removed  
  }

  private triggerEarthquake() {
    this.activeChaosEvent = 'earthquake';
    this.chaosEventTimer = 8.0;
    this.chaosEventAnnounceTimer = 2.5;
    this.soundManager.playSpeedBoost();

    window.dispatchEvent(new CustomEvent('hud_alert', {
      detail: { text: 'EARTHQUAKE', sub: '' }
    }));
  }

  private triggerBossWarning() {
    this.state = 'BOSS_WARNING';
    this.bossWarningTimer = 0;
    this.obstacleManager.clear();
  }

  private triggerLevelComplete() {
    if (this.gameMode !== 'level' || !this.activeLevelConfig) return;

    // Award gems according to level bracket when level is completed: 1-20 (3 gems), 21-40 (4 gems), 41-50 (5 gems)
    const levelNum = this.currentLevelNum;
    let bossGems = 3;
    if (levelNum >= 1 && levelNum <= 20) {
      bossGems = 3;
    } else if (levelNum >= 21 && levelNum <= 40) {
      bossGems = 4;
    } else if (levelNum >= 41 && levelNum <= 50) {
      bossGems = 5;
    }
    this.gemsCollectedThisRun += bossGems;
    this.progressManager.addGems(bossGems);
    this.progressManager.updateQuestProgress('gems', bossGems);

    // Play chime / sounds and register completion stats
    this.soundManager.playLevelUp();

    const width = this.renderer.canvas.width / this.renderer.dpr;
    const height = this.renderer.canvas.height / this.renderer.dpr;
    this.particleEngine.emitRing(width * 0.7, height * 0.5, '#ffd700', 40);

    // Level complete state
    this.state = 'LEVEL_COMPLETE' as any;
    this.soundManager.stopMusic();
    
    this.progressManager.setLevelComplete(this.currentLevelNum, 0);
    
    window.dispatchEvent(new CustomEvent('level_complete_state', {
      detail: {
        levelNum: this.currentLevelNum,
        score: this.score,
        targetScore: this.activeLevelConfig.targetScore,
        coinsGained: this.coinsCollectedThisRun,
        gemsGained: this.gemsCollectedThisRun
      }
    }));
  }

  // Activate game changing powerup mechanics
  public activatePowerup(type: string) {
    let duration = 8.0; // Seconds base
    let max = 8.0;

    if (type === 'rescue') {
      if (this.gameMode === 'flock') {
        const skin = this.bird.getSkin();
        const newBird = new Bird(skin);
        newBird.x = this.bird.x - 100;
        newBird.y = this.bird.y;
        this.flock.push(newBird);
        this.particleEngine.emitRing(newBird.x, newBird.y, skin.glowColor || '#ffaa00', 15);
        this.soundManager.playLevelUp();
        
        this.birdsJoinedThisRun++;
        this.rescuedBirdsTotal++;
        this.mergeReadyCount = this.flock.length;

        // Progress achievements
        this.progressManager.incrementAchievement('bird_savior', 1);
        this.progressManager.updateQuestProgress('rescue', 1);
      }
      return;
    }

    // 'merge' type is no longer used as a path pickup —
    // Hyper Boost now auto-fires when 6 birds have joined.
    if (type === 'merge') {
      return;
    }

    if (type === 'booster') {
      return;
    }

    if (type === 'coin') {
      let coinVal = 1;
      if (this.score >= 300 && this.score < 500) {
        coinVal = 2;
      } else if (this.score >= 500) {
        coinVal = 3;
      }
      if (this.bird.getSkin().id === 'legendary_eagle_king' && this.ultimateActive) {
        coinVal *= 2; // Legendary Eagle King gets 2x coins only when ultimate is active!
      }
      this.coinsCollectedThisRun += coinVal;
      this.progressManager.addCoins(coinVal);
      this.progressManager.updateQuestProgress('coins', coinVal);
      // Reward Ultimate energy (only outside endless/flock modes)
      if (!this.ultimateActive && this.gameMode !== 'endless' && this.gameMode !== 'flock') {
        this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 8 * coinVal);
      }
      return;
    }

    if (type === 'gem') {
      let gemVal = 1;
      if (this.bird.getSkin().id === 'legendary_eagle_king' && this.ultimateActive) {
        gemVal *= 2; // Legendary Eagle King gets 2x gems only when ultimate is active!
      }
      this.gemsCollectedThisRun += gemVal;
      this.progressManager.addGems(gemVal);
      this.progressManager.updateQuestProgress('gems', gemVal);
      // Reward Ultimate energy (only outside endless/flock modes)
      if (!this.ultimateActive && this.gameMode !== 'endless' && this.gameMode !== 'flock') {
        this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 15);
      }
      return;
    }

    if (['shield', 'slowmo', 'magnet', 'double', 'turbo', 'ghost', 'mini', 'weapon'].includes(type)) {
      this.progressManager.updateQuestProgress('collect_powerups', 1);
    }

    if (type === 'shield') {
      this.bird.hasShield = true;
    } else if (type === 'weapon') {
      const weaponTypes: ('bullet' | 'laser' | 'rocket' | 'blade')[] = ['bullet', 'laser', 'rocket', 'blade'];
      this.weaponType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
      if (this.weaponActive) {
        this.weaponLevel = Math.min(3, this.weaponLevel + 1);
      } else {
        this.weaponActive = true;
        this.weaponLevel = 1;
      }
      duration = 15.0;
      max = 15.0;
    } else if (type === 'gravity') {
      // Toggle gravity flip state immediately
      this.gravityFlipped = !this.gravityFlipped;
      this.soundManager.playSpeedBoost();
      // Spawn flashy portal explosion particles!
      this.particleEngine.emitRing(this.bird.x, this.bird.y, '#d946ef', 18);
      this.renderer.triggerScreenShake(4, 0.15);
      return; // Do not add to activePowerupsList since it's an instant toggle!
    } else if (type === 'slowmo') {
      this.timeScale = 0.55;
      duration = 10.0;
      max = 10.0;
    } else if (type === 'magnet') {
      duration = 12.0;
      max = 12.0;
    } else if (type === 'double') {
      this.scoreMultiplier = 2;
    } else if (type === 'turbo') {
      this.bird.isInvincible = true;
      this.scrollSpeed = this.baseScrollSpeed * 2.3;
      duration = 5.0;
      max = 5.0;
    } else if (type === 'ghost') {
      this.bird.isGhost = true;
      duration = 6.0;
      max = 6.0;
    } else if (type === 'mini') {
      this.bird.sizeMultiplier = 0.55;
      duration = 10.0;
      max = 10.0;
    }

    // Apply powerup upgrades multiplier (boosts duration by 15% per upgrade level)
    const upgrades = this.progressManager.getState().powerupUpgrades || {};
    const lvl = upgrades[type] || 1;
    const multiplier = 1 + (lvl - 1) * 0.15;
    duration *= multiplier;
    max *= multiplier;

    // Add or reset powerup timer
    this.activePowerupsList[type] = {
      type,
      durationLeft: duration,
      maxDuration: max
    };

    window.dispatchEvent(new CustomEvent('powerup_activated', { detail: { type, duration } }));
  }

  private updatePowerupTimers(dt: number) {
    for (const key in this.activePowerupsList) {
      const pow = this.activePowerupsList[key];
      pow.durationLeft -= dt;

      // Pulse visual speed trails during Turbo boost
      if (key === 'turbo') {
        const speedTrailColor = this.bird.getSkin().glowColor;
        this.particleEngine.spawn(
          this.bird.x - this.bird.radius,
          this.bird.y + (Math.random() - 0.5) * 10,
          -12 - Math.random() * 4,
          (Math.random() - 0.5) * 2,
          speedTrailColor,
          6 + Math.random() * 4,
          1.0,
          0.05,
          'spark',
          true,
          speedTrailColor
        );
      }

      if (pow.durationLeft <= 0) {
        // Powerup expired
        this.deactivatePowerup(pow.type);
        delete this.activePowerupsList[key];
      }
    }
  }

  private deactivatePowerup(type: string) {
    if (type === 'shield') {
      this.bird.hasShield = false;
    } else if (type === 'slowmo') {
      this.timeScale = 1.0;
    } else if (type === 'double') {
      this.scoreMultiplier = 1;
    } else if (type === 'turbo') {
      this.bird.isInvincible = false;
      this.scrollSpeed = this.baseScrollSpeed;
    } else if (type === 'ghost') {
      this.bird.isGhost = false;
    } else if (type === 'mini') {
      this.bird.sizeMultiplier = 1.0;
    } else if (type === 'weapon') {
      this.weaponActive = false;
      this.weaponLevel = 0;
    }
    window.dispatchEvent(new CustomEvent('powerup_expired', { detail: { type } }));
  }

  public jump() {
    if (this.boosterActive) return;

    if (this.waitingForDoubleTapAfterRevive) {
      // Single tap confirmed! Resume game!
      this.waitingForDoubleTapAfterRevive = false;

      // Add shield powerup and invincibility (only starts ticking down now!)
      this.bird.isInvincible = true;
      this.bird.hasShield = true;
      const shieldDuration = this.gameMode === 'level' ? 4.025 : 3.5;
      this.activePowerupsList['shield'] = {
        type: 'shield',
        durationLeft: shieldDuration,
        maxDuration: shieldDuration
      };

      // Invincibility timeout starts now
      setTimeout(() => {
        if (this.state === 'PLAYING' || this.state === 'BOSS_FIGHT' || this.state === 'BOSS_WARNING') {
          this.bird.isInvincible = false;
        }
      }, shieldDuration * 1000);

      this.bird.jump(this.soundManager, this.score);

      // Force UI redraw to clear the alert
      window.dispatchEvent(new CustomEvent('game_revived'));
      return;
    }

    if (this.state === 'PLAYING' && !this.firstTapDone) {
      this.firstTapDone = true;
      const currentCount = parseInt(localStorage.getItem('legends_tap_instruction_count') || '0', 10);
      if (currentCount < 10) {
        localStorage.setItem('legends_tap_instruction_count', (currentCount + 1).toString());
      }
    }
    this.bird.jump(this.soundManager, this.score);
  }

  // Trigger the Hyper Booster Ability (1s duration, passes 50 obstacles, 1s cooldown)
  public triggerBooster() {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS_FIGHT' && this.state !== 'BOSS_WARNING') return;
    if (this.boosterActive || this.boosterDeactivating) return;
    if (this.boosterSpawnTimer > 0) return; // Must be cooled down

    this.boosterActive = true;
    this.boosterTimer = 25.0; // 25 obstacles to pass
    this.boosterScoreAccumulator = 0.0;
    this.bird.isInvincible = true;
    this.boosterTapsThisRun++;

    this.soundManager.playSpeedBoost();
    this.renderer.triggerScreenShake(12, 0.25);
  }

  // Trigger the Ultimate Special Ability (Option 2)
  public triggerUltimate() {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS_FIGHT') return;
    if (this.gameMode === 'level') return; // Restrict ultimate special ability in levels mode
    if (this.ultimateActive || this.ultimateEnergy < 100) return;

    this.ultimateActive = true;
    this.ultimateEnergy = 0;
    this.bird.ultimateStartVy = this.bird.vy;
    this.progressManager.updateQuestProgress('use_ultimate', 1);

    const skin = this.bird.getSkin();
    const lvl = skin.upgradeLevel || 1;
    let duration = 10.0;
    if (lvl === 1) duration = 10.0;
    else if (lvl === 2) duration = 12.0;
    else if (lvl === 3) duration = 14.0;
    else if (lvl === 4) duration = 16.0;
    else if (lvl === 5) duration = 20.0;

    if (skin.id === 'angry_red') {
      duration = 20.0;
    }

    let subtext = 'SPECIAL ACTIVE ABILITY RELEASED!';

    // Play a cool ultimate trigger sound & tremors shake
    this.soundManager.playLevelUp();
    this.renderer.triggerScreenShake(24, 0.45);

    // Trigger explosive ultimate sparkles
    const skinColor = skin.glowColor || '#ffd700';
    this.particleEngine.emitRing(this.bird.x, this.bird.y, skinColor, 32);
    this.particleEngine.emitExplosion(this.bird.x, this.bird.y, '#ffffff', 20);

    const id = skin.id;
    if (id === 'default') {
      // Sky Sovereign: Micro Glider
      this.bird.sizeMultiplier = 0.60;
      subtext = 'MICRO SIZE ACTIVE!';
    } else if (id === 'neon_crow') {
      // Neon Raven: Cyber Clone
      subtext = 'CYBER CLONE ACTIVE!';
      this.preUltimateFlockLength = this.flock.length;
      if (this.gameMode !== 'flock') {
        this.flock = [this.bird];
      }
      const cloneBird = new Bird(skin);
      cloneBird.x = this.bird.x - 60;
      cloneBird.y = this.bird.y;
      this.flock.push(cloneBird);
    } else if (id === 'white_dragon') {
      // Seto Drake: Lunar Sanctuary
      this.bird.hasShield = true;
      this.bird.isInvincible = true;
      subtext = 'FULL INVINCIBILITY & PROTECTIVE SHIELD!';
    } else if (id === 'kingfisher') {
      // Azure Kingfisher: Temporal Distortion
      this.timeScale = 0.70; // 30% slowmo
      subtext = 'WORLD TIME DILATED BY 30%!';
    } else if (id === 'dread_owl') {
      // Great Horned Owl: Ghost Walk
      this.bird.isGhost = true;
      subtext = 'PHASE THROUGH ALL SOLID PIPES!';
    } else if (id === 'dread_falcon') {
      // Charan Falcon: Sonic Supercharge
      this.bird.isInvincible = true;
      this.scrollSpeed = this.baseScrollSpeed * 3.64;
      subtext = 'SUPERSONIC SPEED BLAST ACTIVE!';
      this.falconScoreAccumulator = 0.0;
      this.falconObstaclesPassed = 0;
    } else if (id === 'legendary_eagle_king') {
      // Legendary Eagle King: Aurum Gilded Age
      this.bird.hasShield = true;
      this.scoreMultiplier = 3;
      subtext = '3X SCORE & COINS + COIN MAGNET!';
    } else if (id === 'angry_red') {
      // Angry Bird: Cyber Magnet
      subtext = 'SCREEN-WIDE COIN HARVESTER ACTIVE!';
    } else if (id === 'articuno') {
      // Ice Phoenix: Temporal Freeze
      this.scrollSpeed = 0.0;
      subtext = `ALL OBSTACLES AND MOTION FROZEN FOR ${duration} SECONDS!`;
    } else if (id === 'jade_lotus') {
      // Lotus Hummingbird: Temporal Dilation
      this.timeScale = 0.30; // 70% slow-mo
      subtext = 'WORLD TIME SLOWED BY 70%! HYPER AGILITY ACTIVE!';
    } else if (id === 'pterodactyl') {
      // Primal Pterodactyl: Primal Temporal Glide
      this.bird.isInvincible = true;
      this.timeScale = 0.50; // 50% slow-mo
      this.scrollSpeed = this.baseScrollSpeed * 1.50; // 1.5x speed blast
      subtext = 'PRIMAL GLIDE ACTIVE! 50% SLOW-MO + 1.5X SPEED BLAST!';
    } else if (id === 'crimson_dragon') {
      // Crimson Wyvern: Crimson Inferno Blast
      this.bird.isInvincible = true;
      this.scrollSpeed = this.baseScrollSpeed * 1.80; // 1.8x speed blast
      subtext = 'INFERNO BLAST ACTIVE! 1.8X SPEED BOOST + INVINCIBILITY!';
    }

    this.ultimateMaxDuration = duration;
    this.ultimateDurationLeft = duration;

    // Dispatch a beautiful custom event to display alerts on the HUD
    window.dispatchEvent(new CustomEvent('hud_alert', { 
      detail: { 
        text: `${skin.name.toUpperCase()} ULTIMATE!`, 
        sub: subtext 
      } 
    }));
  }

  // Deactivate the active Ultimate powerup cleanly
  private deactivateUltimate() {
    this.ultimateActive = false;

    if (this.gameMode !== 'flock') {
      this.flock = [];
    } else {
      if (this.preUltimateFlockLength > 0 && this.flock.length > this.preUltimateFlockLength) {
        this.flock = this.flock.slice(0, this.preUltimateFlockLength);
      }
    }

    // Reset variables modified by ultimate abilities
    this.timeScale = 1.0;
    this.scrollSpeed = this.baseScrollSpeed;
    this.scoreMultiplier = 1;
    this.bird.isInvincible = false;
    this.bird.isGhost = false;

    // Restore starting velocity as final velocity
    this.bird.vy = this.bird.ultimateStartVy;

    if (!this.activePowerupsList['shield']) {
      this.bird.hasShield = false;
    }

    // Reset default size multiplier
    let baseSizeMult = 1.0;
    this.bird.sizeMultiplier = baseSizeMult;

    window.dispatchEvent(new CustomEvent('hud_alert', { 
      detail: { 
        text: 'ULTIMATE EXPIRED', 
        sub: 'COLLECT COINS & GEMS TO RECHARGE!' 
      } 
    }));
  }

  public togglePause() {
    if (this.state === 'PLAYING' || this.state === 'BOSS_FIGHT') {
      this.state = 'PAUSED';
      this.soundManager.stopMusic();
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.soundManager.startMusic(this.progressManager.getState().activeWorld);
    }
  }

  public getActivePowerups(): ActivePowerup[] {
    return Object.values(this.activePowerupsList);
  }

  // cycleFormation was removed to keep the game lightweight

  public enterPhotoMode() {
    if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'BOSS_FIGHT' || this.state === 'MENU') {
      const lastState = this.state;
      this.state = 'PHOTO_MODE';
      this.soundManager.stopMusic();
      return lastState;
    }
    return null;
  }

  // ── SQUAD SURVIVAL FOLLOWER UPDATES ──────────────────────────────────────────

  private updateFlockFollowers(dt: number, activeTimeScale: number) {
    const isNeonCrowUltimate = this.ultimateActive && this.bird.getSkin().id === 'neon_crow';
    if (this.gameMode === 'flock' || isNeonCrowUltimate) {
      if (this.flock.length > 0) {
        this.bird = this.flock[0];
      }
      
      const flockLen = this.flock.length;
      const dtCoeff = dt * 60 * activeTimeScale;
      for (let i = 1; i < flockLen; i++) {
        const follower = this.flock[i];
        
        const groupIdx = Math.floor((i - 1) / 4);
        const subIdx = (i - 1) % 4;
        const dx = (-55 * (Math.floor(subIdx / 2) + 1) - 35 * groupIdx) * 0.8;
        const dy = ((subIdx % 2 === 0 ? -40 : 40) * (Math.floor(subIdx / 2) + 1) + (groupIdx * (i % 2 === 0 ? -12 : 12))) * 0.8;
        
        const targetX = this.bird.x + dx;
        const targetY = this.bird.y + dy;
        
        // Smooth follow
        const followSpeed = 0.12 * dtCoeff;
        follower.x += (targetX - follower.x) * followSpeed;
        follower.y += (targetY - follower.y) * followSpeed;
        
        follower.vy = this.bird.vy;
        follower.angle = this.bird.angle;
        
        follower.update(dt, this.particleEngine, true, activeTimeScale, this.score);
        
        // Sync size/powerup visual states
        follower.isInvincible = this.bird.isInvincible;
        follower.isGhost = this.bird.isGhost;
        follower.hasShield = this.bird.hasShield;
        if (this.bird.sizeMultiplier < 0.7) {
          follower.sizeMultiplier = this.bird.sizeMultiplier * 0.75;
        } else {
          follower.sizeMultiplier = 0.75;
        }
      }
    }
  }

  public triggerSurvivalMerge() {
    if (this.gameMode !== 'flock') return;
    const mergeCount = this.flock.length;
    if (mergeCount < 2) return;

    // Add HP based on squad size
    this.playerBossHP += mergeCount;
    this.maxPlayerBossHP = this.playerBossHP;

    const width  = this.renderer.canvas.width  / this.renderer.dpr;
    const height = this.renderer.canvas.height / this.renderer.dpr;

    // Premium full-screen effects and chime
    for (let i = 1; i < this.flock.length; i++) {
      const b = this.flock[i];
      this.particleEngine.emitExplosion(b.x, b.y, b.getSkin().glowColor || '#ffaa00', 25);
    }
    this.particleEngine.emitRing(this.bird.x, this.bird.y, '#ffffff', 40);
    this.particleEngine.emitExplosion(width / 2, height / 2, '#ff007f', 60);
    this.renderer.triggerScreenShake(30, 0.6);
    this.soundManager.playLevelUp();

    // Collapse flock to only the leader bird
    this.flock = [this.flock[0]];
    this.bird = this.flock[0];
    this.bird.vy = 0; // Reset vertical velocity to stabilize position on merge

    // Increase main bird size by 3% per merged bird
    this.bird.sizeMultiplier = 1.0 + this.playerBossHP * 0.03;

    // Show floating hud alert removed as per user request
  }
}

