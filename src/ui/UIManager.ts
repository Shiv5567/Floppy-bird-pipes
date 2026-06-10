import { GameEngine } from '../engine/GameEngine.ts';
import type { GameState } from '../engine/GameEngine.ts';
import type { Skin, BattlePassTier, Achievement } from '../systems/ProgressManager.ts';
import { LevelManager } from '../systems/LevelManager.ts';
import { AdManager } from '../systems/AdManager.ts';

export class UIManager {
  private engine: GameEngine;
  private container: HTMLElement;
  private activeTab: 'main' | 'skins' | 'worlds' | 'bp' | 'achievements' | 'photo' | 'rewards' | 'settings' | 'levels' | 'powerups' = 'main';
  private lastEngineState: GameState = 'MENU';
  private activeRewardsSubTab: 'daily' | 'trophies' | 'bp' = 'daily';

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
      // 1. Show floating graze text
      this.showFloatingGrazeText(e.detail.x, e.detail.y);
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
    const flockInd = this.container.querySelector('.flock-indicator') as HTMLElement;
    if (flockInd) {
      flockInd.innerText = `🪽 SQUAD: ${this.engine.flock.length} / 5`;
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
          const bPct = Math.max(0, Math.min(100, (this.engine.boosterTimer / 2.0) * 100));
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
  }

  private renderPreloader() {
    const progress = this.engine.progressManager.getState();
    const worldId = progress.activeWorld;

    const worldNames: Record<string, string> = {
      jungle:     'TROPICAL JUNGLE',
      jungle_temple: 'JUNGLE TEMPLE',
      cyberpunk:  'NEON CYBERPUNK',
      ice:        'FROZEN KINGDOM',
      desert:     'DESERT RUINS',
      volcano:    'VOLCANIC ABYSS',
      space:      'COSMIC SPACE VOID',
      underwater: 'DEEP UNDERWATER',
      heaven:     'HEAVENLY REALM',
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

    // World meta lookup
    const worldMeta: Record<string, { name: string; emoji: string }> = {
      jungle:     { name: 'Tropical Rainforest', emoji: '🌴' },
      cyberpunk:  { name: 'Cyberpunk Neon City',  emoji: '🏙️' },
      ice:        { name: 'Frozen Ice Kingdom',   emoji: '❄️' },
      desert:     { name: 'Ancient Desert Ruins',  emoji: '🏜️' },
      volcano:    { name: 'Volcano Hell World',    emoji: '🌋' },
      space:      { name: 'Space Galaxy Void',     emoji: '🌌' },
      underwater: { name: 'Deep Ocean Trench',     emoji: '🐙' },
      heaven:     { name: 'Heaven Fantasy Realm',  emoji: '🌤️' },
      retro:      { name: 'Retro Classic',         emoji: '🎮' },
    };
    const world = worldMeta[worldId] || { name: 'Tropical Rainforest', emoji: '🌴' };



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
          <div class="top-bar-player">
            <canvas class="top-bar-avatar-canvas" width="40" height="40" style="width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, #1a4fd6, #6c14e0); border: 2px solid rgba(255,255,255,0.2); box-shadow: 0 0 10px rgba(108, 20, 224, 0.5);"></canvas>
            <div>
              <div class="top-bar-name">LEGENDARY AVIATOR</div>
            </div>
          </div>
          <div class="top-bar-currencies">
            <div class="top-bar-coin" style="position: relative;">
              <span class="top-bar-coin-icon">🪙</span>${progress.coins.toLocaleString()}
              <button class="top-bar-add-btn" id="btn-plus-coins" title="Watch ad for +500 Coins">+</button>
            </div>
            <div class="top-bar-gem" style="position: relative;">
              <span class="top-bar-gem-icon">💎</span>${progress.gems.toLocaleString()}
              <button class="top-bar-add-btn" id="btn-plus-gems" title="Watch ad for +10 Gems">+</button>
            </div>
            <button class="top-bar-settings-btn" id="btn-open-settings" style="background: none; border: none; font-size: 20px; cursor: pointer; color: white; margin-left: 8px; display: flex; align-items: center; justify-content: center;">⚙️</button>
          </div>
        </div>

        <!-- ===== GAME LOGO ===== -->
        <div class="logo-container">
          <div class="logo-wings-row">
            <span class="logo-wing">🪽</span>
            <span class="logo-flight">FLIGHT</span>
            <span class="logo-wing right">🪽</span>
          </div>
          <span class="logo-of">OF</span>
          <div class="logo-legends">LEGENDS</div>
        </div>

        <!-- ===== CENTER STAGE ===== -->
        <div class="center-stage">

          <!-- Left side panel -->
          <div class="side-panel-left">
            <button class="side-btn" id="side-btn-skins">
              <img class="side-btn-icon" src="character_icon.png" style="width: 55px; height: 55px; object-fit: contain; margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(0, 243, 255, 0.5));">
              <span class="side-btn-label">CHARACTERS</span>
            </button>
            <button class="side-btn" id="side-btn-worlds">
              <img class="side-btn-icon" src="worlds_icon.png" style="width: 55px; height: 55px; object-fit: contain; margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(123, 47, 255, 0.5));">
              <span class="side-btn-label">WORLDS</span>
            </button>
          </div>

          <!-- Bird Mascot -->
          <div class="bird-stage">
            <div class="bird-aura-outer"></div>
            <div class="bird-aura"></div>
            <div class="bird-floaties">${floatiesHtml}</div>
            <div class="bird-mascot" id="bird-mascot-tap" style="cursor: pointer; display: flex; align-items: center; justify-content: center; width: 120px; height: 120px; position: relative; margin: 0 auto;">
              <canvas id="main-menu-bird-canvas" width="140" height="140" style="width: 140px; height: 140px;"></canvas>
            </div>
            <div class="bird-select-character-pill" id="btn-mascot-skins-quick" style="position: absolute; bottom: -20px; left: 50%; transform: translateX(-50%); background: rgba(0, 243, 255, 0.25); border: 1px solid rgba(0, 243, 255, 0.6); padding: 5px 12px; border-radius: 20px; font-size: 10px; font-weight: 800; color: #fff; cursor: pointer; text-shadow: 0 0 5px #00f3ff; box-shadow: 0 0 10px rgba(0, 243, 255, 0.3); white-space: nowrap; transition: all 0.2s ease; z-index: 10;">🔄 SELECT CHARACTER</div>
          </div>

          <!-- Right side panel -->
          <div class="side-panel-right">
            <button class="side-btn" id="side-btn-rewards" style="width: 100%; margin-bottom: 8px;">
              <div class="side-btn-badge">!</div>
              <img class="side-btn-icon" src="reward_box.png" style="width: 55px; height: 55px; object-fit: contain; margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(255, 170, 0, 0.5));">
              <span class="side-btn-label">REWARDS</span>
            </button>
            <button class="side-btn" id="side-btn-powerups" style="width: 100%;">
              <img class="side-btn-icon" src="upgrade_icon.png" style="width: 55px; height: 55px; object-fit: contain; margin-top: -2px; margin-bottom: 2px; filter: drop-shadow(0 0 6px rgba(0, 243, 255, 0.6));">
              <span class="side-btn-label">UPGRADES</span>
            </button>
          </div>
        </div>

        <!-- ===== WORLD PLATFORM + START FLY ===== -->
        <div class="world-platform-area">
          <div class="platform-base">
            <div class="platform-glow-ring"></div>
            
            <div class="world-selector-chip" id="btn-open-worlds">
              <span class="world-chip-icon">${world.emoji}</span>
              <span>${world.name}</span>
              <span class="world-chip-info-icon">ℹ</span>
            </div>

            <div style="display: flex; gap: 8px; width: 100%; margin-bottom: 6px; margin-top: 8px;">
              <button class="start-fly-btn" id="btn-start-game" style="flex: 1; padding: 12px 10px; font-size: 16px;">
                <span>ENDLESS</span>
                <span class="start-fly-wing">🪶</span>
              </button>
              <button class="start-fly-btn" id="btn-open-levels" style="flex: 1; padding: 12px 10px; font-size: 16px; background: linear-gradient(180deg, #b35dfb 0%, #7b2fff 50%, #5200b3 100%); box-shadow: 0 6px 0 #3a0082, 0 8px 20px rgba(123,47,255,0.4);">
                <span>LEVELS</span>
                <span class="start-fly-wing">🏆</span>
              </button>
            </div>
            <button class="spectator-btn-small" id="btn-spectator">🤖 SPECTATOR AUTO-PILOT</button>
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
        this.engine.bird.renderPreview(ctx, mainCanvas.width, mainCanvas.height, activeSkin);
      }
    }

    // 2. Draw top bar player avatar preview if present
    const avatarCanvas = this.container.querySelector('.top-bar-avatar-canvas') as HTMLCanvasElement | null;
    if (avatarCanvas) {
      const activeSkin = this.engine.progressManager.getActiveSkinInfo();
      const ctx = avatarCanvas.getContext('2d');
      if (ctx) {
        this.engine.bird.renderPreview(ctx, avatarCanvas.width, avatarCanvas.height, activeSkin);
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
      skins:        { icon: '<img src="character_icon.png" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; display: inline-block;">', title: 'CHARACTERS',  color: '#00f3ff', heroIcon: '<img src="character_icon.png" style="width: 72px; height: 72px; object-fit: contain; animation: floatBird 4s ease-in-out infinite;">', heroSubtitle: 'Select your legendary aviator' },
      worlds:       { icon: '<img src="worlds_icon.png" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; display: inline-block;">', title: 'SELECT BATTLEFIELD',   color: '#7b2fff', heroIcon: '<img src="worlds_icon.png" style="width: 72px; height: 72px; object-fit: contain; animation: floatBird 4s ease-in-out infinite;">', heroSubtitle: 'Choose your flying world' },
      bp:           { icon: '🎫', title: 'SEASON 1 BATTLE PASS', color: '#ff007f', heroIcon: '⚔️', heroSubtitle: 'Unlock exclusive rewards' },
      achievements: { icon: '🏆', title: 'HALL OF TROPHIES',     color: '#ffd700', heroIcon: '🏅', heroSubtitle: 'Track your legendary feats' },
      rewards:      { icon: '<img src="reward_box.png" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; display: inline-block;">', title: 'REWARDS & PROGRESSION HUB', color: '#ffaa00', heroIcon: '<img src="reward_box.png" style="width: 72px; height: 72px; object-fit: contain; animation: floatBird 4s ease-in-out infinite;">', heroSubtitle: 'Claim your daily logs, trophies, and battle pass!' },
      settings:     { icon: '⚙️', title: 'GAME CONFIGURATION',   color: '#00ff88', heroIcon: '⚙️', heroSubtitle: 'Configure your flight difficulty mode' },
      levels:       { icon: '🏆', title: 'LEVEL SELECT MODE',    color: '#7b2fff', heroIcon: '🏆', heroSubtitle: 'Complete all 50 transforming levels!' },
      powerups:     { icon: '<img src="upgrade_icon.png" style="width: 32px; height: 32px; object-fit: contain; vertical-align: middle; display: inline-block;">', title: 'POWERUP UPGRADE LAB',   color: '#00f3ff', heroIcon: '<img src="upgrade_icon.png" style="width: 72px; height: 72px; object-fit: contain; animation: floatBird 4s ease-in-out infinite;">', heroSubtitle: 'Upgrade bubble durations & effectiveness' }
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

    return `
      <div class="screen tab-hero-screen slide-in-right">

        <!-- World background -->
        <div class="menu-world-bg world-bg-${worldId}"></div>
        <div class="menu-particles">${particlesHtml}</div>

        <!-- ===== TAB HERO HEADER ===== -->
        <div class="tab-hero-header">
          <button class="tab-back-btn" id="btn-back-main">
            <span class="tab-back-arrow">‹</span>
            <span class="tab-back-label">BACK</span>
          </button>
          <div class="tab-hero-title-row">
            <span class="tab-hero-icon">${meta.icon}</span>
            <div>
              <div class="tab-hero-title">${meta.title}</div>
              <div class="tab-hero-subtitle">${meta.heroSubtitle}</div>
            </div>
          </div>
          <div class="tab-hero-spacer"></div>
        </div>

        <!-- ===== HERO FEATURE SPOTLIGHT ===== -->
        ${this.activeTab !== 'levels' ? `
        <div class="tab-hero-spotlight">
          <div class="tab-spotlight-glow" style="background:radial-gradient(circle,${meta.color}33 0%,transparent 70%)"></div>
          ${this.activeTab === 'skins' ? 
            `<canvas id="spotlight-skin-canvas" width="100" height="100" style="width: 100px; height: 100px; z-index: 1; filter: drop-shadow(0 0 12px ${meta.color}55);"></canvas>` : 
            `<div class="tab-spotlight-icon">${meta.heroIcon}</div>`
          }
          <div class="tab-spotlight-label" style="color:${meta.color}">${meta.title}</div>
        </div>
        ` : ''}

        ${this.activeTab === 'rewards' ? `
        <!-- ===== REWARDS HUB PILL NAVIGATION ===== -->
        <div class="rewards-hub-nav glass-card">
          <button class="rewards-sub-btn ${this.activeRewardsSubTab === 'daily' ? 'active' : ''}" data-sub-tab="daily">
            <span class="sub-tab-icon">📅</span> Daily Rewards
          </button>
          <button class="rewards-sub-btn ${this.activeRewardsSubTab === 'trophies' ? 'active' : ''}" data-sub-tab="trophies">
            <span class="sub-tab-icon">🏆</span> Trophies
          </button>
          <button class="rewards-sub-btn ${this.activeRewardsSubTab === 'bp' ? 'active' : ''}" data-sub-tab="bp">
            <span class="sub-tab-icon">🎫</span> Battle Pass
          </button>
        </div>
        ` : ''}

        <!-- ===== CONTENT SCROLL AREA ===== -->
        <div class="tab-content-area">
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
              <div class="skin-emoji" style="display: flex; align-items: center; justify-content: center; width: 90px; height: 90px; margin-bottom: 8px; position: relative;">
                <canvas class="skin-preview-canvas" data-skin-id="${s.id}" width="90" height="90" style="width: 90px; height: 90px;"></canvas>
              </div>
              <div class="grid-card-name">${s.name}</div>
              <span class="tag tag-${s.rarity.toLowerCase()}" style="color:${rc};border-color:${rc}33">${s.rarity}</span>
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
          <div class="tab-sheet-title">✨ SELECT YOUR CHARACTER</div>
          <div class="grid-scroll">${skinsCards}</div>
        `;
      }

      case 'worlds': {
        const worldColors: Record<string, string> = {
          jungle: '#00c853', jungle_temple: '#2e7d32', cyberpunk: '#7c4dff', ice: '#40c4ff',
          desert: '#ffab40', volcano: '#ff3d00', space: '#651fff',
          underwater: '#0091ea', heaven: '#ffd740', retro: '#78909c'
        };
        const worlds = [
          { id: 'jungle',     name: 'Tropical Rainforest', emoji: '🌴', desc: 'Lush greenery, cascades & ancient ruins' },
          { id: 'jungle_temple', name: 'Jungle Temple Ruins', emoji: '🛕', desc: 'Lost ancient civilization, mossy ruins & sacred golden light' },
          { id: 'cyberpunk',  name: 'Cyberpunk Neon City',  emoji: '🏙️', desc: 'Neon lights, hover roads & laser grids' },
          { id: 'ice',        name: 'Frozen Ice Kingdom',   emoji: '❄️', desc: 'Sub-zero snowstorms & giant icicles' },
          { id: 'desert',     name: 'Ancient Desert Ruins', emoji: '🏜️', desc: 'Swirling dust & golden sandstone obelisks' },
          { id: 'volcano',    name: 'Volcano Hell World',   emoji: '🌋', desc: 'Magma rivers, lightning & basalt spires' },
          { id: 'space',      name: 'Space Galaxy Void',    emoji: '🌌', desc: 'Warp zones & drifting asteroid fields' },
          { id: 'underwater', name: 'Deep Ocean Trench',    emoji: '🐙', desc: 'Kelp forests, currents & sea mines' },
          { id: 'heaven',     name: 'Heaven Fantasy Realm', emoji: '🌤️', desc: 'Marble pillars & golden sky lightrays' },
          { id: 'retro',      name: 'Retro Classic',        emoji: '🎮', desc: 'Lag-free simple classic world with zero heavy effects' }
        ];
        const worldsCards = worlds.map(w => {
          const isActive = progress.activeWorld === w.id;
          const wc = worldColors[w.id] || '#fff';
          return `
            <div class="world-card glass-card ${isActive ? 'selected-border' : ''}" data-world-id="${w.id}"
                 style="${isActive ? `box-shadow: 0 0 0 2px ${wc}, 0 0 18px ${wc}44; background:${wc}12;` : ''}"
            >
              <div class="world-icon" style="font-size:36px">${w.emoji}</div>
              <div style="flex:1;min-width:0">
                <div class="world-name">
                  ${w.name}
                  ${isActive ? `<span style="color:${wc};font-size:9px;margin-left:6px;font-weight:800">● ACTIVE</span>` : ''}
                </div>
                <div class="world-desc">${w.desc}</div>
              </div>
              ${isActive ? '' : `<div style="font-size:18px;color:rgba(255,255,255,0.25)">›</div>`}
            </div>
          `;
        }).join('');
        return `
          <div class="tab-sheet-title">🪐 TAP A WORLD TO ENTER</div>
          <div class="vertical-scroll">${worldsCards}</div>
        `;
      }

      case 'bp': {
        // Fallback safety redirect
        this.activeTab = 'rewards';
        this.activeRewardsSubTab = 'bp';
        return this.renderTabInnerContent(progress);
      }
      case 'achievements': {
        // Fallback safety redirect
        this.activeTab = 'rewards';
        this.activeRewardsSubTab = 'trophies';
        return this.renderTabInnerContent(progress);
      }
      case 'rewards': {
        if (this.activeRewardsSubTab === 'daily') {
          const currentDay = parseInt(localStorage.getItem('flight_of_legends_daily_day') || '1');
          const now = Date.now();
          const cooldown = 24 * 60 * 60 * 1000;
          const alreadyClaimedToday = (now - progress.lastDailyClaimTime < cooldown);

          const dailyRewards = [
            { coins: 500, gems: 5 },   // Day 1
            { coins: 1000, gems: 10 }, // Day 2
            { coins: 1500, gems: 15 }, // Day 3
            { coins: 2000, gems: 20 }, // Day 4
            { coins: 2500, gems: 25 }, // Day 5
            { coins: 3000, gems: 30 }, // Day 6
            { coins: 5000, gems: 50 }  // Day 7
          ];

          let calendarHtml = '';
          for (let d = 1; d <= 7; d++) {
            const reward = dailyRewards[d - 1];
            let isClaimed = false;
            let isActive = false;

            if (d < currentDay) {
              isClaimed = true;
            } else if (d === currentDay) {
              if (alreadyClaimedToday) {
                isClaimed = true;
              } else {
                isActive = true;
              }
            }

            const classes = `calendar-day ${isClaimed ? 'claimed' : ''} ${isActive ? 'active-day' : ''}`;
            const rewardText = `+${reward.coins}🟡<br>+${reward.gems}💎`;

            calendarHtml += `
              <div class="${classes}" data-day="${d}">
                <span class="day-label">Day ${d}</span>
                <span class="day-icon">${d === 7 ? '<img src="reward_box.png" style="width: 38px; height: 38px; object-fit: contain; vertical-align: middle;">' : '📅'}</span>
                <span class="day-reward-value">${rewardText}</span>
              </div>
            `;
          }

          const quests = progress.dailyQuests || this.engine.progressManager.initDefaultQuests();
          const questsHtml = quests.map(q => {
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
                  <div class="quest-name-row">
                    <span class="quest-name">${q.name}</span>
                  </div>
                  <div class="quest-desc">${q.desc}</div>
                  <div class="quest-progress-container">
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
          }).join('');

          return `
            <div class="daily-rewards-container" style="padding-bottom: 20px;">
              <div class="hangar-section-title">📅 7-DAY LOGIN REWARDS</div>
              <div class="daily-calendar">
                ${calendarHtml}
              </div>
              
              <div class="hangar-section-title">⚔️ DAILY CHALLENGES</div>
              <div class="quests-list">
                ${questsHtml}
                
                <!-- WATCH AD FOR EXTRA COINS & GEMS -->
                <div class="quest-card" style="margin-top: 15px; background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.2);">
                  <div class="quest-details">
                    <div class="quest-name-row">
                      <span class="quest-name">🎞️ FREE COINS & GEMS</span>
                    </div>
                    <div class="quest-desc">Watch an ad to get 500 Coins & 10 Gems instantly!</div>
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
        } else if (this.activeRewardsSubTab === 'trophies') {
          const achievements = this.engine.progressManager.getAchievements();
          const achCards = achievements.map((a: Achievement) => {
            const progressPercent = Math.min(100, (a.currentValue / a.targetValue) * 100);
            return `
              <div class="achievement-card glass-card ${a.unlocked ? 'unlocked-border' : ''}">
                <div class="ach-info">
                  <div class="ach-name">${a.name} ${a.unlocked ? '🏆' : ''}</div>
                  <div class="ach-desc">${a.desc}</div>
                  <div class="ach-bar-outer"><div class="ach-bar-inner" style="width:${progressPercent}%"></div></div>
                  <div class="ach-progress-text">${a.currentValue} / ${a.targetValue}</div>
                </div>
                <div class="ach-reward">💰+${a.rewardCoins}<br>💎+${a.rewardGems}</div>
              </div>
            `;
          }).join('');
          return `
            <div class="tab-sheet-title">🏆 HALL OF TROPHIES</div>
            <div class="vertical-scroll">${achCards}</div>
          `;
        } else {
          const bp = this.engine.progressManager.getBattlePass();
          const activeTier = bp.find((t: BattlePassTier) => t.tier === progress.battlePassTier) || bp[bp.length - 1];
          const bpItems = bp.slice(0, 15).map((t: BattlePassTier) => {
            const isUnlocked = t.tier < progress.battlePassTier;
            const isClaimed = progress.claimedBPTiers.includes(t.tier);
            const claimable = isUnlocked && !isClaimed;
            return `
              <div class="bp-tier-card glass-card ${claimable ? 'claimable-border' : ''}">
                <div class="bp-tier-num">Tier ${t.tier}</div>
                <div class="bp-tier-reward">${t.rewardName}</div>
                <div>
                  ${isClaimed
                    ? '<span class="claimed-tag">✓ Claimed</span>'
                    : (claimable
                        ? `<button class="btn-claim-bp" data-tier="${t.tier}">CLAIM 🎁</button>`
                        : '<span class="locked-tag">🔒 Locked</span>')}
                </div>
              </div>
            `;
          }).join('');
          return `
            <div class="tab-sheet-title">🎫 SEASON 1 BATTLE PASS</div>
            <div class="bp-progress-bar-container glass-card">
              <div class="bp-level-indicator">Tier ${progress.battlePassTier}</div>
              <div class="bp-bar-outer"><div class="bp-bar-inner" style="width:${(progress.battlePassXp / activeTier.xpRequired) * 100}%"></div></div>
              <div class="bp-xp-text">${progress.battlePassXp} / ${activeTier.xpRequired} PTS</div>
            </div>
            <div class="vertical-scroll bp-scroll">${bpItems}</div>
          `;
        }
      }

      case 'levels': {
        const allLevels = LevelManager.getAllLevels();
        const starsMap = progress.levelModeStars || {};

        const levelCards = allLevels.map(lvl => {
          const isLocked = false;
          const starsCount = starsMap[lvl.levelNum] || 0;
          
          let starHtml = '';
          for (let s = 1; s <= 3; s++) {
            starHtml += `<span class="level-select-star ${s <= starsCount ? 'filled' : ''}">★</span>`;
          }

          const worldEmojis: Record<string, string> = {
            jungle: '🌴', jungle_temple: '🛕', ice: '❄️', cyberpunk: '🏙️', volcano: '🌋'
          };
          const emoji = worldEmojis[lvl.worldId] || '🐦';

          return `
            <div class="level-select-card glass-card ${isLocked ? 'locked' : 'unlocked'}" 
                 data-level-num="${lvl.levelNum}"
            >
              ${isLocked 
                ? `<div class="level-lock-icon">🔒</div>`
                : `
                  <div class="level-num-label">${lvl.levelNum}</div>
                  <div class="level-emoji-label">${emoji}</div>
                  <div class="level-select-stars">${starHtml}</div>
                `
              }
            </div>
          `;
        }).join('');

        return `
          <div class="tab-sheet-title">🏆 SELECT A LEVEL TO START</div>
          <div class="level-select-grid-container">
            <button class="level-nav-arrow prev-arrow" id="btn-levels-prev" style="opacity: 0; pointer-events: none;">◀</button>
            <div class="level-select-grid">
              ${levelCards}
            </div>
            <button class="level-nav-arrow next-arrow" id="btn-levels-next" style="opacity: 0; pointer-events: none;">▶</button>
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
          <div class="tab-sheet-title">⚙️ CONFIGURATION & SOUND SETTINGS</div>
          <div class="zones-configuration-card glass-card" style="padding: 24px; border-radius: 20px; background: rgba(13, 10, 28, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); max-width: 420px; margin: 0 auto;">
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
          </div>
        `;
      }

      default:
        return '';
    }
  }

  private bindMenuEvents() {
    const bindClick = (id: string, action: () => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', action);
    };

    // Back to main landing page
    bindClick('btn-back-main', () => {
      this.activeTab = 'main';
      this.render();
    });

    // Side panel quick-access buttons → open dedicated tab page
    bindClick('side-btn-rewards',      () => { this.activeTab = 'rewards';      this.render(); });
    bindClick('side-btn-powerups',     () => { this.activeTab = 'powerups';     this.render(); });
    bindClick('side-btn-skins',        () => { this.activeTab = 'skins';        this.render(); });
    bindClick('side-btn-worlds',       () => { this.activeTab = 'worlds';       this.render(); });
    bindClick('btn-open-settings',     () => { this.activeTab = 'settings';     this.render(); });

    // Difficulty selection buttons
    const diffBtns = this.container.querySelectorAll('.segmented-control [data-diff]');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
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

    // Daily login calendar claim
    const calendarDays = this.container.querySelectorAll('.calendar-day[data-day]');
    calendarDays.forEach(dayEl => {
      dayEl.addEventListener('click', () => {
        const day = parseInt((dayEl as HTMLElement).getAttribute('data-day') || '1');
        const currentDay = parseInt(localStorage.getItem('flight_of_legends_daily_day') || '1');
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000;
        const progress = this.engine.progressManager.getState();
        const alreadyClaimedToday = (now - progress.lastDailyClaimTime < cooldown);

        if (day !== currentDay) {
          this.showToastNotification('DAILY CALENDAR', day < currentDay ? 'You already claimed this day!' : 'This reward is locked until future days.');
          return;
        }

        if (alreadyClaimedToday) {
          const hoursLeft = Math.ceil((cooldown - (now - progress.lastDailyClaimTime)) / (1000 * 60 * 60));
          this.showToastNotification('DAILY CALENDAR', `You already claimed today! Next reward in ${hoursLeft} hours.`);
          return;
        }

        const res = this.engine.progressManager.claimDailyLoginReward(day);
        if (res.success) {
          this.showToastNotification('CLAIM SUCCESSFUL 🎉', res.msg);
          // Save next day
          const nextDay = (day % 7) + 1;
          localStorage.setItem('flight_of_legends_daily_day', nextDay.toString());
          this.render();
        } else {
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
          this.showToastNotification('QUEST COMPLETED! 🏆', res.msg);
          this.render();
        } else {
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
          this.showToastNotification('UPGRADE SUCCESSFUL 🧪', res.msg);
          this.render();
        } else {
          this.showToastNotification('UPGRADE FAILED', res.msg);
        }
      });
    });

    // World selector chip on main → open worlds page
    bindClick('btn-open-worlds', () => { this.activeTab = 'worlds'; this.render(); });

    // Bird mascot tap opens Skins hangar directly!
    bindClick('bird-mascot-tap', () => {
      this.activeTab = 'skins';
      this.render();
    });
    bindClick('btn-mascot-skins-quick', () => {
      this.activeTab = 'skins';
      this.render();
    });

    // Game start & spectator
    bindClick('btn-start-game', () => {
      this.showEndlessModeSelection();
    });
    bindClick('btn-open-levels', () => {
      this.activeTab = 'levels';
      this.render();
    });
    bindClick('btn-spectator', () => {
      this.engine.gameMode = 'endless';
      this.engine.isSpectatorMode = true;
      this.engine.startGame();
      this.render();
    });

    // Level Select click events
    const unlockedLevelCards = this.container.querySelectorAll('.level-select-card.unlocked');
    unlockedLevelCards.forEach(card => {
      card.addEventListener('click', () => {
        const lvlNum = parseInt(card.getAttribute('data-level-num') || '1');
        this.engine.gameMode = 'level';
        this.engine.currentLevelNum = lvlNum;
        this.engine.startGame();
        this.render();
      });
    });

    // Levels horizontal scroll arrows and dynamic visibility
    const levelsGrid = this.container.querySelector('.level-select-grid') as HTMLElement;
    const btnLevelsPrev = document.getElementById('btn-levels-prev');
    const btnLevelsNext = document.getElementById('btn-levels-next');

    if (levelsGrid && btnLevelsPrev && btnLevelsNext) {
      const updateArrows = () => {
        const scrollLeft = levelsGrid.scrollLeft;
        const maxScroll = levelsGrid.scrollWidth - levelsGrid.clientWidth;

        btnLevelsPrev.style.opacity = scrollLeft <= 10 ? '0' : '1';
        btnLevelsPrev.style.pointerEvents = scrollLeft <= 10 ? 'none' : 'auto';

        btnLevelsNext.style.opacity = scrollLeft >= maxScroll - 10 ? '0' : '1';
        btnLevelsNext.style.pointerEvents = scrollLeft >= maxScroll - 10 ? 'none' : 'auto';
      };

      levelsGrid.addEventListener('scroll', updateArrows);

      btnLevelsPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        levelsGrid.scrollBy({ left: -levelsGrid.clientWidth, behavior: 'smooth' });
      });

      btnLevelsNext.addEventListener('click', (e) => {
        e.stopPropagation();
        levelsGrid.scrollBy({ left: levelsGrid.clientWidth, behavior: 'smooth' });
      });

      // Run initially after layout settles
      setTimeout(updateArrows, 100);
    }

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
        if (target.classList.contains('btn-buy-skin') || target.classList.contains('btn-upgrade-skin') || target.classList.contains('btn-equip-skin')) return;
        
        const skin = this.engine.progressManager.getSkins().find((s: Skin) => s.id === skinId);
        if (!skin) return;

        if (skin.unlocked) {
          this.engine.progressManager.selectSkin(skinId);
          this.showToastNotification('BIRD SELECTED! ✨', `${skin.name} is now your active bird!`);
          setTimeout(() => { this.activeTab = 'main'; this.render(); }, 400);
        } else {
          // Attempt auto-buy when tapping a locked card
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
        this.showToastNotification(res.success ? 'UPGRADE SUCCESSFUL ⬆' : 'UPGRADE FAILED', res.msg);
        this.render();
      });
    });

    // Worlds selection → tap card → instant redirect home with new world
    const worldCards = this.container.querySelectorAll('.world-card[data-world-id]');
    worldCards.forEach(card => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).getAttribute('data-world-id') || '';
        if (!id) return;
        this.engine.progressManager.setWorld(id);
        this.engine.renderer.setWeather(id);
        const worldName = (card.querySelector('.world-name') as HTMLElement)?.textContent?.trim() || id;
        this.showToastNotification('🌍 WORLD SELECTED!', `${worldName.replace('● ACTIVE', '').trim()} is now your battlefield!`);
        setTimeout(() => { this.activeTab = 'main'; this.render(); }, 450);
      });
    });

    // Battle pass claim
    const claimBtns = this.container.querySelectorAll('.btn-claim-bp');
    claimBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tier = parseInt((e.target as HTMLElement).getAttribute('data-tier') || '0');
        const res = this.engine.progressManager.claimBattlePassTier(tier);
        this.showToastNotification(res.success ? 'REWARD CLAIMED' : 'CLAIM FAILED', res.msg);
        this.render();
      });
    });

    // Rewards Hub sub-tabs click events
    const subTabBtns = this.container.querySelectorAll('.rewards-hub-nav [data-sub-tab]');
    subTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = (btn as HTMLElement).getAttribute('data-sub-tab') as 'daily' | 'trophies' | 'bp';
        if (sub) {
          this.activeRewardsSubTab = sub;
          this.render();
        }
      });
    });

    // Currency Plus Ad Buttons
    const btnPlusCoins = document.getElementById('btn-plus-coins');
    if (btnPlusCoins) {
      btnPlusCoins.addEventListener('click', (e) => {
        e.stopPropagation();
        AdManager.showEconomyRewarded((success) => {
          if (success) {
            this.engine.progressManager.addCoins(500);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('COINS CLAIMED! 🪙', 'You received 500 Coins!');
          } else {
            this.showToastNotification('AD FAILED', 'Failed to play or watch ad.');
          }
        });
      });
    }

    const btnPlusGems = document.getElementById('btn-plus-gems');
    if (btnPlusGems) {
      btnPlusGems.addEventListener('click', (e) => {
        e.stopPropagation();
        AdManager.showEconomyRewarded((success) => {
          if (success) {
            this.engine.progressManager.addGems(10);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('GEMS CLAIMED! 💎', 'You received 10 Gems!');
          } else {
            this.showToastNotification('AD FAILED', 'Failed to play or watch ad.');
          }
        });
      });
    }

    // Extra Rewards Ad Button
    const btnExtraRewards = document.getElementById('btn-extra-rewards');
    if (btnExtraRewards) {
      btnExtraRewards.addEventListener('click', (e) => {
        e.stopPropagation();
        AdManager.showEconomyRewarded((success) => {
          if (success) {
            this.engine.progressManager.addCoins(500);
            this.engine.progressManager.addGems(10);
            this.engine.progressManager.save();
            this.render();
            this.showToastNotification('REWARD CLAIMED! 🎁', 'You received 500 Coins & 10 Gems!');
          } else {
            this.showToastNotification('AD FAILED', 'Failed to play or watch ad.');
          }
        });
      });
    }

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
      cyberpunk: 'Nexus Interceptor',
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
      const bPct = Math.max(0, Math.min(100, (this.engine.boosterTimer / 2.0) * 100));
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
    if (this.engine.gameMode === 'endless') {
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

    let formationBtnHTML = '';
    if (this.engine.gameMode === 'formation') {
      const activeForm = this.engine.currentFormation;
      const formIcon = activeForm === 'v_shape' ? '🪽' : activeForm === 'line' ? '➡️' : '⬇️';
      formationBtnHTML = `
        <div class="hud-circle-btn glass-card ult-ready-pulse" 
             style="pointer-events: auto; cursor: pointer; display: flex; align-items: center; justify-content: center; width: 62px; height: 62px; border-radius: 50%; border: 2px solid #ffaa00; background: rgba(255, 170, 0, 0.12); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: all 0.3s ease; box-shadow: 0 0 15px rgba(255, 170, 0, 0.4); position: relative; margin-bottom: 6px; -webkit-tap-highlight-color: transparent;" 
             id="btn-hud-formation" 
             title="Tap to Cycle Flight Formation!">
          <div style="position: absolute; inset: 2px; border-radius: 50%; background: rgba(255, 170, 0, 0.15); pointer-events: none;"></div>
          <span style="font-size: 26px; z-index: 2; transition: transform 0.2s ease; margin: 0; line-height: 1; text-shadow: 0 0 8px #ffaa00;">${formIcon}</span>
        </div>
      `;
    }

    const hudHTML = `
      <div class="hud fade-in">
        ${boosterOverlayHTML}
        <div class="hud-top">
          <!-- Coins & Gems (Left side) -->
          <div class="run-stats" style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px; font-weight: 800; font-size: 13px; pointer-events: auto;">
            <span class="stat-badge" style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); width: fit-content; margin-bottom: 0;">🟡 ${this.engine.coinsCollectedThisRun}</span>
            <span class="stat-badge" style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); width: fit-content; margin-bottom: 0;">💎 ${this.engine.gemsCollectedThisRun}</span>
            ${(this.engine.gameMode === 'flock' || this.engine.gameMode === 'rescue' || this.engine.gameMode === 'formation') ? `
              <span class="stat-badge flock-indicator" style="background: rgba(0,243,255,0.15); padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(0,243,255,0.3); width: fit-content; margin-bottom: 0; color: #00f3ff; text-shadow: 0 0 5px #00f3ff;">🪽 SQUAD: ${this.engine.flock.length} / 5</span>
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

    const formBtn = document.getElementById('btn-hud-formation');
    if (formBtn) {
      formBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.engine.cycleFormation();
        this.render();
      });
    }

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
      this.engine.togglePause();
      this.render();
    });

    document.getElementById('btn-restart-paused')?.addEventListener('click', () => {
      AdManager.onTransitionPoint();
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-quit')?.addEventListener('click', () => {
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
      AdManager.onTransitionPoint();
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-hangar')?.addEventListener('click', () => {
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



          ${this.engine.revivesUsedThisRun < 3 ? `
          <div class="revive-heartbeat-box">
            
            <div style="position: relative; text-align: center; margin-bottom: 20px;">
              <div style="font-size: 20px; color: #00e676; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 10px rgba(0, 230, 118, 0.6);">
                REVIVE
              </div>
              <div style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: 14px; color: #fff; font-weight: 800; letter-spacing: 1.5px; background: rgba(0,0,0,0.4); padding: 4px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                ${3 - this.engine.revivesUsedThisRun} / 3
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
        this.engine.attemptRevive();
        this.render();
      }
    });

    document.getElementById('btn-ad-revive')?.addEventListener('click', () => {
      AdManager.showReviveRewarded((success) => {
        if (success) {
          this.engine.attemptReviveFree();
          this.render();
        } else {
          alert("Ad failed to load or play. Please try again or use diamonds.");
        }
      });
    });

    document.getElementById('btn-skip-revive')?.addEventListener('click', () => {
      this.engine.confirmGameOver(); // Save progress
      AdManager.onTransitionPoint();
      this.engine.startGame(); // Immediate restart
      this.render();
    });

    document.getElementById('btn-home-revive')?.addEventListener('click', () => {
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
      this.engine.currentLevelNum++;
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-retry-level')?.addEventListener('click', () => {
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-quit-levels')?.addEventListener('click', () => {
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
                  Fly with a flock! A new bird joins your squad every 10 to 20 points. Survives if at least one bird is alive. (Demo cap: 500)
                </div>
              </div>
              <button id="btn-select-flock" class="btn" style="width: auto; padding: 8px 14px; font-size: 11px; font-weight: 800; background: linear-gradient(180deg, #00f3ff 0%, #0088ff 100%); color: #002233; border-radius: 10px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0, 243, 255, 0.25);">FLY</button>
            </div>

            <!-- Option 3: Cage Rescue -->
            <div class="glass-card" style="padding: 12px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; display: flex; align-items: center; gap: 12px;">
              <div style="font-size: 32px; filter: drop-shadow(0 0 8px rgba(255, 0, 127, 0.5)); flex-shrink: 0; width: 45px; text-align: center;">🕸️</div>
              <div style="flex: 1;">
                <div style="font-size: 13.5px; font-weight: 800; color: #ff007f; display: flex; align-items: center; gap: 6px;">
                  CAGE RESCUE
                </div>
                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.7); margin-top: 3px; line-height: 1.4;">
                  Rescue captive birds from cages! Collect Merge Orbs to combine your squad and trigger Hyper Boosts. (Demo cap: 500)
                </div>
              </div>
              <button id="btn-select-rescue" class="btn" style="width: auto; padding: 8px 14px; font-size: 11px; font-weight: 800; background: linear-gradient(180deg, #ff007f 0%, #7b2fff 100%); color: #ffffff; border-radius: 10px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(255, 0, 127, 0.25);">FLY</button>
            </div>

            <!-- Option 4: Formation Flight -->
            <div class="glass-card" style="padding: 12px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; display: flex; align-items: center; gap: 12px;">
              <div style="font-size: 32px; filter: drop-shadow(0 0 8px rgba(255, 170, 0, 0.5)); flex-shrink: 0; width: 45px; text-align: center;">🔄</div>
              <div style="flex: 1;">
                <div style="font-size: 13.5px; font-weight: 800; color: #ffaa00; display: flex; align-items: center; gap: 6px;">
                  FORMATION FLIGHT
                </div>
                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.7); margin-top: 3px; line-height: 1.4;">
                  Switch formations on the fly! Cycle V-Shape, Single File, and Column to pass tight hazards. (Demo cap: 500)
                </div>
              </div>
              <button id="btn-select-formation" class="btn" style="width: auto; padding: 8px 14px; font-size: 11px; font-weight: 800; background: linear-gradient(180deg, #ffaa00 0%, #ff5500 100%); color: #ffffff; border-radius: 10px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(255, 170, 0, 0.25);">FLY</button>
            </div>
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

    document.getElementById('btn-select-rescue')?.addEventListener('click', () => {
      this.engine.gameMode = 'rescue';
      this.engine.isSpectatorMode = false;
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-select-formation')?.addEventListener('click', () => {
      this.engine.gameMode = 'formation';
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

}
