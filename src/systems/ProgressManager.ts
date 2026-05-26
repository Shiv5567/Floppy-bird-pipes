export interface Skin {
  id: string;
  name: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  glowColor: string;
  particleType: string;
  costCoins: number;
  costGems: number;
  unlocked: boolean;
  upgradeLevel: number;
  maxUpgrade: number;
}

export interface BattlePassTier {
  tier: number;
  xpRequired: number;
  rewardName: string;
  rewardType: 'coins' | 'gems' | 'skin';
  rewardValue: any;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  targetValue: number;
  currentValue: number;
  rewardCoins: number;
  rewardGems: number;
  unlocked: boolean;
}

export interface PlayerProgressState {
  level: number;
  xp: number;
  coins: number;
  gems: number;
  highscore: number;
  activeSkin: string;
  activeWorld: string;
  battlePassTier: number;
  battlePassXp: number;
  claimedBPTiers: number[];
  unlockedSkins: string[];
  skinUpgrades: Record<string, number>; // skinId -> level
  achievements: Record<string, number>; // achievementId -> progress value
  unlockedAchievements: string[]; // list of unlocked achievement IDs
  selectedZone: 'classic' | 'wave';
  selectedDifficulty: 'easy' | 'medium' | 'hard';
  lastDailyClaimTime: number;
  dailyQuests: { id: string; name: string; desc: string; target: number; current: number; rewardCoins: number; rewardGems: number; claimed: boolean }[];
  levelModeUnlockedLevel?: number;
  levelModeStars?: Record<number, number>;
}

export class ProgressManager {
  private state!: PlayerProgressState;
  private skins: Skin[] = [];
  private achievements: Achievement[] = [];
  private battlePass: BattlePassTier[] = [];
  private storageKey = 'flight_of_legends_progression_save';

  constructor() {
    this.initDefaultSkins();
    this.initDefaultAchievements();
    this.initDefaultBattlePass();
    this.load();
  }

  private initDefaultSkins() {
    this.skins = [
      {
        id: 'default',
        name: 'Golden Eagle',
        rarity: 'Common',
        glowColor: 'rgba(212, 175, 55, 0.4)',
        particleType: 'default',
        costCoins: 0,
        costGems: 0,
        unlocked: true,
        upgradeLevel: 1,
        maxUpgrade: 5
      },
      {
        id: 'phoenix',
        name: 'Fire Phoenix',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 69, 0, 0.8)',
        particleType: 'fire',
        costCoins: 5000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5
      },
      {
        id: 'cyber',
        name: 'Cybernetic Mech',
        rarity: 'Epic',
        glowColor: 'rgba(0, 243, 255, 0.8)',
        particleType: 'neon',
        costCoins: 2500,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5
      },
      {
        id: 'ice',
        name: 'Ice Crystal',
        rarity: 'Rare',
        glowColor: 'rgba(0, 243, 255, 0.5)',
        particleType: 'ice',
        costCoins: 1200,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5
      },
      {
        id: 'shadow',
        name: 'Shadow Assassin',
        rarity: 'Epic',
        glowColor: 'rgba(128, 0, 128, 0.8)',
        particleType: 'shadow',
        costCoins: 3000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5
      },
      {
        id: 'dragon',
        name: 'Neon Dragon',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 0, 255, 0.8)',
        particleType: 'dragon',
        costCoins: 0,
        costGems: 150,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5
      },
      {
        id: 'nebula',
        name: 'Cosmic Nebula',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 20, 147, 0.8)',
        particleType: 'cosmic',
        costCoins: 0,
        costGems: 250,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5
      },
      {
        id: 'bubble',
        name: 'Bubble Siren',
        rarity: 'Rare',
        glowColor: 'rgba(30, 144, 255, 0.6)',
        particleType: 'bubble',
        costCoins: 800,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5
      }
    ];
  }

  private initDefaultAchievements() {
    this.achievements = [
      {
        id: 'first_flight',
        name: 'First Flight',
        desc: 'Fly a distance of 10 blocks in a single campaign.',
        targetValue: 10,
        currentValue: 0,
        rewardCoins: 100,
        rewardGems: 5,
        unlocked: false
      },
      {
        id: 'near_miss',
        name: 'Near Miss Master',
        desc: 'Squeeze through 25 obstacles with razor-thin gaps.',
        targetValue: 25,
        currentValue: 0,
        rewardCoins: 500,
        rewardGems: 15,
        unlocked: false
      },
      {
        id: 'boss_slayer',
        name: 'Titan Boss Slayer',
        desc: 'Defeat 5 giant modular bosses in the skies.',
        targetValue: 5,
        currentValue: 0,
        rewardCoins: 1000,
        rewardGems: 30,
        unlocked: false
      },
      {
        id: 'coin_hoarder',
        name: 'Gold Hoarder',
        desc: 'Collect 1,000 total gold coins from your flights.',
        targetValue: 1000,
        currentValue: 0,
        rewardCoins: 300,
        rewardGems: 10,
        unlocked: false
      },
      {
        id: 'world_explorer',
        name: 'Atmospheric Explorer',
        desc: 'Unlock and play in 5 different planetary worlds.',
        targetValue: 5,
        currentValue: 1, // default world starts as 1
        rewardCoins: 400,
        rewardGems: 12,
        unlocked: false
      }
    ];
  }

  private initDefaultBattlePass() {
    // Generate 50 tiers of rewards
    for (let i = 1; i <= 50; i++) {
      let rewardName = '';
      let rewardType: 'coins' | 'gems' | 'skin' = 'coins';
      let rewardValue: any = 0;

      if (i % 10 === 0) {
        rewardType = 'skin';
        if (i === 10) {
          rewardName = 'Siren Bubble Skin';
          rewardValue = 'bubble';
        } else if (i === 20) {
          rewardName = 'Ice Crystal Shard';
          rewardValue = 'ice';
        } else if (i === 30) {
          rewardName = 'Cyber Armor Unit';
          rewardValue = 'cyber';
        } else if (i === 40) {
          rewardName = 'Shadow Core Unit';
          rewardValue = 'shadow';
        } else {
          rewardName = 'Legendary Cosmic Nebula';
          rewardValue = 'nebula';
        }
      } else if (i % 2 === 0) {
        rewardType = 'gems';
        rewardValue = i * 2;
        rewardName = `${rewardValue} Cosmic Gems`;
      } else {
        rewardType = 'coins';
        rewardValue = i * 150;
        rewardName = `${rewardValue} Gold Coins`;
      }

      this.battlePass.push({
        tier: i,
        xpRequired: 800 + i * 200,
        rewardName,
        rewardType,
        rewardValue
      });
    }
  }

  public getState(): PlayerProgressState {
    return this.state;
  }

  public getSkins(): Skin[] {
    return this.skins;
  }

  public getAchievements(): Achievement[] {
    return this.achievements;
  }

  public getBattlePass(): BattlePassTier[] {
    return this.battlePass;
  }

  public getActiveSkinInfo(): Skin {
    const skin = this.skins.find(s => s.id === this.state.activeSkin);
    return skin || this.skins[0];
  }

  public addCoins(amt: number) {
    this.state.coins += amt;
    this.incrementAchievement('coin_hoarder', amt);
    this.save();
  }

  public addGems(amt: number) {
    this.state.gems += amt;
    this.save();
  }

  public addScore(score: number) {
    if (score > this.state.highscore) {
      this.state.highscore = score;
    }
    this.save();
  }

  public addXp(amount: number): { leveledUp: boolean } {
    this.state.xp += amount;
    this.state.battlePassXp += amount;

    // Check if player levels up
    const xpForNextLevel = this.state.level * 1000;
    let leveledUp = false;
    if (this.state.xp >= xpForNextLevel) {
      this.state.xp -= xpForNextLevel;
      this.state.level += 1;
      leveledUp = true;
    }

    // Check Battle Pass progression
    let currentTierData = this.battlePass.find(t => t.tier === this.state.battlePassTier);
    while (currentTierData && this.state.battlePassXp >= currentTierData.xpRequired) {
      this.state.battlePassXp -= currentTierData.xpRequired;
      this.state.battlePassTier += 1;
      currentTierData = this.battlePass.find(t => t.tier === this.state.battlePassTier);
    }

    this.save();
    return { leveledUp };
  }

  public buySkin(id: string): { success: boolean; msg: string } {
    const skin = this.skins.find(s => s.id === id);
    if (!skin) return { success: false, msg: 'Skin not found.' };
    if (skin.unlocked) return { success: false, msg: 'Skin already unlocked!' };

    if (skin.costCoins > 0) {
      if (this.state.coins >= skin.costCoins) {
        this.state.coins -= skin.costCoins;
        skin.unlocked = true;
        this.state.unlockedSkins.push(id);
        this.save();
        return { success: true, msg: `Unlocked ${skin.name} successfully!` };
      } else {
        return { success: false, msg: `Insufficient gold coins. Needs ${skin.costCoins}🟡` };
      }
    } else if (skin.costGems > 0) {
      if (this.state.gems >= skin.costGems) {
        this.state.gems -= skin.costGems;
        skin.unlocked = true;
        this.state.unlockedSkins.push(id);
        this.save();
        return { success: true, msg: `Unlocked ${skin.name} successfully!` };
      } else {
        return { success: false, msg: `Insufficient gems. Needs ${skin.costGems}💎` };
      }
    }

    return { success: false, msg: 'Skin cannot be purchased.' };
  }

  public upgradeSkin(id: string): { success: boolean; msg: string } {
    const skin = this.skins.find(s => s.id === id);
    if (!skin) return { success: false, msg: 'Skin not found.' };
    if (!skin.unlocked) return { success: false, msg: 'Unlock this skin first!' };
    if (skin.upgradeLevel >= skin.maxUpgrade) return { success: false, msg: 'Skin is already at max level!' };

    // Upgrade cost scales with current level
    const upgradeCost = Math.floor(skin.costCoins * 0.4 * skin.upgradeLevel) || (skin.id === 'default' ? 200 * skin.upgradeLevel : 500);

    if (this.state.coins >= upgradeCost) {
      this.state.coins -= upgradeCost;
      skin.upgradeLevel += 1;
      this.state.skinUpgrades[id] = skin.upgradeLevel;
      this.save();
      return { success: true, msg: `${skin.name} upgraded to Lvl ${skin.upgradeLevel}! Wing lift boosted.` };
    } else {
      return { success: false, msg: `Needs ${upgradeCost} gold coins to upgrade.` };
    }
  }

  public selectSkin(id: string) {
    const skin = this.skins.find(s => s.id === id);
    if (skin && skin.unlocked) {
      this.state.activeSkin = id;
      this.save();
    }
  }

  public setWorld(id: string) {
    this.state.activeWorld = id;
    
    // Count unique worlds played
    // Normally saved when world is selected, we can count achievement targets
    const currentWorldsStr = localStorage.getItem('flight_of_legends_worlds_played') || 'jungle';
    const playedArray = currentWorldsStr.split(',');
    if (!playedArray.includes(id)) {
      playedArray.push(id);
      localStorage.setItem('flight_of_legends_worlds_played', playedArray.join(','));
      this.state.achievements['world_explorer'] = playedArray.length;
      this.incrementAchievement('world_explorer', 0);
    }
    
    this.save();
  }

  public incrementAchievement(id: string, amt: number) {
    const ach = this.achievements.find(a => a.id === id);
    if (!ach || ach.unlocked) return;

    this.state.achievements[id] = (this.state.achievements[id] || 0) + amt;
    ach.currentValue = this.state.achievements[id];

    if (ach.currentValue >= ach.targetValue && !ach.unlocked) {
      ach.unlocked = true;
      this.state.unlockedAchievements.push(id);
      this.state.coins += ach.rewardCoins;
      this.state.gems += ach.rewardGems;
      
      // Dispatch toast notification event to window
      window.dispatchEvent(new CustomEvent('achievement_unlocked', {
        detail: { name: ach.name, desc: ach.desc }
      }));
    }
    this.save();
  }

  public claimBattlePassTier(tier: number): { success: boolean; msg: string } {
    if (tier >= this.state.battlePassTier) return { success: false, msg: 'This tier is locked!' };
    if (this.state.claimedBPTiers.includes(tier)) return { success: false, msg: 'Reward already claimed.' };

    const bpTier = this.battlePass.find(t => t.tier === tier);
    if (!bpTier) return { success: false, msg: 'Tier rewards data missing.' };

    this.state.claimedBPTiers.push(tier);

    if (bpTier.rewardType === 'coins') {
      this.state.coins += bpTier.rewardValue;
    } else if (bpTier.rewardType === 'gems') {
      this.state.gems += bpTier.rewardValue;
    } else if (bpTier.rewardType === 'skin') {
      const skinId = bpTier.rewardValue as string;
      const skin = this.skins.find(s => s.id === skinId);
      if (skin) {
        skin.unlocked = true;
        if (!this.state.unlockedSkins.includes(skinId)) {
          this.state.unlockedSkins.push(skinId);
        }
      }
    }

    this.save();
    return { success: true, msg: `Claimed ${bpTier.rewardName}!` };
  }

  public load() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const loadedState = JSON.parse(data) as PlayerProgressState;
        
        // Setup initial structure defaults to handle back-compat updates
        this.state = {
          level: loadedState.level || 1,
          xp: loadedState.xp || 0,
          coins: Math.max(loadedState.coins || 0, 100000), // Auto grant 100,000 coins for testing
          gems: Math.max(loadedState.gems || 0, 5000),     // Auto grant 5,000 gems for testing
          highscore: loadedState.highscore || 0,
          activeSkin: loadedState.activeSkin || 'default',
          activeWorld: loadedState.activeWorld || 'jungle',
          battlePassTier: loadedState.battlePassTier || 1,
          battlePassXp: loadedState.battlePassXp || 0,
          claimedBPTiers: loadedState.claimedBPTiers || [],
          unlockedSkins: loadedState.unlockedSkins || ['default'],
          skinUpgrades: loadedState.skinUpgrades || {},
          achievements: loadedState.achievements || {},
          unlockedAchievements: loadedState.unlockedAchievements || [],
          selectedZone: (loadedState.selectedZone as any) === 'vertical' ? 'classic' : (loadedState.selectedZone || 'classic'),
          selectedDifficulty: loadedState.selectedDifficulty || 'medium',
          lastDailyClaimTime: loadedState.lastDailyClaimTime || 0,
          dailyQuests: loadedState.dailyQuests || this.initDefaultQuests(),
          levelModeUnlockedLevel: loadedState.levelModeUnlockedLevel || 1,
          levelModeStars: loadedState.levelModeStars || {}
        };

        // Sync skins unlocked state and levels
        this.skins.forEach(s => {
          if (this.state.unlockedSkins.includes(s.id)) {
            s.unlocked = true;
          }
          if (this.state.skinUpgrades[s.id]) {
            s.upgradeLevel = this.state.skinUpgrades[s.id];
          }
        });

        // Sync achievements progress
        this.achievements.forEach(a => {
          a.currentValue = this.state.achievements[a.id] || 0;
          if (this.state.unlockedAchievements.includes(a.id)) {
            a.unlocked = true;
          }
        });
      } else {
        this.resetState();
      }
    } catch (e) {
      console.error('Failed to load local storage save:', e);
      this.resetState();
    }
  }

  private resetState() {
    this.state = {
      level: 1,
      xp: 0,
      coins: 100000, // starting gold for testing
      gems: 5000,    // starting gems for testing
      highscore: 0,
      activeSkin: 'default',
      activeWorld: 'jungle',
      battlePassTier: 1,
      battlePassXp: 0,
      claimedBPTiers: [],
      unlockedSkins: ['default'],
      skinUpgrades: {},
      achievements: {},
      unlockedAchievements: [],
      selectedZone: 'classic',
      selectedDifficulty: 'medium',
      lastDailyClaimTime: 0,
      dailyQuests: this.initDefaultQuests(),
      levelModeUnlockedLevel: 1,
      levelModeStars: {}
    };
    
    // Reset skins
    this.initDefaultSkins();
    // Reset achievements
    this.initDefaultAchievements();

    this.save();
  }

  public initDefaultQuests() {
    return [
      { id: 'graze', name: 'Grazing Ace', desc: 'Perform 3 near-miss grazes close to obstacles', target: 3, current: 0, rewardCoins: 400, rewardGems: 10, claimed: false },
      { id: 'fly_high', name: 'Legendary Flight', desc: 'Reach a score of 15 in a single campaign', target: 15, current: 0, rewardCoins: 600, rewardGems: 15, claimed: false },
      { id: 'coin_grab', name: 'Gold Rush', desc: 'Collect 40 gold coins from your flights', target: 40, current: 0, rewardCoins: 300, rewardGems: 5, claimed: false },
      { id: 'slayer', name: 'Titan Duelist', desc: 'Defeat 1 Titan boss in battle', target: 1, current: 0, rewardCoins: 800, rewardGems: 20, claimed: false }
    ];
  }

  public updateQuestProgress(id: string, amt: number) {
    if (!this.state.dailyQuests) {
      this.state.dailyQuests = this.initDefaultQuests();
    }
    const quest = this.state.dailyQuests.find(q => q.id === id);
    if (quest && !quest.claimed) {
      const oldProgress = quest.current;
      quest.current = Math.min(quest.target, quest.current + amt);
      if (quest.current >= quest.target && oldProgress < quest.target) {
        // Quest completed notification
        window.dispatchEvent(new CustomEvent('achievement_unlocked', {
          detail: { name: `QUEST COMPLETED: ${quest.name}`, desc: `Claim rewards in daily hangar menu!` }
        }));
      }
      this.save();
    }
  }

  public claimQuestReward(id: string): { success: boolean; msg: string } {
    if (!this.state.dailyQuests) this.state.dailyQuests = this.initDefaultQuests();
    const quest = this.state.dailyQuests.find(q => q.id === id);
    if (!quest) return { success: false, msg: 'Quest not found.' };
    if (quest.current < quest.target) return { success: false, msg: 'Quest is not completed yet!' };
    if (quest.claimed) return { success: false, msg: 'Reward already claimed.' };

    quest.claimed = true;
    this.addCoins(quest.rewardCoins);
    this.addGems(quest.rewardGems);
    this.save();
    return { success: true, msg: `Claimed +${quest.rewardCoins}🟡 and +${quest.rewardGems}💎!` };
  }

  public claimDailyLoginReward(day: number): { success: boolean; msg: string } {
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    if (now - this.state.lastDailyClaimTime < cooldown) {
      const hoursLeft = Math.ceil((cooldown - (now - this.state.lastDailyClaimTime)) / (1000 * 60 * 60));
      return { success: false, msg: `Come back in ${hoursLeft} hours for your next reward!` };
    }

    const dailyRewards = [
      { coins: 500, gems: 5 },   // Day 1
      { coins: 1000, gems: 10 }, // Day 2
      { coins: 1500, gems: 15 }, // Day 3
      { coins: 2000, gems: 20 }, // Day 4
      { coins: 2500, gems: 25 }, // Day 5
      { coins: 3000, gems: 30 }, // Day 6
      { coins: 5000, gems: 50 }  // Day 7
    ];

    const idx = (day - 1) % 7;
    const reward = dailyRewards[idx];
    this.addCoins(reward.coins);
    this.addGems(reward.gems);
    this.state.lastDailyClaimTime = now;
    this.save();
    return { success: true, msg: `Day ${day} Claimed! Received +${reward.coins}🟡 and +${reward.gems}💎!` };
  }

  public setLevelComplete(levelNum: number, stars: number) {
    if (!this.state.levelModeStars) this.state.levelModeStars = {};
    const oldStars = this.state.levelModeStars[levelNum] || 0;
    if (stars > oldStars) {
      this.state.levelModeStars[levelNum] = stars;
    }
    if (levelNum === this.state.levelModeUnlockedLevel && this.state.levelModeUnlockedLevel < 30) {
      this.state.levelModeUnlockedLevel = levelNum + 1;
    }
    this.save();
  }

  public save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save to local storage:', e);
    }
  }
}
