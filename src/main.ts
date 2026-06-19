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
    <h2 style="color: #ff0055; margin-top: 0; text-shadow: 0 0 10px rgba(255,0,85,0.4);">🚨 FLIGHT OF LEGENDS CRASHED!</h2>
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
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   window.innerWidth < 1024 || 
                   ('ontouchstart' in window) || 
                   navigator.maxTouchPoints > 0;
  if (isMobile) {
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

  // Start Glass Alibi menu music on first user gesture (autoplay policy workaround)
  const startMenuMusicOnce = () => {
    soundManager.startMenuMusic();
    window.removeEventListener('pointerdown', startMenuMusicOnce);
    window.removeEventListener('keydown', startMenuMusicOnce);
  };
  window.addEventListener('pointerdown', startMenuMusicOnce);
  window.addEventListener('keydown', startMenuMusicOnce);
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

const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       window.innerWidth < 1024 || 
                       ('ontouchstart' in window) || 
                       navigator.maxTouchPoints > 0;
const frameMinTime = isMobileDevice ? 1000 / 60 : 1000 / 120; // Cap to 60fps on mobile to prevent thermal throttling, 120fps on desktop!

function loop(time: number) {
  const elapsed = time - lastTime;
  if (elapsed < frameMinTime - 1) { // 1ms tolerance for requestAnimationFrame timing jitter
    requestAnimationFrame(loop);
    return;
  }
  const deltaTime = elapsed / 1000;
  lastTime = time;

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
  gameEngine.bossManager.render(ctx, gameEngine.bird.isCrashing);
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
    gameEngine.bird.render(ctx);
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

  // ── Menu music: play on all non-gameplay screens, stop during gameplay ────
  const isPlaying = gameEngine.state === 'PLAYING' ||
                    gameEngine.state === 'BOSS_FIGHT' ||
                    gameEngine.state === 'BOSS_WARNING' ||
                    gameEngine.state === 'PRELOADING' ||
                    gameEngine.state === 'REVIVE_CHOICE'; // world music plays here

  if (isPlaying && isMenuMusicActive) {
    soundManager.stopMenuMusic();
    isMenuMusicActive = false;
  } else if (!isPlaying && !isMenuMusicActive) {
    soundManager.startMenuMusic();
    isMenuMusicActive = true;
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
