import { GameEngine } from '../engine/GameEngine.ts';
import type { GameState } from '../engine/GameEngine.ts';
import type { Skin, BattlePassTier, Achievement } from '../systems/ProgressManager.ts';
import { LevelManager } from '../systems/LevelManager.ts';

export class UIManager {
  private engine: GameEngine;
  private container: HTMLElement;
  private activeTab: 'main' | 'skins' | 'worlds' | 'bp' | 'achievements' | 'photo' | 'rewards' | 'settings' | 'levels' = 'main';
  private lastEngineState: GameState = 'MENU';
  private activeRewardsSubTab: 'daily' | 'trophies' | 'bp' = 'daily';

  // Cached HUD DOM element references
  private scoreEl: HTMLElement | null = null;
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

  public getActiveTab(): 'main' | 'skins' | 'worlds' | 'bp' | 'achievements' | 'photo' | 'rewards' | 'settings' | 'levels' {
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
    
    // In-place HUD updates to completely bypass innerHTML DOM thrashing when playing!
    if ((state === 'PLAYING' || state === 'BOSS_FIGHT' || state === 'BOSS_WARNING') && document.getElementById('hud-score')) {
      this.updateHUDValues();
      this.lastEngineState = state;
      return;
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
    }
  }

  private updateHUDValues() {
    // 1. Score (using cached reference if available, otherwise query and cache it)
    if (!this.scoreEl) this.scoreEl = document.getElementById('hud-score');
    if (this.scoreEl) {
      this.scoreEl.innerText = this.engine.score.toString();
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
        this.ultFill.style.width = `${ultPercent}%`;
        this.ultFill.style.background = ultBarBg;
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
    const activeSkin = this.engine.progressManager.getActiveSkinInfo();
    const worldId = progress.activeWorld;

    // If a sub-tab is active, render a full dedicated hero page instead
    if (this.activeTab !== 'main') {
      this.container.innerHTML = this.renderTabPage(worldId);
      this.bindMenuEvents();
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

    // Bird emoji per skin
    const skinEmojis: Record<string, string> = {
      default: '🐦', phoenix: '🔥', cyber: '🤖', ice: '❄️',
      shadow: '🌑', dragon: '🐲', nebula: '🌌', bubble: '🐳'
    };
    const birdEmoji = skinEmojis[activeSkin.id] || '🐦';

    // Level progress
    const levelXpNeeded = progress.level * 1000;
    const levelPct = Math.min(100, Math.round((progress.xp / levelXpNeeded) * 100));

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
            <div class="top-bar-avatar">🦅</div>
            <div>
              <div class="top-bar-name">LEGENDARY AVIATOR</div>
              <div class="top-bar-level">Level ${progress.level}</div>
              <div class="top-bar-level-bar"><div class="top-bar-level-fill" style="width:${levelPct}%"></div></div>
            </div>
          </div>
          <div class="top-bar-currencies">
            <div class="top-bar-coin">
              <span class="top-bar-coin-icon">🪙</span>${progress.coins.toLocaleString()}
            </div>
            <div class="top-bar-gem">
              <span class="top-bar-gem-icon">💎</span>${progress.gems.toLocaleString()}
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
              <span class="side-btn-icon">✨</span>
              <span class="side-btn-label">SKINS</span>
            </button>
            <button class="side-btn" id="side-btn-worlds">
              <span class="side-btn-icon">🪐</span>
              <span class="side-btn-label">WORLDS</span>
            </button>
          </div>

          <!-- Bird Mascot -->
          <div class="bird-stage">
            <div class="bird-aura-outer"></div>
            <div class="bird-aura"></div>
            <div class="bird-floaties">${floatiesHtml}</div>
            <div class="bird-mascot" id="bird-mascot-tap">${birdEmoji}</div>
          </div>

          <!-- Right side panel -->
          <div class="side-panel-right">
            <button class="side-btn" id="side-btn-rewards" style="width: 100%;">
              <div class="side-btn-badge">!</div>
              <span class="side-btn-icon">🎁</span>
              <span class="side-btn-label">REWARDS</span>
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
  }

  private renderTabPage(worldId: string): string {
    const progress = this.engine.progressManager.getState();

    const tabMeta: Record<string, { icon: string; title: string; color: string; heroIcon: string; heroSubtitle: string }> = {
      skins:        { icon: '🪶', title: 'BIRD HANGAR & SKINS',  color: '#00f3ff', heroIcon: '✨', heroSubtitle: 'Customize your legendary bird' },
      worlds:       { icon: '🪐', title: 'SELECT BATTLEFIELD',   color: '#7b2fff', heroIcon: '🌍', heroSubtitle: 'Choose your flying world' },
      bp:           { icon: '🎫', title: 'SEASON 1 BATTLE PASS', color: '#ff007f', heroIcon: '⚔️', heroSubtitle: 'Unlock exclusive rewards' },
      achievements: { icon: '🏆', title: 'HALL OF TROPHIES',     color: '#ffd700', heroIcon: '🏅', heroSubtitle: 'Track your legendary feats' },
      rewards:      { icon: '🎁', title: 'REWARDS & PROGRESSION HUB', color: '#ffaa00', heroIcon: '🎁', heroSubtitle: 'Claim your daily logs, trophies, and battle pass!' },
      settings:     { icon: '⚙️', title: 'GAME CONFIGURATION',   color: '#00ff88', heroIcon: '⚙️', heroSubtitle: 'Configure your flight difficulty mode' },
      levels:       { icon: '🏆', title: 'LEVEL SELECT MODE',    color: '#7b2fff', heroIcon: '🏆', heroSubtitle: 'Complete all 30 transforming levels!' },
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
        <div class="tab-hero-spotlight">
          <div class="tab-spotlight-glow" style="background:radial-gradient(circle,${meta.color}33 0%,transparent 70%)"></div>
          <div class="tab-spotlight-icon">${meta.heroIcon}</div>
          <div class="tab-spotlight-label" style="color:${meta.color}">${meta.title}</div>
        </div>

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
          const emojiMap: Record<string, string> = {
            default: '🦅', phoenix: '🔥', cyber: '🤖', ice: '❄️',
            shadow: '👿', dragon: '🐲', nebula: '🌌', bubble: '🐳'
          };
          const rarityColors: Record<string, string> = {
            common: '#aaa', rare: '#00f3ff', epic: '#a855f7', legendary: '#ffd700'
          };
          const rc = rarityColors[s.rarity.toLowerCase()] || '#aaa';
          return `
            <div class="grid-card glass-card skin-card ${isSelected ? 'selected-border' : ''}"
                 data-skin-id="${s.id}"
                 style="${isSelected ? `box-shadow: 0 0 0 2px ${rc}, 0 0 18px ${rc}55;` : ''}"
            >
              <div class="skin-emoji">${emojiMap[s.id] || '🐦'}</div>
              <div class="grid-card-name">${s.name}</div>
              <span class="tag tag-${s.rarity.toLowerCase()}" style="color:${rc};border-color:${rc}33">${s.rarity}</span>
              ${isSelected ? `<div style="font-size:9px;color:#00ff88;font-weight:800;margin-top:4px">✓ EQUIPPED</div>` : ''}
              <div class="upgrade-row">
                <span class="level-indicator">Lvl ${s.upgradeLevel}/5</span>
                ${s.unlocked && s.upgradeLevel < s.maxUpgrade
                  ? `<button class="btn-upgrade-skin" data-id="${s.id}">⬆ (${upgradeCost}🟡)</button>`
                  : ''}
              </div>
              <div class="buy-row">
                ${s.unlocked
                  ? (isSelected
                      ? `<span class="equipped-tag">★ ACTIVE SKIN</span>`
                      : `<button class="btn-equip-skin" data-id="${s.id}">➡ EQUIP</button>`)
                  : `<button class="btn-buy-skin" data-id="${s.id}">${s.costCoins > 0 ? '🟡 ' + s.costCoins.toLocaleString() : '💎 ' + s.costGems.toLocaleString()}</button>`
                }
              </div>
            </div>
          `;
        }).join('');
        return `
          <div class="tab-sheet-title">✨ CHOOSE YOUR SKIN</div>
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
                <span class="day-icon">${d === 7 ? '🎁' : '📅'}</span>
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
            <div class="daily-rewards-container">
              <div class="hangar-section-title">📅 7-DAY LOGIN REWARDS</div>
              <div class="daily-calendar">
                ${calendarHtml}
              </div>
              
              <div class="hangar-section-title">⚔️ DAILY CHALLENGES</div>
              <div class="quests-list">
                ${questsHtml}
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
              <div class="bp-xp-text">${progress.battlePassXp} / ${activeTier.xpRequired} XP</div>
            </div>
            <div class="vertical-scroll bp-scroll">${bpItems}</div>
          `;
        }
      }

      case 'levels': {
        const allLevels = LevelManager.getAllLevels();
        const starsMap = progress.levelModeStars || {};

        const levelCards = allLevels.map(lvl => {
          const isLocked = false; // All levels unlocked!
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
                  <div class="level-target-label">Target: ${lvl.targetScore}</div>
                `
              }
            </div>
          `;
        }).join('');

        return `
          <div class="tab-sheet-title">🏆 SELECT A LEVEL TO START</div>
          <div class="level-select-grid-container">
            <div class="level-select-grid">
              ${levelCards}
            </div>
          </div>
        `;
      }

      case 'settings': {
        return `
          <div class="tab-sheet-title">⚙️ SELECT DIFFICULTY MODE</div>
          <div class="zones-configuration-card glass-card" style="padding: 24px; border-radius: 20px; background: rgba(13, 10, 28, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); max-width: 420px; margin: 0 auto;">
            <!-- Difficulty segmented control -->
            <div class="control-group">
              <div class="segment-label" style="font-size: 11px; font-weight: 800; letter-spacing: 1px; color: rgba(255,255,255,0.4); margin-bottom: 10px; text-transform: uppercase;">SELECT DIFFICULTY</div>
              <div class="segmented-control" style="display: flex; gap: 8px; background: rgba(0,0,0,0.25); padding: 4px; border-radius: 14px;">
                <button class="segment-btn diff-easy ${progress.selectedDifficulty === 'easy' ? 'active' : ''}" data-diff="easy" style="flex: 1; padding: 10px; border: none; border-radius: 10px; font-family: var(--font-family); font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; background: transparent; transition: all 0.2s ease;">Easy</button>
                <button class="segment-btn diff-medium ${progress.selectedDifficulty === 'medium' ? 'active' : ''}" data-diff="medium" style="flex: 1; padding: 10px; border: none; border-radius: 10px; font-family: var(--font-family); font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; background: transparent; transition: all 0.2s ease;">Medium</button>
                <button class="segment-btn diff-hard ${progress.selectedDifficulty === 'hard' ? 'active' : ''}" data-diff="hard" style="flex: 1; padding: 10px; border: none; border-radius: 10px; font-family: var(--font-family); font-weight: 800; font-size: 12px; cursor: pointer; color: #fff; background: transparent; transition: all 0.2s ease;">Hard</button>
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

    // World selector chip on main → open worlds page
    bindClick('btn-open-worlds', () => { this.activeTab = 'worlds'; this.render(); });

    // Bird mascot tap
    bindClick('bird-mascot-tap', () => {
      this.showToastNotification('READY TO FLY!', 'Tap START FLY to begin your legendary adventure! 🐦');
    });

    // Game start & spectator
    bindClick('btn-start-game', () => {
      this.engine.gameMode = 'endless';
      this.engine.isSpectatorMode = false;
      this.engine.startGame();
      this.render();
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
          this.showToastNotification('SKIN EQUIPPED! ✨', `${skin.name} is now your active bird!`);
          setTimeout(() => { this.activeTab = 'main'; this.render(); }, 400);
        } else {
          // Attempt auto-buy when tapping a locked card
          const res = this.engine.progressManager.buySkin(skinId);
          if (res.success) {
            this.showToastNotification('PURCHASE SUCCESSFUL 🎉', `${skin.name} unlocked and equipped!`);
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
        this.showToastNotification('SKIN EQUIPPED! ✨', `${skin?.name || 'Skin'} is now your active bird!`);
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
  }

  private renderHUD() {
    const pList = this.engine.getActivePowerups();
    
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

    const hudHTML = `
      <div class="hud fade-in">
        <div class="hud-top">
          <div class="score-container">
            <span class="hud-label">SCORE</span>
            <span class="hud-val pop-scale" id="hud-score">${this.engine.score}</span>
          </div>

          <!-- Ultimate Skill HUD Energy bar (Visual Upgrade Option 2) -->
          <div class="hud-ultimate-container glass-card ${ultReady ? 'ult-ready-pulse' : ''} ${ultActive ? 'ult-active-glow' : ''}" style="pointer-events: auto; cursor: pointer;" id="btn-hud-ultimate" title="Double-Tap screen or Single-Tap here to activate Ultimate Skill!">
            <span class="ult-icon">${ultActive ? '⚡' : ultReady ? '🔥' : '✨'}</span>
            <div class="ult-progress-bar">
              <div class="ult-progress-fill" style="width: ${ultPercent}%; background: ${ultBarBg}"></div>
            </div>
            <span class="ult-text">${ultActive ? 'ACTIVE' : ultReady ? 'READY!' : `${ultPercent}%`}</span>
          </div>

          <div class="hud-actions">
            <button class="hud-circle-btn" id="btn-hud-pause">⏸️</button>
          </div>
        </div>

        ${bossHealthBarHTML}

        <div class="hud-middle" id="hud-alert-container"></div>

        <div class="hud-bottom">
          <div class="powerup-timers-holder">
            ${powerupBadges}
          </div>
          <div class="run-stats">
            <span class="stat-badge">🟡 ${this.engine.coinsCollectedThisRun}</span>
            <span class="stat-badge">💎 ${this.engine.gemsCollectedThisRun}</span>
            ${this.engine.isSpectatorMode ? '<span class="spectator-indicator">🤖 AUTO-PILOT</span>' : ''}
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = hudHTML;

    // Cache DOM references for zero-thrashing fast active gameplay updates
    this.scoreEl = document.getElementById('hud-score');
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
          <h2 class="modal-title">CAMPAIGN PAUSED</h2>
          <p class="modal-subtitle">Flight of Legends continues when you are ready.</p>
          
          <div class="vertical-actions">
            <button class="btn btn-primary" id="btn-resume">RESUME FLIGHT</button>
            <button class="btn btn-secondary" id="btn-restart-paused">RESTART FLIGHT</button>
            <button class="btn btn-secondary" id="btn-quit">QUIT TO HANGAR</button>
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
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-quit')?.addEventListener('click', () => {
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
          <h2 class="modal-title warning-text">MISSION OVER</h2>
          <p class="modal-subtitle">You collided with an environmental hazard.</p>

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
            <div class="reward-row">
              <span>XP Reward Gained</span>
              <strong>+${Math.floor(this.engine.score * 50)} XP</strong>
            </div>
          </div>

          <div class="vertical-actions">
            <button class="btn btn-primary btn-glow-orange" id="btn-retry">FLY AGAIN</button>
            <button class="btn btn-secondary" id="btn-hangar">RETURN TO HANGAR</button>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = goHTML;

    document.getElementById('btn-retry')?.addEventListener('click', () => {
      this.engine.startGame();
      this.render();
    });

    document.getElementById('btn-hangar')?.addEventListener('click', () => {
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
      <div class="overlay-screen fade-in glass-modal">
        <div class="modal-card revive-card animate-slide-up">
          <div class="revive-heart">💖</div>
          <h2 class="modal-title font-glow-green">CONTINUE?</h2>
          <p class="modal-subtitle">Resume your flight instantly from this location!</p>

          <div style="font-size:11px; color:#ffd700; font-weight:800; letter-spacing:1.5px; margin-top:-5px; margin-bottom:15px; text-transform:uppercase; text-shadow:0 0 8px rgba(255,215,0,0.4);">
            REVIVES USED: ${this.engine.revivesUsedThisRun} (UNLIMITED)
          </div>

          <!-- Circular digital countdown -->
          <div class="countdown-container">
            <svg class="countdown-svg" viewBox="0 0 100 100">
              <circle class="countdown-bg-circle" cx="50" cy="50" r="45"></circle>
              <circle id="countdown-fill-circle" class="countdown-fill-circle" cx="50" cy="50" r="45" style="stroke-dasharray: 282.74; stroke-dashoffset: 0;"></circle>
            </svg>
            <div id="countdown-text" class="countdown-text">5.0</div>
          </div>

          <div class="revive-gems-status glass-card">
            <span class="gems-label">DIAMOND BANK:</span>
            <span class="gems-count">${gems} / ${price} 💎</span>
          </div>

          <div class="vertical-actions">
            <button class="btn btn-primary btn-revive-action ${canAfford ? 'btn-glow-green' : 'btn-disabled'}" id="btn-confirm-revive" ${canAfford ? '' : 'disabled'}>
              <span>REVIVE NOW</span>
              <strong class="gems-cost">💎 5</strong>
            </button>
            <button class="btn-skip-revive" id="btn-skip-revive">NO THANKS (SKIP)</button>
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

    document.getElementById('btn-skip-revive')?.addEventListener('click', () => {
      this.engine.confirmGameOver();
      this.render();
    });

    // Start micro countdown animation frame loop
    const textEl = document.getElementById('countdown-text');
    const circleEl = document.getElementById('countdown-fill-circle');

    const updateCountdownUI = () => {
      if (this.engine.state !== 'REVIVE_CHOICE') return;

      const countdown = Math.max(0, this.engine.reviveCountdown);
      if (textEl) {
        textEl.innerText = countdown.toFixed(1);
      }

      if (circleEl) {
        const circumference = 282.74; // 2 * Math.PI * 45
        const offset = circumference - (countdown / 5.0) * circumference;
        circleEl.style.strokeDashoffset = offset.toString();
      }

      requestAnimationFrame(updateCountdownUI);
    };

    requestAnimationFrame(updateCountdownUI);
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
              <span>Score Reached</span>
              <strong style="color: #ffd700;">${this.engine.score} / ${levelConfig?.targetScore} 🎯</strong>
            </div>
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
            ${levelNum < 30 
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
