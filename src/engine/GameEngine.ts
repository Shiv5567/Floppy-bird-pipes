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

export type GameState = 'PRELOADING' | 'MENU' | 'PLAYING' | 'PAUSED' | 'BOSS_WARNING' | 'BOSS_FIGHT' | 'GAMEOVER' | 'PHOTO_MODE' | 'REVIVE_CHOICE';

export interface ActivePowerup {
  type: string;
  durationLeft: number;
  maxDuration: number;
}

export class GameEngine {
  public state: GameState = 'MENU';
  public hasRevivedThisRun = false;
  public revivesUsedThisRun = 0;
  public reviveCountdown = 5.0;
  private preReviveState: GameState = 'PLAYING';
  
  // Level Mode systems
  public gameMode: 'endless' | 'level' = 'endless';
  public currentLevelNum = 1;
  public activeLevelConfig: LevelConfig | null = null;
  public shieldBrokenThisRun = false;
  
  // Ultimate Skill state variables (Visual Upgrade Option 2)
  public ultimateEnergy = 0; // 0 to 100
  public ultimateActive = false;
  public ultimateDurationLeft = 0;
  
  // High-performance engines references
  public soundManager: SoundManager;
  public particleEngine: ParticleEngine;
  public renderer: Renderer;
  public progressManager: ProgressManager;

  // Entities
  public bird: Bird;
  public obstacleManager: ObstacleManager;
  public powerupManager: PowerupManager;
  public bossManager: BossManager;

  // Game metrics
  public score = 0;
  public coinsCollectedThisRun = 0;
  public gemsCollectedThisRun = 0;
  public scrollSpeed = 4.2;
  private baseScrollSpeed = 4.2;

  // Multipliers & Delays
  public timeScale = 1.0;
  private scoreMultiplier = 1;
  
  // Powerups timers
  private activePowerupsList: Record<string, ActivePowerup> = {};
  
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
  private bossScoreMilestone = 50; // Spawn a boss every 50 points!
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
  }

  public startGame() {
    this.state = 'PRELOADING';
    this.preloadingTimer = 0.4;
    this.soundManager.init(); // Warm up Web Audio context on user gesture
    this.hasRevivedThisRun = false;
    this.revivesUsedThisRun = 0;
    this.shieldBrokenThisRun = false;
    this.score = 0;
    this.coinsCollectedThisRun = 0;
    this.gemsCollectedThisRun = 0;

    if (this.gameMode === 'level') {
      const levelConfig = LevelManager.getLevel(this.currentLevelNum);
      if (levelConfig) {
        this.activeLevelConfig = levelConfig;
        this.scrollSpeed = levelConfig.scrollSpeed;
        this.baseScrollSpeed = levelConfig.scrollSpeed;
        this.progressManager.setWorld(levelConfig.worldId);
        this.renderer.setWeather(levelConfig.worldId);
        this.renderer.activeLevelNum = this.currentLevelNum;
      }
    } else {
      this.activeLevelConfig = null;
      this.scrollSpeed = this.baseScrollSpeed;
      this.renderer.activeLevelNum = 0;
    }

    this.timeScale = 1.0;
    this.scoreMultiplier = 1;
    this.activePowerupsList = {};
    
    // Reset ultimate skill status
    this.ultimateEnergy = 0;
    this.ultimateActive = false;
    this.ultimateDurationLeft = 0;
    
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

    this.obstacleManager.clear();
    if (this.gameMode === 'level' && this.activeLevelConfig) {
      this.obstacleManager.setLevelMode(true, this.activeLevelConfig);
    } else {
      this.obstacleManager.setLevelMode(false, null);
    }
    this.powerupManager.clear();
    
    this.soundManager.stopMusic();
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
      this.reviveCountdown -= dt;
      if (this.reviveCountdown <= 0) {
        this.confirmGameOver();
      }
      this.renderer.update(dt, 0, this.bird.y, 1.0, this.state);
      return;
    }

    if (this.state === 'PHOTO_MODE') return;

    const width = this.renderer.canvas.width / this.renderer.dpr;
    const height = this.renderer.canvas.height / this.renderer.dpr;


    // Update active powerups durations
    this.updatePowerupTimers(dt);

    // 2. Update state machine
    if (this.state === 'PLAYING' || this.state === 'BOSS_FIGHT') {

      const activeTimeScale = this.timeScale;

      this.bird.update(dt, this.particleEngine, true, activeTimeScale, this.score);
      
      // Update Ultimate Ability Energy Charging & Durations (Visual Upgrade Option 2)
      if (this.ultimateActive) {
        this.ultimateDurationLeft -= dt;
        
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
        
        if (this.ultimateDurationLeft <= 0) {
          this.deactivateUltimate();
        }
      } else {
        // Regenerate energy organically by 2% per second
        this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 2 * dt);
      }
      
      // Keep bird within screen boundaries for all playing states (including powerups)
      if (this.state !== 'PLAYING' || this.bird.isInvincible || this.bird.isGhost) {
        if (this.bird.y - this.bird.radius < 5) {
          this.bird.y = 5 + this.bird.radius;
          if (this.bird.vy < 0) this.bird.vy = 0;
        }
        if (this.bird.y + this.bird.radius > height - 35) {
          this.bird.y = height - 35 - this.bird.radius;
          if (this.bird.vy > 0) this.bird.vy = 0;
        }
      }
      
      // Auto-pilot spectator logic
      if (this.isSpectatorMode) {
        this.runAutopilotAI(height);
      }

      // Calculate and set unified progressive scroll speed before updating visual backgrounds or physics managers
      if (this.state === 'PLAYING') {
        if (this.gameMode === 'level' && this.activeLevelConfig) {
          if (this.activePowerupsList['turbo']) {
            this.scrollSpeed = this.activeLevelConfig.scrollSpeed * 2.3;
          } else {
            const progressiveFactor = 1.0 + Math.floor(this.score / 5) * 0.02;
            this.scrollSpeed = this.activeLevelConfig.scrollSpeed * progressiveFactor;
          }
        } else {
          const selectedZone = this.progressManager.getState().selectedZone;
          const selectedDifficulty = this.progressManager.getState().selectedDifficulty;
          
          // Classic mode has a much slower, gradual, and longer progressive speed curve (up to 250 score)
          const progressiveCap = selectedZone === 'classic' ? 250.0 : 60.0;
          const progressRatio = Math.min(1.0, this.score / progressiveCap);
          
          let startSpeed = 1.0;
          let maxSpeed = 1.25;
          
          if (selectedZone === 'classic') {
            startSpeed = 0.72; // Start very comfortable and slow to allow longer survival
            maxSpeed = 1.20;
          } else if (selectedDifficulty === 'easy') {
            startSpeed = 0.75;
            maxSpeed = 0.90;
          } else if (selectedDifficulty === 'hard') {
            startSpeed = 1.20;
            maxSpeed = 1.50;
          }
          
          const speedCoeff = startSpeed + (maxSpeed - startSpeed) * progressRatio;
          
          // Add exactly 5% speed every 25 score
          const speedMultiplier = 1.0 + Math.floor(this.score / 25.0) * 0.05;

          if (this.activePowerupsList['turbo']) {
            this.scrollSpeed = this.baseScrollSpeed * 2.3;
          } else {
            this.scrollSpeed = this.baseScrollSpeed * speedCoeff * speedMultiplier;
          }
        }
      }

      this.renderer.update(dt, this.scrollSpeed, this.bird.y, activeTimeScale);

      if (this.state === 'PLAYING') {
        const selectedZone = this.progressManager.getState().selectedZone;
        const selectedDifficulty = this.progressManager.getState().selectedDifficulty;

        // Standard scrolling hazards
        this.obstacleManager.update(dt, this.scrollSpeed, this.score, this.progressManager.getState().activeWorld, width, height, activeTimeScale, selectedZone, selectedDifficulty, this.bird.x);
        this.powerupManager.update(dt, this.scrollSpeed, this.bird.x, this.bird.y, !!this.activePowerupsList['magnet'], width, height, activeTimeScale, this.obstacleManager.getList());

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
                
                // 1. Emit ring and star sparkles
                this.particleEngine.emitRing(this.bird.x, this.bird.y, '#00f3ff', 15);
                for (let k = 0; k < 10; k++) {
                  this.particleEngine.spawn(
                    this.bird.x + (Math.random() - 0.5) * 15,
                    this.bird.y + (Math.random() - 0.5) * 15,
                    -1 - Math.random() * 3,
                    (Math.random() - 0.5) * 4,
                    '#ffd700',
                    2.5 + Math.random() * 3,
                    1.0,
                    0.025,
                    'star'
                  );
                }
                
                // Play sound
                this.soundManager.playCoin();
                
                // 3. Update Quest Progress
                this.progressManager.updateQuestProgress('graze', 1);
                
                // Reward Ultimate energy for high skill near-miss grazes (Option 2)
                if (!this.ultimateActive) {
                  this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 5);
                }
                
                // 4. Tremor screen shake
                this.renderer.triggerScreenShake(7, 0.22);
                
                // 5. Dispatch custom event for floating HUD texts
                window.dispatchEvent(new CustomEvent('bird_grazed', {
                  detail: {
                    x: this.bird.x,
                    y: this.bird.y
                  }
                }));
              }
            }
          }
        }

        // Check score triggers for obstacles
        for (let i = 0; i < obsLen; i++) {
          const obs = obstacles[i];
          if (!obs.passed && obs.x + obs.width < this.bird.x) {
            obs.passed = true;
            this.incrementScore();
          }
        }

        // Evaluate standard collisions & enforce boundaries
        if (!this.bird.isInvincible && !this.bird.isGhost) {
          const collidedObs = this.obstacleManager.enforceBoundariesAndCheckCollisions(
            this.bird,
            height,
            selectedDifficulty
          );

          if (collidedObs) {
            // Collided. Check Shield safety
            if (this.bird.hasShield) {
              this.bird.hasShield = false;
              this.shieldBrokenThisRun = true;
              delete this.activePowerupsList['shield'];
              this.bird.isInvincible = true;
              
              // Explode shield wave
              this.particleEngine.emitRing(this.bird.x, this.bird.y, '#00f3ff', 24);
              this.soundManager.playShieldDeflect();
              this.renderer.triggerScreenShake(20, 0.4);
              
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
          this.state = 'PLAYING';
          this.incrementScore(10); // Massive points
          this.coinsCollectedThisRun += 150;
          this.progressManager.addCoins(150);
          this.progressManager.incrementAchievement('boss_slayer', 1);
          this.progressManager.updateQuestProgress('slayer', 1);
          this.soundManager.playLevelUp();
          this.particleEngine.emitRing(width * 0.7, height * 0.5, '#ffd700', 40);
        }

        // Check boss or bullet hitting bird
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

      // Check items pickup
      const collectedType = this.powerupManager.checkItemCollisions(
        this.bird.x,
        this.bird.y,
        this.bird.radius,
        this.particleEngine,
        this.soundManager
      );

      if (collectedType) {
        this.activatePowerup(collectedType);
      }

    } else if (this.state === 'GAMEOVER') {
      // Crash spinning physics update
      this.bird.update(dt, this.particleEngine, true, 1.0, this.score);
      this.renderer.update(dt, 0, this.bird.y, 1.0, this.state);

      // Bounce once hit floor
      if (this.bird.y >= height - 40) {
        this.bird.y = height - 40;
        this.bird.vy = 0;
      }
    } else if (this.state === 'BOSS_WARNING') {
      // Cinematic Boss warning sequence
      this.bossWarningTimer += dt;
      this.bird.update(dt, this.particleEngine, true, 1.0, this.score);
      
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
      this.renderer.update(dt, this.scrollSpeed * 0.4, this.bird.y, 1.0, this.state);
    }
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
    this.bird.isCrashing = true;
    this.soundManager.playExplosion();
    this.renderer.triggerScreenShake(25, 0.5);

    // Debris explosion sparks
    this.particleEngine.emitExplosion(this.bird.x, this.bird.y, this.bird.getSkin().glowColor, 35);
    
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

    // Stop music and proceed to check manual continue system
    this.soundManager.stopMusic();

    // Unlimited revives allowed!
    this.preReviveState = this.state === 'BOSS_WARNING' || this.state === 'BOSS_FIGHT' ? this.state : 'PLAYING';
    this.state = 'REVIVE_CHOICE';
    this.reviveCountdown = 5.0;
  }

  public confirmGameOver() {
    this.state = 'GAMEOVER';
    this.soundManager.stopMusic();

    // Process highscores, Battle pass progression
    this.progressManager.addScore(this.score);
    const xpReward = Math.floor(this.score * 50 + this.coinsCollectedThisRun * 5);
    
    // Award progress
    const BPInfo = this.progressManager.addXp(xpReward);

    // Save
    this.progressManager.save();

    // Custom UI trigger
    window.dispatchEvent(new CustomEvent('game_over_state', { detail: { score: this.score, xpGained: xpReward, leveledUp: BPInfo.leveledUp } }));
  }

  public attemptRevive(): boolean {
    const progress = this.progressManager.getState();
    if (progress.gems < 5) return false;

    // Deduct gems
    this.progressManager.addGems(-5);
    this.progressManager.save();

    this.revivesUsedThisRun++;
    this.hasRevivedThisRun = false; // Unlimited revives!
    this.bird.isCrashing = false;
    this.bird.isInvincible = true;
    this.bird.vy = -4.5; // slight upwards jump impulse to resume
    this.bird.hasShield = true;

    // Add shield powerup
    this.activePowerupsList['shield'] = {
      type: 'shield',
      durationLeft: 3.5,
      maxDuration: 3.5
    };

    // Invincibility timeout for 3.5 seconds
    setTimeout(() => {
      if (this.state === 'PLAYING' || this.state === 'BOSS_FIGHT' || this.state === 'BOSS_WARNING') {
        this.bird.isInvincible = false;
      }
    }, 3500);

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

  // private transitionToNextWorld() {
  //   const worlds = ['jungle', 'cyberpunk', 'ice', 'desert', 'volcano', 'space', 'underwater', 'heaven'];
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
    this.score += amt * this.scoreMultiplier;
    this.progressManager.incrementAchievement('first_flight', this.score);

    // Quest progression for high score pass
    this.progressManager.updateQuestProgress('fly_high', this.score);
    
    // Play subtle chime on score pass
    this.soundManager.playCoin();

    // Spawn point sparkles
    this.particleEngine.emitCoinSparkle(this.bird.x + 30, this.bird.y, '#00ffcc');

    // Level Mode target check
    if (this.gameMode === 'level' && this.activeLevelConfig) {
      if (this.score >= this.activeLevelConfig.targetScore) {
        // Level complete!
        this.state = 'LEVEL_COMPLETE' as any; // Cast in case State type is checked
        this.soundManager.stopMusic();
        this.soundManager.playLevelUp();
        
        // Stars calculation:
        // 3 Stars: 0 revives used AND shield not broken
        // 2 Stars: 0 revives used AND shield broken
        // 1 Star: 1 or more revives used
        let stars = 1;
        if (this.revivesUsedThisRun === 0) {
          stars = this.shieldBrokenThisRun ? 2 : 3;
        }
        
        this.progressManager.setLevelComplete(this.currentLevelNum, stars);
        
        window.dispatchEvent(new CustomEvent('level_complete_state', {
          detail: {
            levelNum: this.currentLevelNum,
            stars: stars,
            score: this.score,
            targetScore: this.activeLevelConfig.targetScore,
            coinsGained: this.coinsCollectedThisRun,
            gemsGained: this.gemsCollectedThisRun
          }
        }));
        return;
      }
    }

    // Trigger Boss Warning sequence at milestone (Endless Mode only)
    if (this.gameMode === 'endless' && this.score > 0 && this.score % this.bossScoreMilestone === 0 && this.state !== 'BOSS_FIGHT') {
      this.triggerBossWarning();
    }
  }

  private triggerBossWarning() {
    this.state = 'BOSS_WARNING';
    this.bossWarningTimer = 0;
    this.obstacleManager.clear();
    
    // Dispatch HUD alert custom event
    window.dispatchEvent(new CustomEvent('hud_alert', { detail: { text: 'TITAN BOSS APPROACHING!', sub: 'COLLECT PLASMA CHARGES TO DEFEND!' } }));
  }

  // Activate game changing powerup mechanics
  private activatePowerup(type: string) {
    let duration = 8.0; // Seconds base
    let max = 8.0;

    if (type === 'coin') {
      this.coinsCollectedThisRun += 1;
      this.progressManager.addCoins(1);
      this.progressManager.updateQuestProgress('coin_grab', 1);
      // Reward Ultimate energy (Option 2)
      if (!this.ultimateActive) {
        this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 8);
      }
      return;
    }

    if (type === 'gem') {
      this.gemsCollectedThisRun += 1;
      this.progressManager.addGems(1);
      // Reward Ultimate energy (Option 2)
      if (!this.ultimateActive) {
        this.ultimateEnergy = Math.min(100, this.ultimateEnergy + 15);
      }
      return;
    }

    if (type === 'shield') {
      this.bird.hasShield = true;
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
    }
    window.dispatchEvent(new CustomEvent('powerup_expired', { detail: { type } }));
  }

  public jump() {
    this.bird.jump(this.soundManager, this.score);
  }

  // Trigger the Ultimate Special Ability (Option 2)
  public triggerUltimate() {
    if (this.state !== 'PLAYING' && this.state !== 'BOSS_FIGHT') return;
    if (this.ultimateActive || this.ultimateEnergy < 100) return;

    this.ultimateActive = true;
    this.ultimateEnergy = 0;

    const skin = this.bird.getSkin();
    const skinId = skin.id;
    let duration = 4.0; // Default duration in seconds

    // Play a cool ultimate trigger sound & tremors shake
    this.soundManager.playLevelUp();
    this.renderer.triggerScreenShake(24, 0.45);

    // Trigger explosive ultimate sparkles
    const skinColor = skin.glowColor || '#ffd700';
    this.particleEngine.emitRing(this.bird.x, this.bird.y, skinColor, 32);
    this.particleEngine.emitExplosion(this.bird.x, this.bird.y, '#ffffff', 20);

    switch (skinId) {
      case 'phoenix': {
        // Blazing Flame Sweep: Instantly clears all visible obstacles/hazards!
        duration = 1.0;
        this.obstacleManager.clear();
        this.particleEngine.emitExplosion(this.bird.x, this.bird.y, '#ff4500', 50);
        break;
      }

      case 'cyber': {
        // Digital EMP Shield: Bird turns invincible + clears all active hazards nearby
        duration = 5.0;
        this.bird.isInvincible = true;
        this.obstacleManager.clear();
        break;
      }

      case 'ice': {
        // Time Freeze Blizzard: Slows down gameplay/physics to 20% speed
        duration = 6.0;
        this.timeScale = 0.2;
        break;
      }

      case 'shadow': {
        // Void Phase: Turns the bird completely ghostly to pass safely through pipes
        duration = 5.0;
        this.bird.isGhost = true;
        break;
      }

      case 'dragon': {
        // Jade Strike: Turbo Dash speed blast + invincibility
        duration = 3.0;
        this.bird.isInvincible = true;
        this.scrollSpeed = this.baseScrollSpeed * 2.8;
        break;
      }

      case 'nebula': {
        // Cosmic Magnet Warp: Activates a strong magnet pulling currency from everywhere
        duration = 7.0;
        this.activatePowerup('magnet');
        break;
      }

      case 'bubble': {
        // Aqua Shield: Spawns a protective shield on the spot
        duration = 6.0;
        this.bird.hasShield = true;
        break;
      }

      default: {
        // Golden Wing Dash: Golden invincibility speedup
        duration = 3.5;
        this.bird.isInvincible = true;
        this.scrollSpeed = this.baseScrollSpeed * 1.8;
        break;
      }
    }

    this.ultimateDurationLeft = duration;

    // Dispatch a beautiful custom event to display alerts on the HUD
    window.dispatchEvent(new CustomEvent('hud_alert', { 
      detail: { 
        text: `${skin.name.toUpperCase()} ULTIMATE!`, 
        sub: 'SPECIAL ACTIVE ABILITY RELEASED!' 
      } 
    }));
  }

  // Deactivate the active Ultimate powerup cleanly
  private deactivateUltimate() {
    this.ultimateActive = false;
    const skinId = this.bird.getSkin().id;

    switch (skinId) {
      case 'cyber':
        this.bird.isInvincible = false;
        break;
      case 'ice':
        this.timeScale = 1.0;
        break;
      case 'shadow':
        this.bird.isGhost = false;
        break;
      case 'dragon':
        this.bird.isInvincible = false;
        this.scrollSpeed = this.baseScrollSpeed;
        break;
      case 'bubble':
        // Shield persists until collision, nothing to do
        break;
      default:
        this.bird.isInvincible = false;
        this.scrollSpeed = this.baseScrollSpeed;
        break;
    }

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

  public enterPhotoMode() {
    if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'BOSS_FIGHT' || this.state === 'MENU') {
      const lastState = this.state;
      this.state = 'PHOTO_MODE';
      this.soundManager.stopMusic();
      return lastState;
    }
    return null;
  }
}
