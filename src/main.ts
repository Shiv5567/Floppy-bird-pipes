import './style.css';
import { ProgressManager } from './systems/ProgressManager.ts';
import { SoundManager } from './engine/SoundManager.ts';
import { GameEngine } from './engine/GameEngine.ts';
import { UIManager } from './ui/UIManager.ts';

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

  // Resize handling
  window.addEventListener('resize', () => {
    gameEngine.renderer.resize();
    uiManager.render();
  });

  setupInputs();
  
  // Kick off the loop
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function setupInputs() {
  let lastTapTime = 0;

  const onActionInput = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input') || target.closest('a') || target.closest('.hud-ultimate-container')) {
      return;
    }

    if (gameEngine.state === 'PLAYING' || gameEngine.state === 'BOSS_FIGHT') {
      const now = performance.now();
      // ALWAYS jump instantly on every single click/tap! No blocking or delay!
      gameEngine.jump();
      
      if (now - lastTapTime < 250) {
        // Trigger the Ultimate Special Ability (Option 2) on double tap/click
        gameEngine.triggerUltimate();
        uiManager.render();
      }
      lastTapTime = now;
    } else if (gameEngine.state === 'MENU' && uiManager.getActiveTab() === 'main') {
      const startBtn = document.getElementById('btn-start-game');
      if (startBtn) startBtn.click();
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
  gameEngine.powerupManager.render(ctx);
  gameEngine.bossManager.render(ctx, gameEngine.bird.isCrashing);
  gameEngine.bird.render(ctx);
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
  }

  requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', () => {
  init();
});
