import { GameEngine } from '../engine/GameEngine.ts';
import type { GameState } from '../engine/GameEngine.ts';
import type { Skin } from '../systems/ProgressManager.ts';
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

    // Show banner ad in Menu and Game Over screens, hide elsewhere
    if (state === 'MENU' || state === 'GAMEOVER') {
      AdManager.showBanner();
    } else {
      AdManager.hideBanner();
    }
    
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
      this.renderReviveScreen();
    } else if (state as any === 'LEVEL_COMPLETE') {
      this.renderLevelComplete();
    } else if (state === 'DEMO_COMPLETE') {
      this.renderDemoComplete();
    }

    // Sync ad button states dynamically
    AdManager.updateAdButtonsDOM();
  }

  private updateHUDValues() {
    // 1. Score / Obstacles (using cached reference if available, otherwise query and cache it)
    if (!this.scoreEl) this.scoreEl = document.getElementById('hud-score');
    if (this.scoreEl) {
      if (this.engine.gameMode === 'level' && this.engine.activeLevelConfig) {
        this.scoreEl.innerText = `${this.engine.score} / ${this.engine.activeLevelConfig.targetScore}`;
      } else {
        this.scoreEl.innerText = this.engine.score.toString();
      }
    }

    // 1.5 Best Score (only in endless mode)
    if (this.engine.gameMode !== 'level') {
      if (!this.bestScoreEl) this.bestScoreEl = document.getElementById('hud-best-score');
      if (this.bestScoreEl) {
        const best = Math.max(this.engine.progressManager.getState().highscore, this.engine.score);
        this.bestScoreEl.innerText = `BEST: ${best}`;
      }
    }

    // 2. Ultimate Bar
    const ultActive = this.engine.ultimateActive;
    const ultPercent = Math.min(100, Math.floor(this.engine.ultimateEnergy));
    const ultReady = ultPercent >= 100;
    const skinGlow = this.engine.bird.getSkin().glowColor || '#00f3ff';
    const ultBarBg = ultReady ? `linear-gradient(90deg, #ffd700, ${skinGlow})` : skinGlow;

    if (!this.btnUltimate) {
      this.btnUltimate = document.getElementById('btn-hud-ultimate');
      if (this.btnUltimate) {
        this.ultIcon = this.btnUltimate.querySelector('.ult-icon');
        this.ultFill = this.btnUltimate.querySelector('.ult-progress-fill');
        this.ultText = this.btnUltimate.querySelector('.ult-text');
      }
    }

    if (this.btnUltimate) {
      // Toggle class lists in place
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

      if (this.ultIcon) {
        this.ultIcon.innerText = ultActive ? '⚡' : ultReady ? '🔥' : '✨';
      }

      if (this.ultFill) {
        const circumference = 157;
        const offset = circumference - (ultPercent / 100) * circumference;
        (this.ultFill as any).style.strokeDashoffset = `${offset}`;
        (this.ultFill as any).style.stroke = ultBarBg;
      }

      if (this.ultText) {
        this.ultText.innerText = ultActive ? 'ACTIVE' : ultReady ? 'READY!' : `${ultPercent}%`;
      }
    }

    // 3. Stats (Coins & Gems) - using fast innerText with emojis!
    if (!this.runStatsCoins || !this.runStatsGems) {
      const runStats = this.container.querySelector('.run-stats');
      if (runStats) {
        const statsBadges = runStats.querySelectorAll('.stat-badge');
        if (statsBadges.length >= 2) {
          this.runStatsCoins = statsBadges[0] as HTMLElement;
          this.runStatsGems = statsBadges[1] as HTMLElement;
        }
      }
    }

    if (this.runStatsCoins) {
      this.runStatsCoins.innerText = `🟡 ${this.engine.coinsCollectedThisRun}`;
    }
    if (this.runStatsGems) {
      this.runStatsGems.innerText = `💎 ${this.engine.gemsCollectedThisRun}`;
    }
    // Update squad indicator for squad survival mode
    const flockInd = this.container.querySelector('.flock-indicator') as HTMLElement;
    if (flockInd) {
      flockInd.innerText = `🪽 SQUAD: ${this.engine.flock.length}`;
    }

    // 4. Powerup timers holder (In-place updates without DOM reconstruction!)
    if (!this.powerupsHolder) {
      this.powerupsHolder = this.container.querySelector('.powerup-timers-holder');
    }
    const holder = this.powerupsHolder;
    if (holder) {
      const pList = this.engine.getActivePowerups();
      
      // Get current types in holder and next types to update
      const currentBadges = Array.from(holder.querySelectorAll('.hud-powerup-badge')) as HTMLElement[];
      const currentTypes = currentBadges.map(el => el.getAttribute('data-powerup-type') || '');
      const nextTypes = pList.map(p => p.type);

      if (currentTypes.join(',') !== nextTypes.join(',')) {
        // Powerups set has changed, regenerate HTML once
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

    // 5. Boss Health Bar (Optimized to skip queries)
    const state = this.engine.state;
    const isBossFight = state === 'BOSS_FIGHT';
    const isBossActive = this.engine.bossManager.isBossActive();

    if (!this.bossContainer) {
      this.bossContainer = this.container.querySelector('.boss-health-bar-container') as HTMLElement;
      if (this.bossContainer) {
        this.bossHealthVal = this.bossContainer.querySelector('.boss-health-val');
        this.bossHealthFill = this.bossContainer.querySelector('.boss-health-fill');
      }
    }

    if (isBossFight && isBossActive) {
      const bossHealth = this.engine.bossManager.getHealth();
      const bossMaxHealth = this.engine.bossManager.getMaxHealth();
      const bossHealthPercent = Math.max(0, Math.min(100, (bossHealth / bossMaxHealth) * 100));

      if (this.bossContainer) {
        // Just update values in place using cached elements!
        if (this.bossHealthVal) {
          this.bossHealthVal.innerText = `${bossHealth} / ${bossMaxHealth}`;
        }
        if (this.bossHealthFill) {
          this.bossHealthFill.style.width = `${bossHealthPercent}%`;
        }
      } else {
        // Boss health bar doesn't exist yet, we must do a full render to spawn it and cache references
        this.renderHUD();
      }
    } else if (this.bossContainer) {
      // Boss is defeated or gone but health bar container reference still active, reset references and do full render HUD to clear
      this.bossContainer = null;
      this.bossHealthVal = null;
      this.bossHealthFill = null;
      this.renderHUD();
    }

    // 5.5 Player HP Hearts (In-place updates)
    const showHP = (isBossFight || state === 'BOSS_WARNING') && this.engine.gameMode === 'flock' && this.engine.playerBossHP > 0;
    if (showHP) {
      if (!this.playerHPContainer) {
        this.playerHPContainer = this.container.querySelector('.player-hud-hp-container');
      }
      if (this.playerHPContainer) {
        const heartsSpan = this.playerHPContainer.querySelector('.player-hud-hp-hearts') as HTMLElement;
        if (heartsSpan) {
          const hp = this.engine.playerBossHP;
          const maxHp = this.engine.maxPlayerBossHP || hp;
          const hearts = '❤️'.repeat(hp);
          
          const fontSize = Math.max(10, 16 - Math.max(0, maxHp - 5) * 0.4);
          const letterSpacing = Math.max(0.5, 2.5 - Math.max(0, maxHp - 5) * 0.15);
          const paddingX = Math.max(10, 18 - Math.max(0, maxHp - 5) * 0.6);
          
          if (heartsSpan.innerText !== hearts) {
            heartsSpan.innerText = hearts;
          }
          heartsSpan.style.fontSize = `${fontSize}px`;
          heartsSpan.style.letterSpacing = `${letterSpacing}px`;
          this.playerHPContainer.style.padding = `6px ${paddingX}px`;
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
      this.renderHUD();
    }

    // 5.8. Ultimate Duration Bar In-place updates
    const isUltActive = this.engine.ultimateActive;
    const hasUltBar = !!document.querySelector('.ultimate-duration-bar-container');
    if (isUltActive !== hasUltBar) {
      this.renderHUD();
      return;
    }

    if (isUltActive) {
      const barContainer = this.container.querySelector('.ultimate-duration-bar-container') as HTMLElement;
      if (barContainer) {
        const fill = barContainer.querySelector('.ultimate-duration-bar-fill') as HTMLElement;
        if (fill) {
          const pct = Math.max(0, Math.min(100, (this.engine.ultimateDurationLeft / this.engine.ultimateMaxDuration) * 100));
          fill.style.width = `${pct}%`;
        }
      }
    }

    // 6. Booster System HUD Overlay In-place updates
    const isBoosterActive = this.engine.boosterActive;
    const hasBoosterOverlay = !!document.querySelector('.hud-booster-overlay');
    if (isBoosterActive !== hasBoosterOverlay) {
      this.renderHUD();
      return;
    }

    if (isBoosterActive) {
      const overlayEl = this.container.querySelector('.hud-booster-overlay') as HTMLElement;
      if (overlayEl) {
        const timerText = overlayEl.querySelector('.hud-booster-title') as HTMLElement;
        const barInner = overlayEl.querySelector('.hud-booster-fill') as HTMLElement;
        if (timerText) {
          timerText.innerText = `⚡ HYPER BOOST: ${this.engine.boosterTimer.toFixed(1)}s`;
        }
        if (barInner) {
          const bPct = Math.max(0, Math.min(100, (this.engine.boosterTimer / 1.0) * 100));
          barInner.style.width = `${bPct}%`;
        }
      }
    }

    // 7. Booster Static Cooldown Button In-place updates in Endless Mode
    if (this.engine.gameMode !== 'level') {
      const boosterBtn = document.getElementById('btn-hud-booster');
      if (boosterBtn) {
        const bTimer = this.engine.boosterSpawnTimer;
        const bReady = bTimer <= 0;
        const bPercent = Math.min(100, Math.floor((1 - bTimer / 5.0) * 100));

        // Toggle ready states in place
        if (bReady) {
          boosterBtn.classList.add('ult-ready-pulse');
          boosterBtn.style.border = '2px solid #ffd700';
          boosterBtn.style.background = 'rgba(255,215,0,0.12)';
          boosterBtn.style.boxShadow = '0 0 15px rgba(255,215,0,0.4)';
          boosterBtn.style.opacity = '1';
          
          const icon = boosterBtn.querySelector('span');
          if (icon && icon.innerText !== '⚡') {
            icon.innerText = '⚡';
            icon.style.textShadow = '0 0 8px #ffd700';
          }
        } else {
          boosterBtn.classList.remove('ult-ready-pulse');
          boosterBtn.style.border = '2px solid rgba(255,255,255,0.2)';
          boosterBtn.style.background = 'rgba(255,255,255,0.03)';
          boosterBtn.style.boxShadow = 'none';
          boosterBtn.style.opacity = '0.65';

          const icon = boosterBtn.querySelector('span');
          if (icon && icon.innerText !== '⏳') {
            icon.innerText = '⏳';
            icon.style.textShadow = 'none';
          }
        }

        const progressFill = boosterBtn.querySelector('.booster-progress-fill') as HTMLElement;
        if (progressFill) {
          const circumference = 157;
          const offset = circumference - (bPercent / 100) * circumference;
          progressFill.style.strokeDashoffset = `${offset}`;
        }
      }
    }

    // 8. Flock Merge Button updates in Squad Survival mode
    if (this.engine.gameMode === 'flock') {
      const flockMergeBtn = document.getElementById('btn-hud-flock-merge');
      if (flockMergeBtn) {
        const flockLen = this.engine.flock.length;
        const visible = flockLen >= 2;
        flockMergeBtn.style.display = visible ? 'flex' : 'none';
        
        if (visible) {
          const label = flockMergeBtn.querySelector('.flock-merge-label') as HTMLElement;
          if (label) {
            label.innerText = `MERGE (+${flockLen})`;
          }
        }
      }
    }
  }

  private renderPreloader() {
    const progress = this.engine.progressManager.getState();
    const worldId = progress.activeWorld;

    const worldNames: Record<string, string> = {
      jungle:     'AMAZON RAINFOREST',
      jungle_temple: 'SUNNY JUNGLE VALLEY',
      ice:        'FROZEN ICE KINGDOM',
      desert:     'DESERT RUINS',
      volcano:    'VOLCANIC SPRING',
      space:      'COSMIC MEADOW',
      underwater: 'DEEP UNDERWATER',
      heaven:     'HEAVEN CLOUD KINGDOM',
      retro:      'RETRO WORLD'
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

    // Floating items around bird
    const floaties = [
      { emoji: '🪙', dur: '5s', delay: '0s' },
      { emoji: '💎', dur: '7s', delay: '-2s' },
      { emoji: '⭐', dur: '6s', delay: '-3.5s' },
    ];
    const floatiesHtml = floaties.map(f =>
      `<div class="bird-floaty" style="animation-duration:${f.dur};animation-delay:${f.delay}">${f.emoji}</div>`
    ).join('');

    const menuHTML = `
      <div class="screen menu-screen fade-in">

        <!-- World reactive background overlay -->
        <div class="menu-world-bg world-bg-${worldId}"></div>

        <!-- Ambient CSS floating particles -->
        <div class="menu-particles">${particlesHtml}</div>

        <!-- ===== TOP BAR ===== -->
        <div class="menu-top-bar">
          <div class="top-bar-currencies">
            <div class="top-bar-coin" id="btn-coin-topup" style="position: relative; cursor: pointer;">
              <span class="top-bar-coin-icon">🪙</span>${progress.coins.toLocaleString()}
              <button class="top-bar-add-btn" id="btn-plus-coins" title="Watch ad for +500 Coins">+</button>
            </div>
            <div class="top-bar-gem" id="btn-gem-topup" style="position: relative; cursor: pointer;">
              <span class="top-bar-gem-icon">💎</span>${progress.gems.toLocaleString()}
              <button class="top-bar-add-btn" id="btn-plus-gems" title="Watch ad for +10 Gems">+</button>
            </div>
            <button class="top-bar-settings-btn" id="btn-open-settings">⚙️</button>
          </div>
        </div>

        <!-- ===== CENTER STAGE ===== -->
        <div class="center-stage">

          <!-- Left side panel -->
          <div class="side-panel-left">
            <button class="side-btn" id="side-btn-skins">
              ${this.getCharacterIconSvg('55px', '55px', 'margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(0, 243, 255, 0.5));', 'home')}
              <span class="side-btn-label">CHARACTERS</span>
            </button>
            <button class="side-btn" id="side-btn-worlds">
              ${this.getWorldsIconSvg('55px', '55px', 'margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(123, 47, 255, 0.5));', 'home')}
              <span class="side-btn-label">WORLDS</span>
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
            <button class="side-btn" id="side-btn-rewards" style="width: 89px !important; height: 86px !important; margin-bottom: 8px; border-radius: 20px;">
              <div class="side-btn-badge">!</div>
              ${this.getRewardBoxSvg('55px', '55px', 'margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(255, 170, 0, 0.5));', 'home')}
              <span class="side-btn-label" style="font-size: 9.5px;">REWARDS</span>
            </button>
            <button class="side-btn" id="side-btn-powerups" style="width: 89px !important; height: 86px !important; border-radius: 20px;">
              <div style="font-size: 38px; line-height: 55px; height: 55px; margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(0, 243, 255, 0.6)); display: flex; align-items: center; justify-content: center;">🔮</div>
              <span class="side-btn-label" style="font-size: 9.5px;">UPGRADES</span>
            </button>
          </div>
        </div>

        <!-- ===== WORLD PLATFORM + START FLY ===== -->
        <div class="world-platform-area">
          <div class="platform-base">
            <div class="platform-glow-ring"></div>

            <div style="display: flex; gap: 8px; width: 100%; margin-bottom: 6px; margin-top: 8px; transform: translateY(50px);">
              <button class="start-fly-btn" id="btn-start-game" style="flex: 1; padding: 12px 10px; font-size: 16px;">
                <span>ENDLESS</span>
                <span class="start-fly-wing">🪶</span>
              </button>
              <button class="start-fly-btn" id="btn-open-levels" style="flex: 1; padding: 12px 10px; font-size: 16px; background: linear-gradient(180deg, #b35dfb 0%, #7b2fff 50%, #5200b3 100%); box-shadow: 0 6px 0 #3a0082, 0 8px 20px rgba(123,47,255,0.4);">
                <span>LEVELS</span>
                <span class="start-fly-wing">🏆</span>
              </button>
            </div>
            <button class="spectator-btn-small" id="btn-spectator" style="transform: translateY(50px);">🤖 SPECTATOR AUTO-PILOT</button>
          </div>
        </div>

      </div>
    `;

    this.container.innerHTML = menuHTML;
    this.bindMenuEvents();
    this.drawSkinPreviews();
  }

  public drawSkinPreviews() {
    // 1. Draw main menu bird canvas if present
    const mainCanvas = document.getElementById('main-menu-bird-canvas') as HTMLCanvasElement | null;
    if (mainCanvas) {
      const activeSkin = this.engine.progressManager.getActiveSkinInfo();
      const ctx = mainCanvas.getContext('2d');
      if (ctx) {
        this.engine.bird.renderPreview(ctx, mainCanvas.width, mainCanvas.height, activeSkin, true);
      }
    }

    // 3. Draw skins tab spotlight preview canvas if present
    const spotlightCanvas = this.container.querySelector('#spotlight-skin-canvas') as HTMLCanvasElement | null;
    if (spotlightCanvas) {
      const activeSkin = this.engine.progressManager.getActiveSkinInfo();
      const ctx = spotlightCanvas.getContext('2d');
      if (ctx) {
        this.engine.bird.renderPreview(ctx, spotlightCanvas.width, spotlightCanvas.height, activeSkin);
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
        
        this.engine.bird.renderPreview(ctx, canvas.width, canvas.height, skin);
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
      levels:       { icon: '🏆', title: 'LEVEL SELECT MODE',    color: '#7b2fff', heroIcon: '🏆', heroSubtitle: 'Complete all 50 transforming levels!' },
      powerups:     { icon: `<span style="font-size: 24px; vertical-align: middle; display: inline-block;">🔮</span>`, title: 'POWERUP UPGRADE LAB',   color: '#00f3ff', heroIcon: `<span style="font-size: 72px; display: inline-block; animation: floatBird 4s ease-in-out infinite;">🔮</span>`, heroSubtitle: 'Upgrade bubble durations & effectiveness' }
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
          ${this.activeTab !== 'rewards' ? `<div class="tab-spotlight-label" style="color:${meta.color}">${meta.title}</div>` : ''}
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
          const upgradeCost = Math.floor(s.costCoins * 0.4 * s.upgradeLevel) || (s.id === 'default' ? 200 * s.upgradeLevel : 500);

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
                ${s.abilityDesc ? `<div style="font-size:8px;color:rgba(230,200,255,0.8);line-height:1.4;padding:0 4px;">${s.abilityDesc}</div>` : '<div style="font-size:8px;color:rgba(230,200,255,0.6);">No special ability.</div>'}
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
          jungle: '#00c853', jungle_temple: '#2e7d32', ice: '#40c4ff',
          desert: '#ffab40', volcano: '#ff3d00', space: '#651fff',
          heaven: '#ffd740'
        };
        const worlds = [
          { id: 'jungle',     name: 'AMAZON RAINFOREST', emoji: '🌴' },
          { id: 'jungle_temple', name: 'SUNNY JUNGLE VALLEY', emoji: '🛕' },
          { id: 'ice',        name: 'FROZEN ICE KINGDOM',   emoji: '❄️' },
          { id: 'desert',     name: 'DESERT RUINS', emoji: '🏜️' },
          { id: 'volcano',    name: 'VOLCANIC SPRING',      emoji: '🌋' },
          { id: 'space',      name: 'COSMIC MEADOW',        emoji: '🌌' },
          { id: 'heaven',     name: 'HEAVEN CLOUD KINGDOM', emoji: '🌤️' }
        ];
        const worldsCards = worlds.map(w => {
          const isActive = progress.activeWorld === w.id;
          const wc = worldColors[w.id] || '#fff';
          
          let iconHtml = `<div class="world-icon" style="font-size:50px">${w.emoji}</div>`;
          if (w.id === 'jungle') {
            iconHtml = this.getJungleWorldIconSvg('58px', '58px');
          } else if (w.id === 'jungle_temple') {
            iconHtml = this.getJungleTempleWorldIconSvg('58px', '58px');
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

          return `
            <div class="world-card glass-card ${isActive ? 'selected-border' : ''}" data-world-id="${w.id}"
                 style="${isActive ? `box-shadow: 0 0 0 2px ${wc}, 0 0 18px ${wc}44; background:${wc}12;` : ''}"
            >
              ${iconHtml}
              <div style="flex:1;min-width:0">
                <div class="world-name">
                  ${w.name}
                  ${isActive ? `<span style="color:${wc};font-size:9px;margin-left:6px;font-weight:800">● ACTIVE</span>` : ''}
                </div>
              </div>
              ${isActive ? '' : `<div style="font-size:18px;color:rgba(255,255,255,0.25)">›</div>`}
            </div>
          `;
        }).join('');
        return `
          <div class="vertical-scroll">${worldsCards}</div>
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
                    <span>💰+${q.rewardCoins}</span>
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
                    <div class="quest-desc" style="font-weight: 800; font-size: 11px; color: #fff;">Watch an ad to get 500 Coins & 10 Gems instantly!</div>
                  </div>
                  <div style="display: flex; align-items: center; justify-content: flex-end;">
                    <button class="btn-quest-claim" id="btn-extra-rewards" style="background: linear-gradient(135deg, #ffaa00, #ff7700); border: none; font-size: 10px; font-weight: 800; padding: 6px 12px; border-radius: 8px; cursor: pointer; color: white;">
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
        const starsMap = progress.levelModeStars || {};

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
            const isLocked = false;
            const starsCount = starsMap[lvl.levelNum] || 0;
            
            let starHtml = '';
            for (let s = 1; s <= 3; s++) {
              starHtml += `<span class="level-select-star ${s <= starsCount ? 'filled' : ''}">★</span>`;
            }

            const worldEmojis: Record<string, string> = {
              jungle: '🌴', jungle_temple: '🛕', ice: '❄️', volcano: '🌋', space: '🌌', heaven: '🌤️', desert: '🏜️'
            };
            
            let emojiHtml = `<div class="level-emoji-label" style="font-size:20px; margin:2px 0;">${worldEmojis[lvl.worldId] || '🐦'}</div>`;
            if (lvl.worldId === 'jungle') {
              emojiHtml = `<div class="level-emoji-label" style="display:flex; justify-content:center; align-items:center; height:25px; margin:2px 0;">${this.getJungleWorldIconSvg('25px', '25px')}</div>`;
            } else if (lvl.worldId === 'jungle_temple') {
              emojiHtml = `<div class="level-emoji-label" style="display:flex; justify-content:center; align-items:center; height:25px; margin:2px 0;">${this.getJungleTempleWorldIconSvg('25px', '25px')}</div>`;
            } else if (lvl.worldId === 'ice') {
              emojiHtml = `<div class="level-emoji-label" style="display:flex; justify-content:center; align-items:center; height:25px; margin:2px 0;">${this.getIceWorldIconSvg('25px', '25px')}</div>`;
            } else if (lvl.worldId === 'volcano') {
              emojiHtml = `<div class="level-emoji-label" style="display:flex; justify-content:center; align-items:center; height:25px; margin:2px 0;">${this.getVolcanoWorldIconSvg('25px', '25px')}</div>`;
            } else if (lvl.worldId === 'space') {
              emojiHtml = `<div class="level-emoji-label" style="display:flex; justify-content:center; align-items:center; height:25px; margin:2px 0;">${this.getSpaceWorldIconSvg('25px', '25px')}</div>`;
            } else if (lvl.worldId === 'heaven') {
              emojiHtml = `<div class="level-emoji-label" style="display:flex; justify-content:center; align-items:center; height:25px; margin:2px 0;">${this.getHeavenWorldIconSvg('25px', '25px')}</div>`;
            } else if (lvl.worldId === 'desert') {
              emojiHtml = `<div class="level-emoji-label" style="display:flex; justify-content:center; align-items:center; height:25px; margin:2px 0;">${this.getDesertWorldIconSvg('25px', '25px')}</div>`;
            }

            return `
              <div class="level-select-card glass-card ${isLocked ? 'locked' : 'unlocked'}" 
                   data-level-num="${lvl.levelNum}"
              >
                ${isLocked 
                  ? `<div class="level-lock-icon">🔒</div>`
                  : `
                    <div class="level-num-label">${lvl.levelNum}</div>
                    ${emojiHtml}
                    <div class="level-select-stars">${starHtml}</div>
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
          <div class="tab-sheet-title">🏆 SELECT A LEVEL TO START</div>
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
                <div class="quest-desc">${p.desc}</div>
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
            <div class="hangar-section-title">🧪 POWERUP BUBBLE UPGRADES</div>
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

            <!-- Difficulty segmented control -->
            <div class="control-group" style="margin-bottom: 24px;">
              <div class="segment-label" style="font-size: 11px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,0.4); margin-bottom: 10px; text-transform: uppercase;">SELECT DIFFICULTY</div>
              <div class="segmented-control" style="display: flex; gap: 8px; background: rgba(0,0,0,0.25); padding: 4px; border-radius: 14px;">
                <button class="segment-btn diff-easy ${progress.selectedDifficulty === 'easy' ? 'active' : ''}" data-diff="easy" style="flex: 1; padding: 10px; border: none; border-radius: 10px; font-family: var(--font-family); font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; background: transparent; transition: all 0.2s ease;">Easy</button>
                <button class="segment-btn diff-medium ${progress.selectedDifficulty === 'medium' ? 'active' : ''}" data-diff="medium" style="flex: 1; padding: 10px; border: none; border-radius: 10px; font-family: var(--font-family); font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; background: transparent; transition: all 0.2s ease;">Medium</button>
                <button class="segment-btn diff-hard ${progress.selectedDifficulty === 'hard' ? 'active' : ''}" data-diff="hard" style="flex: 1; padding: 10px; border: none; border-radius: 10px; font-family: var(--font-family); font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; background: transparent; transition: all 0.2s ease;">Hard</button>
              </div>
            </div>

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
              <button class="share-btn-platform" id="btn-share-system" style="width: 100%; padding: 14px; border: none; border-radius: 12px; font-family: var(--font-family); font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; background: linear-gradient(135deg, #a855f7, #6366f1); display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25);">
                <span style="font-size: 16px;">📤</span>
                <span>SHARE GAME LINK</span>
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
        <div style="font-size: 18px; font-weight: 900; letter-spacing: 1.5px; color: #ffd700; text-shadow: 0 0 10px rgba(255,215,0,0.4); margin-bottom: 4px; margin-top: 6px;">
          🎁 FREE REWARDS 🎁
        </div>
        <div style="font-size: 10px; font-weight: 800; color: #00f3ff; margin-bottom: 16px; text-shadow: 0 0 8px rgba(0,243,255,0.35); display: flex; align-items: center; justify-content: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px;">
          📺 WATCH ADS, GET REWARD!
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
            <div style="font-size: 14px; font-weight: 900; color: #ffe47a;">
              🪙 +500 Coins
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
              ${onCooldown ? 'COOLING' : 'WATCH AD 📺'}
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
            <div style="font-size: 14px; font-weight: 900; color: #a8e5ff;">
              💎 +10 Gems
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
              ${onCooldown ? 'COOLING' : 'WATCH AD 📺'}
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
            this.engine.progressManager.addCoins(500);
            this.engine.progressManager.updateQuestProgress('watch_ads', 1);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('COINS CLAIMED! 🪙', 'You received 500 Coins!');
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
            this.engine.progressManager.addGems(10);
            this.engine.progressManager.updateQuestProgress('watch_ads', 1);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('GEMS CLAIMED! 💎', 'You received 10 Gems!');
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

    // Back to main landing page
    bindClick('btn-back-main', () => {
      sm.playUIBack();
      this.activeTab = 'main';
      this.render();
    });

    bindClick('btn-settings-back', () => {
      sm.playUIBack();
      this.activeTab = 'main';
      this.render();
    });
    bindClick('btn-settings-back-icon', () => {
      sm.playUIBack();
      this.activeTab = 'main';
      this.render();
    });

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

    // Difficulty selection buttons
    const diffBtns = this.container.querySelectorAll('.segmented-control [data-diff]');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sm.playUISelect();
        const diff = (btn as HTMLElement).getAttribute('data-diff') as 'easy' | 'medium' | 'hard';
        if (diff) {
          this.engine.progressManager.getState().selectedDifficulty = diff;
          this.engine.progressManager.save();
          
          // Update active bird physics difficulty dynamically
          this.engine.bird.setDifficulty(diff);
          
          this.showToastNotification('DIFFICULTY SET', `Difficulty changed to ${diff.toUpperCase()}!`);
          this.render();
        }
      });
    });

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
          // Calculate rewards
          const gainedCoins = Math.floor(Math.random() * (ch.maxCoins - ch.minCoins + 1)) + ch.minCoins;
          const gainedGems = Math.floor(Math.random() * (ch.maxGems - ch.minGems + 1)) + ch.minGems;

          // Save claims count
          const nextClaims = status.claims + 1;
          localStorage.setItem(`flight_of_legends_chest_${ch.id}_claims`, nextClaims.toString());

          // Apply rewards
          this.engine.progressManager.addCoins(gainedCoins);
          this.engine.progressManager.addGems(gainedGems);
          this.engine.progressManager.save();

          // Rerender and show reward popup
          this.render();
          this.showChestRewardPopup(ch.name, gainedCoins, gainedGems);
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
    bindClick('btn-spectator', () => {
      sm.playUIClick();
      this.engine.gameMode = 'endless';
      this.engine.isSpectatorMode = true;
      this.engine.startGame();
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
          this.showToastNotification('BIRD SELECTED! ✨', `${skin.name} is now your active bird!`);
          setTimeout(() => { this.activeTab = 'main'; this.render(); }, 400);
        } else {
          // Attempt auto-buy when tapping a locked card
          sm.playUIClick();
          const res = this.engine.progressManager.buySkin(skinId);
          if (res.success) {
            this.showToastNotification('PURCHASE SUCCESSFUL 🎉', `${skin.name} unlocked and selected!`);
            this.engine.progressManager.selectSkin(skinId);
            setTimeout(() => { this.activeTab = 'main'; this.render(); }, 500);
          } else {
            this.showToastNotification('LOCKED SKIN 🔒', res.msg); // E.g. Insufficient coins
          }
        }
      });
    });

    const buyBtns = this.container.querySelectorAll('.btn-buy-skin');
    buyBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sm.playUIClick();
        const id = (btn as HTMLElement).getAttribute('data-id') || '';
        const res = this.engine.progressManager.buySkin(id);
        this.showToastNotification(res.success ? 'PURCHASE SUCCESSFUL 🎉' : 'PURCHASE FAILED', res.msg);
        if (res.success) {
          setTimeout(() => { this.activeTab = 'main'; this.render(); }, 600);
        } else {
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
        const skin = this.engine.progressManager.getSkins().find((s: Skin) => s.id === id);
        this.showToastNotification('BIRD SELECTED! ✨', `${skin?.name || 'Skin'} is now your active bird!`);
        setTimeout(() => { this.activeTab = 'main'; this.render(); }, 550);
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
        } else {
          sm.playUIClick();
        }
        this.showToastNotification(res.success ? 'UPGRADE SUCCESSFUL ⬆' : 'UPGRADE FAILED', res.msg);
        this.render();
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

    // Worlds selection → tap card → instant redirect home with new world
    const worldCards = this.container.querySelectorAll('.world-card[data-world-id]');
    worldCards.forEach(card => {
      card.addEventListener('click', () => {
        sm.playUISelect();
        const id = (card as HTMLElement).getAttribute('data-world-id') || '';
        if (!id) return;
        this.engine.progressManager.setWorld(id);
        this.engine.renderer.setWeather(id);
        const worldName = (card.querySelector('.world-name') as HTMLElement)?.textContent?.trim() || id;
        this.showToastNotification('🌍 WORLD SELECTED!', `${worldName.replace('● ACTIVE', '').trim()} is now your battlefield!`);
        setTimeout(() => { this.activeTab = 'main'; this.render(); }, 450);
      });
    });

    // Extra Rewards Ad Button
    const btnExtraRewards = document.getElementById('btn-extra-rewards');
    if (btnExtraRewards) {
      btnExtraRewards.addEventListener('click', (e) => {
        e.stopPropagation();
        AdManager.showEconomyRewarded((success) => {
          if (success) {
            this.engine.progressManager.addCoins(500);
            this.engine.progressManager.addGems(10);
            this.engine.progressManager.updateQuestProgress('watch_ads', 1);
            this.engine.progressManager.save();
            this.render();
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

      const gameUrl = window.location.origin + window.location.pathname + `?ref=${shareToken}`;
      const text = `Hey! Play Floppy Bird Pipes: Flight of Legends with me here: ${gameUrl}`;
      
      let shareUrl = '';
      let needsClipboard = false;
      
      if (platform === 'WhatsApp') {
        shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      } else if (platform === 'Messenger') {
        shareUrl = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(gameUrl)}&app_id=123456789&redirect_uri=${encodeURIComponent(gameUrl)}`;
      } else if (platform === 'System') {
        if (navigator.share) {
          navigator.share({
            title: 'Flight of Legends',
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
    const pList = this.engine.getActivePowerups();
    const highscore = this.engine.progressManager.getState().highscore;
    
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
      jungle_temple: 'Sentinel Golem Mask',
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

    let boosterOverlayHTML = '';
    if (this.engine.boosterActive) {
      const bPct = Math.max(0, Math.min(100, (this.engine.boosterTimer / 1.0) * 100));
      boosterOverlayHTML = `
        <div class="hud-booster-overlay fade-in glass-card" style="position: absolute; top: 85px; left: 50%; transform: translateX(-50%); padding: 10px 24px; border-radius: 12px; border: 2px solid #ffd700; background: rgba(20, 15, 0, 0.85); box-shadow: 0 0 20px rgba(255, 215, 0, 0.45); display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; z-index: 100;">
          <div class="hud-booster-title" style="font-family: 'Outfit', sans-serif; font-size: 18px; font-weight: 900; color: #ffd700; text-shadow: 0 0 8px rgba(255, 215, 0, 0.6); display: flex; align-items: center; gap: 8px;">
            ⚡ HYPER BOOST: ${this.engine.boosterTimer.toFixed(1)}s
          </div>
          <div style="width: 140px; height: 6px; background: rgba(255, 255, 255, 0.15); border-radius: 3px; overflow: hidden; margin-top: 6px;">
            <div class="hud-booster-fill" style="width: ${bPct}%; height: 100%; background: linear-gradient(90deg, #ffaa00, #ffd700); box-shadow: 0 0 8px #ffd700; transition: width 0.05s linear;"></div>
          </div>
        </div>
      `;
    }

    let boosterBtnHTML = '';
    if (this.engine.gameMode === 'endless' || this.engine.gameMode === 'flock') {
      // Classic endless & Squad flock: manual tap-to-activate booster button
      const bTimer = this.engine.boosterSpawnTimer;
      const bReady = bTimer <= 0;
      const bPercent = Math.min(100, Math.floor((1 - bTimer / 5.0) * 100));
      
      boosterBtnHTML = `
        <div class="hud-booster-btn glass-card ${bReady ? 'ult-ready-pulse' : ''}" 
             style="pointer-events: auto; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 50%; border: 2px solid ${bReady ? '#ffd700' : 'rgba(255,255,255,0.2)'}; background: ${bReady ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.03)'}; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: all 0.3s ease; box-shadow: ${bReady ? '0 0 15px rgba(255,215,0,0.4)' : 'none'}; position: relative; margin-bottom: 6px; -webkit-tap-highlight-color: transparent; opacity: ${bReady ? '1' : '0.65'};" 
             id="btn-hud-booster" 
             title="Tap to Activate Hyper Booster!">
          <div style="position: absolute; inset: 2px; border-radius: 50%; background: ${bReady ? 'rgba(255,215,0,0.15)' : 'transparent'}; pointer-events: none;"></div>
          <svg width="58" height="58" viewBox="0 0 58 58" style="position: absolute; transform: rotate(-90deg); pointer-events: none;">
            <circle cx="29" cy="29" r="25" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="3"></circle>
            <circle cx="29" cy="29" r="25" fill="none" stroke="#ffd700" stroke-width="4.5" 
                    stroke-dasharray="157" stroke-dashoffset="${157 - (157 * bPercent) / 100}" 
                    stroke-linecap="round" class="booster-progress-fill" style="transition: stroke-dashoffset 0.15s ease-out; stroke: #ffd700;"></circle>
          </svg>
          <span style="font-size: 26px; z-index: 2; transition: transform 0.2s ease; margin: 0; line-height: 1; text-shadow: ${bReady ? '0 0 8px #ffd700' : 'none'};">${bReady ? '⚡' : '⏳'}</span>
        </div>
      `;
    }
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
             title="Merge Squad for Boss HP!">
          <div style="position: absolute; inset: 2px; border-radius: 50%; background: rgba(255, 0, 127, 0.15); pointer-events: none;"></div>
          
          <img src="/merge_icon.png" width="32" height="32" style="z-index: 2; object-fit: contain; margin-bottom: 2px; border-radius: 50%; box-shadow: 0 0 8px rgba(255, 0, 127, 0.8);" />

          <span class="flock-merge-label" style="font-size: 7px; font-weight: 900; color: #ff007f; z-index: 2; text-shadow: 0 0 6px #ff007f; letter-spacing: 0.2px; text-align: center;">MERGE (+${flockLen})</span>
        </div>
      `;
    }

    // ── Squad Survival Mode Boss HP indicator ──────────────────────────────
    let playerHPBarHTML = '';
    const isBossWarning = state === 'BOSS_WARNING';
    if ((isBossFight || isBossWarning) && this.engine.gameMode === 'flock' && this.engine.playerBossHP > 0) {
      const hp = this.engine.playerBossHP;
      const maxHp = this.engine.maxPlayerBossHP || hp;
      const hearts = '❤️'.repeat(hp);
      
      const hasBossBar = isBossFight && isBossActive;
      const topOffset = hasBossBar ? '190px' : '130px';
      
      const fontSize = Math.max(10, 16 - Math.max(0, maxHp - 5) * 0.4);
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
                 style="pointer-events: auto; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.06); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.2); position: relative; margin-bottom: 6px; -webkit-tap-highlight-color: transparent;" 
                 id="btn-hud-ultimate" 
                 title="Tap to Activate Ultimate Special Ability!">
              <div class="ult-inner-glow" style="position: absolute; inset: 2px; border-radius: 50%; background: ${ultActive ? 'rgba(255, 0, 127, 0.25)' : ultReady ? 'rgba(255, 215, 0, 0.18)' : 'transparent'}; pointer-events: none;"></div>
              <svg class="ult-ring" width="58" height="58" viewBox="0 0 58 58" style="position: absolute; transform: rotate(-90deg); pointer-events: none;">
                <circle cx="29" cy="29" r="25" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"></circle>
                <circle cx="29" cy="29" r="25" fill="none" stroke="${ultBarBg}" stroke-width="4.5" 
                        stroke-dasharray="157" stroke-dashoffset="${157 - (157 * ultPercent) / 100}" 
                        stroke-linecap="round" class="ult-progress-fill" style="transition: stroke-dashoffset 0.15s ease-out; stroke: ${ultBarBg};"></circle>
              </svg>
              <span class="ult-icon" style="font-size: 24px; z-index: 2; transition: transform 0.2s ease; margin: 0; line-height: 1;">${ultActive ? '⚡' : ultReady ? '🔥' : '✨'}</span>
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



    // Bind triggers
    const ultBtn = document.getElementById('btn-hud-ultimate');
    if (ultBtn) ultBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.triggerUltimate();
      this.render();
    });

    // Bind booster trigger instantly on touch/pointerdown for zero delay
    const boosterBtn = document.getElementById('btn-hud-booster');
    if (boosterBtn) {
      const triggerBooster = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (this.engine.boosterSpawnTimer <= 0 && !this.engine.boosterActive && !this.engine.boosterDeactivating) {
          this.engine.activatePowerup('booster');
          // Reset charge timer
          this.engine.boosterSpawnTimer = 5.0;
          this.render(); // update visual ready state
        }
      };
      
      boosterBtn.addEventListener('pointerdown', triggerBooster);
      boosterBtn.addEventListener('touchstart', triggerBooster);
    }

    // Formation and Cage Rescue merge buttons removed

    // Bind Merge button for Squad Survival mode
    const flockMergeBtn = document.getElementById('btn-hud-flock-merge');
    if (flockMergeBtn) {
      const triggerFlockMerge = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.engine.flock.length >= 2) {
          this.engine.triggerSurvivalMerge();
          this.render();
        }
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
          <p class="modal-subtitle">Flight of Legends continues when you are ready.</p>
          
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
    const isNewHigh = this.engine.score >= progress.highscore;

    const goHTML = `
      <div class="overlay-screen fade-in glass-modal">
        <div class="modal-card gameover-card animate-slide-up">
          <div class="skull-badge">💥</div>
          <h2 class="modal-title warning-text">CRASHED!</h2>


          <div class="final-score-box glass-card">
            <div class="score-label">${isNewHigh ? '🏆 NEW HIGH SCORE! 🏆' : 'FINAL SCORE'}</div>
            <div class="score-number pop-scale">${this.engine.score}</div>
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
      <div class="overlay-screen fade-in" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center;">
        <div style="background: rgba(20, 20, 30, 0.4); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 40px 32px; text-align: center; width: 95%; max-width: 911px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); animation: slideUp 0.3s ease-out; position: relative;">
          
          <button id="btn-home-revive" style="position: absolute; left: 20px; top: 20px; font-size: 24px; color: #fff; font-weight: 800; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; cursor: pointer; line-height: 1; display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; transition: background 0.2s;" title="Return Home">↩</button>
          
          <div style="font-size: 32px; margin-bottom: 10px;">💥</div>
          <h2 style="font-size: 36px; font-weight: 900; color: #ff3c2e; letter-spacing: 2px; margin-bottom: 24px; text-shadow: 0 0 10px rgba(255,60,46,0.5);">CRASHED!</h2>

          ${this.engine.gameMode !== 'level' ? `
          <div style="background: rgba(0,0,0,0.3); border-radius: 16px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size: 12px; font-weight: 800; color: #ffd700; letter-spacing: 1.5px; text-transform: uppercase;">SCORE</div>
            <div style="font-size: 48px; font-weight: 900; color: #fff; text-shadow: 0 4px 10px rgba(0,0,0,0.5);">${this.engine.score}</div>
            <div style="font-size: 14px; font-weight: 800; color: #ffd700; margin-top: 6px; letter-spacing: 1px;">BEST: ${Math.max(progress.highscore, this.engine.score)}</div>
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



          ${this.engine.revivesUsedThisRun < 10 ? `
          <div class="revive-heartbeat-box">
            
            <div style="position: relative; text-align: center; margin-bottom: 20px;">
              <div style="font-size: 20px; color: #00e676; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px rgba(0, 230, 118, 0.6);">
                REVIVE
              </div>
              <div style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 14px; color: #fff; font-weight: 800; letter-spacing: 1.5px; background: rgba(0,0,0,0.4); padding: 4px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                ${10 - this.engine.revivesUsedThisRun} / 10
              </div>
            </div>

            <div style="display: flex; gap: 12px; justify-content: center;">
              <button id="btn-confirm-revive" style="flex: 1; padding: 16px; border-radius: 50px; background: #2a2a35; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.3); opacity: ${canAfford ? '1' : '0.5'};" ${canAfford ? '' : 'disabled'}>
                <span style="font-size: 20px; filter: drop-shadow(0 0 5px rgba(0,243,255,0.8));">💎</span>
                <span style="font-size: 20px; font-weight: 800; color: #fff;">5</span>
              </button>
              
              <button id="btn-ad-revive" style="flex: 1; padding: 16px; border-radius: 50px; background: linear-gradient(135deg, #ff6b00, #ffaa00); border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 0 20px rgba(255, 107, 0, 0.4), 0 4px 10px rgba(0,0,0,0.3);">
                <span style="font-size: 18px; font-weight: 900; color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">🎬 WATCH AD</span>
              </button>
            </div>
          </div>
          ` : `
          <div style="background: rgba(255,0,0,0.15); border: 1px solid rgba(255,0,0,0.3); border-radius: 16px; padding: 16px; margin-bottom: 24px;">
            <div style="font-size: 14px; color: #ff5252; font-weight: 800; letter-spacing: 1px; text-shadow: 0 0 8px rgba(255,82,82,0.5);">MAXIMUM REVIVES REACHED</div>
          </div>
          `}
          
          <div style="display: flex; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 16px; gap: 12px;">
            <button id="btn-skip-revive" style="flex: 1; background: rgba(255,255,255,0.1); border: none; border-radius: 12px; color: #fff; font-size: 18px; font-weight: 700; cursor: pointer; padding: 16px; transition: background 0.2s;">TRY AGAIN</button>
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
      AdManager.showReviveRewarded((success) => {
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
    const levelConfig = LevelManager.getLevel(levelNum);
    const starsMap = this.engine.progressManager.getState().levelModeStars || {};
    const stars = starsMap[levelNum] || 0;
    
    let starsHtml = '';
    for (let s = 1; s <= 3; s++) {
      starsHtml += `<span class="complete-screen-star ${s <= stars ? 'filled' : ''} star-anim-${s}">★</span>`;
    }

    const winHTML = `
      <div class="overlay-screen fade-in glass-modal">
        <div class="modal-card win-card animate-slide-up" style="background: rgba(8, 5, 26, 0.95); border: 2px solid rgba(0, 255, 136, 0.25); box-shadow: 0 0 25px rgba(0, 255, 136, 0.15);">
          <div class="trophy-badge" style="font-size: 55px; filter: drop-shadow(0 0 10px rgba(255,215,0,0.5)); margin-bottom: 5px;">🏆</div>
          <h2 class="modal-title success-text" style="color: #00ff88; text-shadow: 0 0 10px rgba(0,255,136,0.4); font-size: 26px; font-weight: 800; text-transform: uppercase;">LEVEL COMPLETE!</h2>
          <p class="modal-subtitle" style="font-weight: 800; font-size: 13px; color: rgba(255,255,255,0.7); margin-top: 2px;">${levelConfig?.name || `Level ${levelNum}`}</p>

          <div class="complete-stars-box" style="display: flex; justify-content: center; gap: 12px; margin: 15px 0; font-size: 38px;">
            ${starsHtml}
          </div>

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
      <div class="toast-indicator">🔔</div>
      <div>
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
      <div class="overlay-screen fade-in glass-modal" style="background: rgba(10, 5, 20, 0.88); display: flex; align-items: center; justify-content: center;">
        <div class="modal-card animate-slide-up" style="max-width: 440px; padding: 25px 20px; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6); position: relative;">
          <!-- Close button in corner -->
          <button id="btn-close-mode-selector" style="position: absolute; right: 15px; top: 15px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 50%; color: white; width: 32px; height: 32px; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">×</button>
          
          <h2 class="modal-title" style="color: #ffd700; text-shadow: 0 0 10px rgba(255, 215, 0, 0.5); font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 900; margin-bottom: 5px;">SELECT GAME MODE</h2>
          <p class="modal-subtitle" style="color: rgba(255, 255, 255, 0.6); font-size: 11px; margin-bottom: 20px;">Choose your endless adventure</p>
          
          <div style="display: flex; flex-direction: column; gap: 12px; text-align: left; width: 100%;">
            <!-- Option 1: Classic -->
            <div class="glass-card" style="padding: 12px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; display: flex; align-items: center; gap: 12px;">
              <div style="font-size: 32px; filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.5)); flex-shrink: 0; width: 45px; text-align: center;">🐦</div>
              <div style="flex: 1;">
                <div style="font-size: 13.5px; font-weight: 800; color: #ffd700; display: flex; align-items: center; gap: 6px;">
                  CLASSIC ENDLESS
                </div>
                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.7); margin-top: 3px; line-height: 1.4;">
                  Original single bird gameplay. Pure skill, classic physics, and infinite highscore chase.
                </div>
              </div>
              <button id="btn-select-classic" class="btn" style="width: auto; padding: 8px 14px; font-size: 11px; font-weight: 800; background: linear-gradient(180deg, #ffd700 0%, #ffaa00 100%); color: #3d2c00; border-radius: 10px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(255, 215, 0, 0.25);">FLY</button>
            </div>

            <!-- Option 2: Squad Survival -->
            <div class="glass-card" style="padding: 12px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; display: flex; align-items: center; gap: 12px;">
              <div style="font-size: 32px; filter: drop-shadow(0 0 8px rgba(0, 243, 255, 0.5)); flex-shrink: 0; width: 45px; text-align: center;">🪽</div>
              <div style="flex: 1;">
                <div style="font-size: 13.5px; font-weight: 800; color: #00f3ff; display: flex; align-items: center; gap: 6px;">
                  SQUAD SURVIVAL
                </div>
                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.7); margin-top: 3px; line-height: 1.4;">
                  Fly with a flock! A new bird joins your squad every 10 to 20 points. Survives if at least one bird is alive.
                </div>
              </div>
              <button id="btn-select-flock" class="btn" style="width: auto; padding: 8px 14px; font-size: 11px; font-weight: 800; background: linear-gradient(180deg, #00f3ff 0%, #0088ff 100%); color: #002233; border-radius: 10px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0, 243, 255, 0.25);">FLY</button>
            </div>

            <!-- Option 3 and 4 were removed to make the game lightweight and focus on classic/survival modes -->
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-mode-selector')?.addEventListener('click', () => {
      this.renderMenu();
    });

    document.getElementById('btn-select-classic')?.addEventListener('click', () => {
      this.engine.gameMode = 'endless';
      this.engine.isSpectatorMode = false;
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-select-flock')?.addEventListener('click', () => {
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

  private getJungleTempleWorldIconSvg(width: string, height: string): string {
    return `
<svg viewBox="0 0 100 100" style="width: ${width}; height: ${height}; display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 8px rgba(255,215,0,0.6));" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Sunset/Sacred Sky Gradient -->
    <linearGradient id="templeBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="50%" stop-color="#451a03" />
      <stop offset="100%" stop-color="#14532d" />
    </linearGradient>
    <!-- Gold/Light Rays Radial Gradient -->
    <radialGradient id="sunGlow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#fef08a" stop-opacity="1" />
      <stop offset="40%" stop-color="#eab308" stop-opacity="0.8" />
      <stop offset="70%" stop-color="#ca8a04" stop-opacity="0.3" />
      <stop offset="100%" stop-color="#ca8a04" stop-opacity="0" />
    </radialGradient>
    <!-- Ancient Stone Gradients -->
    <linearGradient id="stoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#94a3b8" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>
    <linearGradient id="stoneGradMossy" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6b7280" />
      <stop offset="100%" stop-color="#1e3a1e" />
    </linearGradient>
  </defs>

  <clipPath id="circleClipTemple">
    <circle cx="50" cy="50" r="46" />
  </clipPath>

  <!-- Base Glow Shadow Outer Ring -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="#eab308" stroke-width="2.5" opacity="0.8" />
  <circle cx="50" cy="50" r="46" fill="url(#templeBgGrad)" />

  <g clip-path="url(#circleClipTemple)">
    <!-- Sun Glow Behind the Temple -->
    <circle cx="50" cy="45" r="40" fill="url(#sunGlow)" />
    
    <!-- Lightrays shooting outwards -->
    <polygon points="50,45 25,-10 35,-10" fill="#fef08a" opacity="0.25" />
    <polygon points="50,45 65,-10 75,-10" fill="#fef08a" opacity="0.25" />
    <polygon points="50,45 -10,25 -10,35" fill="#fef08a" opacity="0.2" />
    <polygon points="50,45 110,25 110,35" fill="#fef08a" opacity="0.2" />
    <polygon points="50,45 10,85 18,90" fill="#fef08a" opacity="0.15" />
    <polygon points="50,45 90,85 82,90" fill="#fef08a" opacity="0.15" />

    <!-- Distant Forest/Jungle silhouette behind temple -->
    <path d="M 0,65 Q 20,55 40,65 T 80,60 T 100,65 L 100,100 L 0,100 Z" fill="#14532d" opacity="0.75" />

    <!-- Mayan/Aztec Temple Step Pyramid (Mossy Stone) -->
    <!-- Base Layer (Bottom Step) -->
    <polygon points="20,85 80,85 74,74 26,74" fill="url(#stoneGradMossy)" stroke="#0f172a" stroke-width="1" />
    <!-- Middle Layer (Second Step) -->
    <polygon points="28,74 72,74 67,63 33,63" fill="url(#stoneGrad)" stroke="#0f172a" stroke-width="1" />
    <!-- Top Layer (Third Step / Sanctuary) -->
    <polygon points="36,63 64,63 60,50 40,50" fill="url(#stoneGrad)" stroke="#0f172a" stroke-width="1" />
    
    <!-- Temple Door / Portal (leads to mystery, glows slightly) -->
    <path d="M 45,63 L 45,54 C 45,51 55,51 55,54 L 55,63 Z" fill="#020617" />
    <path d="M 47,63 L 47,56 C 47,54 53,54 53,56 L 53,63 Z" fill="#fef08a" opacity="0.45" />

    <!-- Temple steps detail (center steps going up) -->
    <polygon points="42,85 58,85 55,50 45,50" fill="#334155" opacity="0.5" />
    <!-- Step line indicators -->
    <line x1="44" y1="74" x2="56" y2="74" stroke="#0f172a" stroke-width="0.8" />
    <line x1="45" y1="63" x2="55" y2="63" stroke="#0f172a" stroke-width="0.8" />
    <line x1="46" y1="56" x2="54" y2="56" stroke="#0f172a" stroke-width="0.8" />

    <!-- Moss and Vines hanging over the temple -->
    <!-- Vines hanging on left of temple -->
    <path d="M 25,74 Q 22,80 23,85" fill="none" stroke="#22c55e" stroke-width="1" />
    <circle cx="23" cy="80" r="1.5" fill="#4ade80" />
    <circle cx="24" cy="84" r="1.2" fill="#15803d" />
    
    <!-- Vines hanging on top right -->
    <path d="M 62,50 Q 65,58 63,63" fill="none" stroke="#22c55e" stroke-width="0.8" />
    <circle cx="64" cy="56" r="1.2" fill="#4ade80" />
    
    <!-- Foliage framing the bottom left/right corners -->
    <path d="M -5,95 Q 15,80 30,105 Z" fill="#15803d" />
    <path d="M 105,95 Q 85,80 70,105 Z" fill="#166534" />
    <path d="M 5,105 Q 20,90 35,105 Z" fill="#22c55e" />
    
    <!-- Sacred golden magic particles rising around temple -->
    <circle cx="28" cy="48" r="1.2" fill="#fef08a" opacity="0.9" />
    <circle cx="72" cy="40" r="0.9" fill="#fef08a" opacity="0.8" />
    <circle cx="50" cy="30" r="1.5" fill="#fef08a" opacity="0.95" />
    <circle cx="40" cy="42" r="1.0" fill="#fef08a" opacity="0.75" />
    <circle cx="58" cy="46" r="0.8" fill="#fef08a" opacity="0.8" />
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

  public showChestRewardPopup(chestName: string, coins: number, gems: number) {
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

        <div style="display: flex; justify-content: center; gap: 16px; margin-bottom: 26px;">
          <!-- Coins Reward -->
          <div style="
            flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(212,175,55,0.25);
            border-radius: 16px; padding: 12px 6px; display: flex; flex-direction: column; align-items: center; gap: 6px;
            box-shadow: 0 4px 12px rgba(212,175,55,0.1);
          ">
            <span style="font-size: 24px; filter: drop-shadow(0 0 4px rgba(212,175,55,0.5));">🟡</span>
            <span style="font-size: 14px; font-weight: 900; color: #ffe47a;">+${coins}</span>
            <span style="font-size: 7px; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase;">Gold Coins</span>
          </div>

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
        </div>

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

}
