import './style.css';
import { ProgressManager } from './systems/ProgressManager.ts';
import { SoundManager } from './engine/SoundManager.ts';
import { GameEngine } from './engine/GameEngine.ts';
import { UIManager } from './ui/UIManager.ts';

// Bulletproof global shadow neutralization to boost low-end mobile performance
Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
  set: function() {},
  get: function() { return 0; }
});
Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowColor', {
  set: function() {},
  get: function() { return 'transparent'; }
});

// Mobile detection helper
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       window.innerWidth < 1024 || 
                       ('ontouchstart' in window) || 
                       navigator.maxTouchPoints > 0;
(window as any).gameIsMobile = isMobileDevice;

// Transparent Gradient Optimizer to completely neutralize per-frame canvas gradient allocations on mobile
if (isMobileDevice) {
  class FakeGradient {
    public __isFakeGradient = true;
    public colors: string[] = [];
    addColorStop(_offset: number, color: string) {
      this.colors.push(color);
    }
    clear() {
      this.colors.length = 0;
    }
  }

  const fakeGradientPool = Array.from({ length: 8 }, () => new FakeGradient());
  let poolIndex = 0;

  CanvasRenderingContext2D.prototype.createLinearGradient = function() {
    const grad = fakeGradientPool[poolIndex];
    poolIndex = (poolIndex + 1) % 8;
    grad.clear();
    return grad as any;
  };

  CanvasRenderingContext2D.prototype.createRadialGradient = function() {
    const grad = fakeGradientPool[poolIndex];
    poolIndex = (poolIndex + 1) % 8;
    grad.clear();
    return grad as any;
  };

  // Helper to traverse prototype chain to locate IDL properties like fillStyle / strokeStyle
  // which might reside on BaseRenderingContext2D.prototype in modern WebViews.
  const findDescriptor = (proto: any, prop: string): PropertyDescriptor | undefined => {
    let p = proto;
    while (p) {
      const desc = Object.getOwnPropertyDescriptor(p, prop);
      if (desc) return desc;
      p = Object.getPrototypeOf(p);
    }
    return undefined;
  };

  const fillStyleDesc = findDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle');
  if (fillStyleDesc && fillStyleDesc.set) {
    const originalSetFillStyle = fillStyleDesc.set;
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'fillStyle', {
      get: fillStyleDesc.get,
      set: function(val) {
        if (val && (val as any).__isFakeGradient) {
          // Use middle color for linear gradient approximation
          const color = (val as any).colors[Math.floor((val as any).colors.length / 2)] || '#ffffff';
          originalSetFillStyle.call(this, color);
        } else {
          originalSetFillStyle.call(this, val);
        }
      },
      configurable: true,
      enumerable: true
    });
  }

  const strokeStyleDesc = findDescriptor(CanvasRenderingContext2D.prototype, 'strokeStyle');
  if (strokeStyleDesc && strokeStyleDesc.set) {
    const originalSetStrokeStyle = strokeStyleDesc.set;
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'strokeStyle', {
      get: strokeStyleDesc.get,
      set: function(val) {
        if (val && (val as any).__isFakeGradient) {
          // Use first color for stroke/outlines
          const color = (val as any).colors[0] || '#ffffff';
          originalSetStrokeStyle.call(this, color);
        } else {
          originalSetStrokeStyle.call(this, val);
        }
      },
      configurable: true,
      enumerable: true
    });
  }
}



// Global error catcher overlay for instant live debugging
window.onerror = function(message, source, lineno, colno, error) {
  const errorDiv = document.createElement('div');
  errorDiv.style.position = 'fixed';
  errorDiv.style.top = '0';
  errorDiv.style.left = '0';
  errorDiv.style.width = '100%';
  errorDiv.style.height = '100%';
  errorDiv.style.backgroundColor = 'rgba(20, 5, 5, 0.96)';
  errorDiv.style.color = '#ff3366';
  errorDiv.style.padding = '30px';
  errorDiv.style.zIndex = '1000000';
  errorDiv.style.fontFamily = 'monospace';
  errorDiv.style.fontSize = '14px';
  errorDiv.style.overflowY = 'auto';
  errorDiv.style.border = '3px solid #ff0055';
  errorDiv.style.boxShadow = '0 0 30px rgba(255,0,85,0.5)';
  errorDiv.innerHTML = `
    <h2 style="color: #ff0055; margin-top: 0; text-shadow: 0 0 10px rgba(255,0,85,0.4);">🚨 FLAPPY LEGENDS CRASHED!</h2>
    <p style="color: #ffffff; font-size: 16px;"><b>Message:</b> ${message}</p>
    <p><b>Location:</b> ${source} (Line ${lineno}:${colno})</p>
    <pre style="background: rgba(0,0,0,0.4); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; font-size: 12px; line-height: 1.5;">${error ? error.stack : 'No stack trace available'}</pre>
    <button onclick="window.location.reload()" style="background: #ff0055; color: white; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; margin-top: 15px; box-shadow: 0 4px 10px rgba(255,0,85,0.3);">RELOAD GAME</button>
  `;
  document.body.appendChild(errorDiv);
  return false;
};

let progressManager: ProgressManager;
let soundManager: SoundManager;
let gameEngine: GameEngine;
let uiManager: UIManager;

let lastTime = 0;
const deltaHistory: number[] = [];

// Snaps raw delta times to VSync targets (120Hz, 90Hz, 60Hz, 30Hz) to eliminate micro-jitter.
// Uses a rolling average filter to smooth out sudden frame fluctuations on WebView/mobile.
function snapDeltaTime(rawDt: number): number {
  // Clamp delta time to reasonable limits [0.004, 0.1] to prevent huge jumps on sudden spikes
  const clamped = Math.max(0.004, Math.min(0.1, rawDt));
  
  deltaHistory.push(clamped);
  if (deltaHistory.length > 10) {
    deltaHistory.shift();
  }

  // Calculate simple moving average of recent frame times
  let sum = 0;
  for (let i = 0; i < deltaHistory.length; i++) {
    sum += deltaHistory[i];
  }
  const avg = sum / deltaHistory.length;

  const targetIntervals = [
    1 / 120, // ~0.008333
    1 / 90,  // ~0.011111
    1 / 60,  // ~0.016667
    1 / 30   // ~0.033333
  ];

  // Snap to VSync target if close to average (wider window of 0.0035s to absorb minor WebView jitter)
  for (let i = 0; i < targetIntervals.length; i++) {
    const target = targetIntervals[i];
    if (Math.abs(avg - target) < 0.0035) {
      return target;
    }
  }
  return avg;
}

let lastScore = 0;
let lastState = '';
let lastBossHealth = 0;
let lastUltPercent = 0;
let hudFrameCount = 0;
let isMenuMusicActive = false; // Track menu music state to avoid redundant calls


function init() {
  const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  if (!canvas) return;

  // Add mobile class helper to completely disable expensive layout blurs (backdrop-filter)
  if (isMobileDevice) {
    document.body.classList.add('mobile-performance');
  }

  progressManager = new ProgressManager();
  soundManager = new SoundManager();
  
  gameEngine = new GameEngine(canvas, progressManager, soundManager);
  uiManager = new UIManager('uiContainer', gameEngine);

  // Initialize unique device/fingerprint ID for referrals
  let myDeviceId = localStorage.getItem('legends_device_id');
  if (!myDeviceId) {
    myDeviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('legends_device_id', myDeviceId);
  }

  // Check if page was loaded via a referral link
  const urlParams = new URLSearchParams(window.location.search);
  const refToken = urlParams.get('ref');
  if (refToken) {
    const parts = refToken.split('_');
    const referrerId = parts.length >= 2 ? parts[1] : '';
    
    // Only activate if not self-referral and we haven't already marked this link as opened
    if (myDeviceId && referrerId && myDeviceId !== referrerId) {
      const storageKey = `opened_ref_${refToken}`;
      if (!localStorage.getItem(storageKey)) {
        // Fetch current list of openers
        fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/7cantavq/${refToken}`)
          .then(res => res.json())
          .then(rawVal => {
            let list: string[] = [];
            try {
              let parsed = rawVal;
              if (typeof parsed === 'string') parsed = JSON.parse(parsed);
              if (typeof parsed === 'string') parsed = JSON.parse(parsed); // Double parse for double serialization
              if (Array.isArray(parsed)) {
                list = parsed;
              } else if (parsed === "0" || parsed === 0 || parsed === "1" || parsed === 1) {
                list = [];
              }
            } catch (e) {
              list = [];
            }

            if (!list.includes(myDeviceId)) {
              list.push(myDeviceId);
              const valStr = encodeURIComponent(JSON.stringify(list));
              fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/7cantavq/${refToken}/${valStr}`, { 
                method: 'POST',
                headers: { 'Content-Length': '0' }
              })
              .then(() => {
                localStorage.setItem(storageKey, 'true');
                console.log("Referral link activated successfully!");
              })
              .catch(err => console.error("Referral activation save failed:", err));
            }
          })
          .catch(err => console.error("Referral activation check failed:", err));
      }
    } else {
      console.log("Self-referral or missing/invalid device ID; ignoring referral link activation.");
    }
  }

  // Set up background checker to check if pending shared links were opened
  setInterval(() => {
    let pending = JSON.parse(localStorage.getItem('pending_shares') || '[]');
    if (pending.length === 0) return;

    const currentDeviceId = localStorage.getItem('legends_device_id') || '';
    const creditedDevices = JSON.parse(localStorage.getItem('credited_referral_devices') || '[]');
    let pendingUpdated = [...pending];

    // Filter out expired pending shares (older than 24 hours) to avoid endless polling
    const now = Date.now();
    pending = pending.filter((token: string) => {
      const parts = token.split('_');
      const timestamp = parts.length >= 3 ? parseInt(parts[2]) : 0;
      if (timestamp && now - timestamp > 24 * 60 * 60 * 1000) {
        pendingUpdated = pendingUpdated.filter(t => t !== token);
        return false;
      }
      return true;
    });

    localStorage.setItem('pending_shares', JSON.stringify(pendingUpdated));
    if (pending.length === 0) return;

    pending.forEach((token: string) => {
      fetch(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/7cantavq/${token}`)
        .then(res => res.json())
        .then(rawVal => {
          let list: string[] = [];
          try {
            let parsed = rawVal;
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            if (Array.isArray(parsed)) {
              list = parsed;
            } else if (parsed === "1" || parsed === 1) {
              list = ['legacy_friend'];
            }
          } catch (e) {
            list = [];
          }

          // Filter out our own device ID and already credited devices
          const newDevices = list.filter(devId => devId !== currentDeviceId && !creditedDevices.includes(devId));

          if (newDevices.length > 0) {
            newDevices.forEach(devId => {
              creditedDevices.push(devId);
              // Grant quest progress reward
              progressManager.updateQuestProgress('share_game', 1);
            });
            
            // Save updated credited devices
            localStorage.setItem('credited_referral_devices', JSON.stringify(creditedDevices));

            // Notify player with a toast using existing event
            window.dispatchEvent(new CustomEvent('achievement_unlocked', {
              detail: { 
                name: "REFERRAL COMPLETED! 🚀", 
                desc: `${newDevices.length} friend(s) opened your shared link! Share progress +${newDevices.length}` 
              }
            }));
            
            uiManager.render();
          }
        })
        .catch(err => console.error("Referral check failed:", err));
    });
  }, 10000); // Check every 10 seconds

  // Resize handling
  window.addEventListener('resize', () => {
    gameEngine.renderer.resize();
    uiManager.render();
  });

  setupInputs();
  
  // Kick off the loop
  lastTime = performance.now();
  requestAnimationFrame(loop);

  // Handle page visibility changes (mute/pause music when backgrounded/hidden)
  document.addEventListener('visibilitychange', () => {
    soundManager.handleVisibilityChange(document.hidden);
  });

  // Start/resume menu music and AudioContext on any user gesture (browser autoplay policy workaround)
  const playMenuMusicOnGesture = () => {
    soundManager.resumeContext();
    const shouldPlayMenuMusic = gameEngine.state === 'MENU' ||
                                gameEngine.state === 'GAMEOVER' ||
                                gameEngine.state === 'DEMO_COMPLETE';
    if (shouldPlayMenuMusic) {
      soundManager.startMenuMusic();
    }
  };
  window.addEventListener('pointerdown', playMenuMusicOnGesture);
  window.addEventListener('keydown', playMenuMusicOnGesture);

  // Fade out and remove the loading screen once initialization completes
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
      loadingScreen.remove();
    }, 500); // 500ms matching transition duration
  }
}

function setupInputs() {
  const onActionInput = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || 
        target.closest('input') || 
        target.closest('a') || 
        target.closest('.hud-ultimate-container') || 
        target.closest('.hud-ult-circle-btn') || 
        target.closest('#btn-hud-booster') ||
        target.closest('#btn-hud-flock-merge') ||
        target.closest('#btn-hud-active-skill') ||
        target.closest('.hud-circle-btn')) {
      return;
    }

    if (gameEngine.state === 'PLAYING' || gameEngine.state === 'BOSS_FIGHT') {
      // ALWAYS jump instantly on every single click/tap! No blocking or delay!
      gameEngine.jump();
    } else if (gameEngine.state === 'GAMEOVER') {
      const retryBtn = document.getElementById('btn-retry');
      if (retryBtn) retryBtn.click();
    }
  };

  window.addEventListener('pointerdown', onActionInput);

  // Play corresponding click/action sound instantly on pointerdown (touch down)
  const onUIPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Resolve closest interactive element
    const interactive = target.closest('button, a, .btn, .card, .tab, .side-btn, .settings-slider, .hud-circle-btn, [id*="btn-"], [class*="btn-"]');
    if (!interactive) return;

    // Explicitly resume/warm up AudioContext if suspended
    soundManager.resumeContext();

    const id = interactive.id || '';
    const className = interactive.className || '';

    if (id.includes('back') || className.includes('back') || id === 'btn-quit' || id.includes('quit') || id.includes('close')) {
      soundManager.playUIBack();
    } else if (id.includes('select') || className.includes('select') || className.includes('tab') || className.includes('card') || className.includes('side-btn')) {
      soundManager.playUISelect();
    } else if (id.includes('claim') || id.includes('reward')) {
      soundManager.playUIClaim();
    } else if (id.includes('upgrade') || id.includes('buy')) {
      soundManager.playUIUpgrade();
    } else {
      soundManager.playUIClick();
    }
  };
  window.addEventListener('pointerdown', onUIPointerDown, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (gameEngine.state === 'PLAYING' || gameEngine.state === 'BOSS_FIGHT') {
        gameEngine.jump();
      }
    } else if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      e.preventDefault();
      if (gameEngine.state === 'PLAYING' || gameEngine.state === 'BOSS_FIGHT') {
        gameEngine.triggerUltimate();
        uiManager.render();
      }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      if (gameEngine.state === 'PLAYING' || gameEngine.state === 'PAUSED' || gameEngine.state === 'BOSS_FIGHT') {
        gameEngine.togglePause();
        uiManager.render();
      }
    } else if (e.code === 'KeyK') {
      e.preventDefault();
      if (gameEngine.state === 'PLAYING') {
        if (gameEngine.score < 100) {
          gameEngine.score = 105;
          console.log("Debug: score set to 105 (Cos-based Out-of-Phase 100-150)");
        } else if (gameEngine.score < 150) {
          gameEngine.score = 155;
          console.log("Debug: score set to 155 (Cos-based Out-of-Phase 150-200)");
        } else if (gameEngine.score < 200) {
          gameEngine.score = 220;
          console.log("Debug: score set to 220 (Cos-based Out-of-Phase 200-300)");
        } else if (gameEngine.score < 300) {
          gameEngine.score = 350;
          console.log("Debug: score set to 350 (Cos-based Out-of-Phase 300-500)");
        } else {
          gameEngine.score = 0;
          console.log("Debug: score set to 0");
        }
        uiManager.render();
      }
    }
  });
}

let lastButtonState = false;
function updateGamepad() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gamepads[0];
  if (!gp) return;

  const aButton = gp.buttons[0];
  if (aButton && aButton.pressed) {
    if (!lastButtonState) {
      lastButtonState = true;
      if (gameEngine.state === 'PLAYING' || gameEngine.state === 'BOSS_FIGHT') {
        gameEngine.jump();
      }
    }
  } else {
    lastButtonState = false;
  }
}

function loop(time: number) {
  const elapsed = time - lastTime;
  if (elapsed <= 0) {
    requestAnimationFrame(loop);
    return;
  }
  
  // Use exact elapsed time, capping raw deltaTime to 0.1s to prevent huge jumps on sudden lag spikes
  const rawDeltaTime = Math.min(0.1, elapsed / 1000);
  lastTime = time;

  // Snaps raw delta time to VSync intervals (120Hz, 90Hz, 60Hz, 30Hz) to eliminate micro-jitter
  let deltaTime = snapDeltaTime(rawDeltaTime);

  // Removed the heavy 0.85 low-pass filter as it decouples physics step updates from actual render frame intervals,
  // causing visible vibration/judder. Snap delta time is highly stable and does not need trailing averaging.

  updateGamepad();

  gameEngine.update(deltaTime);

  const activeWorld = progressManager.getState().activeWorld;
  const ctx = gameEngine.renderer.ctx;
  const height = gameEngine.renderer.canvas.height / gameEngine.renderer.dpr;


  gameEngine.renderer.clearScreen(activeWorld);
  
  gameEngine.renderer.renderBackgroundLayers(activeWorld);

  gameEngine.renderer.beginCamera();
  gameEngine.obstacleManager.render(ctx, height);
  gameEngine.powerupManager.render(ctx, gameEngine);
  gameEngine.bossManager.render(ctx, gameEngine.state === 'GAMEOVER');
  const isNeonCrowUltimate = gameEngine.ultimateActive && gameEngine.bird && gameEngine.bird.getSkin().id === 'neon_crow';
  if ((gameEngine.gameMode === 'flock' || isNeonCrowUltimate) && gameEngine.flock && gameEngine.flock.length > 0) {
    const len = gameEngine.flock.length;
    for (let i = len - 1; i >= 0; i--) {
      gameEngine.flock[i].render(ctx);
    }

    // Squad Survival Aura: glowing ring and fill around leader bird when merged Boss HP is active
    if (gameEngine.playerBossHP > 0) {
      const leader = gameEngine.flock[0];
      const hp = gameEngine.playerBossHP;
      const auraColor = '#ff007f'; // Beautiful glowing pink/crimson
      const baseRadius = leader.radius;
      const pulseScale = 1 + 0.10 * Math.sin(performance.now() * 0.007);
      const auraRadius = baseRadius * (1.1 + hp * 0.02) * pulseScale;

      ctx.save();
      ctx.globalAlpha = 0.3 + 0.12 * Math.sin(performance.now() * 0.007);
      ctx.strokeStyle = auraColor;
      ctx.lineWidth = 2.0 + hp * 0.4;
      ctx.beginPath();
      ctx.arc(Math.round(leader.x), Math.round(leader.y), auraRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.06 + 0.02 * Math.sin(performance.now() * 0.007);
      ctx.fillStyle = auraColor;
      ctx.beginPath();
      ctx.arc(Math.round(leader.x), Math.round(leader.y), auraRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    if (gameEngine.state !== 'MENU') {
      gameEngine.bird.render(ctx);
    }
  }
  gameEngine.particleEngine.render(ctx);
  gameEngine.renderer.endCamera();

  gameEngine.renderer.renderWeatherEffects();

  gameEngine.renderer.applyCinematicBloom(activeWorld);

  gameEngine.renderer.restoreScreen();

  if (gameEngine.state === 'PLAYING' || gameEngine.state === 'BOSS_FIGHT' || gameEngine.state === 'BOSS_WARNING') {
    // Highly optimized in-place HUD updates run once every 3 frames (~20Hz) to cut CPU load by 67% on mobile!
    hudFrameCount++;
    if (hudFrameCount % 3 === 0) {
      uiManager.render();
    }
    lastState = gameEngine.state;
  } else {
    // Standard state change checks for menus, pause screen, and game over
    const currentBossHealth = gameEngine.bossManager.isBossActive() ? gameEngine.bossManager.getHealth() : 0;
    const currentUltPercent = Math.min(100, Math.floor(gameEngine.ultimateEnergy));
    if (gameEngine.score !== lastScore || gameEngine.state !== lastState || currentBossHealth !== lastBossHealth || currentUltPercent !== lastUltPercent) {
      lastScore = gameEngine.score;
      lastState = gameEngine.state;
      lastBossHealth = currentBossHealth;
      lastUltPercent = currentUltPercent;
      uiManager.render();
    }
    // Animate character previews continuously in hangar/menus when not actively playing
    uiManager.drawSkinPreviews();
  }

  // ── Menu music BGM state control ────
  const shouldPlayMenuMusic = gameEngine.state === 'MENU' ||
                              gameEngine.state === 'GAMEOVER' ||
                              gameEngine.state === 'DEMO_COMPLETE';

  if (shouldPlayMenuMusic && !isMenuMusicActive) {
    soundManager.startMenuMusic();
    isMenuMusicActive = true;
  } else if (!shouldPlayMenuMusic && isMenuMusicActive) {
    soundManager.stopMenuMusic();
    isMenuMusicActive = false;
  }

  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    init();
  });
} else {
  init();
}
