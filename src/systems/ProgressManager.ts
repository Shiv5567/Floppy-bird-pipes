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
  abilityName?: string;
  abilityDesc?: string;
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

export interface GameWorld {
  id: string;
  name: string;
  emoji: string;
  costCoins: number;
  costGems: number;
  unlocked: boolean;
}

export interface PlayerProgressState {
  coins: number;
  gems: number;
  highscore: number;
  highscoreClassic?: number;
  highscoreSquad?: number;
  highscoreChaos?: number;
  activeSkin: string;
  activeWorld: string;
  unlockedSkins: string[];
  skinUpgrades: Record<string, number>; // skinId -> level
  achievements: Record<string, number>; // achievementId -> progress value
  unlockedAchievements: string[]; // list of unlocked achievement IDs
  claimedAchievements?: string[]; // list of claimed achievement IDs
  selectedZone: 'classic' | 'wave' | 'chaos';
  selectedDifficulty: 'easy' | 'medium' | 'hard';
  lastDailyClaimTime: number;
  lastSpecialOfferAdTime?: number;
  dailyQuests: { id: string; name: string; desc: string; target: number; current: number; rewardCoins: number; rewardGems: number; claimed: boolean }[];
  levelModeUnlockedLevel?: number;
  levelModeStars?: Record<number, number>;
  powerupUpgrades?: Record<string, number>; // powerupType -> level (1-5)
  levelPlayCounts?: Record<number, number>; // levelNum -> playCount (starts)
  levelCompleteCounts?: Record<number, number>; // levelNum -> completeCount (finishes)
  sharedTargets: string[]; // list of shared target identifiers (emails or phone numbers) to prevent abuse
  unlockedWorlds?: string[]; // list of unlocked world IDs
}

export class ProgressManager {

  private state!: PlayerProgressState;
  private skins: Skin[] = [];
  private achievements: Achievement[] = [];
  private worldsList: GameWorld[] = [];
  private storageKey = 'flight_of_legends_progression_save';

  constructor() {
    this.initDefaultSkins();
    this.initDefaultAchievements();
    this.initDefaultWorlds();
    this.load();
  }

  private initDefaultSkins() {
    this.skins = [
      {
        id: 'default',
        name: 'Sky Sovereign',
        rarity: 'Common',
        glowColor: 'rgba(212, 175, 55, 0.4)',
        particleType: 'default',
        costCoins: 0,
        costGems: 0,
        unlocked: true,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Micro Glider',
        abilityDesc: 'Shrink to 60% size.'
      },
      {
        id: 'angry_red',
        name: 'Angry Bird',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 30, 0, 0.9)',
        particleType: 'angry_fire',
        costCoins: 1000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Cyber Magnet',
        abilityDesc: 'Attract coins and gems.'
      },
      {
        id: 'jade_lotus',
        name: 'Lotus Hummingbird',
        rarity: 'Rare',
        glowColor: 'rgba(0, 230, 118, 0.7)',
        particleType: 'jade_lotus',
        costCoins: 4000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Temporal Dilation',
        abilityDesc: 'Slow down obstacles and time by 70% and 35% camera zoom out.'
      },
      {
        id: 'kingfisher',
        name: 'Azure Kingfisher',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 61, 0, 0.95)',
        particleType: 'valkyrie',
        costCoins: 8000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Temporal Focus',
        abilityDesc: 'Slow down game time by 60%.'
      },
      {
        id: 'articuno',
        name: 'Ice Phoenix',
        rarity: 'Legendary',
        glowColor: 'rgba(100, 200, 255, 0.9)',
        particleType: 'blizzard_crystal',
        costCoins: 15000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Temporal Freeze',
        abilityDesc: 'Freeze all obstacles in place and pause their motion.'
      },
      {
        id: 'dread_owl',
        name: 'Great Horned Owl',
        rarity: 'Legendary',
        glowColor: 'rgba(0, 230, 118, 0.95)',
        particleType: 'wyvern',
        costCoins: 18000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Ghost Phasing',
        abilityDesc: ' ghost/transparent and pass through solid pipes.'
      },
      {
        id: 'white_dragon',
        name: 'Seto Dragon',
        rarity: 'Legendary',
        glowColor: 'rgba(224, 180, 255, 0.7)',
        particleType: 'purple_sparkle',
        costCoins: 25000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Lunar Sanctuary',
        abilityDesc: ' invincibility and  protective shield.'
      },
      {
        id: 'dread_falcon',
        name: 'Charan Falcon',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 191, 0, 0.95)',
        particleType: 'valkyrie',
        costCoins: 35000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Sonic Boost',
        abilityDesc: 'Boost supersonic speed blast and invincibility.'
      },
      {
        id: 'crimson_dragon',
        name: 'Mountain Banshee : Avatar',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 30, 0, 0.9)',
        particleType: 'fire',
        costCoins: 35000,
        costGems: 0,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Banshee Cyber Magnet Clone',
        abilityDesc: 'Clones your character and harvests all screen coins & gems!'
      },
      {
        id: 'legendary_eagle_king',
        name: 'Legendary Eagle King',
        rarity: 'Legendary',
        glowColor: 'rgba(255, 215, 0, 0.9)',
        particleType: 'fire',
        costCoins: 0,
        costGems: 300,
        unlocked: false,
        upgradeLevel: 1,
        maxUpgrade: 5,
        abilityName: 'Ultimate Gilded Fortune',
        abilityDesc: 'A shield, 3x score/coins, and a coin magnet.'
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
        name: 'Titan Monster Slayer',
        desc: 'Defeat 5 giant modular monsters in the skies.',
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
        desc: 'Unlock and play in 5 different planetary locations.',
        targetValue: 5,
        currentValue: 1, // default world starts as 1
        rewardCoins: 400,
        rewardGems: 12,
        unlocked: false
      },
      {
        id: 'survival_legend',
        name: 'Survival Legend',
        desc: 'Survive for 100 seconds in Squad Survival mode.',
        targetValue: 100,
        currentValue: 0,
        rewardCoins: 1000,
        rewardGems: 30,
        unlocked: false
      },
      {
        id: 'bird_savior',
        name: 'Bird Savior',
        desc: 'Rescue 30 birds from cages.',
        targetValue: 30,
        currentValue: 0,
        rewardCoins: 800,
        rewardGems: 20,
        unlocked: false
      }
    ];
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

  public addScore(score: number, gameMode?: 'endless' | 'level' | 'flock' | 'chaos') {
    let hasChanged = false;
    if (gameMode === 'flock') {
      if (!this.state.highscoreSquad) this.state.highscoreSquad = 0;
      if (score > this.state.highscoreSquad) {
        this.state.highscoreSquad = score;
        hasChanged = true;
      }
    } else if (gameMode === 'endless') {
      if (this.state.selectedZone === 'chaos') {
        if (!this.state.highscoreChaos) this.state.highscoreChaos = 0;
        if (score > this.state.highscoreChaos) {
          this.state.highscoreChaos = score;
          hasChanged = true;
        }
      } else {
        if (!this.state.highscoreClassic) this.state.highscoreClassic = 0;
        if (score > this.state.highscoreClassic) {
          this.state.highscoreClassic = score;
          hasChanged = true;
        }
        if (score > this.state.highscore) {
          this.state.highscore = score;
          hasChanged = true;
        }
      }
    } else {
      if (score > this.state.highscore) {
        this.state.highscore = score;
        hasChanged = true;
      }
    }
    if (hasChanged) {
      this.save();
    }
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
        this.updateQuestProgress('unlock_chars', this.state.unlockedSkins.length, true);
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
        this.updateQuestProgress('unlock_chars', this.state.unlockedSkins.length, true);
        this.save();
        return { success: true, msg: `Unlocked ${skin.name} successfully!` };
      } else {
        return { success: false, msg: `Insufficient gems. Needs ${skin.costGems}💎` };
      }
    }

    return { success: false, msg: 'Skin cannot be purchased.' };
  }

  public unlockSkinDirect(id: string): boolean {
    const skin = this.skins.find(s => s.id === id);
    if (!skin) return false;
    if (skin.unlocked) return false;
    skin.unlocked = true;
    if (!this.state.unlockedSkins.includes(id)) {
      this.state.unlockedSkins.push(id);
    }
    this.updateQuestProgress('unlock_chars', this.state.unlockedSkins.length, true);
    this.save();
    return true;
  }

  public unlockWorldDirect(id: string): boolean {
    const world = this.worldsList.find(w => w.id === id);
    if (!world) return false;
    if (world.unlocked) return false;
    if (!this.state.unlockedWorlds) {
      this.state.unlockedWorlds = ['jungle'];
    }
    world.unlocked = true;
    if (!this.state.unlockedWorlds.includes(id)) {
      this.state.unlockedWorlds.push(id);
    }
    this.save();
    return true;
  }

  public getSkinUpgradeCost(currentLevel: number): number {
    const costs: Record<number, number> = {
      1: 2000,
      2: 4000,
      3: 8000,
      4: 12000
    };
    return costs[currentLevel] || 0;
  }

  public upgradeSkin(id: string): { success: boolean; msg: string } {
    const skin = this.skins.find(s => s.id === id);
    if (!skin) return { success: false, msg: 'Skin not found.' };
    if (!skin.unlocked) return { success: false, msg: 'Unlock this skin first!' };
    if (skin.upgradeLevel >= skin.maxUpgrade) return { success: false, msg: 'Skin is already at max level!' };

    const upgradeCost = this.getSkinUpgradeCost(skin.upgradeLevel);

    if (this.state.coins >= upgradeCost) {
      this.state.coins -= upgradeCost;
      skin.upgradeLevel += 1;
      this.state.skinUpgrades[id] = skin.upgradeLevel;
      this.save();
      return { success: true, msg: `${skin.name} upgraded to Lvl ${skin.upgradeLevel}! Ability duration boosted.` };
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
    
    this.updateQuestProgress('unlock_worlds', playedArray.length, true);
    
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
      
      // Dispatch toast notification event to window
      window.dispatchEvent(new CustomEvent('achievement_unlocked', {
        detail: { name: ach.name, desc: ach.desc }
      }));
    }
    this.save();
  }

  public claimAchievementReward(id: string): { success: boolean; msg: string } {
    if (!this.state.claimedAchievements) {
      this.state.claimedAchievements = [];
    }
    if (this.state.claimedAchievements.includes(id)) {
      return { success: false, msg: 'Reward already claimed.' };
    }
    const ach = this.achievements.find(a => a.id === id);
    if (!ach) {
      return { success: false, msg: 'Achievement not found.' };
    }
    if (!this.state.unlockedAchievements.includes(id)) {
      return { success: false, msg: 'Achievement is not unlocked yet!' };
    }

    this.state.claimedAchievements.push(id);
    this.addCoins(ach.rewardCoins);
    this.addGems(ach.rewardGems);
    this.save();
    return { success: true, msg: `Claimed +${ach.rewardCoins}🟡 and +${ach.rewardGems}💎!` };
  }

  public load() {
    try {
      const forceResetKey = 'legends_progression_reset_v5';
      if (!localStorage.getItem(forceResetKey)) {
        localStorage.setItem(forceResetKey, 'true');
        this.fullReset();
        return;
      }
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const loadedState = JSON.parse(data) as PlayerProgressState;
        
        // One-time character reset to re-lock all skins
        const skinsResetKey = 'flight_of_legends_skins_reset_v2';
        if (!localStorage.getItem(skinsResetKey)) {
          loadedState.unlockedSkins = ['default'];
          loadedState.skinUpgrades = {};
          loadedState.activeSkin = 'default';
          localStorage.setItem(skinsResetKey, 'true');
        }

        // One-time worlds reset to ensure Amazon Rainforest is auto-set as default
        const worldsResetKey = 'flight_of_legends_worlds_reset_v2';
        if (!localStorage.getItem(worldsResetKey)) {
          loadedState.unlockedWorlds = ['space', 'jungle'];
          loadedState.activeWorld = 'space';
          localStorage.setItem(worldsResetKey, 'true');
        }

        // One-time missions/achievements reset
        const missionsResetKey = 'flight_of_legends_missions_reset_v3';
        if (!localStorage.getItem(missionsResetKey)) {
          loadedState.achievements = {};
          loadedState.unlockedAchievements = [];
          loadedState.claimedAchievements = [];
          loadedState.dailyQuests = this.initDefaultQuests();
          localStorage.setItem(missionsResetKey, 'true');
        }

        // One-time chest/box reset
        const chestsResetKey = 'flight_of_legends_chests_reset_v1';
        if (!localStorage.getItem(chestsResetKey)) {
          localStorage.removeItem('flight_of_legends_chest_1_claims');
          localStorage.removeItem('flight_of_legends_chest_2_claims');
          localStorage.removeItem('flight_of_legends_chest_3_claims');
          localStorage.setItem(chestsResetKey, 'true');
        }

        // One-time skins reset to lock all characters except default
        const skinsLockResetKey = 'flight_of_legends_skins_lock_reset_v2';
        if (!localStorage.getItem(skinsLockResetKey)) {
          loadedState.unlockedSkins = ['default'];
          loadedState.activeSkin = 'default';
          localStorage.setItem(skinsLockResetKey, 'true');
        }
        
        // Setup initial structure defaults to handle back-compat updates
        this.state = {
          coins: loadedState.coins || 0,
          gems: loadedState.gems || 0,
          highscore: loadedState.highscore || 0,
          highscoreClassic: loadedState.highscoreClassic || loadedState.highscore || 0,
          highscoreSquad: loadedState.highscoreSquad || 0,
          highscoreChaos: loadedState.highscoreChaos || 0,
          activeSkin: loadedState.activeSkin || 'default',
          activeWorld: (loadedState.activeWorld && loadedState.activeWorld !== 'cyberpunk' && loadedState.activeWorld !== 'jungle_temple') ? loadedState.activeWorld : 'space',
          unlockedSkins: loadedState.unlockedSkins || ['default'],
          skinUpgrades: loadedState.skinUpgrades || {},
          achievements: loadedState.achievements || {},
          unlockedAchievements: loadedState.unlockedAchievements || [],
          claimedAchievements: loadedState.claimedAchievements || [],
          selectedZone: (loadedState.selectedZone as any) === 'vertical' ? 'classic' : (loadedState.selectedZone || 'classic'),
          selectedDifficulty: 'medium', // permanently locked to medium
          lastDailyClaimTime: loadedState.lastDailyClaimTime || 0,
          lastSpecialOfferAdTime: loadedState.lastSpecialOfferAdTime || 0,
          dailyQuests: (() => {
            const defaultQuests = this.initDefaultQuests();
            const loadedQuests = (loadedState.dailyQuests && loadedState.dailyQuests.length === defaultQuests.length) ? loadedState.dailyQuests : defaultQuests;
            // Sync reward values, name, and desc from defaultQuests to loadedQuests just in case they were adjusted in code
            loadedQuests.forEach(lq => {
              const dq = defaultQuests.find(q => q.id === lq.id);
              if (dq) {
                lq.target = dq.target;
                lq.rewardCoins = dq.rewardCoins;
                lq.rewardGems = dq.rewardGems;
                lq.name = dq.name;
                lq.desc = dq.desc;
              }
            });
            return loadedQuests;
          })(),
          levelModeUnlockedLevel: loadedState.levelModeUnlockedLevel !== undefined ? loadedState.levelModeUnlockedLevel : 1,
          levelModeStars: loadedState.levelModeStars || {},
          powerupUpgrades: (() => {
            const u = loadedState.powerupUpgrades || { shield: 1, slowmo: 1, magnet: 1, turbo: 1, mini: 1, double: 1 };
            if (u && u.double === undefined) {
              u.double = 1;
            }
            return u;
          })(),
          levelPlayCounts: loadedState.levelPlayCounts || {},
          sharedTargets: loadedState.sharedTargets || [],
          unlockedWorlds: loadedState.unlockedWorlds || ['jungle', 'ice', 'space', 'desert', 'volcano', 'heaven']
        };

        // Sync skins unlocked state and levels based on unlockedSkins progression
        this.skins.forEach(s => {
          s.unlocked = this.state.unlockedSkins.includes(s.id);
          if (this.state.skinUpgrades[s.id]) {
            s.upgradeLevel = this.state.skinUpgrades[s.id];
          }
        });

        // Sync worlds unlocked state (all unlocked by default)
        this.worldsList.forEach(w => {
          w.unlocked = true;
        });

        // Sync achievements progress
        this.achievements.forEach(a => {
          a.currentValue = this.state.achievements[a.id] || 0;
          if (this.state.unlockedAchievements.includes(a.id)) {
            a.unlocked = true;
          }
        });

        // Sync static/dynamic milestones on load
        this.updateQuestProgress('unlock_chars', this.state.unlockedSkins.length, true);
        const currentWorldsStr = localStorage.getItem('flight_of_legends_worlds_played') || 'jungle';
        this.updateQuestProgress('unlock_worlds', currentWorldsStr.split(',').length, true);
        if (this.state.levelCompleteCounts) {
          const completeCounts = Object.values(this.state.levelCompleteCounts);
          const levelsWithFiveCompletes = completeCounts.filter(c => c >= 5).length;
          this.updateQuestProgress('play_level_10', levelsWithFiveCompletes, true);
        }
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
      coins: 0,
      gems: 0,
      highscore: 0,
      highscoreClassic: 0,
      highscoreSquad: 0,
      highscoreChaos: 0,
      activeSkin: 'default',
      activeWorld: 'space',
      unlockedSkins: ['default'],
      skinUpgrades: {},
      achievements: {},
      unlockedAchievements: [],
      claimedAchievements: [],
      selectedZone: 'classic',
      selectedDifficulty: 'medium',
      lastDailyClaimTime: 0,
      lastSpecialOfferAdTime: 0,
      dailyQuests: this.initDefaultQuests(),
      levelModeUnlockedLevel: 1,
      levelModeStars: {},
      powerupUpgrades: { shield: 1, slowmo: 1, magnet: 1, turbo: 1, mini: 1, double: 1 },
      levelPlayCounts: {},
      sharedTargets: [],
      unlockedWorlds: ['jungle', 'ice', 'space', 'desert', 'volcano', 'heaven']
    };
    
    // Reset skins
    this.initDefaultSkins();
    // Reset achievements
    this.initDefaultAchievements();
    // Reset worlds
    this.initDefaultWorlds();

    this.save();
  }

  public initDefaultQuests() {
    return [
      // Short-Term Missions (15)
      { id: 'short_obstacles_1', name: 'Pass Pipes', desc: 'Pass 5,000 Pipes', target: 5000, current: 0, rewardCoins: 2000, rewardGems: 10, claimed: false },
      { id: 'short_rescue_1', name: 'Rescue Birds from Cage', desc: 'Rescue 100 Birds from Cage', target: 100, current: 0, rewardCoins: 2500, rewardGems: 10, claimed: false },
      { id: 'short_score_1', name: 'Reach Score', desc: 'Reach a Score of 100', target: 100, current: 0, rewardCoins: 1500, rewardGems: 10, claimed: false },
      { id: 'short_boss_1', name: 'Defeat Monsters', desc: 'Defeat 50 Monsters', target: 50, current: 0, rewardCoins: 3000, rewardGems: 15, claimed: false },
      { id: 'short_destroy_pipes_1', name: 'Destroy Pipes', desc: 'Destroy 2,000 Pipes', target: 2000, current: 0, rewardCoins: 2500, rewardGems: 10, claimed: false },
      { id: 'short_unlock_chars_1', name: 'Unlock Characters', desc: 'Unlock 3 Characters', target: 3, current: 0, rewardCoins: 3200, rewardGems: 10, claimed: false },
      { id: 'short_use_ultimate_1', name: 'Use Ultimate', desc: 'Use Ultimate Power 50 Times', target: 50, current: 0, rewardCoins: 3200, rewardGems: 10, claimed: false },
      { id: 'short_obstacles_2', name: 'Pass Pipes', desc: 'Pass 25,000 Pipes', target: 25000, current: 0, rewardCoins: 4000, rewardGems: 15, claimed: false },
      { id: 'short_collect_powerups_1', name: 'Collect Power-Ups', desc: 'Collect 150 Power-Ups', target: 150, current: 0, rewardCoins: 3000, rewardGems: 10, claimed: false },
      { id: 'short_rescue_2', name: 'Rescue Birds from Cage', desc: 'Rescue 900 Birds from Cage', target: 900, current: 0, rewardCoins: 5000, rewardGems: 15, claimed: false },
      { id: 'short_boss_2', name: 'Defeat Monsters', desc: 'Defeat 100 Monsters', target: 100, current: 0, rewardCoins: 4000, rewardGems: 15, claimed: false },
      { id: 'short_score_2', name: 'Reach Score', desc: 'Reach a Score of 300', target: 300, current: 0, rewardCoins: 2500, rewardGems: 10, claimed: false },
      { id: 'short_play_level_10_1', name: 'Replay Levels', desc: 'Complete Any 3 Levels 5 Times Each', target: 3, current: 0, rewardCoins: 3000, rewardGems: 10, claimed: false },
      { id: 'short_watch_ads_1', name: 'Watch Ads', desc: 'Watch 25 Ads', target: 25, current: 0, rewardCoins: 3000, rewardGems: 15, claimed: false },
      { id: 'short_share_game_1', name: 'Share Game', desc: 'Share the Game with 5 Friends', target: 5, current: 0, rewardCoins: 4000, rewardGems: 20, claimed: false },

      // Long-Term Missions (12)
      { id: 'long_rescue_1', name: 'Rescue Birds from Cage', desc: 'Rescue 2,200 Birds from Cage', target: 2200, current: 0, rewardCoins: 7000, rewardGems: 30, claimed: false },
      { id: 'long_obstacles_1', name: 'Pass Pipes', desc: 'Pass 60,000 Pipes', target: 60000, current: 0, rewardCoins: 5500, rewardGems: 20, claimed: false },
      { id: 'long_score_1', name: 'Reach Score', desc: 'Reach a Score of 500', target: 500, current: 0, rewardCoins: 5000, rewardGems: 15, claimed: false },
      { id: 'long_destroy_pipes_1', name: 'Destroy Pipes', desc: 'Destroy 15,000 Pipes', target: 15000, current: 0, rewardCoins: 5000, rewardGems: 20, claimed: false },
      { id: 'long_obstacles_classic_1', name: 'Pass Pipes Classic', desc: 'Pass 3,500 Pipes in Classic Mode', target: 3500, current: 0, rewardCoins: 5500, rewardGems: 20, claimed: false },
      { id: 'long_boss_1', name: 'Defeat Monsters', desc: 'Defeat 2,500 Monsters', target: 2500, current: 0, rewardCoins: 8000, rewardGems: 25, claimed: false },
      { id: 'long_use_ultimate_1', name: 'Use Ultimate', desc: 'Use Ultimate Power 200 Times', target: 200, current: 0, rewardCoins: 6000, rewardGems: 15, claimed: false },
      { id: 'long_collect_powerups_1', name: 'Collect Power-Ups', desc: 'Collect 500 Power-Ups', target: 500, current: 0, rewardCoins: 6000, rewardGems: 15, claimed: false },
      { id: 'long_obstacles_2', name: 'Pass Pipes', desc: 'Pass 100,000 Pipes', target: 100000, current: 0, rewardCoins: 10000, rewardGems: 30, claimed: false },
      { id: 'long_watch_ads_1', name: 'Watch Ads', desc: 'Watch 100 Ads', target: 100, current: 0, rewardCoins: 8000, rewardGems: 15, claimed: false },
      { id: 'long_unlock_chars_1', name: 'Unlock Characters', desc: 'Unlock 6 Characters', target: 6, current: 0, rewardCoins: 9000, rewardGems: 20, claimed: false },
      { id: 'long_share_game_1', name: 'Share Game', desc: 'Share the Game with 15 Friends', target: 15, current: 0, rewardCoins: 14000, rewardGems: 30, claimed: false },
      { id: 'long_kingfisher_pts_1', name: 'Kingfisher Flight', desc: 'Reach a score of 300 using Kingfisher', target: 300, current: 0, rewardCoins: 6000, rewardGems: 20, claimed: false },
      { id: 'long_volcano_pts_1', name: 'Volcano Survivor', desc: 'Reach a score of 100 in Volcanic Realm', target: 100, current: 0, rewardCoins: 4000, rewardGems: 15, claimed: false }
    ];
  }

  public updateQuestProgress(category: string, amt: number, isMax = false) {
    if (!this.state.dailyQuests || this.state.dailyQuests.length !== this.initDefaultQuests().length) {
      this.state.dailyQuests = this.initDefaultQuests();
    }
    this.state.dailyQuests.forEach(quest => {
      if (quest.id.includes(category) && !quest.claimed) {
        const oldProgress = quest.current;
        if (isMax) {
          quest.current = Math.min(quest.target, Math.max(quest.current, amt));
        } else {
          quest.current = Math.min(quest.target, quest.current + amt);
        }
        if (quest.current >= quest.target && oldProgress < quest.target) {
          // Quest completed notification
          window.dispatchEvent(new CustomEvent('achievement_unlocked', {
            detail: { name: `MISSION COMPLETED: ${quest.name}`, desc: `Claim rewards under Missions!` }
          }));
        }
      }
    });
    this.save();
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

  public recordShareTarget(target: string): { success: boolean; msg: string } {
    if (!this.state.sharedTargets) {
      this.state.sharedTargets = [];
    }
    
    // Normalize target (lowercase/trim)
    const normalized = target.trim().toLowerCase();
    
    if (this.state.sharedTargets.includes(normalized)) {
      return { success: false, msg: 'Already shared to this contact/account! No rewards earned.' };
    }
    
    this.state.sharedTargets.push(normalized);
    
    // Increment both short-term & long-term share quests/missions
    this.updateQuestProgress('share_game', 1);
    
    this.save();
    return { success: true, msg: 'Share recorded! Progress updated.' };
  }

  public trackLevelPlay(levelNum: number) {
    if (!this.state.levelPlayCounts) {
      this.state.levelPlayCounts = {};
    }
    this.state.levelPlayCounts[levelNum] = (this.state.levelPlayCounts[levelNum] || 0) + 1;
    // Note: mission progress is updated only on completion (setLevelComplete)
    this.save();
  }

  public setLevelComplete(levelNum: number, stars: number) {
    if (!this.state.levelModeStars) this.state.levelModeStars = {};
    const oldStars = this.state.levelModeStars[levelNum] || 0;
    if (stars > oldStars) {
      this.state.levelModeStars[levelNum] = stars;
    }
    if (levelNum === this.state.levelModeUnlockedLevel && this.state.levelModeUnlockedLevel < 60) {
      this.state.levelModeUnlockedLevel = levelNum + 1;
    }

    // Track completion count for Replay Levels mission
    if (!this.state.levelCompleteCounts) {
      this.state.levelCompleteCounts = {};
    }
    this.state.levelCompleteCounts[levelNum] = (this.state.levelCompleteCounts[levelNum] || 0) + 1;

    // Count how many levels have been completed 5+ times
    const levelsWithFiveCompletes = Object.values(this.state.levelCompleteCounts).filter(c => c >= 5).length;
    this.updateQuestProgress('play_level_10', levelsWithFiveCompletes, true);

    this.save();
  }

  public upgradePowerup(type: string): { success: boolean; msg: string } {
    if (!this.state.powerupUpgrades) {
      this.state.powerupUpgrades = { shield: 1, slowmo: 1, magnet: 1, turbo: 1, mini: 1, double: 1 };
    }
    const currentLevel = this.state.powerupUpgrades[type] || 1;
    if (currentLevel >= 5) return { success: false, msg: 'Powerup is already at max level!' };

    const cost = 1000 * Math.pow(2, currentLevel - 1); // 1000, 2000, 4000, 8000
    if (this.state.coins >= cost) {
      this.state.coins -= cost;
      this.state.powerupUpgrades[type] = currentLevel + 1;
      this.save();
      return { success: true, msg: `${type.toUpperCase()} upgraded to Lvl ${currentLevel + 1}! Duration boosted.` };
    } else {
      return { success: false, msg: `Insufficient gold coins. Needs ${cost}🟡` };
    }
  }

  private initDefaultWorlds() {
    this.worldsList = [
      { id: 'space',      name: 'TWILIGHT HORIZON',        emoji: '🌌', costCoins: 0, costGems: 0, unlocked: true },
      { id: 'jungle',     name: 'AMAZON RAINFOREST', emoji: '🌴', costCoins: 0, costGems: 0, unlocked: true },
      { id: 'ice',        name: 'FROST VALLEY',   emoji: '❄️', costCoins: 0, costGems: 0, unlocked: true },
      { id: 'desert',     name: 'ANCIENT EGYPT : THE DESERT', emoji: '🏜️', costCoins: 0, costGems: 0, unlocked: true },
      { id: 'volcano',    name: 'VOLCANIC REALM',      emoji: '🌋', costCoins: 0, costGems: 0, unlocked: true },
      { id: 'heaven',     name: 'GOLDEN HEIGHTS : THE CLOUD KINGDOM', emoji: '🌤️', costCoins: 0, costGems: 0, unlocked: true }
    ];
  }

  public getWorldsList(): GameWorld[] {
    return this.worldsList;
  }

  public buyWorld(id: string): { success: boolean; msg: string } {
    const world = this.worldsList.find(w => w.id === id);
    if (!world) return { success: false, msg: 'World not found.' };
    if (world.unlocked) return { success: false, msg: 'World already unlocked!' };

    if (!this.state.unlockedWorlds) {
      this.state.unlockedWorlds = ['jungle'];
    }

    if (world.costCoins > 0) {
      if (this.state.coins >= world.costCoins) {
        this.state.coins -= world.costCoins;
        world.unlocked = true;
        this.state.unlockedWorlds.push(id);
        this.updateQuestProgress('unlock_worlds', this.state.unlockedWorlds.length, true);
        this.save();
        return { success: true, msg: `Unlocked ${world.name} successfully!` };
      } else {
        return { success: false, msg: `Insufficient gold coins. Needs ${world.costCoins}🟡` };
      }
    } else if (world.costGems > 0) {
      if (this.state.gems >= world.costGems) {
        this.state.gems -= world.costGems;
        world.unlocked = true;
        this.state.unlockedWorlds.push(id);
        this.updateQuestProgress('unlock_worlds', this.state.unlockedWorlds.length, true);
        this.save();
        return { success: true, msg: `Unlocked ${world.name} successfully!` };
      } else {
        return { success: false, msg: `Insufficient gems. Needs ${world.costGems}💎` };
      }
    }

    return { success: false, msg: 'World cannot be purchased.' };
  }

  /**
   * Full factory reset: clears ALL game-related localStorage keys and resets
   * all in-memory state to fresh-install defaults. Call this and reload.
   */
  public fullReset() {
    // 1. Remove all game-related localStorage keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('flight_of_legends') ||
        key === 'legends_device_id' ||
        key === 'pending_shares' ||
        key === 'credited_referral_devices' ||
        key.startsWith('opened_ref_')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 2. Reset in-memory state to defaults
    this.resetState();
  }

  public save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save to local storage:', e);
    }
  }
}
