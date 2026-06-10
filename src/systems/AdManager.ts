declare global {
  interface Window {
    AndroidBridge?: {
      showAdMobInterstitial(): void;
      showUnityInterstitial(): void;
      showAdMobRewarded(callbackName: string): void;
      showUnityRewarded(callbackName: string): void;
      showInterstitial?(): void;
    };
    AndroidAdMob?: {
      showBanner(): void;
      hideBanner(): void;
      showInterstitial(): void;
      showRewarded(callbackName: string): void;
    };
    onAdMobRewardedCallback?: (success: boolean) => void;
    onUnityRewardedCallback?: (success: boolean) => void;
    gameEngine?: any;
  }
}

export class AdManager {
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

  /**
   * Triggers a rewarded ad for the Economy / Booster system.
   * Enforces a 3-minute cooldown.
   */
  public static showEconomyRewarded(onCompleted: (success: boolean) => void) {
    const now = Date.now();
    const remaining = this.getEconomyCooldownRemaining();

    if (remaining > 0) {
      console.warn(`[AdManager] Economy rewarded ads are locked for another ${Math.ceil(remaining / 1000)}s.`);
      onCompleted(false);
      return;
    }

    // Lock cooldown immediately
    this.lastEconomyRewardedTime = now;
    this.updateAdButtonsDOM();

    const network = this.nextEconomyRewardNetwork;
    console.log(`[AdManager] Requesting Economy ad from network: ${network}`);

    if (network === 'AdMob') {
      this.nextEconomyRewardNetwork = 'Unity';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showAdMobRewarded) {
        window.onAdMobRewardedCallback = (success: boolean) => {
          onCompleted(success);
          delete window.onAdMobRewardedCallback;
        };
        window.AndroidBridge.showAdMobRewarded("onAdMobRewardedCallback");
      } else {
        console.log("[AdManager Mock] showAdMobRewarded(Economy) - simulating ad completion");
        setTimeout(() => {
          onCompleted(true);
        }, 1500);
      }
    } else {
      this.nextEconomyRewardNetwork = 'AdMob';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showUnityRewarded) {
        window.onUnityRewardedCallback = (success: boolean) => {
          onCompleted(success);
          delete window.onUnityRewardedCallback;
        };
        window.AndroidBridge.showUnityRewarded("onUnityRewardedCallback");
      } else {
        console.log("[AdManager Mock] showUnityRewarded(Economy) - simulating ad completion");
        setTimeout(() => {
          onCompleted(true);
        }, 1500);
      }
    }
  }

  /**
   * Triggers a rewarded ad for the Revive system.
   * Enforces an independent 2-minute cooldown.
   */
  public static showReviveRewarded(onCompleted: (success: boolean) => void) {
    const now = Date.now();
    const remaining = this.getReviveCooldownRemaining();

    if (remaining > 0) {
      console.warn(`[AdManager] Revive rewarded ads are locked for another ${Math.ceil(remaining / 1000)}s.`);
      onCompleted(false);
      return;
    }

    // Lock cooldown immediately
    this.lastReviveRewardedTime = now;
    this.updateAdButtonsDOM();

    const network = this.nextReviveNetwork;
    console.log(`[AdManager] Requesting Revive ad from network: ${network}`);

    if (network === 'AdMob') {
      this.nextReviveNetwork = 'Unity';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showAdMobRewarded) {
        window.onAdMobRewardedCallback = (success: boolean) => {
          onCompleted(success);
          delete window.onAdMobRewardedCallback;
        };
        window.AndroidBridge.showAdMobRewarded("onAdMobRewardedCallback");
      } else {
        console.log("[AdManager Mock] showAdMobRewarded(Revive) - simulating ad completion");
        setTimeout(() => {
          onCompleted(true);
        }, 1500);
      }
    } else {
      this.nextReviveNetwork = 'AdMob';

      if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge.showUnityRewarded) {
        window.onUnityRewardedCallback = (success: boolean) => {
          onCompleted(success);
          delete window.onUnityRewardedCallback;
        };
        window.AndroidBridge.showUnityRewarded("onUnityRewardedCallback");
      } else {
        console.log("[AdManager Mock] showUnityRewarded(Revive) - simulating ad completion");
        setTimeout(() => {
          onCompleted(true);
        }, 1500);
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
    // A. Economy & Booster buttons (3-minute timeline)
    const ecoRemaining = this.getEconomyCooldownRemaining();
    const isEcoCooldownActive = ecoRemaining > 0;
    const ecoTimeText = isEcoCooldownActive ? `Wait ${this.formatTime(ecoRemaining)}` : '';

    // 1. Plus Coins Icon Button
    const plusCoinsBtn = document.getElementById('btn-plus-coins') as HTMLButtonElement | null;
    if (plusCoinsBtn) {
      if (isEcoCooldownActive) {
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
      if (isEcoCooldownActive) {
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
      if (isEcoCooldownActive) {
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
    const revTimeText = isRevCooldownActive ? `Wait ${this.formatTime(revRemaining)}` : '';

    // 4. Revive Screen Button ("WATCH AD TO REVIVE")
    const reviveBtn = document.getElementById('btn-ad-revive') as HTMLButtonElement | null;
    if (reviveBtn) {
      if (isRevCooldownActive) {
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
    if (typeof window.AndroidBridge !== 'undefined' && (window.AndroidBridge as any).showBanner) {
      (window.AndroidBridge as any).showBanner();
    } else if (typeof window.AndroidAdMob !== 'undefined') {
      window.AndroidAdMob.showBanner();
    } else {
      console.log("[AdMob Mock] showBanner()");
    }
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
