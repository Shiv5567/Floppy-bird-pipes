import { GameEngine } from '../engine/GameEngine.ts';
import type { GameState } from '../engine/GameEngine.ts';
import type { Skin, GameWorld } from '../systems/ProgressManager.ts';
import { LevelManager } from '../systems/LevelManager.ts';
import { AdManager } from '../systems/AdManager.ts';

export class UIManager {
  private engine: GameEngine;
  private container: HTMLElement;
  private activeTab: 'main' | 'skins' | 'worlds' | 'photo' | 'rewards' | 'settings' | 'levels' | 'powerups' | 'achievements' = 'main';
  private lastEngineState: GameState = 'MENU';
  private lastRenderedTab: string = 'main';

  // Cached HUD DOM element references
  private scoreEl: HTMLElement | null = null;
  private bestScoreEl: HTMLElement | null = null;
  private btnUltimate: HTMLElement | null = null;
  private ultIcon: HTMLElement | null = null;
  private ultFill: HTMLElement | null = null;
  private ultText: HTMLElement | null = null;
  private runStatsCoins: HTMLElement | null = null;
  private runStatsGems: HTMLElement | null = null;
  private powerupsHolder: HTMLElement | null = null;
  private bossContainer: HTMLElement | null = null;
  private bossHealthVal: HTMLElement | null = null;
  private bossHealthFill: HTMLElement | null = null;
  private playerHPContainer: HTMLElement | null = null;

  // Additional cached references for performance
  private flockIndicatorEl: HTMLElement | null = null;
  private playerHPHearts: HTMLElement | null = null;
  private ultDurationBarContainer: HTMLElement | null = null;
  private ultDurationBarFill: HTMLElement | null = null;
  private boosterOverlay: HTMLElement | null = null;
  private boosterOverlayTitle: HTMLElement | null = null;
  private boosterOverlayFill: HTMLElement | null = null;
  private boosterBtn: HTMLElement | null = null;
  private boosterBtnIcon: HTMLElement | null = null;
  private boosterBtnProgressFill: HTMLElement | null = null;
  private flockMergeBtn: HTMLElement | null = null;
  private flockMergeBtnLabel: HTMLElement | null = null;
  private tapOverlayRemoved: boolean = false;

  // Cached HUD state values to avoid layout thrashing
  private lastScore: number = -1;
  private lastCoins: number = -1;
  private lastGems: number = -1;
  private lastFlockLength: number = -1;
  private lastUltimateEnergy: number = -1;
  private lastUltimateActive: boolean = false;
  private lastBoosterTimer: number = -1;
  private lastBoosterSpawnTimer: number = -1;
  private lastBoosterReadyState: boolean = false;
  private lastBossHealth: number = -1;
  private lastBossMaxHealth: number = -1;
  private lastPlayerBossHP: number = -1;
  private lastPlayerMaxHpVal: number = -1;
  private lastFlockMergeVisible: boolean = false;
  private lastFlockMergeLen: number = -1;
  private lastActivePowerupsKey: string = '';
  private lastUltimateDurationPercent: number = -1;

  private resetHUDCache() {
    this.lastScore = -1;
    this.lastCoins = -1;
    this.lastGems = -1;
    this.lastFlockLength = -1;
    this.lastUltimateEnergy = -1;
    this.lastUltimateActive = false;
    this.lastBoosterTimer = -1;
    this.lastBoosterSpawnTimer = -1;
    this.lastBoosterReadyState = false;
    this.lastBossHealth = -1;
    this.lastBossMaxHealth = -1;
    this.lastPlayerBossHP = -1;
    this.lastPlayerMaxHpVal = -1;
    this.lastFlockMergeVisible = false;
    this.lastFlockMergeLen = -1;
    this.lastActivePowerupsKey = '';
    this.lastUltimateDurationPercent = -1;
    this.tapOverlayRemoved = false;
  }

  constructor(containerId: string, engine: GameEngine) {
    this.engine = engine;
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`UI container element with ID "${containerId}" not found.`);
    this.container = el;
    
    this.setupGlobalEvents();
    this.render();
  }

  public getActiveTab(): 'main' | 'skins' | 'worlds' | 'bp' | 'achievements' | 'photo' | 'rewards' | 'settings' | 'levels' | 'powerups' {
    return this.activeTab;
  }

  private setupGlobalEvents() {
    // Listen to preloader completion to redraw UI HUD
    window.addEventListener('preloading_ui_done', () => {
      this.render();
    });

    // Listen to custom engine alerts
    window.addEventListener('game_over_state', () => {
      if (this.engine.gameMode === 'level') {
        this.activeTab = 'levels';
      } else {
        this.activeTab = 'main';
      }
      this.render();
      
      // Trigger interstitial ad when Game Over screen shows up
      AdManager.triggerInterstitial();
    });

    window.addEventListener('level_complete_state', () => {
      this.render();
    });

    window.addEventListener('game_revived', () => {
      this.render();
    });

    window.addEventListener('hud_alert', (e: any) => {
      this.showHudAlert(e.detail.text, e.detail.sub);
    });

    window.addEventListener('achievement_unlocked', (e: any) => {
      this.showToastNotification(`ACHIEVEMENT UNLOCKED: ${e.detail.name}`, e.detail.desc);
    });

    window.addEventListener('bird_grazed', (e: any) => {
      if (this.engine.gameMode === 'level') return;
      // 1. Show floating graze text
      this.showFloatingGrazeText(e.detail.x, e.detail.y);
    });

    window.addEventListener('bird_damaged', () => {
      this.render();
    });

    this.setupTactileInteractions();
  }

  private setupTactileInteractions() {
    let activeElement: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;

    const findInteractiveParent = (el: HTMLElement | null): HTMLElement | null => {
      if (!el) return null;
      const selector = '.btn, .side-btn, .nav-item, .skin-card, .world-card, .bp-tier-card, .achievement-card, .quest-card, .reward-card, .zone-card, .level-select-card, .chest-card, .bp-mission-card, .hud-circle-btn, .top-bar-settings-btn, .top-bar-coin, .top-bar-gem, .world-selector-chip, .modal-card, .top-bar-add-btn, .start-fly-btn, .tab-back-btn, .spectator-btn-small';
      if (el.matches && el.matches(selector)) return el;
      return el.parentElement ? findInteractiveParent(el.parentElement) : null;
    };

    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Only trigger for main click/touch
      
      const target = findInteractiveParent(e.target as HTMLElement);
      if (!target) return;

      activeElement = target;
      startX = e.clientX;
      startY = e.clientY;

      activeElement.classList.add('touch-active');
      activeElement.style.setProperty('--s', '0.94');
      activeElement.style.setProperty('--tx', '0px');
      activeElement.style.setProperty('--ty', '0px');
      activeElement.style.setProperty('--r', '0deg');
    });

    document.addEventListener('pointermove', (e) => {
      if (!activeElement) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // Elastic resistance drag factor
      const resistance = 0.3;
      let tx = dx * resistance;
      let ty = dy * resistance;

      // Cap movement distance
      const maxDistance = 12;
      const dist = Math.sqrt(tx * tx + ty * ty);
      if (dist > maxDistance) {
        tx = (tx / dist) * maxDistance;
        ty = (ty / dist) * maxDistance;
      }

      // Proportional rotation
      const maxRotate = 3; // degrees
      const r = Math.max(-maxRotate, Math.min(maxRotate, dx * 0.06));

      // Scaling pressure response
      const dragRatio = Math.min(dist / maxDistance, 1);
      const scale = 0.94 - (dragRatio * 0.02);

      activeElement.style.setProperty('--tx', `${tx}px`);
      activeElement.style.setProperty('--ty', `${ty}px`);
      activeElement.style.setProperty('--r', `${r}deg`);
      activeElement.style.setProperty('--s', `${scale}`);

      // Check if finger is dragged too far from element bounds
      const rect = activeElement.getBoundingClientRect();
      const padding = 45; // pixels
      if (
        e.clientX < rect.left - padding ||
        e.clientX > rect.right + padding ||
        e.clientY < rect.top - padding ||
        e.clientY > rect.bottom + padding
      ) {
        resetActiveElement();
      }
    });

    const resetActiveElement = () => {
      if (!activeElement) return;
      activeElement.classList.remove('touch-active');
      activeElement.style.removeProperty('--tx');
      activeElement.style.removeProperty('--ty');
      activeElement.style.removeProperty('--r');
      activeElement.style.removeProperty('--s');
      activeElement = null;
    };

    document.addEventListener('pointerup', resetActiveElement);
    document.addEventListener('pointercancel', resetActiveElement);
  }


  private showFloatingGrazeText(x: number, y: number) {
    const el = document.createElement('div');
    el.className = 'floating-graze';
    el.innerText = '+GRAZE!';
    el.style.left = `${x}px`;
    el.style.top = `${y - 30}px`;
    
    this.container.appendChild(el);
    
    // Remove after float animation (0.65s in style.css)
    setTimeout(() => {
      el.remove();
    }, 700);
  }

  public render() {
    const state = this.engine.state;

    // Ensure banner ads are permanently hidden/disabled
    AdManager.hideBanner();
    
    // In-place HUD updates to completely bypass innerHTML DOM thrashing when playing!
    if ((state === 'PLAYING' || state === 'BOSS_FIGHT' || state === 'BOSS_WARNING') && document.getElementById('hud-score')) {
      // Force a full render to avoid infinite recursion and properly draw/clear the boss bar if:
      // 1. We are in BOSS_FIGHT state but the boss health bar container is not yet in the DOM.
      // 2. We are NOT in BOSS_FIGHT state but the boss health bar container is still in the DOM.
      const hasBossContainer = !!document.querySelector('.boss-health-bar-container');
      const isBossActive = this.engine.bossManager.isBossActive();
      const needsFullBossRender = (state === 'BOSS_FIGHT' && isBossActive && !hasBossContainer) ||
                                  (state !== 'BOSS_FIGHT' && hasBossContainer);

      if (!needsFullBossRender) {
        this.updateHUDValues();
        this.lastEngineState = state;
        return;
      }
    }

    // Save scroll position of any scrollable container
    const scrollContainer = this.container.querySelector('.tab-content-area');
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    // Clear old HTML
    this.container.innerHTML = '';
    this.lastEngineState = state;

    if (state === 'MENU') {
      this.renderMenu();
    } else if (state === 'PRELOADING') {
      this.renderPreloader();
    } else if (state === 'PLAYING' || state === 'BOSS_FIGHT' || state === 'BOSS_WARNING') {
      this.renderHUD();
    } else if (state === 'PAUSED') {
      this.renderPauseMenu();
    } else if (state === 'GAMEOVER') {
      this.renderGameOver();
    } else if (state === 'PHOTO_MODE') {
      this.renderPhotoModePanel();
    } else if (state === 'REVIVE_CHOICE') {
      if (this.engine.reviveCardVisible) {
        this.renderReviveScreen();
      } else {
        this.renderHUD();
      }
    } else if (state as any === 'LEVEL_COMPLETE') {
      this.renderLevelComplete();
    } else if (state === 'DEMO_COMPLETE') {
      this.renderDemoComplete();
    }

    // Sync ad button states dynamically
    AdManager.updateAdButtonsDOM();

    // Restore scroll position
    if (scrollContainer && scrollTop > 0) {
      const restoreScroll = () => {
        const newScrollContainer = this.container.querySelector('.tab-content-area');
        if (newScrollContainer) {
          newScrollContainer.scrollTop = scrollTop;
        }
      };
      requestAnimationFrame(restoreScroll);
      setTimeout(restoreScroll, 20); // Fallback for various browsers/render timings
    }
  }

  private updateHUDValues() {
    // Dismiss onboarding tap instruction popup if the first tap is completed
    if (this.engine.firstTapDone && !this.tapOverlayRemoved) {
      const tapOverlay = document.querySelector('.tap-instruction-overlay');
      if (tapOverlay) {
        tapOverlay.remove();
      }
      this.tapOverlayRemoved = true;
    }

    // 1. Score / Obstacles
    const scoreVal = this.engine.score;
    if (this.lastScore !== scoreVal) {
      this.lastScore = scoreVal;
      if (!this.scoreEl) this.scoreEl = document.getElementById('hud-score');
      if (this.scoreEl) {
        if (this.engine.gameMode === 'level' && this.engine.activeLevelConfig) {
          this.scoreEl.innerText = `${scoreVal} / ${this.engine.activeLevelConfig.targetScore}`;
        } else {
          this.scoreEl.innerText = scoreVal.toString();
        }
      }
    }

    // 1.5 Best Score (endless only)
    if (this.engine.gameMode !== 'level') {
      const state = this.engine.progressManager.getState();
      const currentHighScore = this.engine.gameMode === 'flock'
        ? (state.highscoreSquad || 0)
        : (state.highscoreClassic || state.highscore || 0);
      const bestScoreVal = Math.max(currentHighScore, scoreVal);
      if (this.bestScoreEl) {
        this.bestScoreEl.innerText = `BEST: ${bestScoreVal}`;
      }
    }

    // 2. Ultimate Bar
    const ultActive = this.engine.ultimateActive;
    const ultPercent = Math.min(100, Math.floor(this.engine.ultimateEnergy));
    const ultReady = ultPercent >= 100;
    
    if (this.lastUltimateEnergy !== ultPercent || this.lastUltimateActive !== ultActive) {
      this.lastUltimateEnergy = ultPercent;
      this.lastUltimateActive = ultActive;
      
      const skinGlow = this.engine.bird.getSkin().glowColor || '#00f3ff';
      const ultBarBg = ultReady ? `linear-gradient(90deg, #ffd700, ${skinGlow})` : skinGlow;

      if (!this.btnUltimate) this.btnUltimate = document.getElementById('btn-hud-ultimate');
      if (this.btnUltimate) {
        if (ultReady) {
          this.btnUltimate.classList.add('ult-ready-pulse');
        } else {
          this.btnUltimate.classList.remove('ult-ready-pulse');
        }

        if (ultActive) {
          this.btnUltimate.classList.add('ult-active-glow');
        } else {
          this.btnUltimate.classList.remove('ult-active-glow');
        }

        if (!this.ultIcon) this.ultIcon = this.btnUltimate.querySelector('.ult-icon');
        if (this.ultIcon) {
          this.ultIcon.innerText = ultActive ? '⚡' : '✨';
        }

        if (!this.ultFill) this.ultFill = this.btnUltimate.querySelector('.ult-progress-fill');
        if (this.ultFill) {
          const circumference = 157;
          const offset = circumference - (ultPercent / 100) * circumference;
          (this.ultFill as any).style.strokeDashoffset = `${offset}`;
          (this.ultFill as any).style.stroke = ultBarBg;
        }

        if (!this.ultText) this.ultText = this.btnUltimate.querySelector('.ult-text');
        if (this.ultText) {
          this.ultText.innerText = ultActive ? 'ACTIVE' : ultReady ? 'READY!' : `${ultPercent}%`;
        }
      }
    }

    // 3. Stats (Coins & Gems)
    const coinsVal = this.engine.coinsCollectedThisRun;
    if (this.lastCoins !== coinsVal) {
      this.lastCoins = coinsVal;
      if (this.runStatsCoins) {
        this.runStatsCoins.innerText = `🟡 ${coinsVal}`;
      }
    }

    const gemsVal = this.engine.gemsCollectedThisRun;
    if (this.lastGems !== gemsVal) {
      this.lastGems = gemsVal;
      if (this.runStatsGems) {
        this.runStatsGems.innerText = `💎 ${gemsVal}`;
      }
    }

    // Squad indicator
    const flockLen = this.engine.flock.length;
    if (this.lastFlockLength !== flockLen) {
      this.lastFlockLength = flockLen;
      if (this.flockIndicatorEl) {
        this.flockIndicatorEl.innerText = `🪽 SQUAD: ${flockLen}`;
      }
    }

    // 4. Powerup timers holder
    const holder = this.powerupsHolder;
    if (holder) {
      const pList = this.engine.getActivePowerups();
      const currentTypesKey = pList.map(p => p.type).join(',');
      
      if (this.lastActivePowerupsKey !== currentTypesKey) {
        this.lastActivePowerupsKey = currentTypesKey;
        if (pList.length === 0) {
          holder.innerHTML = '';
        } else {
          holder.innerHTML = pList.map(p => {
            const percent = (p.durationLeft / p.maxDuration) * 100;
            return `
              <div class="hud-powerup-badge glass-card fade-in" data-powerup-type="${p.type}">
                <span class="pow-icon">${p.type === 'shield' ? '🛡️' : p.type === 'slowmo' ? '⏳' : p.type === 'magnet' ? '🧲' : p.type === 'double' ? '✨' : p.type === 'turbo' ? '🔥' : p.type === 'ghost' ? '👻' : p.type === 'mini' ? '🔎' : '🪶'}</span>
                <div class="pow-bar-container">
                  <div class="pow-bar-inner" style="width: ${percent}%; background-color: ${this.getPowerupColor(p.type)}"></div>
                </div>
              </div>
            `;
          }).join('');
        }
      } else {
        // Types are identical, update timer widths in-place!
        const currentBadges = Array.from(holder.querySelectorAll('.hud-powerup-badge')) as HTMLElement[];
        for (let idx = 0; idx < pList.length; idx++) {
          const p = pList[idx];
          const badge = currentBadges[idx];
          if (badge) {
            const fill = badge.querySelector('.pow-bar-inner') as HTMLElement;
            if (fill) {
              const percent = (p.durationLeft / p.maxDuration) * 100;
              fill.style.width = `${percent}%`;
            }
          }
        }
      }
    }

    // 5. Boss Health Bar
    const state = this.engine.state;
    const isBossFight = state === 'BOSS_FIGHT';
    const isBossActive = this.engine.bossManager.isBossActive();

    if (isBossFight && isBossActive) {
      const bossHealth = this.engine.bossManager.getHealth();
      const bossMaxHealth = this.engine.bossManager.getMaxHealth();
      const bossHealthPercent = Math.max(0, Math.min(100, (bossHealth / bossMaxHealth) * 100));

      if (this.bossContainer) {
        if (this.lastBossHealth !== bossHealth || this.lastBossMaxHealth !== bossMaxHealth) {
          this.lastBossHealth = bossHealth;
          this.lastBossMaxHealth = bossMaxHealth;
          if (this.bossHealthVal) {
            this.bossHealthVal.innerText = `${bossHealth} / ${bossMaxHealth}`;
          }
          if (this.bossHealthFill) {
            this.bossHealthFill.style.width = `${bossHealthPercent}%`;
          }
        }
      } else {
        this.renderHUD();
      }
    } else if (this.bossContainer) {
      this.bossContainer = null;
      this.bossHealthVal = null;
      this.bossHealthFill = null;
      this.renderHUD();
    }

    // 5.5 Player HP Hearts
    const showHP = (isBossFight || state === 'BOSS_WARNING') && this.engine.gameMode === 'flock';
    if (showHP) {
      if (this.playerHPContainer) {
        const hp = this.engine.playerBossHP > 0 ? this.engine.playerBossHP : flockLen;
        const maxHp = this.engine.playerBossHP > 0 ? (this.engine.maxPlayerBossHP || hp) : Math.max(flockLen, 1);
        
        if (this.lastPlayerBossHP !== hp || this.lastPlayerMaxHpVal !== maxHp) {
          this.lastPlayerBossHP = hp;
          this.lastPlayerMaxHpVal = maxHp;
          
          if (this.playerHPHearts) {
            const hearts = '❤️'.repeat(hp);
            if (this.playerHPHearts.innerText !== hearts) {
              this.playerHPHearts.innerText = hearts;
            }
            const fontSize = Math.max(8.5, (16 - Math.max(0, maxHp - 5) * 0.4) * 0.85);
            const letterSpacing = Math.max(0.5, 2.5 - Math.max(0, maxHp - 5) * 0.15);
            const paddingX = Math.max(10, 18 - Math.max(0, maxHp - 5) * 0.6);
            
            this.playerHPHearts.style.fontSize = `${fontSize}px`;
            this.playerHPHearts.style.letterSpacing = `${letterSpacing}px`;
            this.playerHPContainer.style.padding = `6px ${paddingX}px`;
          }
        }
        
        const hasBossBar = isBossFight && isBossActive;
        const targetTop = hasBossBar ? '190px' : '130px';
        if (this.playerHPContainer.style.top !== targetTop) {
          this.playerHPContainer.style.top = targetTop;
        }
      } else {
        this.renderHUD();
      }
    } else if (this.playerHPContainer) {
      this.playerHPContainer = null;
      this.playerHPHearts = null;
      this.renderHUD();
    }

    // 5.8. Ultimate Duration Bar
    const isUltActive = this.engine.ultimateActive;
    const hasUltBar = !!this.ultDurationBarContainer;
    if (isUltActive !== hasUltBar) {
      this.renderHUD();
      return;
    }

    if (isUltActive && this.ultDurationBarFill) {
      const pct = Math.max(0, Math.min(100, (this.engine.ultimateDurationLeft / this.engine.ultimateMaxDuration) * 100));
      if (this.lastUltimateDurationPercent !== pct) {
        this.lastUltimateDurationPercent = pct;
        this.ultDurationBarFill.style.width = `${pct}%`;
      }
    }

    // 6. Booster System HUD Overlay
    const isBoosterActive = this.engine.boosterActive;
    const hasBoosterOverlay = !!this.boosterOverlay;
    if (isBoosterActive !== hasBoosterOverlay) {
      this.renderHUD();
      return;
    }

    if (isBoosterActive && this.boosterOverlay) {
      const bTimer = this.engine.boosterTimer;
      if (this.lastBoosterTimer !== bTimer) {
        this.lastBoosterTimer = bTimer;
        if (this.boosterOverlayTitle) {
          this.boosterOverlayTitle.innerText = `⚡ HYPER BOOST: ${bTimer.toFixed(1)}s`;
        }
        if (this.boosterOverlayFill) {
          const bPct = Math.max(0, Math.min(100, (bTimer / 1.0) * 100));
          this.boosterOverlayFill.style.width = `${bPct}%`;
        }
      }
    }

    // 7. Booster Static Cooldown Button in Endless Mode
    if (this.engine.gameMode !== 'level' && this.boosterBtn) {
      const bTimer = this.engine.boosterSpawnTimer;
      const bReady = bTimer <= 0;
      const bPercent = Math.min(100, Math.floor((1 - bTimer / 1.0) * 100));

      if (this.lastBoosterSpawnTimer !== bTimer || this.lastBoosterReadyState !== bReady) {
        this.lastBoosterSpawnTimer = bTimer;
        this.lastBoosterReadyState = bReady;

        // Toggle ready states in place
        if (bReady) {
          this.boosterBtn.classList.add('ult-ready-pulse');
          this.boosterBtn.style.border = '2px solid #ffd700';
          this.boosterBtn.style.background = 'rgba(255,215,0,0.12)';
          this.boosterBtn.style.boxShadow = '0 0 15px rgba(255,215,0,0.4)';
          this.boosterBtn.style.opacity = '1';
          
          if (this.boosterBtnIcon && this.boosterBtnIcon.innerText !== '⚡') {
            this.boosterBtnIcon.innerText = '⚡';
            this.boosterBtnIcon.style.textShadow = '0 0 8px #ffd700';
          }
        } else {
          this.boosterBtn.classList.remove('ult-ready-pulse');
          this.boosterBtn.style.border = '2px solid rgba(255,255,255,0.2)';
          this.boosterBtn.style.background = 'rgba(255,255,255,0.03)';
          this.boosterBtn.style.boxShadow = 'none';
          this.boosterBtn.style.opacity = '0.65';

          if (this.boosterBtnIcon && this.boosterBtnIcon.innerText !== '⏳') {
            this.boosterBtnIcon.innerText = '⏳';
            this.boosterBtnIcon.style.textShadow = 'none';
          }
        }

        if (this.boosterBtnProgressFill) {
          const circumference = 157;
          const offset = circumference - (bPercent / 100) * circumference;
          this.boosterBtnProgressFill.style.strokeDashoffset = `${offset}`;
        }
      }
    }

    // 8. Flock Merge Button updates
    if (this.engine.gameMode === 'flock' && this.flockMergeBtn) {
      const visible = flockLen >= 2;
      if (this.lastFlockMergeVisible !== visible || this.lastFlockMergeLen !== flockLen) {
        this.lastFlockMergeVisible = visible;
        this.lastFlockMergeLen = flockLen;
        this.flockMergeBtn.style.display = visible ? 'flex' : 'none';
        
        if (visible && this.flockMergeBtnLabel) {
          this.flockMergeBtnLabel.innerText = `MERGE (+${flockLen})`;
        }
      }
    }
  }

  private renderPreloader() {
    const progress = this.engine.progressManager.getState();
    const worldId = progress.activeWorld;

    const worldNames: Record<string, string> = {
      jungle:     'AMAZON RAINFOREST',
      ice:        'FROZEN ICE KINGDOM',
      desert:     'DESERT RUINS',
      volcano:    'VOLCANIC SPRING',
      space:      'COSMIC MEADOW',
      underwater: 'DEEP UNDERWATER',
      heaven:     'HEAVEN CLOUD KINGDOM',
      retro:      'RETRO MAP'
    };

    const worldName = worldNames[worldId] || 'THE WORLD';

    this.container.innerHTML = `
      <div class="screen preloading-screen fade-in">
        <div class="menu-world-bg world-bg-${worldId}" style="filter: blur(8px); opacity: 0.6;"></div>
        <div class="preloader-content glass-card">
          <div class="preloader-spinner-container">
            <div class="preloader-spinner"></div>
            <div class="preloader-icon">⚡</div>
          </div>
          <div class="preloader-title">WARMING ENGINES...</div>
          <div class="preloader-subtitle">PREPARING TO ENTER ${worldName}</div>
          <div class="preloader-bar-container">
            <div class="preloader-bar-fill" id="preloader-fill" style="width: 0%"></div>
          </div>
          <div class="preloader-message" id="preloader-message">SYNTHESIZING SOUND WAVES...</div>
        </div>
      </div>
    `;

    const fillEl = document.getElementById('preloader-fill');
    const msgEl = document.getElementById('preloader-message');

    const messages = [
      'SYNTHESIZING SOUND SYNTHS...',
      'CALIBRATING TURBO JET THRUST...',
      'ORGANIZING ASSET CACHES...',
      'POOLING GAME OBSTACLES...',
      'SYNCING AMBIENT WEATHER RAYS...',
      'JET-ENGINES READY FOR TAKEOFF! ⚡'
    ];

    const progressListener = (e: any) => {
      const pct = Math.floor(e.detail.progress * 100);
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (msgEl) {
        const msgIdx = Math.min(messages.length - 1, Math.floor(e.detail.progress * messages.length));
        msgEl.innerText = messages[msgIdx];
      }
    };

    window.addEventListener('preloading_progress', progressListener);

    window.addEventListener('preloading_complete', function completeHandler() {
      window.removeEventListener('preloading_progress', progressListener);
      window.removeEventListener('preloading_complete', completeHandler);
      window.dispatchEvent(new CustomEvent('preloading_ui_done'));
    });
  }

  private renderMenu() {
    const progress = this.engine.progressManager.getState();
    const worldId = progress.activeWorld;

    // If a sub-tab is active, render a full dedicated hero page instead
    if (this.activeTab !== 'main') {
      this.container.innerHTML = this.renderTabPage(worldId);
      this.bindMenuEvents();
      this.drawSkinPreviews();
      return;
    }

    this.lastRenderedTab = 'main';




    // Ambient particles
    const particleColors = ['rgba(100,180,255,0.5)', 'rgba(200,100,255,0.4)', 'rgba(255,200,50,0.4)', 'rgba(0,255,180,0.3)'];
    let particlesHtml = '';
    for (let i = 0; i < 12; i++) {
      const x = Math.round(Math.sin(i * 137.5) * 50 + 50);
      const size = 3 + (i % 4) * 2;
      const dur = 6 + (i % 5) * 2;
      const delay = -(i * 1.1);
      const color = particleColors[i % particleColors.length];
      particlesHtml += `<div class="menu-particle" style="left:${x}%;width:${size}px;height:${size}px;background:${color};animation-duration:${dur}s;animation-delay:${delay}s"></div>`;
    }

    // Floating items around bird (removed)
    const floatiesHtml = '';

    const menuHTML = `
      <div class="screen menu-screen menu-entrance">

        <!-- World reactive background overlay -->
        <div class="menu-world-bg world-bg-${worldId}"></div>

        <!-- Ambient CSS floating particles -->
        <div class="menu-particles">${particlesHtml}</div>

        <!-- ===== TOP BAR ===== -->
        <div class="menu-top-bar">
          <div class="top-bar-currencies">
            <div class="top-bar-coin" id="btn-coin-topup" style="position: relative; cursor: pointer;">
              <span class="top-bar-coin-icon" style="width: 19px; height: 19px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; margin-right: 4px;">
                ${this.getCoinIconSvg('19px', '19px', '', 'topbar')}
              </span>${progress.coins.toLocaleString()}
              <button class="top-bar-add-btn" id="btn-plus-coins" title="Watch ad for +500 Coins">+</button>
            </div>
            <div class="top-bar-gem" id="btn-gem-topup" style="position: relative; cursor: pointer;">
              <span class="top-bar-gem-icon">💎</span>${progress.gems.toLocaleString()}
              <button class="top-bar-add-btn" id="btn-plus-gems" title="Watch ad for +10 Gems">+</button>
            </div>
          </div>
          <button class="top-bar-settings-btn" id="btn-open-settings">⚙️</button>
        </div>

        <!-- ===== CENTER STAGE ===== -->
        <div class="center-stage">

          <!-- Left side panel -->
          <div class="side-panel-left">
            <button class="side-btn" id="side-btn-skins">
              ${this.getCharacterIconSvg('60px', '60px', 'margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(0, 243, 255, 0.5));', 'home')}
              <span class="side-btn-label">CHARACTERS</span>
            </button>
            <button class="side-btn" id="side-btn-worlds">
              ${this.getWorldsIconSvg('60px', '60px', 'margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(123, 47, 255, 0.5));', 'home')}
              <span class="side-btn-label">MAPS</span>
            </button>
          </div>

          <!-- Bird Mascot -->
          <div class="bird-stage">
            <div class="bird-floaties">${floatiesHtml}</div>
            <div class="bird-mascot" id="bird-mascot-tap" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 120px; height: 120px; position: relative; margin: 0 auto;">
              <canvas id="main-menu-bird-canvas" width="180" height="140" style="width: 180px; height: 140px; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);"></canvas>
            </div>
          </div>

          <!-- Right side panel -->
          <div class="side-panel-right">
            <button class="side-btn" id="side-btn-rewards" style="width: 98px !important; height: 95px !important; margin-bottom: 8px; border-radius: 20px;">
              ${this.hasClaimableRewards() ? `<div class="side-btn-badge">!</div>` : ''}
              ${this.getRewardBoxSvg('60px', '60px', 'margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(255, 170, 0, 0.5));', 'home')}
              <span class="side-btn-label" style="font-size: 10.5px;">REWARDS</span>
            </button>
            <button class="side-btn" id="side-btn-powerups" style="width: 98px !important; height: 95px !important; border-radius: 20px;">
              <div style="font-size: 42px; line-height: 60px; height: 60px; margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(0, 243, 255, 0.6)); display: flex; align-items: center; justify-content: center;">🔮</div>
              <span class="side-btn-label" style="font-size: 10.5px;">POWER-UPS</span>
            </button>
          </div>
        </div>

        <!-- ===== WORLD PLATFORM + START FLY ===== -->
        <div class="world-platform-area">
          <div class="platform-base">
            <div class="platform-conic-ray"></div>
            <div class="platform-glow-ring"></div>

            <div style="display: flex; flex-direction: column; gap: 12px; width: 100%; margin-bottom: 8px; margin-top: 8px; transform: translateY(50px);">
              <button class="start-fly-btn" id="btn-start-game" style="width: 100%; padding: 17px 20px; font-size: 19px;">
                <span>ENDLESS</span>
              </button>
              <button class="start-fly-btn" id="btn-open-levels" style="width: 100%; padding: 17px 20px; font-size: 19px; background: linear-gradient(180deg, #b35dfb 0%, #7b2fff 50%, #5200b3 100%); box-shadow: 0 6px 0 #3a0082, 0 8px 20px rgba(123,47,255,0.4);">
                <span>LEVELS</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.container.innerHTML = menuHTML;
    this.bindMenuEvents();
    this.drawSkinPreviews();
  }

  public drawSkinPreviews() {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1); // Cap at 2.5 to keep rendering fast and sharp

    // Helper to configure canvas internal resolution vs CSS display size accounting for High-DPI screens
    const setupCanvas = (canvas: HTMLCanvasElement, baseWidth: number, baseHeight: number) => {
      const targetWidth = baseWidth * dpr;
      const targetHeight = baseHeight * dpr;
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${baseWidth}px`;
        canvas.style.height = `${baseHeight}px`;
      }
    };

    // 1. Draw main menu bird canvas if present
    const mainCanvas = document.getElementById('main-menu-bird-canvas') as HTMLCanvasElement | null;
    if (mainCanvas) {
      const activeSkin = this.engine.progressManager.getActiveSkinInfo();
      const ctx = mainCanvas.getContext('2d');
      if (ctx) {
        setupCanvas(mainCanvas, 180, 140);
        ctx.save();
        ctx.scale(dpr, dpr);
        this.engine.bird.renderPreview(ctx, 180, 140, activeSkin, true);
        ctx.restore();
      }
    }

    // 3. Draw skins tab spotlight preview canvas if present
    const spotlightCanvas = this.container.querySelector('#spotlight-skin-canvas') as HTMLCanvasElement | null;
    if (spotlightCanvas) {
      const activeSkin = this.engine.progressManager.getActiveSkinInfo();
      const ctx = spotlightCanvas.getContext('2d');
      if (ctx) {
        setupCanvas(spotlightCanvas, 100, 100);
        ctx.save();
        ctx.scale(dpr, dpr);
        this.engine.bird.renderPreview(ctx, 100, 100, activeSkin);
        ctx.restore();
      }
    }

    // 4. Draw character selection grid previews
    if (this.activeTab === 'skins') {
      const canvases = this.container.querySelectorAll('.skin-preview-canvas');
      const skins = this.engine.progressManager.getSkins();
      
      canvases.forEach((canvasEl) => {
        const canvas = canvasEl as HTMLCanvasElement;
        const skinId = canvas.getAttribute('data-skin-id');
        const skin = skins.find(s => s.id === skinId);
        if (!skin) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        setupCanvas(canvas, 90, 90);
        ctx.save();
        ctx.scale(dpr, dpr);
        this.engine.bird.renderPreview(ctx, 90, 90, skin);
        ctx.restore();
      });
    }
  }

  private renderTabPage(worldId: string): string {
    const progress = this.engine.progressManager.getState();

    const tabMeta: Record<string, { icon: string; title: string; color: string; heroIcon: string; heroSubtitle: string }> = {
      skins:        { icon: this.getCharacterIconSvg('32px', '32px', 'vertical-align: middle; display: inline-block;', 'tab'), title: 'SELECT YOUR CHARACTER',  color: '#00f3ff', heroIcon: this.getCharacterIconSvg('72px', '72px', 'animation: floatBird 4s ease-in-out infinite;', 'hero'), heroSubtitle: '' },
      worlds:       { icon: this.getWorldsIconSvg('32px', '32px', 'vertical-align: middle; display: inline-block;', 'tab'), title: 'CHOOSE YOUR FLYING LOCATION',   color: '#7b2fff', heroIcon: this.getWorldsIconSvg('72px', '72px', 'animation: floatBird 4s ease-in-out infinite;', 'hero'), heroSubtitle: '' },
      bp:           { icon: '🎫', title: 'SEASON 1 BATTLE PASS', color: '#ff007f', heroIcon: '⚔️', heroSubtitle: 'Unlock exclusive rewards' },
      achievements: { icon: '🏆', title: 'HALL OF TROPHIES',     color: '#ffd700', heroIcon: '🏅', heroSubtitle: 'Track your legendary feats' },
      rewards:      { icon: this.getRewardBoxSvg('32px', '32px', 'vertical-align: middle; display: inline-block;', 'tab'), title: 'REWARDS & PROGRESSION HUB', color: '#ffaa00', heroIcon: this.getRewardBoxSvg('72px', '72px', 'animation: floatBird 4s ease-in-out infinite;', 'hero'), heroSubtitle: 'Claim your daily logs, trophies, and battle pass!' },
      settings:     { icon: '⚙️', title: 'GAME CONFIGURATION',   color: '#00ff88', heroIcon: '⚙️', heroSubtitle: 'Configure your flight difficulty mode' },
      levels:       { icon: '', title: 'LEVEL SELECT MODE',    color: '#7b2fff', heroIcon: '', heroSubtitle: '' },
      powerups:     { icon: `<span style="font-size: 24px; vertical-align: middle; display: inline-block;">🔮</span>`, title: 'POWERS-UPS BUBBLE UPGRADES',   color: '#00f3ff', heroIcon: `<span style="font-size: 72px; display: inline-block; animation: floatBird 4s ease-in-out infinite;">🔮</span>`, heroSubtitle: 'Upgrade bubble durations & effectiveness' }
    };
    const meta = tabMeta[this.activeTab] || tabMeta['skins'];

    // Ambient particles (same as main)
    const particleColors = ['rgba(100,180,255,0.4)', 'rgba(200,100,255,0.35)', 'rgba(255,200,50,0.3)', 'rgba(0,255,180,0.25)'];
    let particlesHtml = '';
    for (let i = 0; i < 10; i++) {
      const x = Math.round(Math.sin(i * 137.5) * 50 + 50);
      const size = 3 + (i % 4) * 2;
      const dur = 7 + (i % 5) * 2;
      const delay = -(i * 1.3);
      const color = particleColors[i % particleColors.length];
      particlesHtml += `<div class="menu-particle" style="left:${x}%;width:${size}px;height:${size}px;background:${color};animation-duration:${dur}s;animation-delay:${delay}s"></div>`;
    }

    const innerContent = this.renderTabInnerContent(progress);
    const isFirstTime = this.activeTab !== this.lastRenderedTab;
    this.lastRenderedTab = this.activeTab;

    return `
      <div class="screen tab-hero-screen ${isFirstTime ? 'tab-transition' : ''}">

        <!-- World background -->
        <div class="menu-world-bg world-bg-${worldId}"></div>
        ${this.activeTab !== 'settings' ? `<div class="menu-particles">${particlesHtml}</div>` : ''}

        <!-- ===== TAB HERO HEADER ===== -->
        ${this.activeTab !== 'settings' ? `
        <div class="tab-hero-header">
          <button class="tab-back-btn" id="btn-back-main">
            <span class="tab-back-arrow">‹</span>
            <span class="tab-back-label">BACK</span>
          </button>
          ${this.activeTab !== 'rewards' ? `
          <div class="tab-hero-title-row">
            <span class="tab-hero-icon">${meta.icon}</span>
            <div>
              <div class="tab-hero-title">${meta.title}</div>
              <div class="tab-hero-subtitle">${meta.heroSubtitle}</div>
            </div>
          </div>
          ` : ''}
          <div class="tab-hero-spacer"></div>
        </div>
        ` : ''}

        <!-- ===== HERO FEATURE SPOTLIGHT ===== -->
        ${(this.activeTab !== 'levels' && this.activeTab !== 'settings' && this.activeTab !== 'worlds') ? `
        <div class="tab-hero-spotlight" style="${this.activeTab === 'rewards' ? 'max-height: none; padding: 10px 0;' : ''}">
          <div class="tab-spotlight-glow" style="background:radial-gradient(circle,${meta.color}33 0%,transparent 70%)"></div>
          ${this.activeTab === 'skins' ? 
            `<canvas id="spotlight-skin-canvas" width="100" height="100" style="width: 100px; height: 100px; z-index: 1; filter: drop-shadow(0 0 12px ${meta.color}55);"></canvas>` : 
            (this.activeTab === 'rewards' ?
              // Render mysterious chests directly in the spotlight area
              `<div class="common-chests-container glass-card" style="
                margin: 0 12px; padding: 10px; border-radius: 16px; width: calc(100% - 24px); box-sizing: border-box;
                border: 1px solid rgba(255, 170, 0, 0.2); background: rgba(13, 10, 28, 0.7);
                box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 6;
              ">
                <div class="hangar-section-title" style="margin: 0 0 6px 0; font-size: 10px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; color: #ffaa00; text-shadow: 0 0 5px rgba(255,170,0,0.3);">MYSTERIOUS BOXES</div>
                <div class="chests-row" style="display: flex; gap: 60px; width: 100%; justify-content: center;">
                  ${this.getChestsHtml()}
                </div>
              </div>`
              : `<div class="tab-spotlight-icon">${meta.heroIcon}</div>`
            )
          }
          ${(this.activeTab !== 'rewards' && this.activeTab !== 'skins' && this.activeTab !== 'powerups') ? `<div class="tab-spotlight-label" style="color:${meta.color}">${meta.title}</div>` : ''}
        </div>
        ` : ''}

        ${this.activeTab === 'rewards' ? `
        ` : ''}

        <!-- ===== CONTENT SCROLL AREA ===== -->
        <div class="tab-content-area subtab-transition">
          ${innerContent}
        </div>

      </div>
    `;
  }

  private renderTabInnerContent(progress: import('../systems/ProgressManager.ts').PlayerProgressState): string {
    switch (this.activeTab) {

      case 'skins': {
        const skins = this.engine.progressManager.getSkins();
        const skinsCards = skins.map((s: Skin) => {
          const isSelected = s.id === progress.activeSkin;
          const upgradeCost = this.engine.progressManager.getSkinUpgradeCost(s.upgradeLevel);

          const getSkinAbilityDuration = (lvl: number) => {
            if (s.id === 'angry_red') return 20;
            if (lvl === 1) return 10;
            if (lvl === 2) return 12;
            if (lvl === 3) return 14;
            if (lvl === 4) return 16;
            if (lvl === 5) return 20;
            return 10;
          };
          const currentDuration = getSkinAbilityDuration(s.upgradeLevel);

          const rarityColors: Record<string, string> = {
            common: '#aaa', rare: '#00f3ff', epic: '#a855f7', legendary: '#ffd700'
          };
          const rc = rarityColors[s.rarity.toLowerCase()] || '#aaa';
          return `
            <div class="grid-card glass-card skin-card ${isSelected ? 'selected-border' : ''}"
                 data-skin-id="${s.id}"
                 style="${isSelected ? `box-shadow: 0 0 0 2px ${rc}, 0 0 18px ${rc}55;` : ''}"
            >
              <div class="skin-emoji" style="display: flex; align-items: center; justify-content: center; width: 90px; height: 90px; margin: 0; position: relative;">
                <canvas class="skin-preview-canvas" data-skin-id="${s.id}" width="90" height="90" style="width: 90px; height: 90px; transform: scale(1.2);"></canvas>
              </div>
              <div class="grid-card-name">${s.name}</div>
              <button class="btn-skin-info" data-skin-info="${s.id}"
                style="background:rgba(230, 200, 255, 0.15);border:1px solid rgba(230, 200, 255, 0.5);color:rgba(230, 200, 255, 0.8);font-size:8px;font-weight:800;padding:3px 10px;border-radius:8px;cursor:pointer;letter-spacing:0.5px;margin-top:4px;font-family:inherit;"
              >Special Ability Info &#9432;</button>
              <div class="skin-info-panel" id="info-${s.id}"
                style="visibility:hidden;min-height:32px;margin-top:4px;width:100%;text-align:center;"
              >
                ${s.abilityDesc ? `<div style="font-size:8px;color:rgba(230,200,255,0.8);line-height:1.4;padding:0 4px;">${s.abilityDesc}<br><span style="color:#ffd700;font-weight:bold;">Duration: ${currentDuration}s</span></div>` : '<div style="font-size:8px;color:rgba(230,200,255,0.6);">No special ability.</div>'}
              </div>
              ${isSelected ? `<div style="font-size:9px;color:#00ff88;font-weight:800;margin-top:4px">✓ SELECTED</div>` : ''}
              <div class="upgrade-row">
                <span class="level-indicator">Lvl ${s.upgradeLevel}/5</span>
                ${s.unlocked && s.upgradeLevel < s.maxUpgrade
                  ? `<button class="btn-upgrade-skin" data-id="${s.id}">⬆ (${upgradeCost}🟡)</button>`
                  : ''}
              </div>
              <div class="buy-row">
                ${s.unlocked
                  ? (isSelected
                      ? `<span class="equipped-tag">★ ACTIVE</span>`
                      : `<button class="btn-equip-skin" data-id="${s.id}">➡ SELECT</button>`)
                  : `<button class="btn-buy-skin" data-id="${s.id}">${s.costCoins > 0 ? '🟡 ' + s.costCoins.toLocaleString() : '💎 ' + s.costGems.toLocaleString()}</button>`
                }
              </div>
            </div>
          `;
        }).join('');
        return `
          <div class="grid-scroll">${skinsCards}</div>
        `;
      }

      case 'worlds': {
        const worldColors: Record<string, string> = {
          jungle: '#00c853', ice: '#40c4ff',
          desert: '#ffab40', volcano: '#ff3d00', space: '#651fff',
          heaven: '#ffd740'
        };
        const worlds = this.engine.progressManager.getWorldsList();
        const worldsCards = worlds.map((w: GameWorld) => {
          const isActive = progress.activeWorld === w.id;
          const wc = worldColors[w.id] || '#fff';
          
          let iconHtml = `<div class="world-icon" style="font-size:50px">${w.emoji}</div>`;
          if (w.id === 'jungle') {
            iconHtml = this.getJungleWorldIconSvg('58px', '58px');
          } else if (w.id === 'ice') {
            iconHtml = this.getIceWorldIconSvg('58px', '58px');
          } else if (w.id === 'volcano') {
            iconHtml = this.getVolcanoWorldIconSvg('58px', '58px');
          } else if (w.id === 'space') {
            iconHtml = this.getSpaceWorldIconSvg('58px', '58px');
          } else if (w.id === 'heaven') {
            iconHtml = this.getHeavenWorldIconSvg('58px', '58px');
          } else if (w.id === 'desert') {
            iconHtml = this.getDesertWorldIconSvg('58px', '58px');
          }

          let actionHtml = '';
          if (w.unlocked) {
            if (isActive) {
              actionHtml = `<span style="color:${wc};font-size:9px;font-weight:800">● ACTIVE</span>`;
            } else {
              actionHtml = `<span style="font-size:18px;color:rgba(255,255,255,0.25)">›</span>`;
            }
          } else {
            actionHtml = `<button class="btn-buy-world btn-buy-skin" data-id="${w.id}" style="padding: 6px 12px; font-size: 10px; width: auto; font-family: inherit;">
              ${w.costCoins > 0 ? '🟡 ' + w.costCoins.toLocaleString() : '💎 ' + w.costGems.toLocaleString()}
            </button>`;
          }

          return `
            <div class="world-card glass-card ${isActive ? 'selected-border' : ''}" data-world-id="${w.id}"
                 style="zoom: 1.2; ${isActive ? `box-shadow: 0 0 0 2px ${wc}, 0 0 18px ${wc}44; background:${wc}12;` : ''}"
            >
              ${iconHtml}
              <div style="flex:1;min-width:0;text-align:left;">
                <div class="world-name" style="font-size: 11px;">${w.name}</div>
              </div>
              <div style="margin-left: 10px;">
                ${actionHtml}
              </div>
            </div>
          `;
        }).join('');
        return `
          <div class="vertical-scroll" style="gap: 24px; padding-bottom: 20px; margin-top: 35px;">${worldsCards}</div>
        `;
      }

      case 'achievements': {
        // Fallback safety redirect
        this.activeTab = 'rewards';
        return this.renderTabInnerContent(progress);
      }
      case 'rewards': {
          const quests = progress.dailyQuests || this.engine.progressManager.initDefaultQuests();
          
          const renderQuestCard = (q: any) => {
            const progressPct = Math.min(100, Math.round((q.current / q.target) * 100));
            const isCompleted = q.current >= q.target;
            const isClaimed = q.claimed;

            let claimBtnClass = '';
            let claimBtnText = 'CLAIM 🎁';
            let claimDisabled = '';

            if (isClaimed) {
              claimBtnClass = 'claimed';
              claimBtnText = 'CLAIMED';
              claimDisabled = 'disabled';
            } else if (!isCompleted) {
              claimBtnClass = 'locked';
              claimBtnText = 'LOCKED';
              claimDisabled = 'disabled';
            }

            return `
              <div class="quest-card">
                <div class="quest-details">
                  <div class="quest-desc" style="font-weight: 800; font-size: 11px; color: #fff;">${q.desc}</div>
                  <div class="quest-progress-container" style="margin-top: 8px;">
                    <div class="quest-progress-bar">
                      <div class="quest-progress-fill" style="width: ${progressPct}%"></div>
                    </div>
                    <span class="quest-progress-text">${q.current} / ${q.target}</span>
                  </div>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                  <div class="quest-rewards">
                    <span style="display: inline-flex; align-items: center; gap: 4px;">
                      ${this.getCoinIconSvg('13px', '13px', 'display: inline-block; vertical-align: middle;', 'quest-' + q.id)}
                      +${q.rewardCoins}
                    </span>
                    <span>💎+${q.rewardGems}</span>
                  </div>
                  <button class="btn-quest-claim ${claimBtnClass}" data-quest-id="${q.id}" ${claimDisabled}>
                    ${claimBtnText}
                  </button>
                </div>
              </div>
            `;
          };

          const shortMissions = quests.filter(q => q.id.startsWith('short_'));
          const longMissions = quests.filter(q => q.id.startsWith('long_'));

          const shortHtml = shortMissions.map(renderQuestCard).join('');
          const longHtml = longMissions.map(renderQuestCard).join('');

          const lastClaim = this.engine.progressManager.getState().lastSpecialOfferAdTime || 0;
          const offerCooldown = 24 * 60 * 60 * 1000;
          const isDailyCooldownActive = (Date.now() - lastClaim) < offerCooldown;

          return `
            <div class="daily-rewards-container" style="padding-bottom: 20px;">
              <div class="hangar-section-title" style="margin: 0 0 15px 0; font-size: 18px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #fff; text-shadow: 0 0 8px rgba(255,255,255,0.4); text-align: center;">🦅 MISSIONS</div>
              <div class="hangar-section-title" style="margin-top: 0; color: #00f3ff; border-left: 3px solid #00f3ff; padding-left: 8px;">SHORT-TERM</div>
              <div class="quests-list" style="margin-bottom: 20px;">
                ${shortHtml}
              </div>

              <div class="hangar-section-title" style="margin-top: 15px; color: #ffd700; border-left: 3px solid #ffd700; padding-left: 8px;">LONG-TERM</div>
              <div class="quests-list" style="margin-bottom: 20px;">
                ${longHtml}
              </div>

              <div class="hangar-section-title" style="margin-top: 15px; color: #ffaa00; border-left: 3px solid #ffaa00; padding-left: 8px;">SPECIAL OFFERS</div>
              <div class="quests-list">
                <!-- WATCH AD FOR EXTRA COINS & GEMS -->
                <div class="quest-card" style="background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.2);">
                  <div class="quest-details">
                    <div class="quest-desc" style="font-weight: 800; font-size: 11px; color: #fff;">Watch an ad to get 200 Coins & 10 Gems instantly!</div>
                  </div>
                  <div style="display: flex; align-items: center; justify-content: flex-end;">
                    <button class="btn-quest-claim ${isDailyCooldownActive ? 'disabled-ad-btn' : ''}" id="btn-extra-rewards" ${isDailyCooldownActive ? 'disabled' : ''} style="background: linear-gradient(135deg, #ffaa00, #ff7700); border: none; font-size: 10px; font-weight: 800; padding: 6px 12px; border-radius: 8px; cursor: pointer; color: white;">
                      CLAIM 🎁
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
      }

      case 'levels': {
        const allLevels = LevelManager.getAllLevels();

        const pageSize = 20;
        const numPages = Math.ceil(allLevels.length / pageSize);
        let pagesHtml = '';

        for (let p = 0; p < numPages; p++) {
          const pageStart = p * pageSize;
          const pageLevels = allLevels.slice(pageStart, pageStart + pageSize);
          
          while (pageLevels.length < pageSize) {
            pageLevels.push(null as any);
          }

          const pageCards = pageLevels.map(lvl => {
            if (!lvl) {
              return `<div class="level-select-card placeholder" style="opacity: 0; pointer-events: none;"></div>`;
            }
            const unlockedLevel = progress.levelModeUnlockedLevel || 1;
            const isLocked = false; // Always unlocked for testing
            const isLatest = lvl.levelNum === unlockedLevel;

            let levelColor = 'inherit';
            if (lvl.levelNum >= 1 && lvl.levelNum <= 20) {
              levelColor = '#4ade80'; // Green
            } else if (lvl.levelNum >= 21 && lvl.levelNum <= 40) {
              levelColor = '#facc15'; // Yellow
            } else if (lvl.levelNum >= 41 && lvl.levelNum <= 50) {
              levelColor = '#f87171'; // Red
            }

            return `
              <div class="level-select-card glass-card ${isLocked ? 'locked' : 'unlocked'} ${isLatest ? 'latest-unlocked' : ''}" 
                   data-level-num="${lvl.levelNum}"
              >
                ${isLocked 
                  ? `<div class="level-lock-icon">🔒</div>`
                  : `
                    <div class="level-num-label" style="color: ${levelColor}; text-shadow: 0 0 10px ${levelColor}88;">${lvl.levelNum}</div>
                  `
                }
              </div>
            `;
          }).join('');

          pagesHtml += `
            <div class="level-select-page">
              ${pageCards}
            </div>
          `;
        }

        return `
          <div class="level-select-grid-container">
            <div class="level-select-grid">
              ${pagesHtml}
            </div>
          </div>
        `;
      }

      case 'powerups': {
        const upgrades = progress.powerupUpgrades || { shield: 1, slowmo: 1, magnet: 1, turbo: 1, mini: 1 };
        const powerupsInfo = [
          { id: 'shield', name: 'Shield Deflector', icon: '🛡️', desc: 'Protects from 1 fatal collision.', base: 8.0 },
          { id: 'slowmo', name: 'Temporal Slow-Mo', icon: '⏳', desc: 'Slows down moving obstacles.', base: 10.0 },
          { id: 'magnet', name: 'Coin Magnet', icon: '🧲', desc: 'Attracts gold coins and gems.', base: 12.0 },
          { id: 'turbo', name: 'Hyper Booster', icon: '🔥', desc: 'Invincible hyper flight speed.', base: 5.0 },
          { id: 'mini', name: 'Quantum Mini-Bird', icon: '🔎', desc: 'Shrinks bird size for tight paths.', base: 10.0 }
        ];

        const upgradesHtml = powerupsInfo.map(p => {
          const lvl = upgrades[p.id] || 1;
          const isMax = lvl >= 5;
          const cost = 1000 * Math.pow(2, lvl - 1);
          const currentDur = (p.base * (1 + (lvl - 1) * 0.15)).toFixed(1);
          const nextDur = (p.base * (1 + lvl * 0.15)).toFixed(1);
          
          let indicatorHtml = '';
          for (let i = 1; i <= 5; i++) {
            indicatorHtml += `<span class="lvl-dot ${i <= lvl ? 'filled' : ''}"></span>`;
          }

          return `
            <div class="quest-card" style="margin-bottom: 10px;">
              <div class="quest-details">
                <div class="quest-name-row">
                  <span class="quest-name">${p.icon} ${p.name}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                  <div class="powerup-lvl-dots">${indicatorHtml}</div>
                  <span class="quest-progress-text" style="color: #ffd700;">Lvl ${lvl}/5</span>
                </div>
                <div style="font-size: 9px; color: rgba(255,255,255,0.5); margin-top: 2px;">
                  Duration: ${currentDur}s ${isMax ? '(Max)' : `➔ <span style="color:#00ffaa">${nextDur}s</span>`}
                </div>
              </div>
              <div style="display: flex; align-items: center; justify-content: flex-end;">
                ${isMax 
                  ? `<button class="btn-quest-claim claimed" style="font-size:9px;" disabled>MAXED</button>`
                  : `<button class="btn-powerup-upgrade btn-quest-claim" data-id="${p.id}" style="font-size:9px; background:linear-gradient(135deg, #00f3ff, #0088ff); box-shadow:0 4px 10px rgba(0, 136, 255, 0.3);">
                       UPGRADE 🟡${cost.toLocaleString()}
                     </button>`
                }
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="daily-rewards-container" style="padding-bottom: 20px;">
            <div class="quests-list">
              ${upgradesHtml}
            </div>
          </div>
        `;
      }

      case 'settings': {
        return `
          <div class="zones-configuration-card glass-card" style="width: 90%; max-width: 380px; padding: 22px 18px; border-radius: 24px; background: rgba(13, 10, 28, 0.85); border: 1.5px solid rgba(0, 255, 136, 0.2); box-shadow: 0 10px 30px rgba(0, 255, 136, 0.15), 0 5px 15px rgba(0, 0, 0, 0.5); margin: 30px auto; position: relative;">
            <!-- Close icon button -->
            <button id="btn-settings-back-icon" style="position: absolute; right: 15px; top: 15px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: white; width: 28px; height: 28px; border-radius: 50%; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">✖</button>


            <!-- Volume control sliders section -->
            <div class="control-group" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px;">
              <div class="segment-label" style="font-size: 11px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,0.4); margin-bottom: 15px; text-transform: uppercase;">SOUND VOLUME CONTROLS</div>
              
              <!-- Background Music slider -->
              <div class="slider-row" style="margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                  <span>🎵 BACKGROUND MUSIC</span>
                  <span id="label-music-val" style="color: #00f3ff; font-weight: 900;">${Math.round(this.engine.soundManager.getMusicVolume() * 100)}%</span>
                </div>
                <input type="range" class="settings-slider" id="slide-music-vol" min="0" max="100" value="${Math.round(this.engine.soundManager.getMusicVolume() * 100)}" 
                       style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; outline: none; -webkit-appearance: none; cursor: pointer; accent-color: #00f3ff;"
                >
              </div>

              <!-- System SFX slider -->
              <div class="slider-row" style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                  <span>🔊 SYSTEM SOUND EFFECTS</span>
                  <span id="label-sfx-val" style="color: #a855f7; font-weight: 900;">${Math.round(this.engine.soundManager.getSfxVolume() * 100)}%</span>
                </div>
                <input type="range" class="settings-slider" id="slide-sfx-vol" min="0" max="100" value="${Math.round(this.engine.soundManager.getSfxVolume() * 100)}" 
                       style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; outline: none; -webkit-appearance: none; cursor: pointer; accent-color: #a855f7;"
                >
              </div>
            </div>

            <!-- Game Share System -->
            <div class="control-group" style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px; margin-top: 20px;">
              <div class="segment-label" style="font-size: 11px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,0.4); margin-bottom: 12px; text-transform: uppercase;">SHARE GAME & EARN REWARDS</div>
              <button class="share-btn-platform" id="btn-share-system" style="width: 100%; padding: 15px 20px; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 14px; font-family: var(--font-family); font-weight: 900; font-size: 13px; letter-spacing: 1.5px; cursor: pointer; color: #fff; background: linear-gradient(135deg, #00f3ff, #a855f7); display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(0, 243, 255, 0.25); text-transform: uppercase;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                <span>SHARE</span>
              </button>
            </div>

            <!-- Back Button at bottom -->
            <div style="margin-top: 24px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 20px;">
              <button class="btn btn-secondary" id="btn-settings-back" style="width: 100%; padding: 12px; border-radius: 12px; font-weight: 800; cursor: pointer;">BACK TO MENU</button>
            </div>
          </div>
        `;
      }

      default:
        return '';
    }
  }

  private showTopupPopup() {
    // Remove any existing popup
    const existing = document.getElementById('topup-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'topup-modal-overlay';
    overlay.className = 'topup-modal-overlay fade-in';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: 'Outfit', sans-serif;
    `;

    const cooldownMs = AdManager.getEconomyCooldownRemaining();
    const onCooldown = cooldownMs > 0;
    const cooldownStr = onCooldown ? Math.ceil(cooldownMs / 1000) + 's' : '';

    overlay.innerHTML = `
      <div class="topup-modal-card glass-card" style="
        width: 85%;
        max-width: 300px;
        background: linear-gradient(135deg, rgba(20, 15, 38, 0.96), rgba(10, 5, 20, 0.98));
        border: 2px solid rgba(0, 243, 255, 0.4);
        border-radius: 20px;
        padding: 20px 16px;
        color: white;
        box-shadow: 0 0 25px rgba(0, 243, 255, 0.25);
        text-align: center;
        position: relative;
        font-family: inherit;
        animation: modalSlideIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      ">
        <!-- Close Button -->
        <button id="topup-close-btn" style="
          position: absolute;
          top: 12px;
          right: 12px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.15);
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        ">✕</button>

        <!-- Header -->
        <div style="font-size: 14px; font-weight: 900; color: #00f3ff; margin-bottom: 16px; margin-top: 10px; text-shadow: 0 0 8px rgba(0,243,255,0.35); display: flex; align-items: center; justify-content: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
          🎬 WATCH ADS, GET REWARD!
        </div>

        <!-- Cooldown Indicator -->
        ${onCooldown ? `
          <div style="
            background: rgba(255, 0, 85, 0.1);
            border: 1px solid rgba(255, 0, 85, 0.35);
            padding: 6px 12px;
            border-radius: 10px;
            font-size: 10px;
            color: #ff3366;
            margin-bottom: 14px;
            font-weight: 800;
            display: inline-block;
          ">
            ⏳ COOLDOWN: Refilling in ${cooldownStr}
          </div>
        ` : ''}

        <!-- Cards Section -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <!-- Coins Card -->
          <div class="topup-card" style="
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(212, 175, 55, 0.25);
            border-radius: 14px;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.3s;
          ">
            <div style="font-size: 14px; font-weight: 900; color: #ffe47a; display: flex; align-items: center; gap: 6px;">
              <span style="width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;">
                ${this.getCoinIconSvg('18px', '18px', '', 'topup')}
              </span>
              +6,000 Coins
            </div>
            <button id="topup-coins-ad-btn" ${onCooldown ? 'disabled' : ''} style="
              background: ${onCooldown ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #ffd700, #ff8800)'};
              border: none;
              padding: 8px 14px;
              border-radius: 10px;
              color: ${onCooldown ? 'rgba(255,255,255,0.35)' : 'white'};
              font-weight: 800;
              font-size: 10px;
              font-family: inherit;
              cursor: ${onCooldown ? 'not-allowed' : 'pointer'};
              box-shadow: ${onCooldown ? 'none' : '0 3px 8px rgba(255,136,0,0.2)'};
              transition: all 0.2s;
            ">
              ${onCooldown ? 'COOLING' : 'GET 🎬'}
            </button>
          </div>

          <!-- Gems Card -->
          <div class="topup-card" style="
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(0, 168, 255, 0.25);
            border-radius: 14px;
            padding: 10px 14px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.3s;
          ">
            <div style="font-size: 14px; font-weight: 900; color: #a8e5ff; display: flex; align-items: center; gap: 6px;">
              💎 +200 Gems
            </div>
            <button id="topup-gems-ad-btn" ${onCooldown ? 'disabled' : ''} style="
              background: ${onCooldown ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #00c3ff, #0055ff)'};
              border: none;
              padding: 8px 14px;
              border-radius: 10px;
              color: ${onCooldown ? 'rgba(255,255,255,0.35)' : 'white'};
              font-weight: 800;
              font-size: 10px;
              font-family: inherit;
              cursor: ${onCooldown ? 'not-allowed' : 'pointer'};
              box-shadow: ${onCooldown ? 'none' : '0 3px 8px rgba(0,85,255,0.2)'};
              transition: all 0.2s;
            ">
              ${onCooldown ? 'COOLING' : 'GET 🎬'}
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close button
    const closeBtn = document.getElementById('topup-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.remove());
    // Click outside to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Coins Watch Ad
    const coinsAdBtn = document.getElementById('topup-coins-ad-btn');
    if (coinsAdBtn && !onCooldown) {
      coinsAdBtn.addEventListener('click', () => {
        overlay.remove();
        AdManager.showEconomyRewarded((success) => {
          if (success) {
            this.engine.progressManager.addCoins(6000);
            this.engine.progressManager.updateQuestProgress('watch_ads', 1);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('REWARDS CLAIMED! 🎁', 'You received 6,000 Coins!');
          } else {
            this.showToastNotification('AD FAILED', 'Failed to play or watch ad.');
          }
        });
      });
    }

    // Gems Watch Ad
    const gemsAdBtn = document.getElementById('topup-gems-ad-btn');
    if (gemsAdBtn && !onCooldown) {
      gemsAdBtn.addEventListener('click', () => {
        overlay.remove();
        AdManager.showEconomyRewarded((success) => {
          if (success) {
            this.engine.progressManager.addGems(200);
            this.engine.progressManager.updateQuestProgress('watch_ads', 1);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('REWARDS CLAIMED! 🎁', 'You received 200 Gems!');
          } else {
            this.showToastNotification('AD FAILED', 'Failed to play or watch ad.');
          }
        });
      });
    }
  }

  private bindMenuEvents() {
    const sm = this.engine.soundManager;
    const bindClick = (id: string, action: () => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', action);
    };

    // Back to main landing page instantly
    const navigateBackWithAnimation = () => {
      sm.playUIBack();
      this.activeTab = 'main';
      this.render();
    };

    bindClick('btn-back-main', navigateBackWithAnimation);
    bindClick('btn-settings-back', navigateBackWithAnimation);
    bindClick('btn-settings-back-icon', navigateBackWithAnimation);


    // Side panel quick-access buttons → open dedicated tab page
    bindClick('side-btn-rewards',      () => { sm.playUISelect(); this.activeTab = 'rewards';      this.render(); });
    bindClick('side-btn-powerups',     () => { sm.playUISelect(); this.activeTab = 'powerups';     this.render(); });
    bindClick('side-btn-skins',        () => { sm.playUISelect(); this.activeTab = 'skins';        this.render(); });
    bindClick('side-btn-worlds',       () => { sm.playUISelect(); this.activeTab = 'worlds';       this.render(); });
    bindClick('btn-open-settings',     () => { sm.playUISelect(); this.activeTab = 'settings';     this.render(); });
    bindClick('btn-coin-topup',         () => { sm.playUIClick(); this.showTopupPopup(); });
    bindClick('btn-gem-topup',          () => { sm.playUIClick(); this.showTopupPopup(); });
    // Also bind the + buttons directly (stopPropagation so they don't bubble to parent div)
    const btnPlusCoinsEl = document.getElementById('btn-plus-coins');
    if (btnPlusCoinsEl) btnPlusCoinsEl.addEventListener('click', (e) => { e.stopPropagation(); sm.playUIClick(); this.showTopupPopup(); });
    const btnPlusGemsEl = document.getElementById('btn-plus-gems');
    if (btnPlusGemsEl) btnPlusGemsEl.addEventListener('click', (e) => { e.stopPropagation(); sm.playUIClick(); this.showTopupPopup(); });



    // Background Music Volume Slider Binding
    const slideMusic = this.container.querySelector('#slide-music-vol') as HTMLInputElement;
    if (slideMusic) {
      slideMusic.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        this.engine.soundManager.setMusicVolume(val / 100);
        const label = this.container.querySelector('#label-music-val');
        if (label) label.textContent = `${val}%`;
      });
    }

    // System SFX Volume Slider Binding
    const slideSfx = this.container.querySelector('#slide-sfx-vol') as HTMLInputElement;
    if (slideSfx) {
      slideSfx.addEventListener('input', (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        this.engine.soundManager.setSfxVolume(val / 100);
        const label = this.container.querySelector('#label-sfx-val');
        if (label) label.textContent = `${val}%`;
      });
      // Play a quick feedback coin sound when releasing the slider so the player can test the volume!
      slideSfx.addEventListener('change', () => {
        this.engine.soundManager.playCoin();
      });
    }

    // Mysterious chests opening
    const chestBtns = this.container.querySelectorAll('.btn-open-chest[data-chest-id]');
    chestBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chestId = parseInt((btn as HTMLElement).getAttribute('data-chest-id') || '0');
        if (!chestId) return;

        const chests = [
          { id: 1, name: 'Bronze Chest', icon: '📦', minCoins: 250, maxCoins: 600, minGems: 2, maxGems: 6 },
          { id: 2, name: 'Silver Chest', icon: '🧰', minCoins: 800, maxCoins: 1800, minGems: 8, maxGems: 16 },
          { id: 3, name: 'Golden Chest', icon: '🎁', minCoins: 2000, maxCoins: 4500, minGems: 20, maxGems: 45 }
        ];
        const ch = chests.find(c => c.id === chestId);
        if (!ch) return;

        const status = this.getChestStatus(chestId);
        if (!status.isReady) {
          this.showToastNotification('CHEST LOCKED', `You need to claim more missions to open this chest!`);
          return;
        }

        // Trigger shake/opening animation!
        const card = this.container.querySelector(`.chest-card[data-chest-id="${ch.id}"]`) as HTMLElement | null;
        if (card) {
          card.classList.add('chest-opening-shake');
        }
        
        btn.textContent = 'OPENING...';
        (btn as HTMLButtonElement).disabled = true;

        this.engine.soundManager.playCrateUnlock();

        setTimeout(() => {
          // Calculate rewards based on chestId and status.claims
          let gainedCoins = 0;
          let gainedGems = 0;
          let unlockedCharName: string | undefined = undefined;
          let unlockedWorldName: string | undefined = undefined;

          const skinsList = this.engine.progressManager.getSkins();
          const worldsList = this.engine.progressManager.getWorldsList();

          if (chestId === 1) {
            // Bronze Box
            if (status.claims === 0) {
              gainedCoins = 1500;
              gainedGems = 10;
            } else if (status.claims === 1) {
              gainedCoins = 2000;
              gainedGems = 20;
            } else if (status.claims === 2) {
              const isNeonCrowUnlocked = skinsList.find(s => s.id === 'neon_crow')?.unlocked;
              const isHummingbirdUnlocked = skinsList.find(s => s.id === 'jade_lotus')?.unlocked;

              if (!isNeonCrowUnlocked) {
                this.engine.progressManager.unlockSkinDirect('neon_crow');
                unlockedCharName = 'Neon crow';
              } else if (!isHummingbirdUnlocked) {
                this.engine.progressManager.unlockSkinDirect('jade_lotus');
                unlockedCharName = 'Lotus Hummingbird';
              } else {
                // Fallback reward if both already unlocked
                gainedCoins = 2500;
                gainedGems = 25;
              }
            }
          } else if (chestId === 2) {
            // Silver Box
            if (status.claims === 0) {
              gainedCoins = 3000;
              gainedGems = 30;
            } else if (status.claims === 1) {
              gainedCoins = 1000;
              gainedGems = 15;

              const isWhiteDragonUnlocked = skinsList.find(s => s.id === 'white_dragon')?.unlocked;
              const isKingfisherUnlocked = skinsList.find(s => s.id === 'kingfisher')?.unlocked;
              const isIcePhoenixUnlocked = skinsList.find(s => s.id === 'articuno')?.unlocked;

              if (!isWhiteDragonUnlocked) {
                this.engine.progressManager.unlockSkinDirect('white_dragon');
                unlockedCharName = 'Seto Dragon';
              } else if (!isKingfisherUnlocked) {
                this.engine.progressManager.unlockSkinDirect('kingfisher');
                unlockedCharName = 'Azure Kingfisher';
              } else if (!isIcePhoenixUnlocked) {
                this.engine.progressManager.unlockSkinDirect('articuno');
                unlockedCharName = 'Ice Phoenix';
              }
            }
          } else if (chestId === 3) {
            // Golden Box
            if (status.claims === 0) {
              gainedCoins = 0;
              gainedGems = 25;

              const isVolcanoUnlocked = worldsList.find(w => w.id === 'volcano')?.unlocked;
              const isDesertUnlocked = worldsList.find(w => w.id === 'desert')?.unlocked;
              const isSpaceUnlocked = worldsList.find(w => w.id === 'space')?.unlocked;

              if (!isVolcanoUnlocked) {
                this.engine.progressManager.unlockWorldDirect('volcano');
                unlockedWorldName = 'Volcanic Spring';
              } else if (!isDesertUnlocked) {
                this.engine.progressManager.unlockWorldDirect('desert');
                unlockedWorldName = 'Desert Ruins';
              } else if (!isSpaceUnlocked) {
                this.engine.progressManager.unlockWorldDirect('space');
                unlockedWorldName = 'Cosmic Meadow';
              }

              const isDreadOwlUnlocked = skinsList.find(s => s.id === 'dread_owl')?.unlocked;
              const isWhiteDragonUnlocked = skinsList.find(s => s.id === 'white_dragon')?.unlocked;
              const isKingfisherUnlocked = skinsList.find(s => s.id === 'kingfisher')?.unlocked;

              if (!isDreadOwlUnlocked) {
                this.engine.progressManager.unlockSkinDirect('dread_owl');
                unlockedCharName = 'Great Horned Owl';
              } else if (!isWhiteDragonUnlocked) {
                this.engine.progressManager.unlockSkinDirect('white_dragon');
                unlockedCharName = 'Seto Dragon';
              } else if (!isKingfisherUnlocked) {
                this.engine.progressManager.unlockSkinDirect('kingfisher');
                unlockedCharName = 'Azure Kingfisher';
              }
            }
          }

          // Save claims count
          const nextClaims = status.claims + 1;
          localStorage.setItem(`flight_of_legends_chest_${ch.id}_claims`, nextClaims.toString());

          // Apply rewards
          if (gainedCoins > 0) {
            this.engine.progressManager.addCoins(gainedCoins);
          }
          if (gainedGems > 0) {
            this.engine.progressManager.addGems(gainedGems);
          }
          this.engine.progressManager.save();

          // Rerender and show reward popup
          this.render();
          this.showChestRewardPopup(ch.name, gainedCoins, gainedGems, unlockedCharName, unlockedWorldName);
        }, 1200); // 1.2 seconds shake animation
      });
    });

    // Battle Pass Missions Claim removed

    // Achievement claim buttons
    const achClaimBtns = this.container.querySelectorAll('.btn-ach-claim[data-ach-id]');
    achClaimBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const achId = (btn as HTMLElement).getAttribute('data-ach-id') || '';
        const res = this.engine.progressManager.claimAchievementReward(achId);
        if (res.success) {
          sm.playUIClaim();
          this.showToastNotification('ACHIEVEMENT CLAIMED! 🏆', res.msg);
          this.render();
        } else {
          sm.playUIClick();
          this.showToastNotification('CLAIM FAILED', res.msg);
        }
      });
    });

    // Daily quests claim buttons
    const questClaimBtns = this.container.querySelectorAll('.btn-quest-claim[data-quest-id]');
    questClaimBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const questId = (btn as HTMLElement).getAttribute('data-quest-id') || '';
        const res = this.engine.progressManager.claimQuestReward(questId);
        if (res.success) {
          sm.playUIClaim();
          this.showToastNotification('QUEST COMPLETED! 🏆', res.msg);
          this.render();
        } else {
          sm.playUIClick();
          this.showToastNotification('CLAIM FAILED', res.msg);
        }
      });
    });

    // Powerup upgrade buttons
    const powerupUpgradeBtns = this.container.querySelectorAll('.btn-powerup-upgrade[data-id]');
    powerupUpgradeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).getAttribute('data-id') || '';
        const res = this.engine.progressManager.upgradePowerup(id);
        if (res.success) {
          sm.playUIUpgrade();
          this.showToastNotification('UPGRADE SUCCESSFUL 🧪', res.msg);
          this.render();
        } else {
          sm.playUIClick();
          this.showToastNotification('UPGRADE FAILED', res.msg);
        }
      });
    });

    // Bird mascot tap opens Skins hangar directly!
    bindClick('bird-mascot-tap', () => {
      sm.playUISelect();
      this.activeTab = 'skins';
      this.render();
    });

    // Game start & spectator
    bindClick('btn-start-game', () => {
      sm.playUISelect();
      this.showEndlessModeSelection();
    });
    bindClick('btn-open-levels', () => {
      sm.playUISelect();
      this.activeTab = 'levels';
      this.render();
    });


    // Level Select click events
    const unlockedLevelCards = this.container.querySelectorAll('.level-select-card.unlocked');
    unlockedLevelCards.forEach(card => {
      card.addEventListener('click', () => {
        sm.playUISelect();
        const lvlNum = parseInt(card.getAttribute('data-level-num') || '1');
        this.engine.gameMode = 'level';
        this.engine.currentLevelNum = lvlNum;
        this.engine.startGame();
        this.render();
      });
    });
    // Levels vertical scroll arrows and dynamic visibility are removed as per request


    // Photo mode
    bindClick('btn-photo', () => {
      this.lastEngineState = this.engine.state;
      this.engine.state = 'PHOTO_MODE';
      this.render();
    });

    // Skins – tap whole card (if unlocked) or just the equip/buy/upgrade btn
    const skinCards = this.container.querySelectorAll('.skin-card[data-skin-id]');
    skinCards.forEach(card => {
      card.addEventListener('click', (e) => {
        const skinId = (card as HTMLElement).getAttribute('data-skin-id') || '';
        const target = e.target as HTMLElement;
        // Don't double-fire if clicking a nested action button
        if (target.classList.contains('btn-buy-skin') || target.classList.contains('btn-upgrade-skin') || target.classList.contains('btn-equip-skin') || target.classList.contains('btn-skin-info')) return;
        
        const skin = this.engine.progressManager.getSkins().find((s: Skin) => s.id === skinId);
        if (!skin) return;

        if (skin.unlocked) {
          sm.playUISelect();
          this.engine.progressManager.selectSkin(skinId);
          this.activeTab = 'main';
          this.render();
        } else {
          // Locked card clicked: do nothing (purchases must go through the blue purchase button directly)
        }
      });
    });

    const buyBtns = this.container.querySelectorAll('.btn-buy-skin:not(.btn-buy-world)');
    buyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sm.playUIClick();
        const id = (btn as HTMLElement).getAttribute('data-id') || '';
        const res = this.engine.progressManager.buySkin(id);
        if (res.success) {
          // Unlocked but not selected, no toast notification, no redirect, just refresh skins list
          this.render();
        } else {
          this.showToastNotification('PURCHASE FAILED', res.msg);
          this.render();
        }
      });
    });
    const equipBtns = this.container.querySelectorAll('.btn-equip-skin');
    equipBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sm.playUISelect();
        const id = (btn as HTMLElement).getAttribute('data-id') || '';
        this.engine.progressManager.selectSkin(id);
        this.activeTab = 'main';
        this.render();
      });
    });
    const upgradeBtns = this.container.querySelectorAll('.btn-upgrade-skin');
    upgradeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).getAttribute('data-id') || '';
        const res = this.engine.progressManager.upgradeSkin(id);
        if (res.success) {
          sm.playUIUpgrade();
          
          // Localized animation for the upgraded card only
          const card = btn.closest('.grid-card');
          if (card) {
            card.classList.add('card-upgrade-success');
            setTimeout(() => {
              card.classList.remove('card-upgrade-success');
            }, 600);

            // Update Level Indicator text
            const lvlIndicator = card.querySelector('.level-indicator');
            const skin = this.engine.progressManager.getSkins().find((s: Skin) => s.id === id);
            if (lvlIndicator && skin) {
              lvlIndicator.textContent = `Lvl ${skin.upgradeLevel}/5`;
            }

            // Update info panel with new duration
            const infoPanel = card.querySelector('.skin-info-panel');
            if (infoPanel && skin) {
              const getSkinAbilityDuration = (lvl: number) => {
                if (skin.id === 'angry_red') return 20;
                if (lvl === 1) return 10;
                if (lvl === 2) return 12;
                if (lvl === 3) return 14;
                if (lvl === 4) return 16;
                if (lvl === 5) return 20;
                return 10;
              };
              const newDur = getSkinAbilityDuration(skin.upgradeLevel);
              infoPanel.innerHTML = skin.abilityDesc 
                ? `<div style="font-size:8px;color:rgba(230,200,255,0.8);line-height:1.4;padding:0 4px;">${skin.abilityDesc}<br><span style="color:#ffd700;font-weight:bold;">Duration: ${newDur}s</span></div>` 
                : '<div style="font-size:8px;color:rgba(230,200,255,0.6);">No special ability.</div>';
            }

            // Update or remove the upgrade button cost/presence
            if (skin) {
              if (skin.upgradeLevel < skin.maxUpgrade) {
                const nextCost = this.engine.progressManager.getSkinUpgradeCost(skin.upgradeLevel);
                btn.textContent = `⬆ (${nextCost}🟡)`;
              } else {
                btn.remove();
              }
            }
          }

          // Safely update top bar coins if it exists
          const coinEl = document.getElementById('btn-coin-topup');
          if (coinEl) {
            const progressState = this.engine.progressManager.getState();
            for (let i = 0; i < coinEl.childNodes.length; i++) {
              const node = coinEl.childNodes[i];
              if (node.nodeType === Node.TEXT_NODE) {
                node.textContent = progressState.coins.toLocaleString();
                break;
              }
            }
          }
        } else {
          sm.playUIClick();
        }
        this.showToastNotification(res.success ? 'UPGRADE SUCCESSFUL ⬆' : 'UPGRADE FAILED', res.msg);
      });
    });

    // Info toggle buttons on skin cards
    const infoBtns = this.container.querySelectorAll('.btn-skin-info');
    infoBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const skinId = (btn as HTMLElement).getAttribute('data-skin-info') || '';
        const panel = this.container.querySelector(`#info-${skinId}`) as HTMLElement | null;
        if (!panel) return;
        const isOpen = panel.style.visibility !== 'hidden';
        panel.style.visibility = isOpen ? 'hidden' : 'visible';
        (btn as HTMLElement).textContent = isOpen ? 'Special Ability Info ℹ' : 'Special Ability Info ▲';
      });
    });

    // Worlds selection
    const worldCards = this.container.querySelectorAll('.world-card[data-world-id]');
    worldCards.forEach(card => {
      card.addEventListener('click', (e) => {
        const id = (card as HTMLElement).getAttribute('data-world-id') || '';
        if (!id) return;

        const target = e.target as HTMLElement;
        // Don't trigger card selection if clicking a nested action button
        if (target.classList.contains('btn-buy-world') || target.classList.contains('btn-equip-world')) return;

        const worldsList = this.engine.progressManager.getWorldsList();
        const world = worldsList.find(w => w.id === id);
        if (!world) return;

        if (world.unlocked) {
          sm.playUISelect();
          this.engine.progressManager.setWorld(id);
          this.engine.renderer.setWeather(id);
          this.activeTab = 'main';
          this.render();
        }
      });
    });

    // Explicit Worlds purchase button click
    const buyWorldBtns = this.container.querySelectorAll('.btn-buy-world');
    buyWorldBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sm.playUIClick();
        const id = (btn as HTMLElement).getAttribute('data-id') || '';
        this.engine.progressManager.buyWorld(id);
        this.render(); // Redraw UI, no toast notification
      });
    });

    // Extra Rewards Ad Button
    const btnExtraRewards = document.getElementById('btn-extra-rewards');
    if (btnExtraRewards) {
      btnExtraRewards.addEventListener('click', (e) => {
        e.stopPropagation();

        const lastClaim = this.engine.progressManager.getState().lastSpecialOfferAdTime || 0;
        const offerCooldown = 24 * 60 * 60 * 1000;
        if (Date.now() - lastClaim < offerCooldown) {
          this.showToastNotification('CLAIMED TODAY', 'You can only claim this reward once a day!');
          return;
        }

        AdManager.showEconomyRewarded((success) => {
          if (success) {
            const state = this.engine.progressManager.getState();
            state.lastSpecialOfferAdTime = Date.now();

            this.engine.progressManager.addCoins(200);
            this.engine.progressManager.addGems(10);
            this.engine.progressManager.updateQuestProgress('watch_ads', 1);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('REWARDS CLAIMED! 🎁', 'You received 200 Coins & 10 Gems!');
          } else {
            this.showToastNotification('AD FAILED', 'Failed to play or watch ad.');
          }
        });
      });
    }

    // Share Game System click bindings
    const handleShareClick = (platform: string) => {
      // Ensure unique device/fingerprint ID for referrals exists
      let myDeviceId = localStorage.getItem('legends_device_id');
      if (!myDeviceId) {
        myDeviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        localStorage.setItem('legends_device_id', myDeviceId);
      }

      // Generate unique referral token containing sender's device ID
      const shareToken = `ref_${myDeviceId}_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
      
      // Store in pending shares list
      const pending = JSON.parse(localStorage.getItem('pending_shares') || '[]');
      pending.push(shareToken);
      localStorage.setItem('pending_shares', JSON.stringify(pending));

      // Initialize status as empty array "[]" on public KV database (url encoded as %5B%5D)
      fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/7cantavq/${shareToken}/%5B%5D`, { 
        method: 'POST',
        headers: { 'Content-Length': '0' }
      })
        .catch(err => console.error("KV initialize failed:", err));

      let gameUrl = window.location.origin + window.location.pathname + `?ref=${shareToken}`;
      if (window.location.hostname === 'localapp' || window.location.protocol === 'file:') {
        gameUrl = `https://shiv5567.github.io/Floppy-bird-pipes/?ref=${shareToken}`;
      }
      const text = `Hey! Play Flappy Legends: Flappy Bird Game with me here: ${gameUrl}`;
      
      let shareUrl = '';
      let needsClipboard = false;
      
      if (platform === 'WhatsApp') {
        shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      } else if (platform === 'Messenger') {
        shareUrl = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(gameUrl)}&app_id=123456789&redirect_uri=${encodeURIComponent(gameUrl)}`;
      } else if (platform === 'System') {
        if ((window as any).AndroidBridge && (window as any).AndroidBridge.shareText) {
          (window as any).AndroidBridge.shareText(text);
        } else if (navigator.share) {
          navigator.share({
            title: 'Flappy Legends',
            text: text,
            url: gameUrl
          }).catch(err => {
            console.log("System Share cancelled/failed:", err);
          });
        } else {
          needsClipboard = true;
        }
      }

      // Open window/redirect or copy link
      if (needsClipboard) {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
          this.showToastNotification('LINK COPIED 📋', `Share link copied to clipboard!`);
        }
      } else if (shareUrl) {
        window.open(shareUrl, '_blank');
      }

      this.showToastNotification('PENDING VERIFICATION ⏳', 'Shared! Mission counts when a friend opens the link!');
      this.render();
    };

    const btnShareSystem = document.getElementById('btn-share-system');
    if (btnShareSystem) btnShareSystem.addEventListener('click', () => handleShareClick('System'));
  }


  private renderHUD() {
    this.resetHUDCache();
    const pList = this.engine.getActivePowerups();
    
    let tapInstructionHTML = '';
    const tapCount = parseInt(localStorage.getItem('legends_tap_instruction_count') || '0', 10);
    if (!this.engine.firstTapDone && tapCount < 10) {
      tapInstructionHTML = `
        <div class="tap-instruction-overlay fade-in" style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          pointer-events: none;
          z-index: 200;
          text-align: center;
          animation: tapPulse 1.8s infinite ease-in-out;
        ">
          <span style="font-size: 32px; animation: handWobble 1.2s infinite ease-in-out; display: inline-block;">👆</span>
          <span style="
            font-size: 20px;
            font-weight: 900;
            color: #00f3ff;
            text-shadow: 0 0 10px rgba(0, 243, 255, 0.7);
            letter-spacing: 1.5px;
            font-family: 'Outfit', sans-serif;
          ">TAP TAP TAP</span>
        </div>
      `;
    }

    const stateVal = this.engine.progressManager.getState();
    const highscore = this.engine.gameMode === 'flock'
      ? (stateVal.highscoreSquad || 0)
      : (stateVal.highscoreClassic || stateVal.highscore || 0);


    
    // Convert powerups to floating badge list
    const powerupBadges = pList.map(p => {
      const percent = (p.durationLeft / p.maxDuration) * 100;
      return `
        <div class="hud-powerup-badge glass-card fade-in">
          <span class="pow-icon">${p.type === 'shield' ? '🛡️' : p.type === 'slowmo' ? '⏳' : p.type === 'magnet' ? '🧲' : p.type === 'double' ? '✨' : p.type === 'turbo' ? '🔥' : p.type === 'ghost' ? '👻' : p.type === 'mini' ? '🔎' : '🪶'}</span>
          <div class="pow-bar-container">
            <div class="pow-bar-inner" style="width: ${percent}%; background-color: ${this.getPowerupColor(p.type)}"></div>
          </div>
        </div>
      `;
    }).join('');

    const ultActive = this.engine.ultimateActive;
    const ultPercent = Math.min(100, Math.floor(this.engine.ultimateEnergy));
    const ultReady = ultPercent >= 100;
    const skinGlow = this.engine.bird.getSkin().glowColor || '#00f3ff';
    const ultBarBg = ultReady ? `linear-gradient(90deg, #ffd700, ${skinGlow})` : skinGlow;

    // Boss Fight HUD elements (Option 3)
    const state = this.engine.state;
    const isBossFight = state === 'BOSS_FIGHT';
    const isBossActive = this.engine.bossManager.isBossActive();
    const activeWorld = this.engine.progressManager.getState().activeWorld;

    const bossNames: Record<string, string> = {
      jungle: 'Canopy Harpy',
      ice: 'Glacial Frost Wyrm',
      desert: 'Obelisk Sphinx',
      volcano: 'Volcanic Lava Dragon',
      space: 'Singularity Leviathan',
      underwater: 'Abyssal Mecha-Kraken',
      heaven: 'Seraphim Sol',
      retro: 'Retro Pixelsaurus'
    };
    const bossName = bossNames[activeWorld] || 'Titan Sentinel';

    let bossHealthBarHTML = '';
    if (isBossFight && isBossActive) {
      const bossHealth = this.engine.bossManager.getHealth();
      const bossMaxHealth = this.engine.bossManager.getMaxHealth();
      const bossHealthPercent = Math.max(0, Math.min(100, (bossHealth / bossMaxHealth) * 100));
      bossHealthBarHTML = `
        <div class="boss-health-bar-container fade-in">
          <div class="boss-info">
            <span class="boss-name">${bossName}</span>
            <span class="boss-health-val">${bossHealth} / ${bossMaxHealth}</span>
          </div>
          <div class="boss-health-track">
            <div class="boss-health-fill" style="width: ${bossHealthPercent}%"></div>
          </div>
        </div>
      `;
    }

    const boosterOverlayHTML = '';
    const boosterBtnHTML = '';
    const formationBtnHTML = '';
    const rescueEvolutionHTML = '';
    const evolveBtnHTML = '';
    const activeSkillBtnHTML = '';

    // ── Squad Survival Mode flock merge button ─────────────────────────────
    let flockMergeBtnHTML = '';
    if (this.engine.gameMode === 'flock') {
      const flockLen = this.engine.flock.length;
      const visible = flockLen >= 2;
      flockMergeBtnHTML = `
        <div class="hud-circle-btn glass-card ult-ready-pulse" 
             style="pointer-events: auto; cursor: pointer; display: ${visible ? 'flex' : 'none'}; flex-direction: column; align-items: center; justify-content: center; width: 68px; height: 68px; border-radius: 50%; border: 2.5px solid #ff007f; background: rgba(255, 0, 127, 0.1); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 0 18px rgba(255, 0, 127, 0.5); position: relative; margin-bottom: 6px; -webkit-tap-highlight-color: transparent; gap: 1px;" 
             id="btn-hud-flock-merge" 
             title="Merge Squad for Monster HP!">
          <div style="position: absolute; inset: 2px; border-radius: 50%; background: rgba(255, 0, 127, 0.15); pointer-events: none;"></div>
          
          <svg viewBox="0 0 100 100" style="width: 32px; height: 32px; z-index: 2; overflow: visible; margin-bottom: 2px;" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="mergeNeonGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <linearGradient id="mergeNeonGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ff007f" />
                <stop offset="40%" stop-color="#ff00ff" />
                <stop offset="75%" stop-color="#ff5533" />
                <stop offset="100%" stop-color="#ffaa00" />
              </linearGradient>
            </defs>
            
            <!-- Outer rings -->
            <path d="M 50,12 A 38,38 0 1,1 12,50 A 38,38 0 0,1 48,12.5" fill="none" stroke="url(#mergeNeonGrad)" stroke-width="2.5" stroke-linecap="round" filter="url(#mergeNeonGlow)" />
            <path d="M 40,20 A 30,30 0 1,0 75,50 A 30,30 0 0,0 52,20.3" fill="none" stroke="url(#mergeNeonGrad)" stroke-width="1.5" stroke-linecap="round" opacity="0.8" filter="url(#mergeNeonGlow)" />
            
            <!-- 3 Orbiting Birds -->
            <g transform="translate(50, 12) rotate(15)" filter="url(#mergeNeonGlow)">
              <path d="M -5,3 Q 0,-3 5,3 Q 2,1 0,-1 Q -2,1 -5,3" fill="url(#mergeNeonGrad)" />
            </g>
            <g transform="translate(18, 68) rotate(-110)" filter="url(#mergeNeonGlow)">
              <path d="M -5,3 Q 0,-3 5,3 Q 2,1 0,-1 Q -2,1 -5,3" fill="url(#mergeNeonGrad)" />
            </g>
            <g transform="translate(82, 60) rotate(120)" filter="url(#mergeNeonGlow)">
              <path d="M -5,3 Q 0,-3 5,3 Q 2,1 0,-1 Q -2,1 -5,3" fill="url(#mergeNeonGrad)" />
            </g>
            
            <!-- Center Phoenix -->
            <g transform="translate(50, 48) scale(0.9)" filter="url(#mergeNeonGlow)">
              <path d="
                M 0,-18 
                C -1,-22 -3,-24 -5,-25 
                C -3,-22 -2,-19 -2,-17 
                C -4,-18 -6,-17 -7,-15 
                C -5,-15 -3,-14 -2,-13
                C -4,-12 -5,-10 -5,-8
                C -3,-9 -1,-11 0,-12
                C 1,-11 2,-9 2,-7
                C 2,-5 1,-3 0,-1
                C -2,3 -4,8 -2,13
                C 0,17 3,22 1,26
                C -1,29 -5,28 -7,25
                C -5,30 0,32 3,29
                C 6,26 6,20 4,14
                C 6,18 9,23 13,22
                C 10,20 8,16 6,12
                C 8,8 8,3 6,-1
                C 5,-4 4,-6 4,-8
                C 4,-10 3,-12 1,-13
                C 2,-14 4,-15 6,-15
                C 4,-17 2,-18 0,-18 Z
              " fill="url(#mergeNeonGrad)" />
              
              <!-- Left Wing -->
              <path d="
                M -3,-10
                C -12,-16 -24,-13 -32,-2
                C -26,-2 -18,-5 -12,-5
                C -22,2 -28,10 -30,19
                C -24,13 -16,9 -10,8
                C -18,14 -20,24 -20,31
                C -16,23 -10,17 -6,14
                C -10,19 -11,26 -9,32
                C -7,24 -4,18 -1,13
                C -1,9 -2,0 -3,-10 Z
              " fill="url(#mergeNeonGrad)" />
              
              <!-- Right Wing -->
              <path d="
                M 3,-10
                C 12,-16 24,-13 32,-2
                C 26,-2 18,-5 12,-5
                C 22,2 28,10 30,19
                C 24,13 16,9 10,8
                C 18,14 20,24 20,31
                C 16,23 10,17 6,14
                C 10,19 11,26 9,32
                C 7,24 4,18 1,13
                C 1,9 2,0 3,-10 Z
              " fill="url(#mergeNeonGrad)" />
            </g>
          </svg>

          <span class="flock-merge-label" style="font-size: 7px; font-weight: 900; color: #ff007f; z-index: 2; text-shadow: 0 0 6px #ff007f; letter-spacing: 0.2px; text-align: center;">MERGE (+${flockLen})</span>
        </div>
      `;
    }

    // ── Squad Survival Mode Boss HP indicator ──────────────────────────────
    let playerHPBarHTML = '';
    const isBossWarning = state === 'BOSS_WARNING';
    if ((isBossFight || isBossWarning) && this.engine.gameMode === 'flock') {
      const hp = this.engine.playerBossHP > 0 ? this.engine.playerBossHP : this.engine.flock.length;
      const maxHp = this.engine.playerBossHP > 0 ? (this.engine.maxPlayerBossHP || hp) : Math.max(this.engine.flock.length, 1);
      const hearts = '❤️'.repeat(hp);
      
      const hasBossBar = isBossFight && isBossActive;
      const topOffset = hasBossBar ? '190px' : '130px';
      
      const fontSize = Math.max(8.5, (16 - Math.max(0, maxHp - 5) * 0.4) * 0.85);
      const letterSpacing = Math.max(0.5, 2.5 - Math.max(0, maxHp - 5) * 0.15);
      const paddingX = Math.max(10, 18 - Math.max(0, maxHp - 5) * 0.6);

      playerHPBarHTML = `
        <div class="player-hud-hp-container fade-in" style="
          position: absolute;
          top: ${topOffset};
          left: 50%;
          transform: translateX(-50%);
          background: rgba(13, 10, 28, 0.85);
          border: 1px solid rgba(255, 0, 127, 0.45);
          border-radius: 12px;
          padding: 6px ${paddingX}px;
          font-weight: 800;
          color: #fff;
          text-shadow: 0 0 8px #ff007f;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 0, 127, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          pointer-events: none;
          z-index: 100;
        ">
          <span style="font-size: 11px; color: #ff007f; letter-spacing: 0.5px; font-weight: 900;">SQUAD HP:</span>
          <span class="player-hud-hp-hearts" style="font-size: ${fontSize}px; letter-spacing: ${letterSpacing}px; display: flex; flex-direction: row; align-items: center; justify-content: center;">${hearts}</span>
        </div>
      `;
    }

    // Ultimate Duration Bar
    let ultDurationBarHTML = '';
    if (this.engine.ultimateActive) {
      const activeSkin = this.engine.bird.getSkin();
      const pct = Math.max(0, Math.min(100, (this.engine.ultimateDurationLeft / this.engine.ultimateMaxDuration) * 100));
      const skinGlow = activeSkin.glowColor || '#00f3ff';
      ultDurationBarHTML = `
        <div class="ultimate-duration-bar-container fade-in" style="border-color: ${skinGlow}88; box-shadow: 0 0 15px ${skinGlow}33;">
          <div class="ultimate-duration-bar-fill" style="width: ${pct}%; background: linear-gradient(90deg, ${skinGlow}, #ffffff); box-shadow: 0 0 10px ${skinGlow};"></div>
        </div>
      `;
    }

    const hudHTML = `
      <div class="hud fade-in">
        ${tapInstructionHTML}
        ${boosterOverlayHTML}
        ${rescueEvolutionHTML}
        ${playerHPBarHTML}
        ${ultDurationBarHTML}
        <div class="hud-top">
          <!-- Coins & Gems (Left side) -->
          <div class="run-stats" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-weight: 800; font-size: 13px; pointer-events: auto;">
            <span class="stat-badge" style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); width: fit-content; margin-bottom: 0;">🟡 ${this.engine.coinsCollectedThisRun}</span>
            <span class="stat-badge" style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); width: fit-content; margin-bottom: 0;">💎 ${this.engine.gemsCollectedThisRun}</span>
            ${(this.engine.gameMode === 'flock') ? `
              <span class="stat-badge flock-indicator" style="background: rgba(0,243,255,0.15); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(0,243,255,0.3); width: fit-content; margin-bottom: 0; color: #00f3ff; text-shadow: 0 0 5px #00f3ff;">🪽 SQUAD: ${this.engine.flock.length}</span>
            ` : ''}
            ${this.engine.isSpectatorMode ? '<span class="spectator-indicator" style="font-size: 8px; background: rgba(0,255,180,0.15); border: 1px solid rgba(0,255,180,0.3); padding: 2px 6px; border-radius: 6px; color: #00ffb4; font-weight: 800; width: fit-content; margin-top: 2px;">🤖 AUTO-PILOT</span>' : ''}
          </div>

          <!-- Powerup Timers (Middle section) -->
          <div class="powerup-timers-holder">
            ${powerupBadges}
          </div>

          <!-- Actions: Score & Pause (Right side) -->
          <div class="hud-actions" style="display: flex; align-items: center; gap: 8px; pointer-events: auto;">
            <div class="score-container" style="${this.engine.gameMode === 'level' ? 'display: none;' : ''}">
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.2;">
                <span class="hud-label">SCORE</span>
                <span class="hud-val pop-scale" id="hud-score">${this.engine.score}</span>
                <span id="hud-best-score" style="font-size: 10px; color: #ffd700; font-weight: 800; margin-top: 2px; letter-spacing: 0.5px; opacity: 0.85;">BEST: ${Math.max(highscore, this.engine.score)}</span>
              </div>
            </div>
            <button class="hud-circle-btn" id="btn-hud-pause">⏸️</button>
          </div>
        </div>

        ${bossHealthBarHTML}

        <div class="hud-middle" id="hud-alert-container"></div>

        <div class="hud-bottom">
          <div style="display: flex; flex-direction: row; align-items: center; gap: 12px; pointer-events: auto;">
            ${boosterBtnHTML}
            ${formationBtnHTML}
            ${evolveBtnHTML}
            ${activeSkillBtnHTML}
            ${flockMergeBtnHTML}

            <!-- Ultimate Special Ability Transparent Circular Button (Shifted from Double-Tap) -->
            <div class="hud-ult-circle-btn glass-card ${ultReady ? 'ult-ready-pulse' : ''} ${ultActive ? 'ult-active-glow' : ''}" 
                 style="pointer-events: auto; cursor: pointer; display: ${this.engine.gameMode === 'level' ? 'none' : 'flex'}; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.06); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.2); position: relative; margin-bottom: 6px; -webkit-tap-highlight-color: transparent;" 
                 id="btn-hud-ultimate" 
                 title="Tap to Activate Ultimate Special Ability!">
              <div class="ult-inner-glow" style="position: absolute; inset: 2px; border-radius: 50%; background: ${ultActive ? 'rgba(255, 0, 127, 0.25)' : ultReady ? 'rgba(255, 215, 0, 0.18)' : 'transparent'}; pointer-events: none;"></div>
              <svg class="ult-ring" width="58" height="58" viewBox="0 0 58 58" style="position: absolute; transform: rotate(-90deg); pointer-events: none;">
                <circle cx="29" cy="29" r="25" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"></circle>
                <circle cx="29" cy="29" r="25" fill="none" stroke="${ultBarBg}" stroke-width="4.5" 
                        stroke-dasharray="157" stroke-dashoffset="${157 - (157 * ultPercent) / 100}" 
                        stroke-linecap="round" class="ult-progress-fill" style="transition: stroke-dashoffset 0.15s ease-out; stroke: ${ultBarBg};"></circle>
              </svg>
              <span class="ult-icon" style="font-size: 24px; z-index: 2; transition: transform 0.2s ease; margin: 0; line-height: 1;">${ultActive ? '⚡' : '✨'}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = hudHTML;

    // Cache DOM references for zero-thrashing fast active gameplay updates
    this.scoreEl = document.getElementById('hud-score');
    this.bestScoreEl = document.getElementById('hud-best-score');
    this.btnUltimate = document.getElementById('btn-hud-ultimate');
    if (this.btnUltimate) {
      this.ultIcon = this.btnUltimate.querySelector('.ult-icon');
      this.ultFill = this.btnUltimate.querySelector('.ult-progress-fill');
      this.ultText = this.btnUltimate.querySelector('.ult-text');
    } else {
      this.ultIcon = null;
      this.ultFill = null;
      this.ultText = null;
    }
    const runStats = this.container.querySelector('.run-stats');
    if (runStats) {
      const statsBadges = runStats.querySelectorAll('.stat-badge');
      if (statsBadges.length >= 2) {
        this.runStatsCoins = statsBadges[0] as HTMLElement;
        this.runStatsGems = statsBadges[1] as HTMLElement;
      } else {
        this.runStatsCoins = null;
        this.runStatsGems = null;
      }
    } else {
      this.runStatsCoins = null;
      this.runStatsGems = null;
    }
    this.powerupsHolder = this.container.querySelector('.powerup-timers-holder');
    this.bossContainer = this.container.querySelector('.boss-health-bar-container');
    if (this.bossContainer) {
      this.bossHealthVal = this.bossContainer.querySelector('.boss-health-val');
      this.bossHealthFill = this.bossContainer.querySelector('.boss-health-fill');
    } else {
      this.bossHealthVal = null;
      this.bossHealthFill = null;
    }
    this.flockIndicatorEl = this.container.querySelector('.flock-indicator') as HTMLElement;
    this.playerHPContainer = this.container.querySelector('.player-hud-hp-container') as HTMLElement;
    this.playerHPHearts = this.playerHPContainer ? this.playerHPContainer.querySelector('.player-hud-hp-hearts') as HTMLElement : null;
    this.ultDurationBarContainer = this.container.querySelector('.ultimate-duration-bar-container') as HTMLElement;
    this.ultDurationBarFill = this.ultDurationBarContainer ? this.ultDurationBarContainer.querySelector('.ultimate-duration-bar-fill') as HTMLElement : null;
    this.boosterOverlay = this.container.querySelector('.hud-booster-overlay') as HTMLElement;
    this.boosterOverlayTitle = this.boosterOverlay ? this.boosterOverlay.querySelector('.hud-booster-title') as HTMLElement : null;
    this.boosterOverlayFill = this.boosterOverlay ? this.boosterOverlay.querySelector('.hud-booster-fill') as HTMLElement : null;
    this.boosterBtn = document.getElementById('btn-hud-booster');
    this.boosterBtnIcon = this.boosterBtn ? this.boosterBtn.querySelector('span') : null;
    this.boosterBtnProgressFill = this.boosterBtn ? this.boosterBtn.querySelector('.booster-progress-fill') as HTMLElement : null;
    this.flockMergeBtn = document.getElementById('btn-hud-flock-merge');
    this.flockMergeBtnLabel = this.flockMergeBtn ? this.flockMergeBtn.querySelector('.flock-merge-label') as HTMLElement : null;



    // Bind triggers
    const ultBtn = document.getElementById('btn-hud-ultimate');
    if (ultBtn) {
      const triggerUltimateAbility = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        this.engine.triggerUltimate();
        if (this.engine.state === 'PLAYING' || this.engine.state === 'BOSS_FIGHT') {
          this.engine.jump();
        }
        this.render();
      };
      ultBtn.addEventListener('pointerdown', triggerUltimateAbility);
      ultBtn.addEventListener('touchstart', triggerUltimateAbility);
    }

    // Booster trigger binding removed

    // Formation and Cage Rescue merge buttons removed

    // Bind Merge button for Squad Survival mode
    const flockMergeBtn = document.getElementById('btn-hud-flock-merge');
    if (flockMergeBtn) {
      const triggerFlockMerge = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.engine.flock.length >= 2) {
          this.engine.triggerSurvivalMerge();
        }
        if (this.engine.state === 'PLAYING' || this.engine.state === 'BOSS_FIGHT') {
          this.engine.jump();
        }
        this.render();
      };
      flockMergeBtn.addEventListener('pointerdown', triggerFlockMerge);
      flockMergeBtn.addEventListener('touchstart', triggerFlockMerge);
    }

    // Active skill button removed

    const pBtn = document.getElementById('btn-hud-pause');
    if (pBtn) pBtn.addEventListener('click', () => {
      this.engine.togglePause();
      this.render();
    });
  }

  private renderPauseMenu() {
    const pauseHTML = `
      <div class="overlay-screen fade-in glass-modal">
        <div class="modal-card">
          <h2 class="modal-title">PAUSED</h2>
          
          <div class="vertical-actions">
            <button class="btn btn-primary" id="btn-resume">RESUME</button>
            <button class="btn btn-secondary" id="btn-restart-paused">RESTART</button>
            <button class="btn btn-secondary" id="btn-quit">EXIT TO MENU</button>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = pauseHTML;

    document.getElementById('btn-resume')?.addEventListener('click', () => {
      this.engine.soundManager.playUIClick();
      this.engine.togglePause();
      this.render();
    });

    document.getElementById('btn-restart-paused')?.addEventListener('click', () => {
      this.engine.soundManager.playUIClick();
      AdManager.onTransitionPoint();
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-quit')?.addEventListener('click', () => {
      this.engine.soundManager.playUIBack();
      AdManager.onTransitionPoint();
      this.engine.state = 'MENU';
      this.engine.soundManager.stopMusic();
      if (this.engine.gameMode === 'level') {
        this.activeTab = 'levels';
      }
      this.render();
    });
  }

  private renderGameOver() {
    const progress = this.engine.progressManager.getState();
    const currentHighScore = this.engine.gameMode === 'flock'
      ? (progress.highscoreSquad || 0)
      : (progress.highscoreClassic || progress.highscore || 0);
    const isNewHigh = this.engine.score >= currentHighScore;

    const goHTML = `
      <div class="overlay-screen fade-in glass-modal" style="display: flex; align-items: center; justify-content: center;">
        <div style="transform: scale(0.84) translateY(-20%); transform-origin: bottom center; width: 100%; display: flex; justify-content: center;">
          <div class="modal-card gameover-card animate-slide-up">
            <div class="skull-badge">💥</div>
            <h2 class="modal-title warning-text">CRASHED!</h2>
  
  
            <div class="final-score-box glass-card">
              <div class="score-label">${isNewHigh ? '🏆 NEW HIGH SCORE! 🏆' : 'FINAL SCORE'}</div>
              <div class="score-number pop-scale">${this.engine.score}</div>
              ${this.engine.gameMode !== 'level' ? `<div style="font-size: 14px; font-weight: 800; color: #ffd700; margin-top: 6px; letter-spacing: 1px;">BEST: ${Math.max(currentHighScore, this.engine.score)}</div>` : ''}
            </div>
  
            <div class="rewards-summary">
              <div class="reward-row">
                <span>Coins Collected</span>
                <strong>+${this.engine.coinsCollectedThisRun} 🟡</strong>
              </div>
              <div class="reward-row">
                <span>Gems Collected</span>
                <strong>+${this.engine.gemsCollectedThisRun} 💎</strong>
              </div>
            </div>
  
            <div class="vertical-actions">
              <button class="btn btn-primary btn-glow-orange" id="btn-retry">FLY AGAIN</button>
              <button class="btn btn-secondary" id="btn-hangar">RETURN HOME</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = goHTML;

    document.getElementById('btn-retry')?.addEventListener('click', () => {
      this.engine.soundManager.playUISelect();
      AdManager.onTransitionPoint();
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-hangar')?.addEventListener('click', () => {
      this.engine.soundManager.playUIBack();
      AdManager.onTransitionPoint();
      this.engine.state = 'MENU';
      if (this.engine.gameMode === 'level') {
        this.activeTab = 'levels';
      }
      this.render();
    });
  }

  private renderReviveScreen() {
    const progress = this.engine.progressManager.getState();
    const gems = progress.gems;
    const price = 5;
    const canAfford = gems >= price;

    const reviveHTML = `
      <div class="overlay-screen fade-in" style="background: rgba(0,0,0,0.4) !important; backdrop-filter: blur(5.6px) !important; -webkit-backdrop-filter: blur(5.6px) !important; display: flex; align-items: center; justify-content: center;">
        <div style="transform: scale(1.024, 0.84) translateY(-20%); transform-origin: bottom center; width: 100%; display: flex; justify-content: center;">
          <div style="background: rgba(20,20,30,0.28) !important; backdrop-filter: blur(11.2px) !important; -webkit-backdrop-filter: blur(11.2px) !important; border: 1px solid rgba(255,255,255,0.07) !important; border-radius: 24px; padding: 40px 32px; text-align: center; width: 95%; max-width: 911px; box-shadow: 0 20px 40px rgba(0,0,0,0.35) !important; animation: slideUp 0.3s ease-out; position: relative;">
            
            <button id="btn-home-revive" style="position: absolute; left: 20px; top: 20px; font-size: 33px; color: #fff; font-weight: 800; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; cursor: pointer; line-height: 1; display: flex; align-items: center; justify-content: center; width: 63px; height: 63px; transition: background 0.2s;" title="Return Home">↩</button>
            
            <div style="font-size: 32px; margin-bottom: 10px;">💥</div>
            <h2 style="font-size: 36px; font-weight: 900; color: #ff3c2e; letter-spacing: 2px; margin-bottom: 24px; text-shadow: 0 0 10px rgba(255,60,46,0.5);">CRASHED!</h2>
  
            ${this.engine.gameMode !== 'level' ? `
            <div style="background: rgba(0,0,0,0.3); border-radius: 16px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05);">
              <div style="font-size: 12px; font-weight: 800; color: #ffd700; letter-spacing: 1.5px; text-transform: uppercase;">SCORE</div>
              <div style="font-size: 48px; font-weight: 900; color: #fff; text-shadow: 0 4px 10px rgba(0,0,0,0.5);">${this.engine.score}</div>
              <div style="font-size: 14px; font-weight: 800; color: #ffd700; margin-top: 6px; letter-spacing: 1px;">BEST: ${Math.max(this.engine.gameMode === 'flock' ? (progress.highscoreSquad || 0) : (progress.highscoreClassic || progress.highscore || 0), this.engine.score)}</div>
            </div>
            ` : ''}
  
            <div style="display: flex; flex-direction: column; gap: 8px; text-align: left; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 16px; margin-bottom: 24px; font-size: 14px; font-weight: 600; color: #ddd;">
              <div style="display: flex; justify-content: space-between;">
                <span>Coins Collected</span>
                <strong style="color: #fff;">+${this.engine.coinsCollectedThisRun} 🟡</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>Gems Collected</span>
                <strong style="color: #fff;">+${this.engine.gemsCollectedThisRun} 💎</strong>
              </div>
            </div>
  
  
  
            <div class="revive-heartbeat-box">
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                <div style="font-size: 12px; font-weight: 800; color: #aaa; letter-spacing: 1px;">
                  REVIVE
                </div>
                <div style="font-size: 10px; font-weight: 800; color: #666;">
                  REVIVES USED: ${this.engine.revivesUsedThisRun}
                </div>
              </div>
              <div style="display: flex; gap: 10px; width: 100%; margin-top: 10px;">
                <button id="btn-confirm-revive" style="flex: 1; padding: 16px; border-radius: 50px; background: #2a2a35; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3); opacity: ${canAfford ? '1' : '0.5'};" ${canAfford ? '' : 'disabled'}>
                  <span style="font-size: 13px; font-weight: 800; color: #fff;">USE 5 💎</span>
                </button>
                <button id="btn-ad-revive" style="flex: 1; padding: 16px; border-radius: 50px; background: linear-gradient(135deg, #ff6b00, #ffaa00); border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 0 20px rgba(255, 107, 0, 0.4), 0 4px 10px rgba(0,0,0,0.3);">
                  <span style="font-size: 13px; font-weight: 800; color: #fff;">FREE (AD) 📺</span>
                </button>
              </div>
            </div>
            
            <div style="display: flex; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 16px; gap: 12px;">
              <button id="btn-skip-revive" style="flex: 1; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: #fff; font-size: 18px; font-weight: 700; cursor: pointer; padding: 16px; transition: background 0.2s;">TRY AGAIN</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = reviveHTML;

    document.getElementById('btn-confirm-revive')?.addEventListener('click', () => {
      if (canAfford) {
        this.engine.soundManager.playUIClick();
        this.engine.attemptRevive();
        this.render();
      }
    });

    document.getElementById('btn-ad-revive')?.addEventListener('click', () => {
      this.engine.soundManager.playUIClick();
      AdManager.showReviveInterstitial((success) => {
        if (success) {
          this.engine.attemptReviveFree();
          this.engine.progressManager.updateQuestProgress('watch_ads', 1);
          this.render();
        } else {
          alert("Ad failed to load or play. Please try again or use diamonds.");
        }
      });
    });

    document.getElementById('btn-skip-revive')?.addEventListener('click', () => {
      this.engine.soundManager.playUISelect();
      this.engine.confirmGameOver(); // Save progress
      AdManager.onTransitionPoint();
      this.engine.startGame(); // Immediate restart
      this.render();
    });

    document.getElementById('btn-home-revive')?.addEventListener('click', () => {
      this.engine.soundManager.playUIBack();
      this.engine.confirmGameOver(); // Save progress
      AdManager.onTransitionPoint();
      this.engine.state = 'MENU';
      if (this.engine.gameMode === 'level') {
        this.activeTab = 'levels';
      }
      this.render();
    });
  }

  private renderLevelComplete() {
    const levelNum = this.engine.currentLevelNum;

    const winHTML = `
      <div class="overlay-screen fade-in glass-modal" style="display: flex; align-items: center; justify-content: center;">
        <div style="transform: scale(0.8); width: 100%; display: flex; justify-content: center;">
          <div class="modal-card win-card animate-slide-up" style="background: transparent; backdrop-filter: none; border: 2px solid rgba(0, 255, 136, 0.25); box-shadow: 0 0 25px rgba(0, 255, 136, 0.15);">
            <div class="trophy-badge" style="font-size: 55px; filter: drop-shadow(0 0 10px rgba(255,215,0,0.5)); margin-bottom: 5px;">🎉</div>
          <h2 class="modal-title success-text" style="color: #00ff88; text-shadow: 0 0 10px rgba(0,255,136,0.4); font-size: 26px; font-weight: 800; text-transform: uppercase;">LEVEL COMPLETE!</h2>

          <div class="rewards-summary" style="margin-top: 15px; width: 100%; display: flex; flex-direction: column; gap: 8px;">
            <div class="reward-row" style="display: flex; justify-content: space-between; padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
              <span>Gold Collected</span>
              <strong>+${this.engine.coinsCollectedThisRun} 🟡</strong>
            </div>
            <div class="reward-row" style="display: flex; justify-content: space-between; padding: 6px 12px; background: rgba(255,255,255,0.03); border-radius: 8px;">
              <span>Gems Collected</span>
              <strong>+${this.engine.gemsCollectedThisRun} 💎</strong>
            </div>
          </div>

          <div class="vertical-actions" style="margin-top: 20px; display: flex; flex-direction: column; gap: 8px; width: 100%;">
            ${levelNum < 50 
              ? `<button class="btn btn-primary btn-glow-green" id="btn-next-level" style="background: linear-gradient(180deg, #00ff88 0%, #00c853 100%); box-shadow: 0 6px 0 #007e33, 0 8px 20px rgba(0,200,83,0.4); width: 100%; padding: 14px; border-radius: 12px; font-weight: 800; border: none; cursor: pointer; color: #04240e; font-size: 15px;">NEXT LEVEL ➡</button>`
              : `<button class="btn btn-primary" id="btn-quit-levels" style="background: linear-gradient(180deg, #ffd700 0%, #ffaa00 100%); width: 100%; padding: 14px; border-radius: 12px; font-weight: 800; border: none; cursor: pointer; color: #3d2c00; font-size: 15px;">ALL LEVELS BEATEN! 🎉</button>`
            }
            <button class="btn btn-secondary" id="btn-retry-level" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #fff; cursor: pointer; font-weight: 800; font-size: 13px;">REPLAY LEVEL</button>
            <button class="btn btn-secondary" id="btn-quit-levels-back" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #fff; cursor: pointer; font-weight: 800; font-size: 13px;">RETURN TO LEVELS</button>
          </div>
        </div>
        </div>
      </div>
    `;

    this.container.innerHTML = winHTML;

    document.getElementById('btn-next-level')?.addEventListener('click', () => {
      this.engine.soundManager.playUISelect();
      this.engine.currentLevelNum++;
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-retry-level')?.addEventListener('click', () => {
      this.engine.soundManager.playUIClick();
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-quit-levels')?.addEventListener('click', () => {
      this.engine.soundManager.playUIBack();
      this.engine.state = 'MENU';
      this.activeTab = 'levels';
      this.render();
    });

    document.getElementById('btn-quit-levels-back')?.addEventListener('click', () => {
      this.engine.state = 'MENU';
      this.activeTab = 'levels';
      this.render();
    });
  }

  private renderPhotoModePanel() {
    const photoHTML = `
      <div class="photo-overlay fade-in">
        <div class="photo-controls glass-card animate-slide-up">
          <div class="photo-header">
            <h3>📷 PHOTO STUDIO</h3>
            <button class="circle-close-btn" id="btn-close-photo">×</button>
          </div>

          <div class="photo-slider-group">
            <label>Brightness</label>
            <input type="range" class="photo-slider" id="slide-bright" min="50" max="180" value="${this.engine.photoFilters.brightness}">
          </div>

          <div class="photo-slider-group">
            <label>Contrast</label>
            <input type="range" class="photo-slider" id="slide-contrast" min="50" max="180" value="${this.engine.photoFilters.contrast}">
          </div>

          <div class="photo-slider-group">
            <label>Saturate</label>
            <input type="range" class="photo-slider" id="slide-saturate" min="0" max="200" value="${this.engine.photoFilters.saturate}">
          </div>

          <div class="photo-slider-group">
            <label>Sepia Filtermode</label>
            <input type="range" class="photo-slider" id="slide-sepia" min="0" max="100" value="${this.engine.photoFilters.sepia}">
          </div>

          <div class="photo-slider-group">
            <label>Depth of Field (Blur)</label>
            <input type="range" class="photo-slider" id="slide-blur" min="0" max="8" value="${this.engine.photoFilters.blur}">
          </div>

          <button class="btn btn-primary" id="btn-snapshot">SNAP SCREENSHOT</button>
        </div>
      </div>
    `;

    this.container.innerHTML = photoHTML;

    // Bind sliders
    const bindSlider = (id: string, prop: keyof typeof this.engine.photoFilters) => {
      const slider = document.getElementById(id) as HTMLInputElement;
      if (slider) {
        slider.addEventListener('input', (e) => {
          const val = parseInt((e.target as HTMLInputElement).value);
          this.engine.photoFilters[prop] = val;
          // Dynamically apply visual filter effects to the rendering canvas style
          this.applyCanvasFilters();
        });
      }
    };

    bindSlider('slide-bright', 'brightness');
    bindSlider('slide-contrast', 'contrast');
    bindSlider('slide-saturate', 'saturate');
    bindSlider('slide-sepia', 'sepia');
    bindSlider('slide-blur', 'blur');

    document.getElementById('btn-close-photo')?.addEventListener('click', () => {
      this.engine.state = this.lastEngineState;
      // Reset canvas filters style
      const canvas = this.engine.renderer.canvas;
      canvas.style.filter = 'none';
      
      if (this.engine.state === 'PLAYING') {
        this.engine.soundManager.startMusic(this.engine.progressManager.getState().activeWorld);
      }
      this.render();
    });

    document.getElementById('btn-snapshot')?.addEventListener('click', () => {
      this.takeSnapshot();
    });
  }

  private applyCanvasFilters() {
    const f = this.engine.photoFilters;
    const canvas = this.engine.renderer.canvas;
    canvas.style.filter = `
      brightness(${f.brightness}%)
      contrast(${f.contrast}%)
      saturate(${f.saturate}%)
      sepia(${f.sepia}%)
      blur(${f.blur}px)
    `;
  }

  private takeSnapshot() {
    const canvas = this.engine.renderer.canvas;
    const dataUrl = canvas.toDataURL('image/png');
    
    // Download snapshot
    const link = document.createElement('a');
    link.download = 'FlightOfLegends_Snapshot.png';
    link.href = dataUrl;
    link.click();
    
    this.showToastNotification('SNAPSHOT CAPTURED', 'Cinematic photo saved to your downloads folder.');
  }

  // Visual Hud Warning Panel overlays
  private showHudAlert(text: string, sub: string) {
    const container = document.getElementById('hud-alert-container');
    if (!container) return;

    container.innerHTML = `
      <div class="hud-alert-card glass-card flash-red-border animate-pulse">
        <div class="alert-title font-glow-red">${text}</div>
        <div class="alert-subtitle">${sub}</div>
      </div>
    `;

    // Fade out after 2.2 seconds
    setTimeout(() => {
      container.innerHTML = '';
    }, 2200);
  }

  // Toast dynamic notification overlays
  public showToastNotification(title: string, msg: string) {
    const toast = document.createElement('div');
    toast.className = 'toast-alert glass-card fade-in';
    toast.innerHTML = `
      <div style="text-align: center; width: 100%;">
        <div class="toast-title">${title}</div>
        <div class="toast-desc">${msg}</div>
      </div>
    `;

    document.body.appendChild(toast);

    // Slide away
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 400);
    }, 3200);
  }

  private renderDemoComplete() {
    this.container.innerHTML = `
      <div class="overlay-screen fade-in glass-modal" style="background: rgba(10, 5, 20, 0.88);">
        <div class="modal-card" style="border: 2px solid #ffd700; box-shadow: 0 0 25px rgba(255, 215, 0, 0.45); animation: floatBird 4s ease-in-out infinite;">
          <div style="font-size: 55px; margin-bottom: 12px; filter: drop-shadow(0 0 10px #ffd700);">🏆</div>
          <h2 class="modal-title" style="color: #ffd700; text-shadow: 0 0 8px rgba(255, 215, 0, 0.6); font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 900;">DEMO COMPLETED!</h2>
          <p class="modal-subtitle" style="color: #ffffff; font-size: 14px; margin-bottom: 20px;">Congratulations! You successfully reached score <b>500</b> in Endless Flock Mode!</p>
          
          <div class="glass-card" style="padding: 12px; margin-bottom: 20px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="font-size: 12px; color: #00f3ff; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.5px;">DEMO CONCEPT PREVIEW SUMMARY</div>
            <div style="font-size: 11px; color: #e2e8f0; text-align: left; line-height: 1.5; display: flex; flex-direction: column; gap: 4px;">
              <span>🔹 <b>Flock Survival:</b> Fly with multiple birds. Hitting pipes only kills individual birds.</span>
              <span>🔹 <b>Rescue Cages:</b> Rescuing cages adds wild birds to your flock.</span>
              <span>🔹 <b>Flock Formation:</b> Follower birds fly in V-shape and trailing line.</span>
              <span>🔹 <b>Flock Merge:</b> Evolve your squad to trigger Hyper Boost!</span>
            </div>
          </div>
          
          <div class="vertical-actions">
            <button class="btn btn-primary" id="btn-continue-demo" style="background: linear-gradient(180deg, #ffd700, #ff8800); text-shadow: 0 1px 2px rgba(0,0,0,0.4); font-weight: 900;">CONTINUE FLYING</button>
            <button class="btn btn-secondary" id="btn-quit-demo">EXIT TO MENU</button>
          </div>
        </div>
      </div>
    `;

    const btnContinue = document.getElementById('btn-continue-demo');
    if (btnContinue) {
      btnContinue.addEventListener('click', () => {
        this.engine.state = 'PLAYING';
        for (const b of this.engine.flock) {
          b.isInvincible = true;
        }
        setTimeout(() => {
          for (const b of this.engine.flock) {
            b.isInvincible = false;
          }
        }, 2000);
        
        this.engine.soundManager.startMusic(this.engine.progressManager.getState().activeWorld);
        this.render();
      });
    }

    const btnQuit = document.getElementById('btn-quit-demo');
    if (btnQuit) {
      btnQuit.addEventListener('click', () => {
        this.engine.confirmGameOver();
        this.activeTab = 'main';
        this.render();
      });
    }
  }

  private showEndlessModeSelection() {
    this.container.innerHTML = `
      <style>
        .mode-3d-overlay {
          background: rgba(6, 4, 14, 0.88);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 9999;
          font-family: 'Outfit', sans-serif;
        }
        .mode-3d-card-wrapper {
          background: rgba(18, 12, 30, 0.35);
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 24px 20px;
          max-width: 460px;
          width: 90%;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          position: relative;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          box-sizing: border-box;
        }
        .mode-3d-container {
          display: flex;
          gap: 16px;
          width: 100%;
          justify-content: center;
          perspective: 1000px;
          padding: 10px 2px;
          margin-top: 12px;
          box-sizing: border-box;
        }
        .mode-3d-card {
          flex: 1;
          background: linear-gradient(135deg, rgba(32, 24, 48, 0.4) 0%, rgba(16, 12, 28, 0.55) 100%);
          border-radius: 18px;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          padding: 20px 14px;
          transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, border-color 0.15s ease-out;
          transform-style: preserve-3d;
          cursor: pointer;
          box-sizing: border-box;
        }
        
        /* Classic 3D Theme */
        .mode-3d-card.classic-3d {
          border: 1.5px solid rgba(255, 215, 0, 0.25);
          box-shadow: 0 10px 25px rgba(255, 215, 0, 0.08), 0 15px 30px rgba(0, 0, 0, 0.5);
        }
        .mode-3d-card.classic-3d:hover {
          border-color: rgba(255, 215, 0, 0.8);
        }

        /* Squad 3D Theme */
        .mode-3d-card.squad-3d {
          border: 1.5px solid rgba(0, 243, 255, 0.25);
          box-shadow: 0 10px 25px rgba(0, 243, 255, 0.08), 0 15px 30px rgba(0, 0, 0, 0.5);
        }
        .mode-3d-card.squad-3d:hover {
          border-color: rgba(0, 243, 255, 0.8);
        }

        /* Inner elements 3D pop-out */
        .mode-3d-icon {
          transform: translateZ(0px);
          transition: transform 0.15s ease-out;
          margin-bottom: 8px;
          width: 58px;
          height: 58px;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        .mode-3d-label {
          font-family: 'Outfit', sans-serif;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 1.2px;
          margin-bottom: 12px;
          text-transform: uppercase;
          transition: transform 0.15s ease-out;
          pointer-events: none;
        }
        .mode-3d-card.classic-3d .mode-3d-label {
          color: #ffd700;
          text-shadow: 0 0 8px rgba(255, 215, 0, 0.35);
        }
        .mode-3d-card.squad-3d .mode-3d-label {
          color: #00f3ff;
          text-shadow: 0 0 8px rgba(0, 243, 255, 0.35);
        }

        /* 3D arcade buttons */
        .mode-3d-btn {
          width: 100%;
          padding: 12px 10px;
          font-size: 14px;
          font-weight: 900;
          text-transform: uppercase;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease-out;
        }
        .classic-3d-btn {
          background: linear-gradient(180deg, #ffd700 0%, #ff9900 100%);
          color: #2b1c00;
          box-shadow: 0 5px 0 #9c6300, 0 5px 12px rgba(255, 170, 0, 0.25);
        }
        .classic-3d-btn:hover {
          background: linear-gradient(180deg, #ffe54d 0%, #ffa200 100%);
          box-shadow: 0 5px 0 #9c6300, 0 7px 16px rgba(255, 170, 0, 0.35);
        }
        .squad-3d-btn {
          background: linear-gradient(180deg, #00f3ff 0%, #0066ff 100%);
          color: #001a33;
          box-shadow: 0 5px 0 #004da8, 0 5px 12px rgba(0, 136, 255, 0.25);
        }
        .squad-3d-btn:hover {
          background: linear-gradient(180deg, #4df7ff 0%, #1a80ff 100%);
          box-shadow: 0 5px 0 #004da8, 0 7px 16px rgba(0, 136, 255, 0.35);
        }

        /* Mobile Responsive 3D Styling (Lightweight & Smooth) */
        @media (max-width: 480px) {
          .mode-3d-card-wrapper {
            padding: 20px 16px;
            max-width: 320px;
          }
          .mode-3d-container {
            flex-direction: column;
            gap: 12px;
            padding: 0;
            margin-top: 10px;
          }
          .mode-3d-card {
            padding: 12px 14px;
            flex-direction: row !important;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            height: 70px;
            border-radius: 14px;
          }
          .mode-3d-icon {
            margin-bottom: 0 !important;
            width: 44px;
            height: 44px;
          }
          .mode-3d-label {
            margin-bottom: 0 !important;
            font-size: 14px;
            flex: 1;
            text-align: left;
            padding-left: 12px;
          }
          .mode-3d-btn {
            width: auto !important;
            padding: 10px 22px !important;
            font-size: 13px !important;
          }
        }
      </style>

      <div class="mode-3d-overlay fade-in">
        <div class="mode-3d-card-wrapper animate-slide-up">
          <!-- Close button in corner -->
          <button id="btn-close-mode-selector" style="position: absolute; right: 15px; top: 15px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; color: white; width: 32px; height: 32px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">×</button>
          
          <h2 style="color: #ffd700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); font-size: 18px; font-weight: 900; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">SELECT GAME MODE</h2>
          <p style="color: rgba(255, 255, 255, 0.5); font-size: 11px; margin-bottom: 6px; letter-spacing: 0.2px;">Choose your endless adventure</p>
          
          <div class="mode-3d-container">
            <!-- Option 1: Classic Card -->
            <div class="mode-3d-card classic-3d" id="card-select-classic">
              <div class="mode-3d-icon">
                <svg width="50" height="50" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="42" fill="rgba(255, 215, 0, 0.05)" stroke="rgba(255, 215, 0, 0.15)" stroke-width="1.5" stroke-dasharray="4 4" />
                  <g transform="translate(10, 15)">
                    <path d="M12,40 C5,38 2,42 0,47 C3,52 8,50 15,46 Z" fill="#ff8800" />
                    <path d="M15,44 C10,40 6,43 5,48 C8,52 12,50 17,46 Z" fill="#ffaa00" />
                    <circle cx="40" cy="38" r="24" fill="url(#gold-body-grad-classic-selection)" stroke="#9c6300" stroke-width="2" />
                    <ellipse cx="50" cy="28" rx="8" ry="11" fill="#ffffff" stroke="#111" stroke-width="2" />
                    <ellipse cx="51" cy="28" rx="4" ry="6" fill="#000000" />
                    <circle cx="49" cy="25" r="2.2" fill="#ffffff" />
                    <circle cx="53" cy="31" r="1" fill="#ffffff" />
                    <path d="M60,34 C72,34 78,38 72,44 C66,48 60,42 60,34 Z" fill="url(#beak-grad-classic-selection)" stroke="#b34000" stroke-width="1.5" />
                    <path d="M58,40 C68,42 70,46 64,48 C58,50 56,43 58,40 Z" fill="url(#beak-grad-classic-selection)" stroke="#b34000" stroke-width="1.5" />
                    <path d="M22,46 C28,58 52,58 58,46 C48,50 32,50 22,46 Z" fill="#fff9d4" opacity="0.8" />
                    <path d="M26,38 C20,24 38,10 44,22 C48,32 38,44 26,38 Z" fill="url(#gold-wing-grad-classic-selection)" stroke="#9c6300" stroke-width="1.8" />
                    <path d="M28,36 C24,27 36,18 40,26 C43,33 36,41 28,36 Z" fill="#ffe066" opacity="0.9" />
                  </g>
                  <defs>
                    <linearGradient id="gold-body-grad-classic-selection" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#fff099" />
                      <stop offset="40%" stop-color="#ffd700" />
                      <stop offset="100%" stop-color="#e69d00" />
                    </linearGradient>
                    <linearGradient id="gold-wing-grad-classic-selection" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#fff5cc" />
                      <stop offset="100%" stop-color="#ffa600" />
                    </linearGradient>
                    <linearGradient id="beak-grad-classic-selection" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#ff9900" />
                      <stop offset="100%" stop-color="#ff3300" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div class="mode-3d-label">Classic</div>
              <button id="btn-select-classic" class="mode-3d-btn classic-3d-btn">Fly</button>
            </div>

            <!-- Option 2: Squad Card -->
            <div class="mode-3d-card squad-3d" id="card-select-flock">
              <div class="mode-3d-icon">
                <svg width="50" height="50" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="50" cy="50" r="42" fill="rgba(0, 243, 255, 0.04)" stroke="rgba(0, 243, 255, 0.15)" stroke-width="1.5" stroke-dasharray="4 4" />
                  <g transform="translate(10, 52) scale(0.42)">
                    <path d="M12,40 C5,38 2,42 0,47 C3,52 8,50 15,46 Z" fill="#005588" />
                    <circle cx="40" cy="38" r="24" fill="url(#squad-blue-grad-squad-selection)" stroke="#003366" stroke-width="2" />
                    <ellipse cx="50" cy="28" rx="8" ry="11" fill="#ffffff" stroke="#111" stroke-width="2" />
                    <ellipse cx="51" cy="28" rx="4" ry="6" fill="#000000" />
                    <path d="M60,34 C72,34 78,38 72,44 C66,48 60,42 60,34 Z" fill="#ff7700" />
                    <path d="M26,38 C20,24 38,10 44,22 C48,32 38,44 26,38 Z" fill="url(#squad-cyan-grad-squad-selection)" stroke="#005588" stroke-width="1.8" />
                  </g>
                  <g transform="translate(15, 12) scale(0.5)">
                    <path d="M12,40 C5,38 2,42 0,47 C3,52 8,50 15,46 Z" fill="#005588" />
                    <circle cx="40" cy="38" r="24" fill="url(#squad-blue-grad-squad-selection)" stroke="#003366" stroke-width="2" />
                    <ellipse cx="50" cy="28" rx="8" ry="11" fill="#ffffff" stroke="#111" stroke-width="2" />
                    <ellipse cx="51" cy="28" rx="4" ry="6" fill="#000000" />
                    <path d="M60,34 C72,34 78,38 72,44 C66,48 60,42 60,34 Z" fill="#ff7700" />
                    <path d="M26,38 C20,24 38,10 44,22 C48,32 38,44 26,38 Z" fill="url(#squad-cyan-grad-squad-selection)" stroke="#005588" stroke-width="1.8" />
                  </g>
                  <g transform="translate(42, 26) scale(0.65)">
                    <path d="M12,40 C5,38 2,42 0,47 C3,52 8,50 15,46 Z" fill="#005588" />
                    <circle cx="40" cy="38" r="24" fill="url(#squad-cyan-grad-squad-selection)" stroke="#005588" stroke-width="2" />
                    <ellipse cx="50" cy="28" rx="8" ry="11" fill="#ffffff" stroke="#111" stroke-width="2" />
                    <ellipse cx="51" cy="28" rx="4" ry="6" fill="#000000" />
                    <circle cx="49" cy="25" r="2.2" fill="#ffffff" />
                    <path d="M60,34 C72,34 78,38 72,44 C66,48 60,42 60,34 Z" fill="#ff7700" stroke="#b34000" stroke-width="1" />
                    <path d="M58,40 C68,42 70,46 64,48 C58,50 56,43 58,40 Z" fill="#ff5500" stroke="#b34000" stroke-width="1" />
                    <path d="M26,38 C20,24 38,10 44,22 C48,32 38,44 26,38 Z" fill="url(#squad-blue-grad-squad-selection)" stroke="#003366" stroke-width="1.8" />
                    <path d="M28,36 C24,27 36,18 40,26 C43,33 36,41 28,36 Z" fill="#a3f5ff" opacity="0.9" />
                  </g>
                  <defs>
                    <linearGradient id="squad-cyan-grad-squad-selection" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#b3f5ff" />
                      <stop offset="50%" stop-color="#00f3ff" />
                      <stop offset="100%" stop-color="#00aaff" />
                    </linearGradient>
                    <linearGradient id="squad-blue-grad-squad-selection" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#80d5ff" />
                      <stop offset="100%" stop-color="#0055ff" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div class="mode-3d-label">Squad</div>
              <button id="btn-select-flock" class="mode-3d-btn squad-3d-btn">Fly</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Dynamic 3D interactive tilt math for desktop and mobile
    const setup3DTilt = (cardId: string) => {
      const card = document.getElementById(cardId);
      if (!card) return;

      const handleMove = (e: MouseEvent | TouchEvent) => {
        const rect = card.getBoundingClientRect();
        
        let clientX = 0;
        let clientY = 0;
        if ('touches' in e) {
          if (e.touches.length === 0) return;
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }

        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Calculate offset from center (from -0.5 to 0.5)
        const px = (x / rect.width) - 0.5;
        const py = (y / rect.height) - 0.5;

        // Dynamic 3D rotation angles
        const rx = -py * 16; 
        const ry = px * 16;  

        // Apply interactive 3D rotation and scale
        card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.03, 1.03, 1.03)`;
        
        // Subtle offset shadow based on cursor position
        const shadowX = -px * 12;
        const shadowY = -py * 12;
        const glowColor = cardId.includes('classic') ? '255, 215, 0' : '0, 243, 255';
        card.style.boxShadow = `${shadowX}px ${shadowY}px 20px rgba(${glowColor}, 0.2), 0 12px 25px rgba(0,0,0,0.45)`;

        // Parallax offset for inner elements
        const icon = card.querySelector('.mode-3d-icon') as HTMLElement;
        const label = card.querySelector('.mode-3d-label') as HTMLElement;
        const btn = card.querySelector('.mode-3d-btn') as HTMLElement;
        if (icon) icon.style.transform = `translateZ(40px) scale(1.1) rotateX(${-rx * 0.15}deg) rotateY(${-ry * 0.15}deg)`;
        if (label) label.style.transform = `translateZ(20px)`;
        if (btn) btn.style.transform = `translateZ(25px)`;
      };

      const handleReset = () => {
        card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        
        const glowColor = cardId.includes('classic') ? '255, 215, 0' : '0, 243, 255';
        card.style.boxShadow = `0 10px 25px rgba(${glowColor}, 0.08), 0 15px 30px rgba(0, 0, 0, 0.5)`;

        const icon = card.querySelector('.mode-3d-icon') as HTMLElement;
        const label = card.querySelector('.mode-3d-label') as HTMLElement;
        const btn = card.querySelector('.mode-3d-btn') as HTMLElement;
        if (icon) icon.style.transform = `translateZ(0px) scale(1)`;
        if (label) label.style.transform = `translateZ(0px)`;
        if (btn) btn.style.transform = `translateZ(0px)`;
      };

      card.addEventListener('mousemove', handleMove);
      card.addEventListener('mouseleave', handleReset);
      
      // Touch support for mobile 3D interactivity
      card.addEventListener('touchstart', (e) => {
        handleMove(e);
      }, { passive: true });
      card.addEventListener('touchmove', (e) => {
        handleMove(e);
      }, { passive: true });
      card.addEventListener('touchend', handleReset);
      card.addEventListener('touchcancel', handleReset);
    };

    // Initialize 3D dynamic tilt for both modes
    setup3DTilt('card-select-classic');
    setup3DTilt('card-select-flock');

    document.getElementById('btn-close-mode-selector')?.addEventListener('click', () => {
      this.renderMenu();
    });

    document.getElementById('btn-select-classic')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.gameMode = 'endless';
      this.engine.isSpectatorMode = false;
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-select-flock')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.gameMode = 'flock';
      this.engine.isSpectatorMode = false;
      this.engine.startGame();
      this.render();
    });

  }

  private getPowerupColor(type: string): string {
    switch (type) {
      case 'shield': return '#00bfff';
      case 'slowmo': return '#da70d6';
      case 'magnet': return '#ff003c';
      case 'double': return '#ffd700';
      case 'turbo': return '#ff4500';
      case 'ghost': return '#9400d3';
      case 'mini': return '#00ff7f';
      default: return '#ffffff';
    }
  }

  private getRewardBoxSvg(width: string, height: string, extraStyle: string = '', idSuffix: string = 'main'): string {
    return `
<svg viewBox="0 0 512 512" style="width: ${width}; height: ${height}; ${extraStyle}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Wood Gradients -->
    <linearGradient id="wood-left-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E2B770" />
      <stop offset="100%" stop-color="#A57038" />
    </linearGradient>
    <linearGradient id="wood-right-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B28247" />
      <stop offset="100%" stop-color="#72451C" />
    </linearGradient>
    <linearGradient id="wood-lid-top-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F3D19E" />
      <stop offset="100%" stop-color="#D29A4E" />
    </linearGradient>
    <linearGradient id="wood-recessed-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#8E5623" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#2A1608" stop-opacity="0.6" />
    </linearGradient>

    <!-- Ribbon Gradients -->
    <linearGradient id="ribbon-left-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF5555" />
      <stop offset="30%" stop-color="#D61A1A" />
      <stop offset="100%" stop-color="#800000" />
    </linearGradient>
    <linearGradient id="ribbon-right-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#D61A1A" />
      <stop offset="70%" stop-color="#9E0C0C" />
      <stop offset="100%" stop-color="#5E0000" />
    </linearGradient>
    <linearGradient id="ribbon-top-left-${idSuffix}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF5555" />
      <stop offset="100%" stop-color="#9E0C0C" />
    </linearGradient>

    <!-- Metal Gold Gradients -->
    <linearGradient id="gold-grad-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FCE69B" />
      <stop offset="50%" stop-color="#D4A034" />
      <stop offset="100%" stop-color="#7B4B17" />
    </linearGradient>
    <linearGradient id="gold-highlight-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#FFE580" stop-opacity="0.1" />
    </linearGradient>
  </defs>

  <!-- Drop Shadow -->
  <ellipse cx="256" cy="425" rx="160" ry="40" fill="rgba(0, 0, 0, 0.3)" filter="blur(8px)" />

  <g stroke="#2A1608" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- Left Wall Base -->
    <polygon points="120,180 256,260 256,420 120,340" fill="url(#wood-left-${idSuffix})" />
    <!-- Recessed Left Panel -->
    <polygon points="135,200 241,262 241,400 135,338" fill="url(#wood-left-${idSuffix})" />
    <polygon points="135,200 241,262 241,400 135,338" fill="url(#wood-recessed-${idSuffix})" />

    <!-- Right Wall Base -->
    <polygon points="256,260 392,180 392,340 256,420" fill="url(#wood-right-${idSuffix})" />
    <!-- Recessed Right Panel -->
    <polygon points="271,262 377,200 377,338 271,400" fill="url(#wood-right-${idSuffix})" />
    <polygon points="271,262 377,200 377,338 271,400" fill="url(#wood-recessed-${idSuffix})" />

    <!-- Lid Overhang Rim -->
    <!-- Left Lid Rim -->
    <polygon points="110,135 256,225 256,265 110,175" fill="url(#wood-left-${idSuffix})" />
    <!-- Right Lid Rim -->
    <polygon points="256,225 402,135 402,175 256,265" fill="url(#wood-right-${idSuffix})" />
    
    <!-- Top Lid Face -->
    <polygon points="110,135 256,45 402,135 256,225" fill="url(#wood-lid-top-${idSuffix})" />
    <!-- Top Lid Recessed Panel -->
    <polygon points="125,135 256,58 387,135 256,212" fill="url(#wood-lid-top-${idSuffix})" />
    <polygon points="125,135 256,58 387,135 256,212" fill="url(#wood-recessed-${idSuffix})" />
  </g>

  <!-- Ribbons -->
  <g stroke="#2A1608" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- Top Face Ribbons -->
    <polygon points="163,168 256,113 296,137 203,192" fill="url(#ribbon-top-left-${idSuffix})" />
    <polygon points="309,192 216,137 256,113 349,168" fill="url(#ribbon-top-left-${idSuffix})" />

    <!-- Left Wall Ribbon -->
    <polygon points="168,208 208,232 208,392 168,368" fill="url(#ribbon-left-${idSuffix})" />
    <!-- Left Lid Overhang Ribbon -->
    <polygon points="163,168 203,192 203,232 163,208" fill="url(#ribbon-left-${idSuffix})" />

    <!-- Right Wall Ribbon -->
    <polygon points="304,232 344,208 344,368 304,392" fill="url(#ribbon-right-${idSuffix})" />
    <!-- Right Lid Overhang Ribbon -->
    <polygon points="309,192 349,168 349,208 309,232" fill="url(#ribbon-right-${idSuffix})" />
  </g>

  <!-- Metal Corners -->
  <g fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round">
    <!-- Bottom Left -->
    <path d="M 120,315 C 120,325 125,335 135,340 C 145,335 150,325 150,315 L 120,315 Z" transform="rotate(-15, 135, 327)" />
    <circle cx="120" cy="340" r="10" />

    <!-- Bottom Middle -->
    <path d="M 256,395 C 270,395 281,405 281,410 C 270,418 242,418 231,410 C 231,405 242,395 256,395 Z" />
    <circle cx="256" cy="420" r="12" />

    <!-- Bottom Right -->
    <path d="M 392,315 C 392,325 387,335 377,340 C 367,335 362,325 362,315 L 392,315 Z" transform="rotate(15, 377, 327)" />
    <circle cx="392" cy="340" r="10" />

    <!-- Lid corners (Top-Left, Top-Middle, Top-Right) -->
    <circle cx="110" cy="135" r="12" />
    <circle cx="256" cy="225" r="14" />
    <circle cx="402" cy="135" r="12" />
    <circle cx="256" cy="45" r="10" />
  </g>

  <!-- Lock Plate (Right Wall, on Ribbon) -->
  <g stroke="#2A1608" stroke-width="5" stroke-linejoin="round">
    <!-- Golden Escutcheon Badge -->
    <path d="M 324,225 C 342,225 352,238 349,252 C 345,268 324,285 324,285 C 324,285 303,268 299,252 C 296,238 306,225 324,225 Z" fill="url(#gold-grad-${idSuffix})" />
    
    <!-- Red Center Shield -->
    <path d="M 324,233 C 334,233 340,240 338,250 C 335,260 324,272 324,272 C 324,272 313,260 310,250 C 308,240 314,233 324,233 Z" fill="#D61A1A" />
    
    <!-- Keyhole -->
    <circle cx="324" cy="248" r="5" fill="#2A1608" />
    <polygon points="321,250 327,250 329,263 319,263" fill="#2A1608" />
  </g>

  <!-- Bow (Top Center of Lid) -->
  <g stroke="#2A1608" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- Ribbon Tails -->
    <path d="M 245,130 C 225,160 190,195 200,210 C 210,210 235,180 249,145 Z" fill="url(#ribbon-left-${idSuffix})" />
    <path d="M 267,130 C 287,160 322,195 312,210 C 302,210 277,180 263,145 Z" fill="url(#ribbon-right-${idSuffix})" />

    <!-- Left Loop -->
    <path d="M 246,128 C 210,85 140,95 165,140 C 185,165 230,145 246,128 Z" fill="url(#ribbon-left-${idSuffix})" />
    <!-- Left Loop Inner Shadow -->
    <path d="M 230,135 C 205,145 185,148 178,137 C 168,122 210,105 238,126 Z" fill="#5E0000" opacity="0.4" stroke="none" />

    <!-- Right Loop -->
    <path d="M 266,128 C 302,85 372,95 347,140 C 327,165 282,145 266,128 Z" fill="url(#ribbon-right-${idSuffix})" />
    <!-- Right Loop Inner Shadow -->
    <path d="M 282,135 C 307,145 327,148 334,137 C 344,122 302,105 274,126 Z" fill="#5E0000" opacity="0.4" stroke="none" />

    <!-- Center Knot -->
    <rect x="242" y="116" width="28" height="24" rx="8" ry="8" fill="url(#ribbon-left-${idSuffix})" />
  </g>
</svg>
    `;
  }

  private getChestStatus(chestId: number) {
    const daily = this.engine.progressManager.getState().dailyQuests || [];
    const claimedMissions = daily.filter(q => q.claimed).length;
    const claims = parseInt(localStorage.getItem(`flight_of_legends_chest_${chestId}_claims`) || '0');
    
    let maxClaims = 0;
    let requiredMissions = 0;
    
    if (chestId === 1) {
      maxClaims = 3;
      requiredMissions = (claims + 1) * 3;
    } else if (chestId === 2) {
      maxClaims = 2;
      requiredMissions = (claims + 1) * 9;
    } else if (chestId === 3) {
      maxClaims = 1;
      requiredMissions = 27;
    }
    
    const isCompleted = claims >= maxClaims;
    const isReady = !isCompleted && (claimedMissions >= requiredMissions);
    
    return {
      claims,
      maxClaims,
      requiredMissions,
      claimedMissions,
      isCompleted,
      isReady
    };
  }

  /** Returns true if there is at least one unclaimed mission reward, a ready chest, or an available special offer ad. */
  private hasClaimableRewards(): boolean {
    const progress = this.engine.progressManager.getState();
    const quests = progress.dailyQuests || [];

    // 1. Any mission completed but not yet claimed
    const hasUnclaimedMission = quests.some(q => q.current >= q.target && !q.claimed);
    if (hasUnclaimedMission) return true;

    // 2. Any mysterious box ready to open
    const anyChestReady = [1, 2, 3].some(id => this.getChestStatus(id).isReady);
    if (anyChestReady) return true;

    // 3. Special offer ad cooldown has expired (can claim again)
    const lastSpecialOffer = progress.lastSpecialOfferAdTime || 0;
    const offerCooldown = 24 * 60 * 60 * 1000;
    const specialOfferAvailable = (Date.now() - lastSpecialOffer) >= offerCooldown;
    if (specialOfferAvailable) return true;

    return false;
  }

  private getChestsHtml(): string {
    const chests = [
      { id: 1, name: 'Bronze Box', icon: '📦', color: '#cd7f32', glow: 'rgba(205, 127, 50, 0.45)', minCoins: 250, maxCoins: 600, minGems: 2, maxGems: 6 },
      { id: 2, name: 'Silver Box', icon: '🧰', color: '#c0c0c0', glow: 'rgba(192, 192, 192, 0.45)', minCoins: 800, maxCoins: 1800, minGems: 8, maxGems: 16 },
      { id: 3, name: 'Golden Box', icon: '🎁', color: '#ffd700', glow: 'rgba(255, 215, 0, 0.45)', minCoins: 2000, maxCoins: 4500, minGems: 20, maxGems: 45 }
    ];

    let chestsHtml = '';
    chests.forEach(ch => {
      const status = this.getChestStatus(ch.id);
      const isReady = status.isReady;
      const isCompleted = status.isCompleted;
      
      let progressPercent = 0;
      if (isCompleted) {
        progressPercent = 100;
      } else {
        progressPercent = Math.min(100, Math.floor((status.claimedMissions / status.requiredMissions) * 100));
      }
      
      let statusText = '';
      let btnText = 'OPEN 🎁';
      let btnClass = 'btn-open-chest';
      let btnDisabled = '';
      
      if (isCompleted) {
        statusText = `✅ CLAIMED (${status.claims}/${status.maxClaims})`;
        btnText = 'CLAIMED';
        btnClass = 'btn-open-chest completed';
        btnDisabled = 'disabled';
      } else if (!isReady) {
        statusText = `🔒 ${status.claimedMissions}/${status.requiredMissions}`;
        btnText = 'LOCKED';
        btnClass = 'btn-open-chest locked';
        btnDisabled = 'disabled';
      } else {
        statusText = `✨ READY! (${status.claims}/${status.maxClaims})`;
      }

      chestsHtml += `
        <div class="chest-border-wrapper" style="
          flex: 1; min-width: 65px; max-width: 75px; padding: 2px; border-radius: 14px;
          background: conic-gradient(${ch.color} ${progressPercent}%, rgba(255, 255, 255, 0.08) ${progressPercent}%);
          box-shadow: 0 4px 12px ${ch.glow}; transition: all 0.3s ease;
          display: flex;
        ">
          <div class="chest-card glass-card ${isReady ? 'ready-pulse' : ''}" data-chest-id="${ch.id}" style="
            flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 8px 2px; border-radius: 12px; border: none; background: rgba(13, 10, 28, 0.95);
            transition: all 0.3s ease; position: relative; width: 100%;
          ">
            <div class="chest-icon-wrapper" style="
              width: 65px; height: 65px; display: flex; align-items: center; justify-content: center; margin-bottom: 2px; filter: drop-shadow(0 0 6px ${ch.color});
              animation: ${isReady ? 'chestFloat 2s ease-in-out infinite' : 'none'};
            ">
              ${this.getChestSvg(ch.id, '65px', '65px', '', 'tab-chest-' + ch.id)}
            </div>
            <div class="chest-name" style="font-size: 7.5px; font-weight: 900; color: ${ch.color}; letter-spacing: 0.5px; text-shadow: 0 0 5px ${ch.glow}; margin-bottom: 2px;">${ch.name.replace(' Box', '').toUpperCase()}</div>
            <div class="chest-status" style="font-size: 7.5px; font-weight: 800; color: ${isCompleted ? '#a855f7' : (isReady ? '#00ffaa' : '#ff3366')}; text-shadow: ${isReady ? '0 0 5px rgba(0,255,170,0.5)' : 'none'}; margin-bottom: 6px;">
              ${statusText}
            </div>
            <button class="${btnClass}" data-chest-id="${ch.id}" ${btnDisabled} style="
              width: 90%; max-width: 65px; border: none; padding: 3px 0; border-radius: 6px; font-family: inherit; font-size: 7.5px; font-weight: 900;
              color: ${isReady ? '#030c17' : 'rgba(255,255,255,0.35)'}; background: ${isReady ? `linear-gradient(180deg, ${ch.color} 0%, #ffffff 100%)` : 'rgba(255,255,255,0.06)'};
              cursor: ${isReady ? 'pointer' : 'not-allowed'}; box-shadow: ${isReady ? `0 4px 10px ${ch.glow}` : 'none'}; transition: all 0.2s;
            ">
              ${btnText}
            </button>
          </div>
        </div>
      `;
    });

    return chestsHtml;
  }

  private getChestSvg(chestId: number, width: string, height: string, extraStyle: string = '', idSuffix: string = 'chest'): string {
    // Configure gradient colors based on chestId
    let woodLeftStart = '#E2B770', woodLeftEnd = '#A57038';
    let woodRightStart = '#B28247', woodRightEnd = '#72451C';
    let woodLidTopStart = '#F3D19E', woodLidTopEnd = '#D29A4E';
    let woodRecessedStart = '#8E5623', woodRecessedEnd = '#2A1608';
    
    let ribbonLeft1 = '#FF5555', ribbonLeft2 = '#D61A1A', ribbonLeft3 = '#800000';
    let ribbonRight1 = '#D61A1A', ribbonRight2 = '#9E0C0C', ribbonRight3 = '#5E0000';
    let ribbonTopLeft1 = '#FF5555', ribbonTopLeft2 = '#9E0C0C';
    
    let metalGold1 = '#FCE69B', metalGold2 = '#D4A034', metalGold3 = '#7B4B17';
    let metalHighlight1 = '#FFFFFF', metalHighlight2 = '#FFE580';
    let shieldCenterFill = '#D61A1A';

    if (chestId === 1) {
      // Bronze Chest: Bronze/coppery metal, brownish wood, dark orange ribbons
      woodLeftStart = '#7A4A28'; woodLeftEnd = '#4D2C15';
      woodRightStart = '#5C361D'; woodRightEnd = '#331D0E';
      woodLidTopStart = '#9E673E'; woodLidTopEnd = '#6B4122';
      woodRecessedStart = '#4D2C15'; woodRecessedEnd = '#1C0D05';
      
      ribbonLeft1 = '#D97736'; ribbonLeft2 = '#A65321'; ribbonLeft3 = '#5E2B0E';
      ribbonRight1 = '#A65321'; ribbonRight2 = '#803B14'; ribbonRight3 = '#401A05';
      ribbonTopLeft1 = '#D97736'; ribbonTopLeft2 = '#803B14';
      
      metalGold1 = '#E3905D'; metalGold2 = '#A05A32'; metalGold3 = '#593019';
      metalHighlight1 = '#FAD5C0'; metalHighlight2 = '#C4774B';
      shieldCenterFill = '#5C361D';
    } else if (chestId === 2) {
      // Silver Chest: Steel/slate wood, bright silver metal, blue ribbons
      woodLeftStart = '#5A6B7C'; woodLeftEnd = '#333E4A';
      woodRightStart = '#465362'; woodRightEnd = '#242C35';
      woodLidTopStart = '#7D92A6'; woodLidTopEnd = '#4E5D6F';
      woodRecessedStart = '#333E4A'; woodRecessedEnd = '#12171D';
      
      ribbonLeft1 = '#00B4D8'; ribbonLeft2 = '#0077B6'; ribbonLeft3 = '#03045E';
      ribbonRight1 = '#0077B6'; ribbonRight2 = '#0096C7'; ribbonRight3 = '#023E8A';
      ribbonTopLeft1 = '#00B4D8'; ribbonTopLeft2 = '#03045E';
      
      metalGold1 = '#E2E8F0'; metalGold2 = '#94A3B8'; metalGold3 = '#475569';
      metalHighlight1 = '#FFFFFF'; metalHighlight2 = '#CBD5E1';
      shieldCenterFill = '#0077B6';
    } else {
      // Golden Chest (chestId === 3): Rich mahogany wood, shiny gold metal, ruby red ribbons
      woodLeftStart = '#A25B1F'; woodLeftEnd = '#663300';
      woodRightStart = '#8F4D18'; woodRightEnd = '#4C2300';
      woodLidTopStart = '#C37D3B'; woodLidTopEnd = '#8A4A1C';
      woodRecessedStart = '#663300'; woodRecessedEnd = '#241000';
      
      ribbonLeft1 = '#D90429'; ribbonLeft2 = '#9B001C'; ribbonLeft3 = '#4A000A';
      ribbonRight1 = '#9B001C'; ribbonRight2 = '#EF233C'; ribbonRight3 = '#3D0005';
      ribbonTopLeft1 = '#EF233C'; ribbonTopLeft2 = '#4A000A';
      
      metalGold1 = '#FCE69B'; metalGold2 = '#D4A034'; metalGold3 = '#7B4B17';
      metalHighlight1 = '#FFFFFF'; metalHighlight2 = '#FFE580';
      shieldCenterFill = '#EF233C';
    }

    // Metal Corners
    let cornersHtml = '';
  if (chestId === 3) {
    cornersHtml = `
      <!-- Bottom Left -->
      <path d="M 120,315 C 120,325 125,335 135,340 C 145,335 150,325 150,315 L 120,315 Z" transform="rotate(-15, 135, 327)" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round" />
      <circle cx="120" cy="340" r="10" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />

      <!-- Bottom Middle -->
      <path d="M 256,395 C 270,395 281,405 281,410 C 270,418 242,418 231,410 C 231,405 242,395 256,395 Z" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round" />
      <circle cx="256" cy="420" r="12" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />

      <!-- Bottom Right -->
      <path d="M 392,315 C 392,325 387,335 377,340 C 367,335 362,325 362,315 L 392,315 Z" transform="rotate(15, 377, 327)" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round" />
      <circle cx="392" cy="340" r="10" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />

      <!-- Lid corners (Top-Left, Top-Middle, Top-Right) -->
      <circle cx="110" cy="135" r="12" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />
      <circle cx="256" cy="225" r="14" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />
      <circle cx="402" cy="135" r="12" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />
      <circle cx="256" cy="45" r="10" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />
    `;
  } else if (chestId === 2) {
    cornersHtml = `
      <!-- Bottom Left -->
      <path d="M 120,315 C 120,325 125,335 135,340 C 145,335 150,325 150,315 L 120,315 Z" transform="rotate(-15, 135, 327)" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round" />
      <circle cx="120" cy="340" r="9" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />

      <!-- Bottom Right -->
      <path d="M 392,315 C 392,325 387,335 377,340 C 367,335 362,325 362,315 L 392,315 Z" transform="rotate(15, 377, 327)" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round" />
      <circle cx="392" cy="340" r="9" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />

      <!-- Lid corners (only left and right) -->
      <circle cx="110" cy="135" r="10" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />
      <circle cx="402" cy="135" r="10" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" />
    `;
  } else {
    cornersHtml = `
      <!-- Bottom Left -->
      <path d="M 120,315 C 120,325 125,335 135,340 C 145,335 150,325 150,315 L 120,315 Z" transform="rotate(-15, 135, 327)" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round" />

      <!-- Bottom Right -->
      <path d="M 392,315 C 392,325 387,335 377,340 C 367,335 362,325 362,315 L 392,315 Z" transform="rotate(15, 377, 327)" fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round" />
    `;
  }

  // Lock Html
  let lockHtml = '';
  if (chestId === 1) {
    lockHtml = `
    <g stroke="#2A1608" stroke-width="4" stroke-linejoin="round">
      <rect x="312" y="240" width="24" height="30" rx="4" fill="url(#gold-grad-${idSuffix})" />
      <circle cx="324" cy="252" r="4" fill="#2A1608" />
      <polygon points="322,254 326,254 327,264 321,264" fill="#2A1608" />
    </g>
    `;
  } else {
    lockHtml = `
    <g stroke="#2A1608" stroke-width="5" stroke-linejoin="round">
      <!-- Golden Escutcheon Badge -->
      <path d="M 324,225 C 342,225 352,238 349,252 C 345,268 324,285 324,285 C 324,285 303,268 299,252 C 296,238 306,225 324,225 Z" fill="url(#gold-grad-${idSuffix})" />
      
      <!-- Center Shield -->
      <path d="M 324,233 C 334,233 340,240 338,250 C 335,260 324,272 324,272 C 324,272 313,260 310,250 C 308,240 314,233 324,233 Z" fill="${shieldCenterFill}" />
      
      <!-- Keyhole -->
      <circle cx="324" cy="248" r="5" fill="#2A1608" />
      <polygon points="321,250 327,250 329,263 319,263" fill="#2A1608" />
    </g>
    `;
  }

  // Bow Html
  let bowHtml = '';
  if (chestId === 3) {
    bowHtml = `
    <g stroke="#2A1608" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
      <!-- Ribbon Tails -->
      <path d="M 245,130 C 225,160 190,195 200,210 C 210,210 235,180 249,145 Z" fill="url(#ribbon-left-${idSuffix})" />
      <path d="M 267,130 C 287,160 322,195 312,210 C 302,210 277,180 263,145 Z" fill="url(#ribbon-right-${idSuffix})" />

      <!-- Left Loop -->
      <path d="M 246,128 C 210,85 140,95 165,140 C 185,165 230,145 246,128 Z" fill="url(#ribbon-left-${idSuffix})" />
      <!-- Left Loop Inner Shadow -->
      <path d="M 230,135 C 205,145 185,148 178,137 C 168,122 210,105 238,126 Z" fill="#5E0000" opacity="0.4" stroke="none" />

      <!-- Right Loop -->
      <path d="M 266,128 C 302,85 372,95 347,140 C 327,165 282,145 266,128 Z" fill="url(#ribbon-right-${idSuffix})" />
      <!-- Right Loop Inner Shadow -->
      <path d="M 282,135 C 307,145 327,148 334,137 C 344,122 302,105 274,126 Z" fill="#5E0000" opacity="0.4" stroke="none" />

      <!-- Center Knot -->
      <rect x="242" y="116" width="28" height="24" rx="8" ry="8" fill="url(#ribbon-left-${idSuffix})" />
    </g>
    `;
  } else if (chestId === 2) {
    bowHtml = `
    <g stroke="#2A1608" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
      <!-- Left Loop -->
      <path d="M 246,128 C 210,85 140,95 165,140 C 185,165 230,145 246,128 Z" fill="url(#ribbon-left-${idSuffix})" />
      <!-- Left Loop Inner Shadow -->
      <path d="M 230,135 C 205,145 185,148 178,137 C 168,122 210,105 238,126 Z" fill="#5E0000" opacity="0.4" stroke="none" />

      <!-- Right Loop -->
      <path d="M 266,128 C 302,85 372,95 347,140 C 327,165 282,145 266,128 Z" fill="url(#ribbon-right-${idSuffix})" />
      <!-- Right Loop Inner Shadow -->
      <path d="M 282,135 C 307,145 327,148 334,137 C 344,122 302,105 274,126 Z" fill="#5E0000" opacity="0.4" stroke="none" />

      <!-- Center Knot -->
      <rect x="242" y="116" width="28" height="24" rx="8" ry="8" fill="url(#ribbon-left-${idSuffix})" />
    </g>
    `;
  }

  return `
<svg viewBox="0 0 512 512" style="width: ${width}; height: ${height}; ${extraStyle}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Wood Gradients -->
    <linearGradient id="wood-left-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${woodLeftStart}" />
      <stop offset="100%" stop-color="${woodLeftEnd}" />
    </linearGradient>
    <linearGradient id="wood-right-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${woodRightStart}" />
      <stop offset="100%" stop-color="${woodRightEnd}" />
    </linearGradient>
    <linearGradient id="wood-lid-top-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${woodLidTopStart}" />
      <stop offset="100%" stop-color="${woodLidTopEnd}" />
    </linearGradient>
    <linearGradient id="wood-recessed-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${woodRecessedStart}" stop-opacity="0.3" />
      <stop offset="100%" stop-color="${woodRecessedEnd}" stop-opacity="0.6" />
    </linearGradient>

    <!-- Ribbon Gradients -->
    <linearGradient id="ribbon-left-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ribbonLeft1}" />
      <stop offset="30%" stop-color="${ribbonLeft2}" />
      <stop offset="100%" stop-color="${ribbonLeft3}" />
    </linearGradient>
    <linearGradient id="ribbon-right-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ribbonRight1}" />
      <stop offset="70%" stop-color="${ribbonRight2}" />
      <stop offset="100%" stop-color="${ribbonRight3}" />
    </linearGradient>
    <linearGradient id="ribbon-top-left-${idSuffix}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${ribbonTopLeft1}" />
      <stop offset="100%" stop-color="${ribbonTopLeft2}" />
    </linearGradient>

    <!-- Metal Gold Gradients -->
    <linearGradient id="gold-grad-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${metalGold1}" />
      <stop offset="50%" stop-color="${metalGold2}" />
      <stop offset="100%" stop-color="${metalGold3}" />
    </linearGradient>
    <linearGradient id="gold-highlight-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${metalHighlight1}" stop-opacity="0.8" />
      <stop offset="100%" stop-color="${metalHighlight2}" stop-opacity="0.1" />
    </linearGradient>
  </defs>

  <!-- Drop Shadow -->
  <ellipse cx="256" cy="425" rx="160" ry="40" fill="rgba(0, 0, 0, 0.3)" filter="blur(8px)" />

  <g stroke="#2A1608" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- Left Wall Base -->
    <polygon points="120,180 256,260 256,420 120,340" fill="url(#wood-left-${idSuffix})" />
    <!-- Recessed Left Panel -->
    <polygon points="135,200 241,262 241,400 135,338" fill="url(#wood-left-${idSuffix})" />
    <polygon points="135,200 241,262 241,400 135,338" fill="url(#wood-recessed-${idSuffix})" />

    <!-- Right Wall Base -->
    <polygon points="256,260 392,180 392,340 256,420" fill="url(#wood-right-${idSuffix})" />
    <!-- Recessed Right Panel -->
    <polygon points="271,262 377,200 377,338 271,400" fill="url(#wood-right-${idSuffix})" />
    <polygon points="271,262 377,200 377,338 271,400" fill="url(#wood-recessed-${idSuffix})" />

    <!-- Lid Overhang Rim -->
    <!-- Left Lid Rim -->
    <polygon points="110,135 256,225 256,265 110,175" fill="url(#wood-left-${idSuffix})" />
    <!-- Right Lid Rim -->
    <polygon points="256,225 402,135 402,175 256,265" fill="url(#wood-right-${idSuffix})" />
    
    <!-- Top Lid Face -->
    <polygon points="110,135 256,45 402,135 256,225" fill="url(#wood-lid-top-${idSuffix})" />
    <!-- Top Lid Recessed Panel -->
    <polygon points="125,135 256,58 387,135 256,212" fill="url(#wood-lid-top-${idSuffix})" />
    <polygon points="125,135 256,58 387,135 256,212" fill="url(#wood-recessed-${idSuffix})" />
  </g>

  <!-- Ribbons -->
  <g stroke="#2A1608" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <!-- Top Face Ribbons -->
    <polygon points="163,168 256,113 296,137 203,192" fill="url(#ribbon-top-left-${idSuffix})" />
    <polygon points="309,192 216,137 256,113 349,168" fill="url(#ribbon-top-left-${idSuffix})" />

    <!-- Left Wall Ribbon -->
    <polygon points="168,208 208,232 208,392 168,368" fill="url(#ribbon-left-${idSuffix})" />
    <!-- Left Lid Overhang Ribbon -->
    <polygon points="163,168 203,192 203,232 163,208" fill="url(#ribbon-left-${idSuffix})" />

    <!-- Right Wall Ribbon -->
    <polygon points="304,232 344,208 344,368 304,392" fill="url(#ribbon-right-${idSuffix})" />
    <!-- Right Lid Overhang Ribbon -->
    <polygon points="309,192 349,168 349,208 309,232" fill="url(#ribbon-right-${idSuffix})" />
  </g>

  <!-- Metal Corners -->
  <g fill="url(#gold-grad-${idSuffix})" stroke="#2A1608" stroke-width="5" stroke-linejoin="round">
    ${cornersHtml}
  </g>

  <!-- Lock Plate -->
  ${lockHtml}

  <!-- Bow (Top Center of Lid) -->
  ${bowHtml}
</svg>
    `;
  }

  private getWorldsIconSvg(width: string, height: string, extraStyle: string = '', idSuffix: string = 'main'): string {
    return `
<svg viewBox="0 0 600 400" style="width: ${width}; height: ${height}; ${extraStyle}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Wooden Ring Gradients -->
    <linearGradient id="woodRingGrad-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fdf5e2" />
      <stop offset="50%" stop-color="#dfc091" />
      <stop offset="100%" stop-color="#b68f56" />
    </linearGradient>

    <!-- Biome 1: Snow Gradients -->
    <linearGradient id="snowGrad-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#bce3eb" />
    </linearGradient>
    <linearGradient id="snowMountainShade-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e1f5fe" />
      <stop offset="100%" stop-color="#90caf9" />
    </linearGradient>

    <!-- Biome 2 & 3: Valley Gradients -->
    <linearGradient id="valleyGrad-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#acd57a" />
      <stop offset="100%" stop-color="#559933" />
    </linearGradient>
    <linearGradient id="mountainWoodGrad-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a1887f" />
      <stop offset="100%" stop-color="#5d4037" />
    </linearGradient>

    <!-- Biome 4: Desert Gradients -->
    <linearGradient id="desertGrad-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fdd480" />
      <stop offset="100%" stop-color="#d98c3b" />
    </linearGradient>

    <!-- Paper Texture & Shading -->
    <linearGradient id="foldLight-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
    </linearGradient>
    <linearGradient id="foldDark-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.25" />
    </linearGradient>

    <!-- Red Map Pin Gradient -->
    <radialGradient id="pinGrad-${idSuffix}" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#ff8a80" />
      <stop offset="70%" stop-color="#d50000" />
      <stop offset="100%" stop-color="#9a0007" />
    </radialGradient>

    <!-- Shadows -->
    <filter id="mapShadow-${idSuffix}" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="15" stdDeviation="10" flood-color="#000000" flood-opacity="0.55" />
    </filter>

    <!-- Clip Paths for Accordion Folds -->
    <clipPath id="panel1-clip-${idSuffix}">
      <polygon points="80,130 190,95 190,295 80,330" />
    </clipPath>
    <clipPath id="panel2-clip-${idSuffix}">
      <polygon points="190,95 300,130 300,330 190,295" />
    </clipPath>
    <clipPath id="panel3-clip-${idSuffix}">
      <polygon points="300,130 410,95 410,295 300,330" />
    </clipPath>
    <clipPath id="panel4-clip-${idSuffix}">
      <polygon points="410,95 520,130 520,330 410,295" />
    </clipPath>
  </defs>

  <!-- 1. Background Wooden Hoop Ring -->
  <ellipse cx="300" cy="200" rx="230" ry="170" fill="none" stroke="url(#woodRingGrad-${idSuffix})" stroke-width="14" stroke-opacity="0.9" />
  <ellipse cx="300" cy="200" rx="230" ry="170" fill="none" stroke="#6d4c41" stroke-width="1.5" stroke-opacity="0.4" />

  <!-- Group with Drop Shadow -->
  <g filter="url(#mapShadow-${idSuffix})">

    <!-- ================= PANEL 1: SNOW BIOME ================= -->
    <g clip-path="url(#panel1-clip-${idSuffix})">
      <!-- Background Ice/Snow -->
      <polygon points="80,130 190,95 190,295 80,330" fill="url(#snowGrad-${idSuffix})" />
      
      <!-- Blue-tinted Mountains (Left) -->
      <!-- Left Peak -->
      <polygon points="100,130 140,240 70,240" fill="url(#snowMountainShade-${idSuffix})" stroke="#90caf9" stroke-width="1" />
      <polygon points="100,130 100,240 140,240" fill="#64b5f6" fill-opacity="0.3" /> <!-- Shadow face -->
      
      <!-- Right Peak -->
      <polygon points="140,140 180,250 110,250" fill="url(#snowMountainShade-${idSuffix})" stroke="#90caf9" stroke-width="1" />
      <polygon points="140,140 140,250 180,250" fill="#64b5f6" fill-opacity="0.3" />
      
      <!-- Snowy Peaks overlay -->
      <polygon points="100,130 112,165 100,160 88,165" fill="#ffffff" />
      <polygon points="140,140 152,175 140,170 128,175" fill="#ffffff" />

      <!-- River (Ice melt) -->
      <path d="M 140 240 Q 120 280 160 295" fill="none" stroke="#29b6f6" stroke-width="4.5" stroke-linecap="round" />
      
      <!-- Snow Pines -->
      <polygon points="90,270 95,285 85,285" fill="#4dd0e1" />
      <polygon points="90,265 93,275 87,275" fill="#ffffff" />
      
      <polygon points="105,280 110,295 100,295" fill="#4dd0e1" />
      <polygon points="115,260 120,275 110,275" fill="#4dd0e1" />

      <!-- Igloo -->
      <path d="M 155 285 A 15 15 0 0 1 185 285 Z" fill="#e0f7fa" stroke="#80deea" stroke-width="1.5" />
      <path d="M 165 285 A 6 6 0 0 1 175 285 Z" fill="#80deea" />
      <!-- Yeti Silhouetted Shadow -->
      <circle cx="125" cy="220" r="7" fill="#ffffff" opacity="0.9" />
      <path d="M 120 232 L 130 232 L 128 223 L 122 223 Z" fill="#ffffff" opacity="0.9" />

      <!-- Panel 1 lighting overlay -->
      <polygon points="80,130 190,95 190,295 80,330" fill="url(#foldLight-${idSuffix})" />
    </g>

    <!-- ================= PANEL 2: VOLCANO & SHORE ================= -->
    <g clip-path="url(#panel2-clip-${idSuffix})">
      <!-- Background Valley/Ocean -->
      <polygon points="190,95 300,130 300,330 190,295" fill="url(#valleyGrad-${idSuffix})" />
      
      <!-- Sea water boundary (Left edge is water) -->
      <path d="M 190 95 C 220 120 200 200 230 250 C 250 280 210 290 190 295 Z" fill="#29b6f6" />
      <path d="M 190 95 C 220 120 200 200 230 250 C 250 280 210 290 190 295" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-opacity="0.5" />

      <!-- Volcano Mountain -->
      <polygon points="255,135 285,220 225,220" fill="url(#mountainWoodGrad-${idSuffix})" stroke="#4e342e" stroke-width="1.5" />
      <!-- Volcano Shadow side -->
      <polygon points="255,135 255,220 285,220" fill="#3e2723" fill-opacity="0.35" />
      
      <!-- Lava Crater Peak -->
      <polygon points="250,138 260,138 265,145 245,145" fill="#ff5722" />
      <ellipse cx="255" cy="138" rx="5" ry="2" fill="#ffeb3b" />
      <!-- Smoke -->
      <path d="M 255 133 C 250 115 270 110 260 95 C 275 100 265 120 255 133" fill="#cfd8dc" opacity="0.6" />

      <!-- Tiny Coast Houses -->
      <rect x="235" y="245" width="8" height="8" fill="#d7ccc8" stroke="#5d4037" stroke-width="1" />
      <polygon points="233,245 245,245 239,239" fill="#e53935" />
      
      <rect x="250" y="255" width="10" height="8" fill="#d7ccc8" stroke="#5d4037" stroke-width="1" />
      <polygon points="248,255 262,255 255,249" fill="#e53935" />

      <!-- Little Sailboat -->
      <path d="M 205 230 L 215 230 L 212 234 L 208 234 Z" fill="#5d4037" />
      <polygon points="210,218 210,230 215,226" fill="#ffffff" />

      <!-- Panel 2 shadow overlay -->
      <polygon points="190,95 300,130 300,330 190,295" fill="url(#foldDark-${idSuffix})" />
    </g>

    <!-- ================= PANEL 3: VALLEYS & GEYSERS ================= -->
    <g clip-path="url(#panel3-clip-${idSuffix})">
      <!-- Background Valley -->
      <polygon points="300,130 410,95 410,295 300,330" fill="url(#valleyGrad-${idSuffix})" />
      
      <!-- Winding River coming from Volcano -->
      <path d="M 300 220 Q 320 210 340 240 T 380 230 Q 400 240 410 270" fill="none" stroke="#29b6f6" stroke-width="5" stroke-linecap="round" />

      <!-- Mountains in Background -->
      <polygon points="360,110 390,190 330,190" fill="url(#mountainWoodGrad-${idSuffix})" stroke="#4e342e" stroke-width="1.5" />
      <polygon points="360,110 360,190 390,190" fill="#3e2723" fill-opacity="0.3" />

      <!-- Active Geysers (Water Spouts) -->
      <!-- Geyser 1 -->
      <path d="M 330 205 Q 325 185 330 165 Q 335 185 330 205" fill="#e0f7fa" opacity="0.8" />
      <ellipse cx="330" cy="205" rx="6" ry="2.5" fill="#80deea" opacity="0.7" />
      <!-- Geyser 2 -->
      <path d="M 375 225 Q 370 200 375 180 Q 380 200 375 225" fill="#e0f7fa" opacity="0.8" />
      <ellipse cx="375" cy="225" rx="6" ry="2.5" fill="#80deea" opacity="0.7" />

      <!-- Forest Clumps -->
      <circle cx="320" cy="275" r="9" fill="#2e7d32" stroke="#1b5e20" stroke-width="1" />
      <circle cx="330" cy="280" r="7" fill="#388e3c" />
      <circle cx="312" cy="282" r="6" fill="#1b5e20" />
      
      <circle cx="385" cy="180" r="8" fill="#2e7d32" stroke="#1b5e20" stroke-width="1" />
      <circle cx="393" cy="184" r="6" fill="#388e3c" />

      <!-- Panel 3 lighting overlay -->
      <polygon points="300,130 410,95 410,295 300,330" fill="url(#foldLight-${idSuffix})" />
    </g>

    <!-- ================= PANEL 4: DESERT & TOWN ================= -->
    <g clip-path="url(#panel4-clip-${idSuffix})">
      <!-- Background Desert -->
      <polygon points="410,95 520,130 520,330 410,295" fill="url(#desertGrad-${idSuffix})" />

      <!-- River flowing into Delta -->
      <path d="M 410 270 Q 425 290 440 280 T 470 300" fill="none" stroke="#29b6f6" stroke-width="4" stroke-linecap="round" />

      <!-- Small Sandy Dunes -->
      <path d="M 410 160 C 430 150 450 170 470 160 C 490 150 500 170 520 160" fill="none" stroke="#e65100" stroke-width="1.5" stroke-opacity="0.3" />
      <path d="M 420 190 C 440 180 460 200 480 190 T 520 180" fill="none" stroke="#e65100" stroke-width="1.5" stroke-opacity="0.3" />

      <!-- Medieval Castle/Fortress City -->
      <g transform="translate(440, 210) scale(0.9)">
        <!-- Castle Walls -->
        <rect x="10" y="30" width="45" height="25" fill="#b0bec5" stroke="#37474f" stroke-width="1.5" />
        <line x1="10" y1="30" x2="55" y2="30" stroke="#37474f" stroke-width="3" stroke-dasharray="3,3" /> <!-- Crenellations -->
        
        <!-- Tower 1 (Left) -->
        <rect x="5" y="15" width="12" height="40" fill="#90a4ae" stroke="#37474f" stroke-width="1.5" />
        <polygon points="2,15 8,2 14,2 20,15" fill="#37474f" />
        <polygon points="5,15 11,2 17,15" fill="#d84315" /> <!-- Red conical roof -->

        <!-- Tower 2 (Right) -->
        <rect x="48" y="15" width="12" height="40" fill="#90a4ae" stroke="#37474f" stroke-width="1.5" />
        <polygon points="45,15 51,2 57,2 63,15" fill="#37474f" />
        <polygon points="48,15 54,2 60,15" fill="#d84315" />
        
        <!-- Little Houses inside -->
        <rect x="22" y="20" width="10" height="10" fill="#eceff1" stroke="#37474f" stroke-width="1" />
        <polygon points="20,20 32,20 26,14" fill="#ff8f00" />
        <rect x="34" y="22" width="8" height="8" fill="#eceff1" stroke="#37474f" stroke-width="1" />
        <polygon points="32,22 44,22 38,17" fill="#ff8f00" />
      </g>

      <!-- Panel 4 shadow overlay -->
      <polygon points="410,95 520,130 520,330 410,295" fill="url(#foldDark-${idSuffix})" />
    </g>

    <!-- ================= BORDERS & ACCORDION OUTLINES ================= -->
    <!-- Fold Lines (Shadow overlays between panels) -->
    <!-- Fold 1 (Concave/Valley fold - dark) -->
    <line x1="190" y1="95" x2="190" y2="295" stroke="#3e2723" stroke-width="3" stroke-linecap="round" opacity="0.65" />
    <line x1="190" y1="95" x2="190" y2="295" stroke="#000000" stroke-width="1.5" stroke-linecap="round" opacity="0.4" />
    
    <!-- Fold 2 (Convex/Ridge fold - bright highlight) -->
    <line x1="300" y1="130" x2="300" y2="330" stroke="#ffecb3" stroke-width="3.5" stroke-linecap="round" opacity="0.75" />
    <line x1="300" y1="130" x2="300" y2="330" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" opacity="0.9" />

    <!-- Fold 3 (Concave/Valley fold - dark) -->
    <line x1="410" y1="95" x2="410" y2="295" stroke="#3e2723" stroke-width="3" stroke-linecap="round" opacity="0.65" />
    <line x1="410" y1="95" x2="410" y2="295" stroke="#000000" stroke-width="1.5" stroke-linecap="round" opacity="0.4" />

    <!-- Outer Hand-drawn Map Border -->
    <!-- Thick Outer dark-brown border -->
    <polygon points="80,130 190,95 300,130 410,95 520,130 520,330 410,295 300,330 190,295 80,330" 
             fill="none" stroke="#4e2c16" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" />
    
    <!-- Thin Inner golden-brown decorative border -->
    <polygon points="85,128 190,99 300,134 410,99 515,128 515,326 410,291 300,326 190,291 85,326" 
             fill="none" stroke="#d7ccc8" stroke-width="1.5" stroke-linejoin="round" stroke-opacity="0.85" />

    <!-- Dashed navigation line on the border inside -->
    <polygon points="88,126 190,102 300,137 410,102 512,126 512,323 410,288 300,323 190,288 88,323" 
             fill="none" stroke="#b0bec5" stroke-width="1" stroke-linejoin="round" stroke-dasharray="5,4" stroke-opacity="0.4" />

    <!-- ================= 3D RED MAP PIN / MARKER ================= -->
    <!-- Placed on the Right-most Panel (Desert Town) -->
    <g transform="translate(470, 248) scale(1.15)">
      <!-- Soft Map Pin Shadow on the paper -->
      <ellipse cx="0" cy="18" rx="8" ry="4" fill="rgba(0, 0, 0, 0.4)" filter="blur(1.5px)" />
      
      <!-- Pin Pinpoint base needle -->
      <path d="M 0 18 L -6 4 L 6 4 Z" fill="#9a0007" />
      
      <!-- Pin Body (Teardrop shape) -->
      <path d="M 0 18 C -15 0 -15 -18 0 -18 C 15 -18 15 0 0 18 Z" fill="url(#pinGrad-${idSuffix})" stroke="#7f0000" stroke-width="1.5" />
      
      <!-- Glossy Reflection Highlights -->
      <!-- Crescent highlight on top-left -->
      <path d="M -7 -9 C -4 -13 0 -15 4 -13" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.6" />
      
      <!-- Inner Core Hole Circle -->
      <circle cx="0" cy="-4" r="5" fill="#ffffff" />
      <circle cx="0" cy="-4" r="5" fill="#ffebee" opacity="0.95" />
      <circle cx="0" cy="-4" r="3.5" fill="#d50000" opacity="0.15" />
    </g>

  </g>
</svg>
    `;
  }

  private getJungleWorldIconSvg(width: string, height: string): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 8px rgba(0,200,83,0.6));" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="jungleBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#052e16" />
      <stop offset="100%" stop-color="#022c22" />
    </linearGradient>
    <!-- Waterfall Gradient -->
    <linearGradient id="waterfallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#a5f3fc" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <!-- Leaves Gradient -->
    <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4ade80" />
      <stop offset="100%" stop-color="#15803d" />
    </linearGradient>
    <linearGradient id="leafGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22c55e" />
      <stop offset="100%" stop-color="#14532d" />
    </linearGradient>
  </defs>

  <!-- Mask for circular boundary -->
  <clipPath id="circleClip">
    <circle cx="50" cy="50" r="46" />
  </clipPath>

  <!-- Base Glow Shadow Outer Ring -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#22c55e" stroke-width="2.5" opacity="0.8" />
  <circle cx="50" cy="50" r="46" fill="url(#jungleBgGrad)" />

  <!-- Inside Content Clipped to Circle -->
  <g clip-path="url(#circleClip)">
    <!-- Distant Mountains Silhouette -->
    <!-- Peak 1: Left Peak -->
    <path d="M -10,80 L 25,25 L 25,80 Z" fill="#2d6a4f" />
    <path d="M 25,25 L 60,80 L 25,80 Z" fill="#1b4332" />
    <path d="M 20,33 C 23,31 24,31 25,25 C 26,31 27,31 30,33 L 25,37 Z" fill="#74c69d" />
    
    <!-- Peak 2: Right Peak (Taller) -->
    <path d="M 35,80 L 70,15 L 70,80 Z" fill="#225c42" />
    <path d="M 70,15 L 105,80 L 70,80 Z" fill="#123826" />
    <path d="M 64,26 C 68,23 69,23 70,15 C 71,23 72,23 76,26 L 70,30 Z" fill="#95d5b2" />
    
    <!-- Foothills / Jungle Ridge in front -->
    <path d="M 0,70 Q 25,60 50,75 T 100,70 L 100,100 L 0,100 Z" fill="#081c15" />

    <!-- Waterfall coming from the top center (60% smaller presence) -->
    <path d="M 47,40 L 53,40 L 55,90 L 45,90 Z" fill="url(#waterfallGrad)" opacity="0.4" />
    <!-- Waterfall stream details -->
    <path d="M 49,40 L 48,90" stroke="#ffffff" stroke-width="0.5" opacity="0.3" stroke-dasharray="8 4" />
    <path d="M 51,40 L 52,90" stroke="#ffffff" stroke-width="0.5" opacity="0.3" stroke-dasharray="10 5" />
    
    <!-- Water Splash Foam at bottom -->
    <ellipse cx="50" cy="88" rx="6" ry="2" fill="#e0f2fe" opacity="0.4" />
    <ellipse cx="50" cy="91" rx="7" ry="2" fill="#ffffff" opacity="0.3" />

    <!-- Tropical Leaves Left Side (scaled down 60%, opacity 0.5) -->
    <!-- Monstera leaf 1 -->
    <g transform="translate(18, 68) rotate(-20) scale(0.24)" opacity="0.5">
      <path d="M 0,0 C 15,-15 30,-5 30,15 C 30,35 10,40 0,40 C -10,40 -30,35 -30,15 C -30,-5 -15,-15 0,0 Z" fill="url(#leafGradDark)" />
      <!-- Leaf cuts -->
      <path d="M 0,0 L 0,40" stroke="#14532d" stroke-width="1.5" />
      <path d="M 5,10 L 25,5" stroke="#052e16" stroke-width="1.2" />
      <path d="M -5,10 L -25,5" stroke="#052e16" stroke-width="1.2" />
      <path d="M 8,20 L 28,18" stroke="#052e16" stroke-width="1.2" />
      <path stroke="#052e16" stroke-width="1.2" d="M -8,20 L -28,18" />
    </g>
    <!-- Fern/Palm Leaf 1 -->
    <g transform="translate(10, 84) rotate(35) scale(0.28)" opacity="0.5">
      <path d="M -2,40 Q 15,10 30,-10 Q 15,20 -2,40 Z" fill="url(#leafGrad)" />
      <path d="M 0,40 L 20,0" stroke="#15803d" stroke-width="1" />
    </g>

    <!-- Tropical Leaves Right Side completely removed for 60%+ leaf presence reduction -->

    <!-- Vines hanging from the top (reduced scale and opacity) -->
    <path d="M 15,0 Q 18,10 17,20" fill="none" stroke="#166534" stroke-width="0.8" opacity="0.3" />
    <path d="M 17,20 L 15,22 L 19,22 Z" fill="#22c55e" opacity="0.3" />
    <path d="M 85,0 Q 82,10 83,18" fill="none" stroke="#166534" stroke-width="0.8" opacity="0.3" />
    <path d="M 83,18 L 81,20 L 85,20 Z" fill="#22c55e" opacity="0.3" />

    <!-- Rain drops falling diagonally (express environment!) -->
    <path d="M 30,15 L 28,22" stroke="#38bdf8" stroke-width="1" opacity="0.6" stroke-linecap="round" />
    <path d="M 70,20 L 68,27" stroke="#38bdf8" stroke-width="1" opacity="0.6" stroke-linecap="round" />
    <path d="M 48,10 L 46,17" stroke="#38bdf8" stroke-width="1" opacity="0.6" stroke-linecap="round" />
    <path d="M 20,40 L 18,47" stroke="#38bdf8" stroke-width="1" opacity="0.4" stroke-linecap="round" />
    <path d="M 82,42 L 80,49" stroke="#38bdf8" stroke-width="1" opacity="0.4" stroke-linecap="round" />
  </g>
</svg>
    `;
  }


  private getIceWorldIconSvg(width: string, height: string): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 8px rgba(0,243,255,0.6));" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="iceBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0b132b" />
      <stop offset="100%" stop-color="#1c2541" />
    </linearGradient>
    <linearGradient id="crystalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e0f7fa" />
      <stop offset="100%" stop-color="#00e5ff" />
    </linearGradient>
    <linearGradient id="mountainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#48cae4" />
    </linearGradient>
  </defs>

  <clipPath id="circleClipIce">
    <circle cx="50" cy="50" r="46" />
  </clipPath>

  <!-- Glow Ring -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#00e5ff" stroke-width="2.5" opacity="0.8" />
  <circle cx="50" cy="50" r="46" fill="url(#iceBgGrad)" />

  <g clip-path="url(#circleClipIce)">
    <!-- Snow mountain peaks -->
    <polygon points="10,85 50,30 90,85" fill="url(#mountainGrad)" opacity="0.4" />
    <polygon points="30,85 65,45 100,85" fill="url(#mountainGrad)" opacity="0.25" />
    <polygon points="-10,85 25,50 60,85" fill="url(#mountainGrad)" opacity="0.25" />

    <!-- Shadows on mountains -->
    <polygon points="50,30 50,85 90,85" fill="#0077b6" opacity="0.2" />

    <!-- Snow drift ground at bottom -->
    <path d="M -5,80 Q 25,72 50,80 T 105,78 L 105,105 L -5,105 Z" fill="#ffffff" />
    <path d="M -5,86 Q 35,80 75,88 T 105,85 L 105,105 L -5,105 Z" fill="#caf0f8" opacity="0.6" />

    <!-- Hanging Ice Spikes/Icicles from top -->
    <polygon points="15,0 20,0 17,22" fill="#e0f7fa" opacity="0.8" />
    <polygon points="28,0 36,0 32,32" fill="#caf0f8" opacity="0.9" />
    <polygon points="32,32 36,0 32,0" fill="#90e0ef" opacity="0.4" />
    <polygon points="60,0 66,0 63,18" fill="#e0f7fa" opacity="0.8" />
    <polygon points="75,0 85,0 80,28" fill="#caf0f8" opacity="0.9" />

    <!-- Giant Ice Crystal Snowflake in center -->
    <g transform="translate(50, 56) scale(0.85)">
      <!-- Central core -->
      <circle cx="0" cy="0" r="4" fill="#ffffff" />
      <!-- Spikes (6 axes) -->
      <g id="crystalSpike">
        <line x1="0" y1="0" x2="0" y2="-20" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
        <path d="M -4,-12 L 0,-16 L 4,-12" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" />
        <path d="M -2,-6 L 0,-9 L 2,-6" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" />
      </g>
      <g transform="rotate(60)">
        <use href="#crystalSpike" />
      </g>
      <g transform="rotate(120)">
        <use href="#crystalSpike" />
      </g>
      <g transform="rotate(180)">
        <use href="#crystalSpike" />
      </g>
      <g transform="rotate(240)">
        <use href="#crystalSpike" />
      </g>
      <g transform="rotate(300)">
        <use href="#crystalSpike" />
      </g>
    </g>

    <!-- Twinkling snow particles -->
    <circle cx="22" cy="35" r="1.5" fill="#ffffff" opacity="0.9" />
    <circle cx="78" cy="42" r="1.2" fill="#ffffff" opacity="0.8" />
    <circle cx="35" cy="50" r="1.0" fill="#ffffff" opacity="0.75" />
    <circle cx="65" cy="65" r="1.5" fill="#ffffff" opacity="0.85" />
  </g>
</svg>
    `;
  }

  private getVolcanoWorldIconSvg(width: string, height: string): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 8px rgba(255,69,0,0.6));" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="volcanoBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#140505" />
      <stop offset="100%" stop-color="#3a0808" />
    </linearGradient>
    <linearGradient id="lavaRiverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff3d00" />
      <stop offset="50%" stop-color="#ffd600" />
      <stop offset="100%" stop-color="#ff3d00" />
    </linearGradient>
    <linearGradient id="eruptionGrad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#ff3d00" />
      <stop offset="60%" stop-color="#ff9100" />
      <stop offset="100%" stop-color="#ffd600" stop-opacity="0" />
    </linearGradient>
  </defs>

  <clipPath id="circleClipVolcano">
    <circle cx="50" cy="50" r="46" />
  </clipPath>

  <!-- Glow Ring -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#ff3d00" stroke-width="2.5" opacity="0.8" />
  <circle cx="50" cy="50" r="46" fill="url(#volcanoBgGrad)" />

  <g clip-path="url(#circleClipVolcano)">
    <!-- Volcanic Peak Silhouette in center background -->
    <polygon points="15,85 50,35 85,85" fill="#1e0b0b" stroke="#000000" stroke-width="1" />
    <!-- Crag highlight / shadow split -->
    <polygon points="50,35 50,85 85,85" fill="#0d0404" />

    <!-- Lava Eruption plume -->
    <path d="M 46,36 Q 50,15 42,12 Q 50,22 50,35" fill="none" stroke="url(#eruptionGrad)" stroke-width="3" stroke-linecap="round" />
    <path d="M 54,36 Q 50,15 58,12 Q 50,22 50,35" fill="none" stroke="url(#eruptionGrad)" stroke-width="3" stroke-linecap="round" />
    <!-- Exploding sparks from eruption -->
    <circle cx="42" cy="12" r="1.5" fill="#ffd600" />
    <circle cx="58" cy="12" r="1.2" fill="#ffd600" />
    <circle cx="50" cy="8" r="1.8" fill="#ff9100" />

    <!-- Lava flow channels down the mountain face -->
    <path d="M 50,38 L 47,55 L 40,70 L 35,85" fill="none" stroke="#ff3d00" stroke-width="2" stroke-linecap="round" opacity="0.85" />
    <path d="M 50,38 L 53,52 L 60,68 L 65,85" fill="none" stroke="#ff9100" stroke-width="1.8" stroke-linecap="round" opacity="0.85" />

    <!-- Basalt Ground / Lava River at bottom -->
    <rect x="-5" y="80" width="110" height="25" fill="#1c0707" />
    <path d="M -5,82 Q 25,74 50,82 T 105,80" fill="none" stroke="url(#lavaRiverGrad)" stroke-width="4.5" />
    <path d="M -5,82 Q 25,74 50,82 T 105,80" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6" />

    <!-- Sharp basalt rocky spires in foreground -->
    <polygon points="2,85 10,65 18,85" fill="#0c0303" />
    <polygon points="82,85 90,62 98,85" fill="#0c0303" />

    <!-- Flying burning embers rising up -->
    <circle cx="20" cy="45" r="1.2" fill="#ff3d00" opacity="0.9" />
    <circle cx="28" cy="30" r="0.9" fill="#ff9100" opacity="0.8" />
    <circle cx="75" cy="50" r="1.5" fill="#ff3d00" opacity="0.85" />
    <circle cx="82" cy="35" r="1.0" fill="#ffd600" opacity="0.75" />
  </g>
</svg>
    `;
  }

  private getSpaceWorldIconSvg(width: string, height: string): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 8px rgba(101,31,255,0.6));" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="spaceBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#02000a" />
      <stop offset="60%" stop-color="#090518" />
      <stop offset="100%" stop-color="#140a2b" />
    </linearGradient>
    <radialGradient id="nebulaGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.6" />
      <stop offset="60%" stop-color="#ec4899" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="planetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06b6d4" />
      <stop offset="70%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9" />
      <stop offset="50%" stop-color="#a855f7" stop-opacity="0.5" />
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0" />
    </linearGradient>
  </defs>

  <clipPath id="circleClipSpace">
    <circle cx="50" cy="50" r="46" />
  </clipPath>

  <!-- Glow Ring -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#a855f7" stroke-width="2.5" opacity="0.8" />
  <circle cx="50" cy="50" r="46" fill="url(#spaceBgGrad)" />

  <g clip-path="url(#circleClipSpace)">
    <!-- Swirling Nebula background -->
    <circle cx="60" cy="40" r="45" fill="url(#nebulaGlow)" />
    <circle cx="35" cy="65" r="35" fill="url(#nebulaGlow)" opacity="0.7" />

    <!-- Distant Stars (Twinkling dots) -->
    <circle cx="15" cy="25" r="0.8" fill="#ffffff" opacity="0.9" />
    <circle cx="85" cy="20" r="1.2" fill="#ffffff" opacity="0.95" />
    <circle cx="28" cy="75" r="0.6" fill="#ffffff" opacity="0.6" />
    <circle cx="78" cy="72" r="1.0" fill="#ffffff" opacity="0.8" />
    <circle cx="48" cy="18" r="0.7" fill="#ffffff" opacity="0.85" />
    <circle cx="18" cy="58" r="1.0" fill="#ffffff" opacity="0.75" />

    <!-- Planet with rings in center -->
    <g transform="translate(50, 50)">
      <!-- Back ring section -->
      <ellipse cx="0" cy="0" rx="34" ry="10" fill="none" stroke="url(#ringGrad)" stroke-width="5" transform="rotate(-15)" opacity="0.5" />
      
      <!-- Planet Sphere -->
      <circle cx="0" cy="0" r="18" fill="url(#planetGrad)" stroke="#1e3a8a" stroke-width="0.8" />
      <!-- Shadow overlay on planet -->
      <path d="M 0,-18 A 18,18 0 0,1 18,0 A 18,18 0 0,1 0,18 A 18,18 0 0,0 0,-18 Z" fill="#030712" opacity="0.45" />

      <!-- Front ring section -->
      <path d="M -32.8, 8.5 C -15.5, 17.5 15.5, 17.5 32.8, 8.5" fill="none" stroke="url(#ringGrad)" stroke-width="5" transform="rotate(-15)" />
      
      <!-- Tiny Moon orbiting planet -->
      <circle cx="-25" cy="-10" r="3" fill="#cbd5e1" stroke="#475569" stroke-width="0.5" />
    </g>

    <!-- Drifting Asteroid Silhouettes -->
    <polygon points="12,78 18,74 20,80 15,84 10,81" fill="#334155" opacity="0.8" />
    <polygon points="84,35 88,31 92,34 90,40 85,38" fill="#475569" opacity="0.85" />
  </g>
</svg>
    `;
  }

  private getHeavenWorldIconSvg(width: string, height: string): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 8px rgba(255,223,128,0.6));" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="heavenBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#bae6fd" />
      <stop offset="60%" stop-color="#e0f2fe" />
      <stop offset="100%" stop-color="#fef08a" />
    </linearGradient>
    <linearGradient id="pillarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#f8fafc" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>
    <linearGradient id="goldTrimGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#ca8a04" />
    </linearGradient>
  </defs>

  <clipPath id="circleClipHeaven">
    <circle cx="50" cy="50" r="46" />
  </clipPath>

  <!-- Glow Ring -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#fef08a" stroke-width="2.5" opacity="0.8" />
  <circle cx="50" cy="50" r="46" fill="url(#heavenBgGrad)" />

  <g clip-path="url(#circleClipHeaven)">
    <!-- Divine light rays coming from top-right -->
    <polygon points="100,0 -20,60 -20,100 100,50" fill="#ffffff" opacity="0.35" />
    <polygon points="100,0 20,100 60,100" fill="#ffffff" opacity="0.25" />

    <!-- Fluffy Heavenly Clouds -->
    <!-- Distant clouds -->
    <ellipse cx="25" cy="80" rx="30" ry="15" fill="#ffffff" opacity="0.7" />
    <ellipse cx="75" cy="82" rx="35" ry="16" fill="#ffffff" opacity="0.7" />
    <!-- Center pillar pedestal clouds -->
    <circle cx="50" cy="90" r="22" fill="#ffffff" />
    <circle cx="32" cy="88" r="15" fill="#ffffff" />
    <circle cx="68" cy="88" r="16" fill="#ffffff" />

    <!-- Ancient Greek Marble Pillar in center -->
    <g transform="translate(40, 30) scale(0.9)">
      <!-- Pillar Base Pedestal -->
      <rect x="0" y="52" width="22" height="6" rx="1" fill="url(#pillarGrad)" stroke="#94a3b8" stroke-width="0.8" />
      <rect x="2" y="48" width="18" height="4" fill="url(#pillarGrad)" stroke="#94a3b8" stroke-width="0.8" />
      <rect x="1" y="52" width="20" height="1.5" fill="url(#goldTrimGrad)" />

      <!-- Pillar Shaft -->
      <rect x="4" y="8" width="14" height="40" fill="url(#pillarGrad)" stroke="#94a3b8" stroke-width="0.8" />
      <!-- Flute line details on shaft -->
      <line x1="7" y1="8" x2="7" y2="48" stroke="#cbd5e1" stroke-width="1.2" />
      <line x1="11" y1="8" x2="11" y2="48" stroke="#cbd5e1" stroke-width="1.2" />
      <line x1="15" y1="8" x2="15" y2="48" stroke="#cbd5e1" stroke-width="1.2" />

      <!-- Pillar Capital (Top) -->
      <rect x="2" y="4" width="18" height="4" fill="url(#pillarGrad)" stroke="#94a3b8" stroke-width="0.8" />
      <path d="M 0,2 C 2,2 4,4 4,6 L 18,6 C 18,4 20,2 22,2 Z" fill="url(#pillarGrad)" stroke="#94a3b8" stroke-width="0.8" />
      <rect x="1" y="4.5" width="20" height="1.5" fill="url(#goldTrimGrad)" />
    </g>

    <!-- Foreground fluffy clouds to wrap the pillar base -->
    <ellipse cx="50" cy="95" rx="35" ry="12" fill="#f8fafc" />
    <ellipse cx="20" cy="92" rx="20" ry="10" fill="#ffffff" opacity="0.9" />
    <ellipse cx="80" cy="92" rx="20" ry="10" fill="#ffffff" opacity="0.9" />

    <!-- Golden sparkles rising up -->
    <circle cx="18" cy="45" r="1.5" fill="#fef08a" opacity="0.95" />
    <circle cx="28" cy="22" r="1.0" fill="#fef08a" opacity="0.8" />
    <circle cx="82" cy="52" r="1.5" fill="#fef08a" opacity="0.9" />
    <circle cx="72" cy="28" r="1.2" fill="#fef08a" opacity="0.8" />
    <circle cx="50" cy="15" r="1.8" fill="#fef08a" opacity="0.95" />
  </g>
</svg>
    `;
  }

  private getDesertWorldIconSvg(width: string, height: string): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 8px rgba(251,146,60,0.6));" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background desert sky gradient -->
    <linearGradient id="desertBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="60%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
    <!-- Scorching sun radial gradient -->
    <radialGradient id="desertSun" cx="50%" cy="40%" r="40%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#b45309" stop-opacity="0" />
    </radialGradient>
    <!-- Dune sandstone gradient -->
    <linearGradient id="duneGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7" />
      <stop offset="100%" stop-color="#92400e" />
    </linearGradient>
    <!-- Obelisk shadow gradient -->
    <linearGradient id="obeliskShadow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#78350f" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#78350f" stop-opacity="0" />
    </linearGradient>
  </defs>

  <clipPath id="circleClipDesert">
    <circle cx="50" cy="50" r="46" />
  </clipPath>

  <!-- Glow Ring -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#f59e0b" stroke-width="2.5" opacity="0.8" />
  <circle cx="50" cy="50" r="46" fill="url(#desertBgGrad)" />

  <g clip-path="url(#circleClipDesert)">
    <!-- Scorching Desert Sun -->
    <circle cx="50" cy="40" r="30" fill="url(#desertSun)" />

    <!-- Distant Dunes -->
    <path d="M -10,75 Q 20,60 50,72 T 110,68 L 110,105 L -10,105 Z" fill="#b45309" opacity="0.7" />

    <!-- Ancient Sandstone Obelisk / Pyramid in center -->
    <g transform="translate(42, 32) scale(0.9)">
      <!-- Base step -->
      <polygon points="0,48 18,48 16,45 2,45" fill="url(#duneGrad)" stroke="#451a03" stroke-width="0.8" />
      <!-- Main column -->
      <polygon points="4,45 14,45 12,5 6,5" fill="url(#duneGrad)" stroke="#451a03" stroke-width="0.8" />
      <!-- Top pyramidion cap -->
      <polygon points="6,5 12,5 9,0" fill="#fef08a" stroke="#ca8a04" stroke-width="0.8" />
      
      <!-- Highlight/Shadow line down the center of the obelisk -->
      <polygon points="9,0 9,45 12,45 12,5" fill="url(#obeliskShadow)" />
      
      <!-- Ancient Hieroglyphic etchings (simple patterns) -->
      <line x1="9" y1="12" x2="9" y2="40" stroke="#78350f" stroke-width="0.8" stroke-dasharray="2 3" />
    </g>

    <!-- Foreground Dunes -->
    <path d="M -10,84 Q 30,72 65,82 T 110,80 L 110,105 L -10,105 Z" fill="url(#duneGrad)" />
    <path d="M -10,90 Q 25,82 60,92 T 110,88 L 110,105 L -10,105 Z" fill="#92400e" opacity="0.5" />

    <!-- Cactus silhouette on the right side -->
    <g transform="translate(72, 60) scale(0.7)">
      <!-- Main trunk -->
      <rect x="6" y="0" width="5" height="28" rx="2.5" fill="#451a03" />
      <!-- Left arm -->
      <path d="M 6,12 H 1 C -0.5,12 -1,11 -1,9.5 V 4 H 2 V 9.5 H 6 Z" fill="#451a03" />
      <!-- Right arm -->
      <path d="M 11,16 H 16 C 17.5,16 18,15 18,13.5 V 8 H 15 V 13.5 H 11 Z" fill="#451a03" />
    </g>

    <!-- Swirling sand storm gusts (sandstorm weather) -->
    <path d="M 15,30 Q 30,22 45,28" fill="none" stroke="#fef3c7" stroke-width="1.2" opacity="0.35" stroke-linecap="round" />
    <path d="M 55,25 Q 70,30 85,22" fill="none" stroke="#fef3c7" stroke-width="1.2" opacity="0.35" stroke-linecap="round" />
    <path d="M 30,52 Q 45,45 60,48" fill="none" stroke="#fef3c7" stroke-width="1.0" opacity="0.25" stroke-linecap="round" />
  </g>
</svg>
    `;
  }



  private getCharacterIconSvg(width: string, height: string, extraStyle: string = '', idSuffix: string = 'main'): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; ${extraStyle}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="redBaseGrad-${idSuffix}" x1="40%" y1="10%" x2="60%" y2="90%">
      <stop offset="0%" stop-color="#ff3b30" />
      <stop offset="50%" stop-color="#d61a1a" />
      <stop offset="100%" stop-color="#800000" />
    </linearGradient>

    <linearGradient id="beakUpperGrad-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fff176" />
      <stop offset="50%" stop-color="#ffb300" />
      <stop offset="100%" stop-color="#ff6f00" />
    </linearGradient>

    <linearGradient id="beakLowerGrad-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffa000" />
      <stop offset="100%" stop-color="#e65100" />
    </linearGradient>

    <linearGradient id="throatGrad-${idSuffix}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="70%" stop-color="#f5f2eb" />
      <stop offset="100%" stop-color="#dfdcd6" />
    </linearGradient>
  </defs>

  <g stroke="#1a0a05" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">
    <!-- 1. CIRCULAR BASE HEAD -->
    <circle cx="46" cy="50" r="36" fill="url(#redBaseGrad-${idSuffix})" />

    <!-- 2. WHITE THROAT FEATHERS (SMOOTH AND CONFORMING TO CIRCLE) -->
    <path d="
      M 20,75
      A 36,36 0 0,0 72,75
      C 66,62 58,54 46,54
      C 34,54 26,62 20,75 Z"
      fill="url(#throatGrad-${idSuffix})" />

    <!-- 3. LOWER BEAK -->
    <path d="
      M 60,54
      Q 68,62 76,58
      Q 82,56 83,51
      Q 72,51 60,54 Z"
      fill="url(#beakLowerGrad-${idSuffix})" />

    <!-- 4. UPPER BEAK -->
    <path d="
      M 64,38
      C 72,36 82,38 88,43
      C 94,48 96,56 92,61
      Q 89,64 87,59
      C 83,54 76,52 66,52
      C 62,52 61,47 62,44
      C 63,40 63,38 64,38 Z"
      fill="url(#beakUpperGrad-${idSuffix})" />
    
    <!-- Nostril -->
    <ellipse cx="70" cy="43" rx="1.2" ry="1.8" fill="#4d1a00" stroke="none" transform="rotate(-20, 70, 43)" />

    <!-- 5. EYE -->
    <ellipse cx="54" cy="45" rx="10" ry="9.5" fill="#ffffff" />
    <ellipse cx="58" cy="46" rx="5.5" ry="5.3" fill="#121212" />
    <circle cx="60" cy="44" r="1.6" fill="#ffffff" stroke="none" />

    <!-- 6. ANGRY EYEBROW -->
    <path d="M 44,27 Q 49,23 54,26 Q 50,29 44,30 Z" fill="#121212" />
    <path d="
      M 40,36
      Q 36,31 41,27
      Q 40,35 43,37
      Q 48,36 54,36
      L 70,37
      Q 67,44 65,43
      Q 56,39 48,40
      Q 43,40 40,36 Z"
      fill="#121212" />
  </g>
</svg>
    `;
  }

  public showChestRewardPopup(chestName: string, coins: number, gems: number, unlockedCharName?: string, unlockedWorldName?: string) {
    // Remove any existing reward popup
    const existing = document.getElementById('chest-reward-modal-overlay');
    if (existing) existing.remove();

    let chestId = 3;
    let chestColor = '#ffd700';
    if (chestName.includes('Bronze')) {
      chestId = 1;
      chestColor = '#cd7f32';
    } else if (chestName.includes('Silver')) {
      chestId = 2;
      chestColor = '#c0c0c0';
    }

    const overlay = document.createElement('div');
    overlay.id = 'chest-reward-modal-overlay';
    overlay.className = 'topup-modal-overlay fade-in';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: 'Outfit', sans-serif;
    `;

    let rewardsHtml = '';
    if (coins > 0 || gems > 0) {
      rewardsHtml += `<div style="display: flex; justify-content: center; gap: 16px; margin-bottom: 20px;">`;
      if (coins > 0) {
        rewardsHtml += `
          <!-- Coins Reward -->
          <div style="
            flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(212,175,55,0.25);
            border-radius: 16px; padding: 12px 6px; display: flex; flex-direction: column; align-items: center; gap: 6px;
            box-shadow: 0 4px 12px rgba(212,175,55,0.1);
          ">
            <span style="width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 4px rgba(212,175,55,0.5));">
              ${this.getCoinIconSvg('26px', '26px', '', 'chest-reward')}
            </span>
            <span style="font-size: 14px; font-weight: 900; color: #ffe47a;">+${coins}</span>
            <span style="font-size: 7px; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase;">Gold Coins</span>
          </div>
        `;
      }
      if (gems > 0) {
        rewardsHtml += `
          <!-- Gems Reward -->
          <div style="
            flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(0,168,255,0.25);
            border-radius: 16px; padding: 12px 6px; display: flex; flex-direction: column; align-items: center; gap: 6px;
            box-shadow: 0 4px 12px rgba(0,168,255,0.1);
          ">
            <span style="font-size: 24px; filter: drop-shadow(0 0 4px rgba(0,168,255,0.5));">💎</span>
            <span style="font-size: 14px; font-weight: 900; color: #a8e5ff;">+${gems}</span>
            <span style="font-size: 7px; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase;">Cosmic Gems</span>
          </div>
        `;
      }
      rewardsHtml += `</div>`;
    }

    if (unlockedCharName) {
      rewardsHtml += `
        <!-- Character Reward -->
        <div style="
          background: rgba(255, 0, 127, 0.05); border: 1.5px solid rgba(255, 0, 127, 0.4);
          border-radius: 16px; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px;
          box-shadow: 0 4px 12px rgba(255, 0, 127, 0.2); margin-bottom: 20px;
        ">
          <span style="font-size: 28px; animation: chestFloat 2s ease-in-out infinite;">🐦</span>
          <span style="font-size: 12px; font-weight: 900; color: #ff007f; letter-spacing: 0.5px; text-transform: uppercase; text-shadow: 0 0 5px rgba(255,0,127,0.3);">${unlockedCharName}</span>
          <span style="font-size: 8px; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">New Character Unlocked!</span>
        </div>
      `;
    }

    if (unlockedWorldName) {
      rewardsHtml += `
        <!-- World Reward -->
        <div style="
          background: rgba(0, 255, 136, 0.05); border: 1.5px solid rgba(0, 255, 136, 0.4);
          border-radius: 16px; padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 4px;
          box-shadow: 0 4px 12px rgba(0, 255, 136, 0.2); margin-bottom: 20px;
        ">
          <span style="font-size: 28px; animation: chestFloat 2.5s ease-in-out infinite;">🌍</span>
          <span style="font-size: 12px; font-weight: 900; color: #00ffaa; letter-spacing: 0.5px; text-transform: uppercase; text-shadow: 0 0 5px rgba(0,255,136,0.3);">${unlockedWorldName}</span>
          <span style="font-size: 8px; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px;">New World Unlocked!</span>
        </div>
      `;
    }

    overlay.innerHTML = `
      <div class="topup-modal-card glass-card" style="
        width: 85%;
        max-width: 320px;
        background: linear-gradient(135deg, rgba(28, 10, 24, 0.96), rgba(15, 5, 12, 0.98));
        border: 2.5px solid #ffd700;
        border-radius: 24px;
        padding: 26px 20px;
        color: white;
        box-shadow: 0 0 35px rgba(255, 215, 0, 0.35);
        text-align: center;
        position: relative;
        font-family: inherit;
        animation: modalSlideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      ">
        <div style="width: 100px; height: 100px; margin: 0 auto 12px auto; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 0 10px ${chestColor}); animation: chestOpenBounce 0.6s ease-out;">
          ${this.getChestSvg(chestId, '100px', '100px', '', 'modal-chest')}
        </div>
        
        <div style="font-size: 20px; font-weight: 900; letter-spacing: 1.5px; color: #ffd700; text-shadow: 0 0 10px rgba(255,215,0,0.5); margin-bottom: 4px; text-transform: uppercase;">
          CHEST UNLOCKED!
        </div>
        <div style="font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.6); margin-bottom: 24px;">
          You successfully opened a <span style="color: #ffd700; font-weight: 900;">${chestName}</span>!
        </div>

        ${rewardsHtml}

        <button id="chest-reward-claim-btn" style="
          width: 100%;
          background: linear-gradient(180deg, #ffd700 0%, #ff8800 100%);
          border: none;
          padding: 12px;
          border-radius: 14px;
          color: black;
          font-weight: 900;
          font-size: 12px;
          font-family: inherit;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(255,136,0,0.3);
          transition: all 0.2s;
        ">
          CLAIM TREASURE 🎉
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    // Play coin collect sounds on claim button click
    const claimBtn = overlay.querySelector('#chest-reward-claim-btn');
    if (claimBtn) {
      claimBtn.addEventListener('click', () => {
        this.engine.soundManager.playCoin();
        overlay.remove();
      });
    }
  }

  private getCoinIconSvg(width: string, height: string, extraStyle: string = '', idSuffix: string = 'main'): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: block; overflow: visible; ${extraStyle}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- 3D Coin Rim Gradient (Sleek metallic gold) -->
    <linearGradient id="goldRimGrad-${idSuffix}" x1="15%" y1="15%" x2="85%" y2="85%">
      <stop offset="0%" stop-color="#fff8cc" />
      <stop offset="30%" stop-color="#ffdf00" />
      <stop offset="70%" stop-color="#cca300" />
      <stop offset="100%" stop-color="#805000" />
    </linearGradient>
    
    <!-- Coin Inner Face Gradient (Slightly darker inset for contrast) -->
    <linearGradient id="goldFaceGrad-${idSuffix}" x1="15%" y1="15%" x2="85%" y2="85%">
      <stop offset="0%" stop-color="#ffe680" />
      <stop offset="50%" stop-color="#e6b800" />
      <stop offset="100%" stop-color="#997300" />
    </linearGradient>

    <!-- Bird Logo Gradient (Bright golden metallic gold) -->
    <linearGradient id="logoGrad-${idSuffix}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="30%" stop-color="#ffea7a" />
      <stop offset="70%" stop-color="#d4af37" />
      <stop offset="100%" stop-color="#aa7c00" />
    </linearGradient>
  </defs>

  <!-- 3D Coin Extrusion (Dark base offset downwards to give thickness) -->
  <circle cx="50" cy="53" r="45" fill="#523200" />
  
  <!-- Outer Gold Rim -->
  <circle cx="50" cy="50" r="45" fill="url(#goldRimGrad-${idSuffix})" stroke="#6b4000" stroke-width="1" />
  
  <!-- Inner Coin Plate (Creating a beveled inset look) -->
  <circle cx="50" cy="50" r="38" fill="url(#goldFaceGrad-${idSuffix})" stroke="#fff8cc" stroke-width="0.8" />
  
  <!-- Dotted Inner Rim Details -->
  <circle cx="50" cy="50" r="32" fill="none" stroke="#fff8cc" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.4" />

  <!-- 3D Engraved Bird Head Logo -->
  <g transform="translate(10, 10) scale(0.8)">
    <!-- 1. Highlight / Shadow underlay (creates debossed 3D depth) -->
    <g transform="translate(1, 1.5)" opacity="0.9">
      <circle cx="44" cy="46" r="22" fill="#6b4000" />
      <path d="M 62,42 C 74,42 80,46 74,52 C 68,56 62,50 62,42 Z" fill="#6b4000" />
      <path d="M 60,48 C 70,50 72,54 66,56 C 60,58 58,51 60,48 Z" fill="#6b4000" />
      <path d="M 28,46 C 22,32 38,20 44,32 C 48,42 38,52 28,46 Z" fill="#6b4000" />
    </g>

    <!-- 2. Main Logo body overlay -->
    <g stroke="#6b4000" stroke-width="0.8" stroke-linejoin="round">
      <!-- Head -->
      <circle cx="44" cy="46" r="22" fill="url(#logoGrad-${idSuffix})" />
      <!-- Beak (Upper & Lower) -->
      <path d="M 62,42 C 74,42 80,46 74,52 C 68,56 62,50 62,42 Z" fill="url(#logoGrad-${idSuffix})" />
      <path d="M 60,48 C 70,50 72,54 66,56 C 60,58 58,51 60,48 Z" fill="url(#logoGrad-${idSuffix})" />
      <!-- Eye Inset -->
      <circle cx="48" cy="38" r="7" fill="url(#goldFaceGrad-${idSuffix})" stroke="none" />
      <circle cx="49.5" cy="38" r="3" fill="#6b4000" stroke="none" />
      <!-- Wing -->
      <path d="M 28,46 C 22,32 38,20 44,32 C 48,42 38,52 28,46 Z" fill="url(#logoGrad-${idSuffix})" />
    </g>
  </g>
</svg>
    `;
  }

}
