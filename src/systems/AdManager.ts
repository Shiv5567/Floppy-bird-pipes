declare global {
  interface Window {
    AndroidBridge?: {
      showAdMobInterstitial(callbackName?: string): void;
      showUnityInterstitial(callbackName?: string): void;
      showAdMobRewarded(callbackName: string): void;
      showUnityRewarded(callbackName: string): void;
      showInterstitial?(): void;
      preloadAds?(): void;
      isAdReady?(adType: string): boolean;
    };
    AndroidAdMob?: {
      showBanner(): void;
      hideBanner(): void;
      showInterstitial(): void;
      showRewarded(callbackName: string): void;
    };
    onAdMobRewardedCallback?: (success: boolean) => void;
    onUnityRewardedCallback?: (success: boolean) => void;
    onReviveInterstitialCallback?: (success: boolean) => void;
    setOnlineStatus?: (online: boolean) => void;
    gameEngine?: any;
  }
}

export class AdManager {
  private static readonly OFFLINE_EMOJI_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" style="display: inline-block; vertical-align: middle; filter: drop-shadow(0 0 4px rgba(255, 51, 102, 0.4));"><path d="M12 18a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="#00d2ff"/><path d="M8.5 11.5a5 5 0 017 0" stroke="#00d2ff" stroke-width="2" stroke-linecap="round"/><path d="M5.5 8.5a9.2 9.2 0 0113 0" stroke="#00d2ff" stroke-width="2" stroke-linecap="round"/><path d="M2.5 5.5a13.4 13.4 0 0119 0" stroke="#00d2ff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="10" stroke="#ff3366" stroke-width="2.5"/><line x1="5" y1="5" x2="19" y2="19" stroke="#ff3366" stroke-width="2.5"/></svg>`;
  private static readonly INTERSTITIAL_COOLDOWN = 300000; // 5 minutes (300,000 ms)
  private static readonly ECONOMY_COOLDOWN = 180000; // 3 minutes (180,000 ms)
  private static readonly REVIVE_COOLDOWN = 120000; // 2 minutes (120,000 ms)

  // 1. Interstitial ad state
  private static lastInterstitialTime: number = Date.now();
  private static isInterstitialPending: boolean = false;
  private static nextInterstitialNetwork: 'AdMob' | 'Unity' = 'AdMob';

  // 2. Economy / Booster ad state
  private static lastEconomyRewardedTime: number = 0;
  private static nextEconomyRewardNetwork: 'AdMob' | 'Unity' = 'AdMob';

  // 3. Revive ad state
  private static lastReviveRewardedTime: number = 0;
  private static nextReviveNetwork: 'AdMob' | 'Unity' = 'AdMob';

  private static updateTimer: any = null;

  // 4. Online state
  public static isOnline: boolean = navigator.onLine;

  public static initializeOnlineTracking() {
    this.updateOnlineStatus(navigator.onLine);

    window.addEventListener('online', () => {
      console.log("[AdManager] Browser went online.");
      this.updateOnlineStatus(true);
    });
    window.addEventListener('offline', () => {
      console.log("[AdManager] Browser went offline.");
      this.updateOnlineStatus(false);
    });

    window.setOnlineStatus = (online: boolean) => {
      console.log(`[AdManager] Native pushed online status: ${online}`);
      this.updateOnlineStatus(online);
    };
  }

  private static updateOnlineStatus(online: boolean) {
    this.isOnline = online;

    let dot = document.getElementById('online-indicator');
    if (!dot) {
      dot = document.createElement('div');
      dot.id = 'online-indicator';
      dot.style.cssText = `
        position: fixed;
        top: 12px;
        left: 12px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: #00d2ff;
        z-index: 99999;
        box-shadow: 0 0 10px #00d2ff, 0 0 20px #00d2ff;
        pointer-events: none;
        transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        opacity: 0;
        transform: scale(0.5);
        animation: pulseDot 2s infinite ease-in-out;
      `;

      if (!document.getElementById('pulse-dot-style')) {
        const style = document.createElement('style');
        style.id = 'pulse-dot-style';
        style.textContent = `
          @keyframes pulseDot {
            0%, 100% {
              box-shadow: 0 0 8px #00d2ff, 0 0 16px rgba(0, 210, 255, 0.4);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 14px #00d2ff, 0 0 24px rgba(0, 210, 255, 0.7);
              transform: scale(1.15);
            }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(dot);
    }

    if (online) {
      dot.style.display = 'block';
      requestAnimationFrame(() => {
        if (dot) {
          dot.style.opacity = '1';
          dot.style.transform = 'scale(1)';
        }
      });

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.preloadAds) {
        console.log("[AdManager] Requesting native ad preload since device is online.");
        window.AndroidBridge.preloadAds();
      }
    } else {
      dot.style.opacity = '0';
      dot.style.transform = 'scale(0.5)';
      setTimeout(() => {
        if (!this.isOnline && dot) {
          dot.style.display = 'none';
        }
      }, 300);
    }
  }

  private static showAdLoadingOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.id = 'ad-loading-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(6, 5, 11, 0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      font-family: 'Outfit', sans-serif;
      animation: fadeInAdOverlay 0.3s ease forwards;
    `;

    overlay.innerHTML = `
      <div style="position: relative; width: 64px; height: 64px;">
        <div style="
          position: absolute;
          inset: 0;
          border: 4px solid rgba(0, 243, 255, 0.08);
          border-top: 4px solid #00f3ff;
          border-radius: 50%;
          animation: spinClockwiseAd 1s infinite linear;
          box-shadow: 0 0 15px rgba(0, 243, 255, 0.4);
        "></div>
        <div style="
          position: absolute;
          inset: 8px;
          border: 4px solid rgba(255, 0, 127, 0.08);
          border-bottom: 4px solid #ff007f;
          border-radius: 50%;
          animation: spinCounterClockwiseAd 0.8s infinite linear;
          box-shadow: 0 0 12px rgba(255, 0, 127, 0.3);
        "></div>
      </div>
      <div style="color: #ffffff; font-size: 16px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; text-shadow: 0 0 8px rgba(255,255,255,0.2);">
        Preparing Ad...
      </div>
      <div style="color: rgba(255, 255, 255, 0.45); font-size: 11px; letter-spacing: 0.5px; font-weight: 600;">
        Optimizing connection for mobile delivery
      </div>
      <style>
        @keyframes fadeInAdOverlay {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spinClockwiseAd {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spinCounterClockwiseAd {
          0% { transform: rotate(360deg); }
          100% { transform: rotate(0deg); }
        }
      </style>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  private static isAdAvailable(network: 'AdMob' | 'Unity', type: 'Rewarded' | 'Interstitial'): boolean {
    if (typeof window.AndroidBridge === 'undefined' || !window.AndroidBridge.isAdReady) {
      return true;
    }
    const key = network + type;
    return window.AndroidBridge.isAdReady(key);
  }

  /**
   * Helper to check if the user is currently in an active game run.
   */
  private static isInRun(): boolean {
    const engine = window.gameEngine;
    if (engine) {
      const activeStates = ['PLAYING', 'BOSS_WARNING', 'BOSS_FIGHT', 'PAUSED', 'REVIVE_CHOICE'];
      return activeStates.includes(engine.state);
    }
    return false;
  }

  /**
   * Triggers an interstitial ad. Gated by 5-minute cooldown.
   * Defers display if user is actively playing.
   */
  public static triggerInterstitial() {
    const now = Date.now();
    if (now - this.lastInterstitialTime >= this.INTERSTITIAL_COOLDOWN) {
      if (this.isInRun()) {
        this.isInterstitialPending = true;
        console.log("[AdManager] Interstitial cooldown elapsed, but user is actively playing. Deferring ad.");
      } else {
        this.showInterstitialNow();
      }
    } else {
      const secLeft = Math.ceil((this.INTERSTITIAL_COOLDOWN - (now - this.lastInterstitialTime)) / 1000);
      console.log(`[AdManager] Interstitial ad on cooldown. ${secLeft}s remaining.`);
    }
  }

  /**
   * Hook called at transition points: Game Over, Returning to Menu, or Restarting.
   * Fires the ad if it was deferred during play.
   */
  public static onTransitionPoint() {
    const now = Date.now();
    const cooldownElapsed = (now - this.lastInterstitialTime >= this.INTERSTITIAL_COOLDOWN);
    
    console.log(`[AdManager] Transition point hit. Pending: ${this.isInterstitialPending}, Cooldown elapsed: ${cooldownElapsed}`);
    
    if (this.isInterstitialPending || cooldownElapsed) {
      this.showInterstitialNow();
    }
  }

  /**
   * Triggers the Native Interstitial ad, alternating between networks.
   */
  private static showInterstitialNow() {
    this.lastInterstitialTime = Date.now();
    this.isInterstitialPending = false;

    const network = this.nextInterstitialNetwork;
    console.log(`[AdManager] Firing interstitial ad from network: ${network}`);

    if (network === 'AdMob') {
      this.nextInterstitialNetwork = 'Unity';
      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showAdMobInterstitial) {
        window.AndroidBridge.showAdMobInterstitial();
      } else if (typeof window.AndroidAdMob !== 'undefined' && window.AndroidAdMob.showInterstitial) {
        window.AndroidAdMob.showInterstitial();
      } else {
        console.log("[AdManager Mock] showAdMobInterstitial()");
      }
    } else {
      this.nextInterstitialNetwork = 'AdMob';
      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showUnityInterstitial) {
        window.AndroidBridge.showUnityInterstitial();
      } else {
        console.log("[AdManager Mock] showUnityInterstitial()");
      }
    }
  }

  private static notifyUser(title: string, message: string) {
    const engine = window.gameEngine;
    if (engine && engine.uiManager && typeof engine.uiManager.showToastNotification === 'function') {
      engine.uiManager.showToastNotification(title, message);
    } else {
      alert(`${title}: ${message}`);
    }
  }

  /**
   * Triggers a rewarded ad for the Economy / Booster system.
   * Enforces a 3-minute cooldown.
   */
  public static showEconomyRewarded(onCompleted: (success: boolean) => void) {
    const remaining = this.getEconomyCooldownRemaining();

    if (remaining > 0) {
      console.warn(`[AdManager] Economy rewarded ads are locked for another ${Math.ceil(remaining / 1000)}s.`);
      onCompleted(false);
      return;
    }

    if (!this.isOnline) {
      this.notifyUser('OFFLINE', 'Please connect to the internet to watch ads.');
      onCompleted(false);
      return;
    }

    const network = this.nextEconomyRewardNetwork;
    const isReady = this.isAdAvailable(network, 'Rewarded');

    if (isReady) {
      this.executeRewardedNow(network, onCompleted);
    } else {
      console.log(`[AdManager] Economy rewarded ad not ready on ${network}. Triggering preload and waiting...`);
      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.preloadAds) {
        window.AndroidBridge.preloadAds();
      }

      const spinner = this.showAdLoadingOverlay();
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 500;
        const ready = this.isAdAvailable(network, 'Rewarded');
        if (ready) {
          clearInterval(interval);
          spinner.remove();
          this.executeRewardedNow(network, onCompleted);
        } else if (elapsed >= 6000) {
          clearInterval(interval);
          spinner.remove();
          console.warn(`[AdManager] Economy rewarded ad load timeout.`);
          this.notifyUser('AD NOT READY', 'Ad is taking longer to load. Please try again.');
          onCompleted(false);
        }
      }, 500);
    }
  }

  private static executeRewardedNow(network: 'AdMob' | 'Unity', onCompleted: (success: boolean) => void) {
    console.log(`[AdManager] Requesting Economy ad from network: ${network}`);

    if (network === 'AdMob') {
      this.nextEconomyRewardNetwork = 'Unity';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showAdMobRewarded) {
        window.onAdMobRewardedCallback = (success: boolean) => {
          if (success) {
            this.lastEconomyRewardedTime = Date.now();
            this.updateAdButtonsDOM();
          }
          onCompleted(success);
          delete window.onAdMobRewardedCallback;
        };
        window.AndroidBridge.showAdMobRewarded("onAdMobRewardedCallback");
      } else {
        console.log("[AdManager Mock] showAdMobRewarded(Economy) - simulating ad completion");
        setTimeout(() => {
          this.lastEconomyRewardedTime = Date.now();
          this.updateAdButtonsDOM();
          onCompleted(true);
        }, 1500);
      }
    } else {
      this.nextEconomyRewardNetwork = 'AdMob';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showUnityRewarded) {
        window.onUnityRewardedCallback = (success: boolean) => {
          if (success) {
            this.lastEconomyRewardedTime = Date.now();
            this.updateAdButtonsDOM();
          }
          onCompleted(success);
          delete window.onUnityRewardedCallback;
        };
        window.AndroidBridge.showUnityRewarded("onUnityRewardedCallback");
      } else {
        console.log("[AdManager Mock] showUnityRewarded(Economy) - simulating ad completion");
        setTimeout(() => {
          this.lastEconomyRewardedTime = Date.now();
          this.updateAdButtonsDOM();
          onCompleted(true);
        }, 1500);
      }
    }
  }

  /**
   * Triggers an interstitial ad for the Revive system.
   * Enforces an independent 2-minute cooldown.
   */
  public static showReviveInterstitial(onCompleted: (success: boolean) => void) {
    const remaining = this.getReviveCooldownRemaining();

    if (remaining > 0) {
      console.warn(`[AdManager] Revive interstitial ads are locked for another ${Math.ceil(remaining / 1000)}s.`);
      onCompleted(false);
      return;
    }

    if (!this.isOnline) {
      this.notifyUser('OFFLINE', 'Please connect to the internet to watch ads.');
      onCompleted(false);
      return;
    }

    const network = this.nextReviveNetwork;
    const isReady = this.isAdAvailable(network, 'Interstitial');

    if (isReady) {
      this.executeInterstitialNow(network, onCompleted);
    } else {
      console.log(`[AdManager] Revive interstitial ad not ready on ${network}. Triggering preload and waiting...`);
      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.preloadAds) {
        window.AndroidBridge.preloadAds();
      }

      const spinner = this.showAdLoadingOverlay();
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 500;
        const ready = this.isAdAvailable(network, 'Interstitial');
        if (ready) {
          clearInterval(interval);
          spinner.remove();
          this.executeInterstitialNow(network, onCompleted);
        } else if (elapsed >= 6000) {
          clearInterval(interval);
          spinner.remove();
          console.warn(`[AdManager] Revive interstitial ad load timeout.`);
          this.notifyUser('AD NOT READY', 'Ad is taking longer to load. Please try again.');
          onCompleted(false);
        }
      }, 500);
    }
  }

  private static executeInterstitialNow(network: 'AdMob' | 'Unity', onCompleted: (success: boolean) => void) {
    console.log(`[AdManager] Requesting Revive Interstitial ad from network: ${network}`);

    if (network === 'AdMob') {
      this.nextReviveNetwork = 'Unity';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showAdMobInterstitial) {
        window.onReviveInterstitialCallback = (success: boolean) => {
          if (success) {
            this.lastReviveRewardedTime = Date.now();
            this.updateAdButtonsDOM();
          }
          onCompleted(success);
          delete window.onReviveInterstitialCallback;
        };
        window.AndroidBridge.showAdMobInterstitial("onReviveInterstitialCallback");
      } else if (typeof window.AndroidAdMob !== 'undefined' && window.AndroidAdMob.showInterstitial) {
        window.AndroidAdMob.showInterstitial();
        this.lastReviveRewardedTime = Date.now();
        this.updateAdButtonsDOM();
        setTimeout(() => onCompleted(true), 1500);
      } else {
        console.log("[AdManager Mock] showAdMobInterstitial(Revive)");
        this.lastReviveRewardedTime = Date.now();
        this.updateAdButtonsDOM();
        setTimeout(() => onCompleted(true), 1500);
      }
    } else {
      this.nextReviveNetwork = 'AdMob';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showUnityInterstitial) {
        window.onReviveInterstitialCallback = (success: boolean) => {
          if (success) {
            this.lastReviveRewardedTime = Date.now();
            this.updateAdButtonsDOM();
          }
          onCompleted(success);
          delete window.onReviveInterstitialCallback;
        };
        window.AndroidBridge.showUnityInterstitial("onReviveInterstitialCallback");
      } else {
        console.log("[AdManager Mock] showUnityInterstitial(Revive)");
        this.lastReviveRewardedTime = Date.now();
        this.updateAdButtonsDOM();
        setTimeout(() => onCompleted(true), 1500);
      }
    }
  }

  /**
   * Returns remaining economy ad cooldown in milliseconds.
   */
  public static getEconomyCooldownRemaining(): number {
    const elapsed = Date.now() - this.lastEconomyRewardedTime;
    return Math.max(0, this.ECONOMY_COOLDOWN - elapsed);
  }

  /**
   * Returns remaining revive ad cooldown in milliseconds.
   */
  public static getReviveCooldownRemaining(): number {
    const elapsed = Date.now() - this.lastReviveRewardedTime;
    return Math.max(0, this.REVIVE_COOLDOWN - elapsed);
  }

  /**
   * Formats milliseconds into standard MM:SS string (with 2-digit padding).
   */
  private static formatTime(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const padMin = minutes.toString().padStart(2, '0');
    const padSec = seconds.toString().padStart(2, '0');
    return `${padMin}:${padSec}`;
  }

  /**
   * Scans and updates DOM ad elements, injecting the ticking "Time Lap" digital timer.
   */
  public static updateAdButtonsDOM() {
    const isOffline = !this.isOnline;

    // A. Economy & Booster buttons (3-minute timeline)
    const ecoRemaining = this.getEconomyCooldownRemaining();
    const isEcoCooldownActive = ecoRemaining > 0;
    const ecoTimeText = isEcoCooldownActive ? this.formatTime(ecoRemaining) : '';

    // 1. Plus Coins Icon Button
    const plusCoinsBtn = document.getElementById('btn-plus-coins') as HTMLButtonElement | null;
    if (plusCoinsBtn) {
      if (isOffline) {
        plusCoinsBtn.disabled = false;
        plusCoinsBtn.classList.remove('disabled-ad-btn');
        plusCoinsBtn.innerText = '+';
      } else if (isEcoCooldownActive) {
        plusCoinsBtn.disabled = true;
        plusCoinsBtn.classList.add('disabled-ad-btn');
        plusCoinsBtn.innerText = ecoTimeText;
      } else {
        plusCoinsBtn.disabled = false;
        plusCoinsBtn.classList.remove('disabled-ad-btn');
        plusCoinsBtn.innerText = '+';
      }
    }

    // 2. Plus Gems Icon Button
    const plusGemsBtn = document.getElementById('btn-plus-gems') as HTMLButtonElement | null;
    if (plusGemsBtn) {
      if (isOffline) {
        plusGemsBtn.disabled = false;
        plusGemsBtn.classList.remove('disabled-ad-btn');
        plusGemsBtn.innerText = '+';
      } else if (isEcoCooldownActive) {
        plusGemsBtn.disabled = true;
        plusGemsBtn.classList.add('disabled-ad-btn');
        plusGemsBtn.innerText = ecoTimeText;
      } else {
        plusGemsBtn.disabled = false;
        plusGemsBtn.classList.remove('disabled-ad-btn');
        plusGemsBtn.innerText = '+';
      }
    }

    // 3. Extra Rewards Button in Hangar Tab
    const extraRewardsBtn = document.getElementById('btn-extra-rewards') as HTMLButtonElement | null;
    if (extraRewardsBtn) {
      const engine = window.gameEngine;
      const lastClaim = engine?.progressManager?.getState()?.lastSpecialOfferAdTime || 0;
      const dailyCooldown = 24 * 60 * 60 * 1000;
      const elapsed = Date.now() - lastClaim;
      const isDailyCooldownActive = elapsed < dailyCooldown;

      if (isDailyCooldownActive) {
        extraRewardsBtn.disabled = true;
        extraRewardsBtn.classList.add('disabled-ad-btn');
        
        const remainingMs = dailyCooldown - elapsed;
        const totalSecs = Math.ceil(remainingMs / 1000);
        const hours = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        extraRewardsBtn.innerText = `⏳ ${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      } else if (isOffline) {
        extraRewardsBtn.disabled = true;
        extraRewardsBtn.classList.add('disabled-ad-btn');
        extraRewardsBtn.innerText = 'OFFLINE 🔌';
      } else if (isEcoCooldownActive) {
        extraRewardsBtn.disabled = true;
        extraRewardsBtn.classList.add('disabled-ad-btn');
        extraRewardsBtn.innerText = ecoTimeText;
      } else {
        extraRewardsBtn.disabled = false;
        extraRewardsBtn.classList.remove('disabled-ad-btn');
        extraRewardsBtn.innerText = 'CLAIM 🎁';
      }
    }

    // B. Revive buttons (2-minute timeline)
    const revRemaining = this.getReviveCooldownRemaining();
    const isRevCooldownActive = revRemaining > 0;
    const revTimeText = isRevCooldownActive ? this.formatTime(revRemaining) : '';

    // 4. Revive Screen Button ("WATCH AD TO REVIVE")
    const reviveBtn = document.getElementById('btn-ad-revive') as HTMLButtonElement | null;
    if (reviveBtn) {
      if (isOffline) {
        reviveBtn.disabled = true;
        reviveBtn.classList.add('disabled-ad-btn');
        reviveBtn.style.opacity = '0.5';
        reviveBtn.style.cursor = 'not-allowed';
        reviveBtn.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px;">${this.OFFLINE_EMOJI_SVG} WATCH AD</span>`;
      } else if (isRevCooldownActive) {
        reviveBtn.disabled = true;
        reviveBtn.classList.add('disabled-ad-btn');
        reviveBtn.style.opacity = '0.5';
        reviveBtn.style.cursor = 'not-allowed';
        reviveBtn.innerHTML = `<span>⏳ ${revTimeText}</span>`;
      } else {
        reviveBtn.disabled = false;
        reviveBtn.classList.remove('disabled-ad-btn');
        reviveBtn.style.opacity = '1';
        reviveBtn.style.cursor = 'pointer';
        reviveBtn.innerHTML = `<span>🎬 WATCH AD</span>`;
      }
    }
  }

  /**
   * Starts a background polling timer to tick ad cooldown text displays.
   */
  public static startCooldownTimer() {
    if (this.updateTimer) return;
    
    // Scan and update DOM elements every 500ms for smooth real-time ticking
    this.updateTimer = setInterval(() => {
      this.updateAdButtonsDOM();
    }, 500);
  }

  // --- Legacy banner wrapper triggers ---
  public static showBanner() {
    // Banner ads are permanently disabled in the game
    console.log("[AdManager] showBanner() called but disabled.");
  }

  public static hideBanner() {
    if (typeof window.AndroidBridge !== 'undefined' && (window.AndroidBridge as any).hideBanner) {
      (window.AndroidBridge as any).hideBanner();
    } else if (typeof window.AndroidAdMob !== 'undefined') {
      window.AndroidAdMob.hideBanner();
    } else {
      console.log("[AdMob Mock] hideBanner()");
    }
  }
}

// Start timer automatically when the class file executes
AdManager.startCooldownTimer();
AdManager.initializeOnlineTracking();
