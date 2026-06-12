import { ParticleEngine } from '../engine/ParticleEngine.ts';
import type { Skin } from '../systems/ProgressManager.ts';

export class Bird {
  public x = 120;
  public y = 300;
  public vy = 0;
  public radius = 26; // Base collision circle radius
  public baseRadius = 26;
  public angle = 0;
  
  // Physics parameters (Increased vertical velocity by 20% for snappier feel)
  private gravity = 0.432;      // +20% increase (was 0.36)
  private jumpLift = -6.912;    // +20% increase (was -5.76)
  private maxFallSpeed = 11.88;  // +20% increase (was 9.9)
  private maxRiseSpeed = -9.18; // +20% increase (was -7.65)
  
  // Animation variables
  private flapCycle = 0;
  private flapSpeed = 0.25;
  private crashSpinAngle = 0;
  public isCrashing = false;

  // Aura animation variables
  private auraAngle = 0;
  private auraPulse = 0;

  // Active upgrades / powerup modifiers
  public sizeMultiplier = 1.0;
  public isInvincible = false;
  public hasShield = false;
  public isGhost = false;

  // Custom cosmetics
  private activeSkin: Skin;

  constructor(activeSkin: Skin) {
    this.activeSkin = activeSkin;
    this.setDifficulty('medium');
  }

  public setDifficulty(difficulty: 'easy' | 'medium' | 'hard') {
    void difficulty; // Enforce constant medium physics for balanced predictability
    this.gravity = 0.432;       // +20% increase (was 0.36)
    this.jumpLift = -6.912;     // +20% increase (was -5.76)
    this.maxFallSpeed = 11.88;   // +20% increase (was 9.9)
    this.maxRiseSpeed = -9.18; // +20% increase (was -7.65)
  }

  public setSkin(skin: Skin) {
    this.activeSkin = skin;
  }

  public getSkin(): Skin {
    return this.activeSkin;
  }

  private getJumpScale(score: number): number {
    const effectiveScore = Math.min(600, score);
    let jumpScale = 1.0;
    const maxScale400 = 1.05 * 1.06 * 1.03; // ~1.14639
    if (effectiveScore <= 100) {
      jumpScale = 1.0;
    } else if (effectiveScore <= 200) {
      const progress = (effectiveScore - 100) / 100;
      jumpScale = 1.0 + progress * 0.05;
    } else if (effectiveScore <= 300) {
      const progress = (effectiveScore - 200) / 100;
      jumpScale = 1.05 * (1.0 + progress * 0.06);
    } else if (effectiveScore <= 400) {
      const progress = (effectiveScore - 300) / 100;
      jumpScale = 1.05 * 1.06 * (1.0 + progress * 0.03);
    } else if (effectiveScore <= 500) {
      jumpScale = maxScale400 * 1.10; // ~1.26103
    } else {
      // From score 500 to 600, keep progressive scaling identical to how 500-600 is set
      const progress = (effectiveScore - 500) / 100;
      jumpScale = maxScale400 * 1.10 * 1.08 * (1.0 + progress * 0.075); // reaches ~1.464 at 600
    }
    return jumpScale;
  }

  public jump(soundManager?: any, score = 0) {
    if (this.isCrashing) return;
    
    // Jump lift scaled with skin upgrade level (minor bonus)
    const levelBonus = (this.activeSkin.upgradeLevel - 1) * 0.05;
    
    // Custom progressive score-based jump scaling:
    const jumpScale = this.getJumpScale(score);
    
    // Check if playing in Level 2 or Level 13 of level mode (which contains the Level 4 snake/laser layout)
    const engine = (window as any).gameEngine;
    const isLevel2 = engine && engine.gameMode === 'level' && (engine.currentLevelNum === 2 || engine.currentLevelNum === 13);
    const jumpReduction = isLevel2 ? 0.78 : 1.0;
    
    let impulse = this.jumpLift * (1 + levelBonus) * jumpScale * jumpReduction;
    
    // Scale velocity impulse in squad/flock mode:
    // - Score >= 500: increase by 8% (1.08)
    // - Score >= 50: increase by 7% (1.07) (covers score 50 to 500, including 300 to 500)
    if (engine && engine.gameMode === 'flock') {
      if (score >= 500) {
        impulse *= 1.08;
      } else if (score >= 50) {
        impulse *= 1.07;
      }
    }
    
    // Instant, sharp, predictable and completely constant jump:
    // Instantly set vertical velocity to the jump impulse to give an immediate constant response on every tap.
    this.vy = impulse;
    
    this.flapCycle = 0; // Reset wing animation cycle to start flap
    if (soundManager) soundManager.playFlap();
  }

  public update(deltaTime: number, particleEngine: ParticleEngine, isPlaying: boolean, timeScale: number, score = 0) {
    const dtCoeff = deltaTime * 60 * timeScale;
    
    // Freeze vertical physics at exactly score 600 (keeping it identical to score 500-600 setting all the way to infinity!)
    const effectiveScore = Math.min(600, score);
    
    // Synchronize physics gravity and max fall speed caps with 5% speed increase every 25 score
    const speedMultiplier = 1.0 + Math.floor(effectiveScore / 25.0) * 0.05;
    
    // Check if playing in Level 2 or Level 13 of level mode (which contains the Level 4 snake/laser layout)
    const engine = (window as any).gameEngine;
    const isLevel2 = engine && engine.gameMode === 'level' && (engine.currentLevelNum === 2 || engine.currentLevelNum === 13);
    const speedReduction = isLevel2 ? 0.75 : 1.0;
    
    let currentGravity = this.gravity * speedMultiplier * speedReduction;
    let currentMaxFallSpeed = this.maxFallSpeed * speedMultiplier * speedReduction;
    
    // Custom progressive score-based jump scaling:
    const jumpScale = this.getJumpScale(effectiveScore);
    
    // Scale maximum rise speed dynamically to stay fully synchronized with jump impulse (unreduced for upward speed!)
    let currentMaxRiseSpeed = this.maxRiseSpeed * jumpScale * (isLevel2 ? 0.78 : 1.0);
    
    // Scale vertical velocity physics in squad/flock mode:
    // - Score >= 500: scale max rise speed by 8% (1.08), gravity and fall speed by 7% (1.07)
    // - Score >= 50: scale max rise speed, gravity, and fall speed by 7% (1.07)
    if (engine && engine.gameMode === 'flock') {
      if (score >= 50) {
        currentGravity *= 1.07;
        currentMaxFallSpeed *= 1.07;
      }
      if (score >= 500) {
        currentMaxRiseSpeed *= 1.08;
      } else if (score >= 50) {
        currentMaxRiseSpeed *= 1.07;
      }
    }
    
    if (isPlaying) {
      // Apply gravity
      this.vy += currentGravity * dtCoeff;
      if (this.vy > currentMaxFallSpeed) this.vy = currentMaxFallSpeed;
      if (this.vy < currentMaxRiseSpeed) this.vy = currentMaxRiseSpeed; // Synced upward rise cap

      this.y += this.vy * dtCoeff;

      // Dynamic orientation angle based on vertical speed
      if (!this.isCrashing) {
        // Snappier and more expressive tilting responding directly to the new velocity thresholds
        const targetAngle = Math.max(-0.55, Math.min(0.8, this.vy * 0.045));
        this.angle += (targetAngle - this.angle) * 0.22 * dtCoeff;
      } else {
        // Crashing spin animation
        this.crashSpinAngle += 0.3 * dtCoeff;
        this.angle = this.crashSpinAngle;
      }
    }

    // Flap cycle animation
    if (!this.isCrashing && isPlaying) {
      // Speed of wing flapping relates to vertical speed
      const cycleSpeed = this.vy < 0 ? this.flapSpeed * 1.5 : this.flapSpeed;
      this.flapCycle = (this.flapCycle + cycleSpeed * dtCoeff) % (Math.PI * 2);
      
      // Update magic aura rotation and breathing pulsing cycle
      this.auraAngle = (this.auraAngle + 0.02 * dtCoeff) % (Math.PI * 2);
      this.auraPulse = (this.auraPulse + 0.04 * dtCoeff) % (Math.PI * 2);
    }

    // Size scaling
    this.radius = this.baseRadius * this.sizeMultiplier;

    // Emit skin-specific trails
    const isPerformanceMode = (window as any).gameDisableShadows;
    const trailRate = isPerformanceMode ? 0.15 : 0.35;
    if (isPlaying && !this.isCrashing && Math.random() < trailRate * dtCoeff) {
      this.emitSkinTrail(particleEngine);
    }
  }

  private emitSkinTrail(particleEngine: ParticleEngine) {
    const type = this.activeSkin.particleType;
    const offsetBackX = this.x - this.radius * 0.8;
    const offsetBackY = this.y + Math.sin(this.flapCycle) * 5;

    // Small random deviation
    const rx = (Math.random() - 0.5) * 4;
    const ry = (Math.random() - 0.5) * 4;

    switch (type) {
      case 'neon_cyan':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -2 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5, '#00f3ff', 3 + Math.random() * 2, 1.0, 0.025, 'spark', true, 'rgba(0, 243, 255, 0.8)');
        break;

      case 'neon_pink':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -2 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5, '#ff007f', 3 + Math.random() * 2, 1.0, 0.025, 'spark', true, 'rgba(255, 0, 127, 0.8)');
        break;

      case 'feathers':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -0.6 - Math.random() * 1, (Math.random() - 0.5) * 1, '#d2b48c', 2.5 + Math.random() * 3, 0.8, 0.02, 'circle');
        break;

      case 'purple_sparkle':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.5, '#e0b4ff', 3 + Math.random() * 3, 1.0, 0.02, 'star', true, 'rgba(192, 132, 252, 0.7)');
        break;

      case 'fire':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.5, 'rgba(255, 69, 0, 0.9)', 3 + Math.random() * 4, 1.0, 0.03, 'circle', true, 'rgba(255, 120, 0, 0.8)', -0.05);
        particleEngine.spawn(offsetBackX, offsetBackY, -0.5 - Math.random() * 1, (Math.random() - 0.5) * 1.0, 'rgba(255, 215, 0, 0.9)', 2 + Math.random() * 3, 1.0, 0.04, 'circle', true, '#ff4500');
        break;

      case 'ice':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -0.5 - Math.random() * 1, (Math.random() - 0.5) * 1, 'rgba(200, 240, 255, 0.8)', 4 + Math.random() * 3, 0.9, 0.02, 'snowflake', true, 'rgba(173, 216, 230, 0.5)');
        break;

      case 'cosmic':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 1.5, 'rgba(255, 20, 147, 0.9)', 3 + Math.random() * 3, 1.0, 0.02, 'star', true, 'rgba(148, 0, 211, 0.8)');
        particleEngine.spawn(offsetBackX, offsetBackY, -0.8 - Math.random() * 1, (Math.random() - 0.5) * 1, 'rgba(0, 191, 255, 0.8)', 2.5 + Math.random() * 2, 0.9, 0.03, 'circle', true, '#ff1493');
        break;

      case 'valkyrie':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1.2 - Math.random() * 2, (Math.random() - 0.5) * 1.5, '#ff1744', 3.5 + Math.random() * 3.5, 1.0, 0.03, 'circle', true, '#ffd700');
        break;

      case 'wyvern':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5, '#00e676', 3 + Math.random() * 2, 0.9, 0.02, 'spark', true, 'rgba(27, 94, 32, 0.5)');
        break;

      case 'angry_fire':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 1.8, 'rgba(255, 20, 0, 0.95)', 3.5 + Math.random() * 4, 1.0, 0.03, 'circle', true, 'rgba(255, 80, 0, 0.9)', -0.05);
        particleEngine.spawn(offsetBackX, offsetBackY, -0.8 - Math.random() * 1.2, (Math.random() - 0.5) * 1.2, 'rgba(255, 160, 0, 0.9)', 2.5 + Math.random() * 3, 1.0, 0.04, 'circle', true, '#ff3300');
        break;

      case 'blizzard_crystal':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -0.6 - Math.random() * 1.2, (Math.random() - 0.5) * 1.5, 'rgba(140, 210, 255, 0.9)', 4 + Math.random() * 3, 0.95, 0.02, 'snowflake', true, 'rgba(80, 180, 255, 0.6)');
        particleEngine.spawn(offsetBackX + rx * 0.5, offsetBackY + ry * 0.5, -0.4 - Math.random() * 0.8, (Math.random() - 0.5) * 1, 'rgba(220, 240, 255, 0.85)', 3 + Math.random() * 2, 0.9, 0.025, 'star', true, 'rgba(160, 220, 255, 0.5)');
        break;

      case 'jade_lotus':
        // Blossom pink flower petals + jade green sparks
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 1.2, '#f48fb1', 3 + Math.random() * 3, 0.9, 0.02, 'circle', true, '#ff4081');
        particleEngine.spawn(offsetBackX + rx * 0.8, offsetBackY + ry * 0.8, -0.6 - Math.random() * 1.0, (Math.random() - 0.5) * 0.8, '#a5d6a7', 2.5 + Math.random() * 2, 0.85, 0.03, 'spark', true, 'rgba(0, 230, 118, 0.5)');
        break;

      case 'cosmic_nova':
        // Neon-cyan sparks + violet stars
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1.5 - Math.random() * 2.0, (Math.random() - 0.5) * 1.5, '#18ffff', 3.5 + Math.random() * 2.5, 1.0, 0.025, 'spark', true, 'rgba(0, 229, 255, 0.7)');
        particleEngine.spawn(offsetBackX, offsetBackY, -0.8 - Math.random() * 1.2, (Math.random() - 0.5) * 1.0, '#d1c4e9', 3.0 + Math.random() * 3.0, 0.9, 0.02, 'star', true, 'rgba(124, 77, 255, 0.8)');
        break;

      case 'storm_thunder':
        // Fiery red-orange embers + gold sparks
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1.8 - Math.random() * 2.0, (Math.random() - 0.5) * 1.5, '#ff3d00', 3.5 + Math.random() * 2.5, 1.0, 0.025, 'spark', true, 'rgba(255, 61, 0, 0.8)');
        particleEngine.spawn(offsetBackX, offsetBackY, -1.0 - Math.random() * 1.5, (Math.random() - 0.5) * 1.0, '#ffd54f', 2.0 + Math.random() * 2.0, 0.9, 0.03, 'circle', true, 'rgba(255, 213, 79, 0.7)');
        break;





      default:
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 1, (Math.random() - 0.5) * 0.5, 'rgba(255, 255, 255, 0.4)', 2, 0.8, 0.03, 'circle');
    }
  }

  // Draw procedural birds depending on active skin
  public render(ctx: CanvasRenderingContext2D) {
    // Trailing golden motion-blur warp wedge behind the bird when booster is active!
    const engine = (window as any).gameEngine;
    if (engine && engine.boosterActive) {
      ctx.save();
      const wedgeGrad = ctx.createLinearGradient(this.x - 90, this.y, this.x, this.y);
      wedgeGrad.addColorStop(0, 'rgba(255, 215, 0, 0.0)');
      wedgeGrad.addColorStop(0.5, 'rgba(255, 230, 100, 0.24)');
      wedgeGrad.addColorStop(1, 'rgba(255, 215, 0, 0.65)');
      
      ctx.fillStyle = wedgeGrad;
      ctx.beginPath();
      ctx.moveTo(this.x - 90, this.y);
      ctx.lineTo(this.x, this.y - this.radius * 0.95);
      ctx.lineTo(this.x, this.y + this.radius * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    
    // Add organic airbeat body bobbing (lift-push response)
    const yBob = !this.isCrashing ? Math.sin(this.flapCycle) * 2.2 : 0;
    ctx.translate(this.x, this.y + yBob);
    ctx.rotate(this.angle);

    // Apply scaling
    const finalRad = this.radius;
    ctx.scale(finalRad / this.baseRadius, finalRad / this.baseRadius);

    // Draw active skin
    const skinId = this.activeSkin.id;
    
    // Render the beautiful, responsive, breathing, and rotating Magic Aura
    this.drawMagicAura(ctx);

    // Invincible or shield bubble overlay
    if (this.hasShield) {
      ctx.save();
      const shieldGrad = ctx.createRadialGradient(0, 0, 15, 0, 0, 25);
      shieldGrad.addColorStop(0, 'rgba(0, 243, 255, 0.15)');
      shieldGrad.addColorStop(0.8, 'rgba(0, 243, 255, 0.6)');
      shieldGrad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = shieldGrad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Ghost transparency
    if (this.isGhost) {
      ctx.globalAlpha = 0.4;
    }

    // Draw skin geometry
    switch (skinId) {
      case 'phoenix':
        this.drawPhoenix(ctx);
        break;
      case 'ice':
        this.drawIce(ctx);
        break;
      case 'nebula':
        this.drawNebula(ctx);
        break;
      case 'cyber_owl':
        this.drawCyberOwl(ctx);
        break;
      case 'neon_crow':
        this.drawNeonCrow(ctx);
        break;
      case 'white_dragon':
        this.drawWhiteDragon(ctx);
        break;
      case 'kingfisher':
        this.drawKingfisher(ctx);
        break;
      case 'dread_owl':
        this.drawOwl(ctx);
        break;
      case 'aviator_chick':
        this.drawAviatorChick(ctx);
        break;
      case 'dread_falcon':
        this.drawFalcon(ctx);
        break;
      case 'legendary_eagle_king':
        this.drawLegendaryEagleKing(ctx);
        break;
      case 'angry_red':
        this.drawAngryBird(ctx);
        break;
      case 'articuno':
        this.drawArticuno(ctx);
        break;
      case 'jade_lotus':
        this.drawJadeLotus(ctx);
        break;
      case 'cosmic_nova':
        this.drawCosmicNova(ctx);
        break;
      case 'storm_tempest_eagle':
        this.drawStormTempestEagle(ctx);
        break;



      default:
        this.drawEagle(ctx); // Default Eagle
    }

    ctx.restore();
  }

  // Renders a high-fidelity static preview of the character skin for UI menus/cards
  public renderPreview(ctx: CanvasRenderingContext2D, width: number, height: number, skin: Skin) {
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    
    // Translate to center of canvas
    ctx.translate(width / 2, height / 2);

    // Save original bird parameters to prevent disrupting active gameplay state
    const origSkin = this.activeSkin;
    const origFlap = this.flapCycle;
    const origAngle = this.angle;
    const origAuraPulse = this.auraPulse;
    const origAuraAngle = this.auraAngle;
    const origVy = this.vy;

    // Apply mock parameters for a pristine, centered flight-pose preview (dynamic animation loop)
    this.activeSkin = skin;
    this.flapCycle = (Date.now() / 150) % (Math.PI * 2); // Dynamically flap wings!
    this.angle = Math.sin(Date.now() / 250) * 0.08 - 0.04; // Dynamically float up/down!
    this.auraPulse = (Date.now() / 350) % (Math.PI * 2);
    this.auraAngle = (Date.now() / 800) % (Math.PI * 2);
    this.vy = Math.cos(Date.now() / 250) * 1.5;

    // Apply standard scaling (preview scales dynamically based on canvas dimensions)
    const scale = Math.min(width, height) / 95;
    ctx.scale(scale, scale);

    // Render the beautiful rotating Magic Aura
    this.drawMagicAura(ctx);

    // Draw the corresponding character skin geometry
    const skinId = skin.id;
    this.renderSkinGeometry(ctx, skinId);

    // Restore original gameplay parameters
    this.activeSkin = origSkin;
    this.flapCycle = origFlap;
    this.angle = origAngle;
    this.auraPulse = origAuraPulse;
    this.auraAngle = origAuraAngle;
    this.vy = origVy;

    ctx.restore();
  }

  public renderSkinGeometry(ctx: CanvasRenderingContext2D, skinId: string) {
    switch (skinId) {
      case 'phoenix':
        this.drawPhoenix(ctx);
        break;
      case 'ice':
        this.drawIce(ctx);
        break;
      case 'nebula':
        this.drawNebula(ctx);
        break;
      case 'cyber_owl':
        this.drawCyberOwl(ctx);
        break;
      case 'neon_crow':
        this.drawNeonCrow(ctx);
        break;
      case 'white_dragon':
        this.drawWhiteDragon(ctx);
        break;
      case 'kingfisher':
        this.drawKingfisher(ctx);
        break;
      case 'dread_owl':
        this.drawOwl(ctx);
        break;
      case 'aviator_chick':
        this.drawAviatorChick(ctx);
        break;
      case 'dread_falcon':
        this.drawFalcon(ctx);
        break;
      case 'legendary_eagle_king':
        this.drawLegendaryEagleKing(ctx);
        break;
      case 'angry_red':
        this.drawAngryBird(ctx);
        break;
      case 'articuno':
        this.drawArticuno(ctx);
        break;
      case 'jade_lotus':
        this.drawJadeLotus(ctx);
        break;
      case 'cosmic_nova':
        this.drawCosmicNova(ctx);
        break;
      case 'storm_tempest_eagle':
        this.drawStormTempestEagle(ctx);
        break;



      default:
        this.drawEagle(ctx);
    }
  }


  // Draw dynamic breathing & rotating skin-themed Magic Aura (Visual Weather & Aura Pack)
  private drawMagicAura(ctx: CanvasRenderingContext2D) {
    const skinId = this.activeSkin.id;
    const upgradeLvl = this.activeSkin.upgradeLevel;
    
    ctx.save();
    
    // Scale breathing effect based on a sine wave
    const breath = 1.0 + Math.sin(this.auraPulse) * 0.08;
    const baseRadius = 26 * breath;
    
    // Set line dash and global styling parameters
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.45 + (Math.sin(this.auraPulse * 1.5) * 0.15); // Breathing opacity
    
    const disableShadows = (window as any).gameDisableShadows;
    if (!disableShadows && this.activeSkin.glowColor) {
      ctx.shadowBlur = 10 + Math.sin(this.auraPulse) * 4;
      ctx.shadowColor = this.activeSkin.glowColor;
    }

    switch (skinId) {
      case 'phoenix': {
        // Concentric fiery rings with spinning flares
        ctx.strokeStyle = '#ff5500';
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.15, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = '#ffd700';
        ctx.save();
        ctx.rotate(this.auraAngle * 1.5);
        ctx.setLineDash([8, 12]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        
        // Internal blazing sparks
        ctx.fillStyle = '#ff8800';
        for (let i = 0; i < 4; i++) {
          const angle = this.auraAngle + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * (baseRadius * 0.9), Math.sin(angle) * (baseRadius * 0.9), 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'ice': {
        // Rotating glacial snowflake magic circle
        ctx.strokeStyle = '#80d8ff';
        ctx.save();
        ctx.rotate(this.auraAngle);
        
        // 8-pointed ice star shield outline
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const dist = i % 2 === 0 ? baseRadius * 1.4 : baseRadius * 0.95;
          ctx.lineTo(Math.cos(angle) * dist, Math.sin(angle) * dist);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner glowing ring
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'nebula': {
        // Pulsating glowing stardust cloud rings
        ctx.strokeStyle = '#ff007f';
        ctx.save();
        ctx.rotate(this.auraAngle * 0.8);
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.3, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.strokeStyle = '#7c4dff';
        ctx.rotate(-this.auraAngle * 1.6);
        ctx.setLineDash([4, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'cyber_owl': {
        ctx.strokeStyle = '#00f3ff';
        ctx.save();
        ctx.rotate(this.auraAngle);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.setLineDash([6, 8]);
        ctx.arc(0, 0, baseRadius * 1.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'neon_crow': {
        ctx.strokeStyle = '#ff007f';
        ctx.save();
        ctx.rotate(-this.auraAngle * 1.4);
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }

      case 'white_dragon': {
        ctx.strokeStyle = '#e0b4ff';
        ctx.save();
        ctx.rotate(-this.auraAngle * 0.8);
        ctx.setLineDash([5, 5]);
        ctx.arc(0, 0, baseRadius * 1.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'kingfisher': {
        // Rotating fiery runic boss circle with plasma energy spikes
        ctx.strokeStyle = '#ff3d00'; // Neon Red-Orange
        ctx.save();
        ctx.rotate(this.auraAngle * 1.8);
        
        // Draw outer spiked ring
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5;
          const outerRad = baseRadius * 1.5;
          const innerRad = baseRadius * 1.1;
          ctx.lineTo(Math.cos(angle) * outerRad, Math.sin(angle) * outerRad);
          ctx.lineTo(Math.cos(angle + Math.PI / 5) * innerRad, Math.sin(angle + Math.PI / 5) * innerRad);
        }
        ctx.closePath();
        ctx.stroke();

        // Inner glowing dash ring
        ctx.strokeStyle = '#e040fb'; // Neon Violet/Magenta
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'dread_owl': {
        // Double rotating runic owl circle with ancient crescent symbols
        ctx.strokeStyle = '#00e676'; // Menacing electric green
        ctx.save();
        ctx.rotate(this.auraAngle * 1.2);
        
        // Outer glowing crescent circles
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          ctx.arc(Math.cos(angle) * baseRadius * 1.4, Math.sin(angle) * baseRadius * 1.4, 4, 0, Math.PI * 2);
        }
        ctx.stroke();

        // Inner runic ring
        ctx.strokeStyle = 'rgba(0, 230, 118, 0.5)';
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'aviator_chick': {
        // Rotating golden aeronautical compass-themed aura
        ctx.strokeStyle = '#ffd700'; // Gold compass
        ctx.save();
        ctx.rotate(this.auraAngle * 0.8);
        
        // Outer compass circle
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.3, 0, Math.PI * 2);
        ctx.stroke();

        // 4 cardinal direction ticks (North, South, East, West)
        ctx.strokeStyle = '#ff9100'; // Orange ticks
        ctx.lineWidth = 2.0;
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * baseRadius * 1.2, Math.sin(angle) * baseRadius * 1.2);
          ctx.lineTo(Math.cos(angle) * baseRadius * 1.4, Math.sin(angle) * baseRadius * 1.4);
          ctx.stroke();
        }

        // Inner rotating double needle (North/South indicator)
        ctx.rotate(this.auraAngle * 1.5); // Fast counter-needle
        ctx.fillStyle = '#ff3d00'; // Red pointer
        ctx.beginPath();
        ctx.moveTo(0, -baseRadius * 1.1);
        ctx.lineTo(3.5, 0);
        ctx.lineTo(-3.5, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#cfd8dc'; // Silver pointer
        ctx.beginPath();
        ctx.moveTo(0, baseRadius * 1.1);
        ctx.lineTo(3.5, 0);
        ctx.lineTo(-3.5, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        break;
      }
      case 'dread_falcon': {
        // Rotating golden high-speed targeting reticle aura
        ctx.strokeStyle = '#ffd700'; // Gold reticle
        ctx.save();
        ctx.rotate(this.auraAngle * 2.0); // Fast rotation
        
        // Outer dashed reticle circle
        ctx.lineWidth = 1.2;
        ctx.setLineDash([8, 12]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.35, 0, Math.PI * 2);
        ctx.stroke();

        // 4 corner reticle brackets
        ctx.setLineDash([]);
        ctx.lineWidth = 2.0;
        const bracketSize = 5;
        const bracketRad = baseRadius * 1.5;
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2 + Math.PI / 4;
          const bx = Math.cos(angle) * bracketRad;
          const by = Math.sin(angle) * bracketRad;
          
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(angle + Math.PI); // Align to center
          ctx.beginPath();
          ctx.moveTo(-bracketSize, 0);
          ctx.lineTo(0, 0);
          ctx.lineTo(0, -bracketSize);
          ctx.stroke();
          ctx.restore();
        }

        // Inner glowing target lock blinking red dot
        if (Math.sin(this.auraPulse * 3) > 0) {
          ctx.fillStyle = '#ff1744'; // Glowing red target lock
          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
        break;
      }
      case 'angry_red': {
        // Pulsating fiery rage aura with spinning fury embers
        ctx.strokeStyle = '#ff1a00';
        ctx.save();
        ctx.rotate(this.auraAngle * 1.6);
        
        // Outer fury ring
        ctx.lineWidth = 2.0;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.3, 0, Math.PI * 2);
        ctx.stroke();

        // Inner rage pulse ring
        ctx.strokeStyle = '#ff6600';
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.15, 0, Math.PI * 2);
        ctx.stroke();

        // Spinning fury embers (6 embers around the bird)
        ctx.fillStyle = '#ff4400';
        for (let i = 0; i < 6; i++) {
          const angle = this.auraAngle * 2.0 + (i * Math.PI) / 3;
          const dist = baseRadius * 1.22;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'articuno': {
        // Rotating glacial aurora aura with ice crystal orbits
        ctx.strokeStyle = '#50b4ff';
        ctx.save();
        ctx.rotate(-this.auraAngle * 1.2);
        
        // Outer frost aurora ring
        ctx.lineWidth = 1.8;
        ctx.setLineDash([8, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.35, 0, Math.PI * 2);
        ctx.stroke();

        // Inner shimmering ice ring
        ctx.strokeStyle = '#a0dcff';
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.12, 0, Math.PI * 2);
        ctx.stroke();

        // 5 orbiting ice crystals
        ctx.fillStyle = '#c8eaff';
        for (let i = 0; i < 5; i++) {
          const angle = this.auraAngle * 1.8 + (i * Math.PI * 2) / 5;
          const dist = baseRadius * 1.28;
          ctx.save();
          ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist);
          ctx.rotate(angle * 2);
          // Diamond shape crystal
          ctx.beginPath();
          ctx.moveTo(0, -3);
          ctx.lineTo(2, 0);
          ctx.lineTo(0, 3);
          ctx.lineTo(-2, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        break;
      }

      case 'jade_lotus': {
        // Swirling jade petal ring with blossom orbits
        ctx.strokeStyle = '#00e676';
        ctx.save();
        ctx.rotate(this.auraAngle * 0.9);
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.3, 0, Math.PI * 2);
        ctx.stroke();

        // Inner pink petal ring
        ctx.strokeStyle = '#f48fb1';
        ctx.setLineDash([4, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.1, 0, Math.PI * 2);
        ctx.stroke();

        // 6 orbiting petals
        for (let i = 0; i < 6; i++) {
          const angle = this.auraAngle * 1.5 + (i * Math.PI * 2) / 6;
          const dist = baseRadius * 1.25;
          ctx.save();
          ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist);
          ctx.rotate(angle * 3);
          ctx.fillStyle = i % 2 === 0 ? '#f48fb1' : '#a5d6a7';
          ctx.beginPath();
          ctx.ellipse(0, 0, 3, 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        break;
      }

      case 'cosmic_nova': {
        // Rotating stardust nebula with energy arcs
        ctx.strokeStyle = '#b388ff';
        ctx.save();
        ctx.rotate(this.auraAngle * 1.3);
        ctx.setLineDash([10, 6]);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.35, 0, Math.PI * 2);
        ctx.stroke();

        // Inner cyan energy ring
        ctx.strokeStyle = '#18ffff';
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.15, 0, Math.PI * 2);
        ctx.stroke();

        // 4 energy sparks
        ctx.fillStyle = '#e040fb';
        for (let i = 0; i < 4; i++) {
          const angle = -this.auraAngle * 2.0 + (i * Math.PI) / 2;
          const dist = baseRadius * 1.25;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case 'storm_tempest_eagle': {
        // Double rotating electric circles + jagged lightning discharge arcs (Fiery theme)
        ctx.save();
        
        // Outer rotating crimson ring
        ctx.strokeStyle = '#ff3300';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([8, 12]);
        ctx.save();
        ctx.rotate(this.auraAngle * 1.5);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Inner rotating gold ring
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 8]);
        ctx.save();
        ctx.rotate(-this.auraAngle * 2.2);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Jagged electric discharges (3 fire lightning bolts)
        ctx.strokeStyle = '#ff6f00';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const baseAngle = this.auraAngle + (i * Math.PI * 2) / 3;
          ctx.save();
          ctx.rotate(baseAngle);
          
          ctx.beginPath();
          ctx.moveTo(baseRadius * 0.8, 0);
          // Jagged step 1
          const midX = baseRadius * 1.1;
          const midY = (Math.random() - 0.5) * 6;
          ctx.lineTo(midX, midY);
          // Jagged step 2 (tip)
          const tipX = baseRadius * 1.45;
          const tipY = midY + (Math.random() - 0.5) * 8;
          ctx.lineTo(tipX, tipY);
          ctx.stroke();
          
          // Tiny energy particle at tip
          ctx.fillStyle = '#ffd54f';
          ctx.beginPath();
          ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
        }
        
        ctx.restore();
        break;
      }





      default: {
        // Gold celestial wing shield (Default Eagle)
        if (upgradeLvl > 1) {
          ctx.strokeStyle = '#ffd700';
          ctx.save();
          ctx.rotate(this.auraAngle * 0.5);
          ctx.setLineDash([10, 15]);
          ctx.beginPath();
          ctx.arc(0, 0, baseRadius * 1.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
    }
    
    ctx.restore();
  }

  // Visual Skins Geometries
  private drawEagle(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(212, 175, 55, 0.4)';
    }

    const outlineColor = '#3d2503'; // Dark bronze outline
    
    // 2.5D Face shift offset
    const faceX = Math.cos(this.angle) * 1.8;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.18;

    // --- 2. BACKWARDS CREST FEATHERS (White with Gold tips) ---
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.0;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(faceX - 16, faceY - 12 + k * 7);
      ctx.lineTo(faceX - 30, faceY - 7 + k * 7);
      ctx.lineTo(faceX - 19, faceY - 2 + k * 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Gold tips
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(faceX - 25, faceY - 9 + k * 7);
      ctx.lineTo(faceX - 30, faceY - 7 + k * 7);
      ctx.lineTo(faceX - 26, faceY - 4 + k * 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    }
    ctx.restore();

    // --- 3. EAGLE HEAD PLUMAGE (White Eagle Crown, now the main body: radius 15) ---
    ctx.save();
    const headGrad = ctx.createRadialGradient(faceX - 3, faceY - 3, 2, faceX, faceY, 15);
    headGrad.addColorStop(0, '#ffffff'); // Pure white center
    headGrad.addColorStop(0.7, '#f9fafb'); // Off-white
    headGrad.addColorStop(1, '#e5e7eb'); // Light grey shading at edges
    
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(faceX, faceY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Feathery details inside crown
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(faceX - 3.5, faceY - 1.8, 10.6, 0.3 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // White feathered collar base (feathers at throat)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(faceX - 23, faceY + 11);
    ctx.quadraticCurveTo(faceX - 16, faceY + 18, faceX - 9, faceY + 14);
    ctx.quadraticCurveTo(faceX - 2, faceY + 18, faceX + 5, faceY + 12);
    ctx.lineTo(faceX - 9, faceY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- 4. INTENSE WARRIOR EYE & BROW (Purple/Violet theme) ---
    ctx.save();
    // Outer iris (Vibrant Purple/Violet `#7c3aed`)
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.arc(faceX + 3.5, faceY - 0.9, 5.0, 0, Math.PI * 2);
    ctx.fill();
    
    // Slit pupil (Dark `#1e1b29`)
    ctx.fillStyle = '#1e1b29';
    ctx.beginPath();
    ctx.arc(faceX + 3.5, faceY - 0.9, 2.1, 0, Math.PI * 2);
    ctx.fill();
    
    // Tiny reflection highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(faceX + 4.4, faceY - 1.8, 1.0, 0, Math.PI * 2);
    ctx.fill();

    // Defined shadow brow line over the eye (Vivid violet `#5b21b6`)
    ctx.strokeStyle = '#5b21b6';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(faceX - 2.6, faceY - 5.6);
    ctx.lineTo(faceX + 9.7, faceY - 3.2);
    ctx.stroke();
    ctx.restore();

    // --- 5. THICK MAJESTIC GOLDEN EAGLE BEAK (Hooked gold beak with lavender tip) ---
    ctx.save();
    const beakGrad = ctx.createLinearGradient(faceX + 8.8, faceY - 3.5, faceX + 19.7, faceY + 9.9);
    beakGrad.addColorStop(0, '#ffd54f'); // Golden yellow base
    beakGrad.addColorStop(0.6, '#ff8f00'); // Deep gold
    beakGrad.addColorStop(1, '#c084fc'); // Lavender tip
    
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2.1;

    ctx.beginPath();
    ctx.moveTo(faceX + 8.8, faceY - 3.5);
    ctx.quadraticCurveTo(faceX + 26.4, faceY - 1.8, faceX + 21.1, faceY + 12.3); // hooked down tip
    ctx.lineTo(faceX + 15.8, faceY + 9.7);
    ctx.quadraticCurveTo(faceX + 12.3, faceY + 6.7, faceX + 7.9, faceY + 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Beak mouth line
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(faceX + 8.8, faceY + 5.6);
    ctx.quadraticCurveTo(faceX + 15.0, faceY + 8.4, faceX + 19.7, faceY + 9.9);
    ctx.stroke();
    ctx.restore();

    // --- 6. FLAPPING WINGS (Classic flappy wings shape, gold-brown color scheme) ---
    ctx.save();
    ctx.translate(faceX - 2, faceY + 1);
    const wingFlap = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(wingFlap);

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';

    const makeFeatherGrad = (x1: number, y1: number, x2: number, y2: number, startCol: string, endCol: string) => {
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, startCol);
      grad.addColorStop(1, endCol);
      return grad;
    };

    // Bottom rounded feather
    ctx.fillStyle = makeFeatherGrad(-10, 5, -5, -1, '#8b5a2b', '#4a2f1b');
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.quadraticCurveTo(-5, 9, -10, 5);
    ctx.quadraticCurveTo(-12, 1, -5, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Middle rounded feather
    ctx.fillStyle = makeFeatherGrad(-15, -5, -4, -5, '#d4af37', '#8b5a2b');
    ctx.beginPath();
    ctx.moveTo(1, -2);
    ctx.quadraticCurveTo(-13, 1, -15, -5);
    ctx.quadraticCurveTo(-15, -9, -4, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Top rounded feather (overlapping others, with golden shine)
    ctx.fillStyle = makeFeatherGrad(-9, -18, 2, -9, '#ffd54f', '#d4af37');
    ctx.beginPath();
    ctx.moveTo(1, -6);
    ctx.quadraticCurveTo(-11, -11, -9, -18);
    ctx.quadraticCurveTo(-5, -18, 2, -9);
    ctx.quadraticCurveTo(4, -4, 2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glossy wing highlight
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1, -9);
    ctx.quadraticCurveTo(-4, -14, -7, -16);
    ctx.stroke();

    ctx.restore();
  }



  private drawPhoenix(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(255, 69, 0, 0.9)';
    }

    // Fire phoenix core body
    const bodyGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.4, '#ffd700');
    bodyGrad.addColorStop(0.8, '#ff4500');
    bodyGrad.addColorStop(1, '#8b0000');

    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Glowing flame beak
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.lineTo(25, 0);
    ctx.lineTo(10, 4);
    ctx.closePath();
    ctx.fill();

    // Fire phoenix eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(7, -3, 2, 0, Math.PI * 2);
    ctx.fill();

    // Flapping blazing phoenix wings
    this.drawFlappingWing(ctx, '#ff4500', '#ffd700', true);
  }


  private drawIce(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(0, 243, 255, 0.6)';
    }

    // Translucent Ice Gem body
    const iceGrad = ctx.createLinearGradient(-15, -15, 15, 15);
    iceGrad.addColorStop(0, '#e0ffff');
    iceGrad.addColorStop(0.5, '#87ceeb');
    iceGrad.addColorStop(1, '#4682b4');

    ctx.fillStyle = iceGrad;
    ctx.beginPath();
    // Angular geometric body instead of circle
    ctx.moveTo(0, -16);
    ctx.lineTo(15, -5);
    ctx.lineTo(10, 12);
    ctx.lineTo(-12, 10);
    ctx.lineTo(-15, -7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Icicle beak
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(11, -3);
    ctx.lineTo(24, 0);
    ctx.lineTo(8, 3);
    ctx.closePath();
    ctx.fill();

    // Sparkling eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, -4, 2, 0, Math.PI * 2);
    ctx.fill();

    // Crystal shard wing
    this.drawCrystalWing(ctx);
  }
  private drawNebula(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = 'rgba(255, 20, 147, 0.8)';
    }

    // Galaxy body
    const cosmicGrad = ctx.createRadialGradient(-2, -2, 2, 0, 0, 16);
    cosmicGrad.addColorStop(0, '#ff1493');
    cosmicGrad.addColorStop(0.5, '#00bfff');
    cosmicGrad.addColorStop(1, '#0b001a');

    ctx.fillStyle = cosmicGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Star sparkles pattern inside body
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-6, -6, 1.5, 1.5);
    ctx.fillRect(4, 5, 1.5, 1.5);
    ctx.fillRect(-5, 4, 1, 1);

    // Nebula eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, -4, 2, 0, Math.PI * 2);
    ctx.fill();

    // Celestial cosmic wings
    this.drawFlappingWing(ctx, '#0b001a', '#ff1493', true);
  }


  // Utility flapping wing math
  private drawFlappingWing(ctx: CanvasRenderingContext2D, color1: string, color2: string, glow = false) {
    ctx.save();
    // Offset slightly back from center
    ctx.translate(-4, 2);

    // Oscillation based on flapCycle
    const flapAngle = Math.sin(this.flapCycle) * 0.7; // Angle of wing pivot
    ctx.rotate(flapAngle);

    const wingGrad = ctx.createLinearGradient(0, 0, -25, 0);
    wingGrad.addColorStop(0, color1);
    wingGrad.addColorStop(1, color2);
    ctx.fillStyle = wingGrad;

    if (glow && !(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = color2;
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-15, -12, -25, -2, -28, 6);
    ctx.bezierCurveTo(-20, 12, -10, 4, 0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }


  private drawCrystalWing(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(-4, 2);
    const flapAngle = Math.sin(this.flapCycle) * 0.6;
    ctx.rotate(flapAngle);

    const crystGrad = ctx.createLinearGradient(0, 0, -26, 0);
    crystGrad.addColorStop(0, '#87ceeb');
    crystGrad.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
    ctx.fillStyle = crystGrad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;

    // Wing comprised of 3 distinct crystal shard feathers
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-20, -12);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-26, -3);
    ctx.lineTo(-16, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawCyberOwl(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00f3ff';
    }

    // 2.5D Face shift offset
    const faceX = Math.cos(this.angle) * 2.0;
    const faceY = Math.sin(this.angle) * 1.5 - this.vy * 0.2;

    // Glowing thruster/engine exhaust at back
    ctx.save();
    ctx.translate(-14, 2);
    const thrusterGlow = 4 + Math.sin(this.flapCycle * 2) * 2;
    ctx.fillStyle = '#071626';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-3, -6, 4, 12);
    ctx.fill();
    ctx.stroke();
    
    // Pulse flame
    const flameGrad = ctx.createLinearGradient(-3, 0, -16, 0);
    flameGrad.addColorStop(0, '#ffffff');
    flameGrad.addColorStop(0.3, '#00f3ff');
    flameGrad.addColorStop(1, 'rgba(0, 243, 255, 0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-3, -3);
    ctx.lineTo(-3 - thrusterGlow * 1.5, 0);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Futuristic mechanical metallic body
    const bodyGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    bodyGrad.addColorStop(0, '#092540');
    bodyGrad.addColorStop(0.7, '#071626');
    bodyGrad.addColorStop(1, '#02070e');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Circuits lines on face (2.5D shift)
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-10 + faceX, -5 + faceY);
    ctx.lineTo(-4 + faceX, faceY);
    ctx.lineTo(-10 + faceX, 5 + faceY);
    ctx.moveTo(10 + faceX, -5 + faceY);
    ctx.lineTo(4 + faceX, faceY);
    ctx.lineTo(10 + faceX, 5 + faceY);
    ctx.stroke();

    // Glowing Neon Cyan Owl circular eyes (2.5D shift)
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2.5;
    
    // Left eye
    ctx.fillStyle = '#050c18';
    ctx.beginPath();
    ctx.arc(-6 + faceX, -2 + faceY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-6 + faceX, -2 + faceY, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Right eye
    ctx.fillStyle = '#050c18';
    ctx.beginPath();
    ctx.arc(6 + faceX, -2 + faceY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6 + faceX, -2 + faceY, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Cyber pointed beak (2.5D shift)
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.moveTo(faceX, 2 + faceY);
    ctx.lineTo(-3 + faceX, 8 + faceY);
    ctx.lineTo(3 + faceX, 8 + faceY);
    ctx.closePath();
    ctx.fill();

    // Cyber owl ear tufts (2.5D shift)
    ctx.fillStyle = '#071626';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12 + faceX, -10 + faceY);
    ctx.lineTo(-18 + faceX * 1.3, -18 + faceY * 1.3);
    ctx.lineTo(-6 + faceX, -15 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(12 + faceX, -10 + faceY);
    ctx.lineTo(18 + faceX * 1.3, -18 + faceY * 1.3);
    ctx.lineTo(6 + faceX, -15 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Reactive mechanical tail stabilizer (sways on climb/dive & beats)
    ctx.save();
    ctx.translate(-13, 8);
    const tailSway = Math.sin(this.flapCycle) * 0.15 - this.vy * 0.05;
    ctx.rotate(tailSway);
    ctx.fillStyle = '#02070e';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.2;
    
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-12, 4);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Vane lines
    ctx.strokeStyle = '#00f3ff';
    ctx.beginPath();
    ctx.moveTo(-3, -1);
    ctx.lineTo(-8, -1);
    ctx.moveTo(-3, 1);
    ctx.lineTo(-8, 1);
    ctx.stroke();
    ctx.restore();

    // Multi-layered mechanical wings (shoulder, elbow, wrist segments)
    ctx.save();
    ctx.translate(-4, 1);
    
    const shoulderAngle = Math.sin(this.flapCycle) * 0.55;
    const elbowAngle = Math.sin(this.flapCycle + 0.4) * 0.4;
    const wristAngle = Math.sin(this.flapCycle + 0.8) * 0.3;
    
    // Panel 1: Shoulder main armor casing
    ctx.save();
    ctx.rotate(shoulderAngle);
    ctx.fillStyle = '#071626';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-18, 2);
    ctx.lineTo(-8, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Panel 2: Inner wing panels sliding under the main casing
    ctx.save();
    ctx.translate(-10, -2);
    ctx.rotate(elbowAngle);
    const midWingGrad = ctx.createLinearGradient(0, 0, -15, 4);
    midWingGrad.addColorStop(0, '#092540');
    midWingGrad.addColorStop(1, '#00f3ff');
    ctx.fillStyle = midWingGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-15, -6);
    ctx.lineTo(-20, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Panel 3: High-energy blade feathers extending under the midwing
    ctx.save();
    ctx.translate(-12, -1);
    ctx.rotate(wristAngle);
    ctx.fillStyle = 'rgba(0, 243, 255, 0.85)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-14, -4);
    ctx.lineTo(-17, 2);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore(); // wrist
    ctx.restore(); // elbow
    ctx.restore(); // shoulder
    ctx.restore(); // wing main
  }

  private drawNeonCrow(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ff007f';
    }

    // 2.5D Face shift offset
    const faceX = Math.cos(this.angle) * 2.2;
    const faceY = Math.sin(this.angle) * 1.8 - this.vy * 0.15;

    // Sleek black body
    ctx.fillStyle = '#0a0a0f';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Punk mohawk crest feathers (folds back based on velocity vy & sways on beat)
    ctx.save();
    ctx.translate(-2, -12);
    const crestTilt = -this.vy * 0.08 + Math.sin(this.flapCycle * 2.0) * 0.06;
    ctx.rotate(crestTilt);
    ctx.fillStyle = '#ff007f'; // Neon magenta mohawk
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-16, -14, -20, -8);
    ctx.quadraticCurveTo(-10, 0, 0, -3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Blue rogue jacket collar details - reacts to velocity drag
    ctx.save();
    ctx.translate(-10, 8);
    const collarSway = this.vy * 0.08;
    ctx.rotate(collarSway);
    ctx.fillStyle = '#1e3a8a';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(6, 7);
    ctx.lineTo(-2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Dual long tail feathers tilting reactively in opposition to wing beats
    ctx.save();
    ctx.translate(-14, 5);
    const tailFlap = -Math.sin(this.flapCycle) * 0.25 - this.vy * 0.08;
    ctx.rotate(tailFlap);
    
    // Top feather
    ctx.fillStyle = '#0a0a0f';
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(-15, -8, -24, -4);
    ctx.quadraticCurveTo(-10, 2, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bottom feather
    ctx.strokeStyle = '#00f3ff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-18, 2, -26, 6);
    ctx.quadraticCurveTo(-10, 4, 0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Rogue bird glowing pink cheek patch (2.5D shift)
    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.arc(4 + faceX, 2 + faceY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Cool rogue raven beak (large & sharp; 2.5D shift)
    ctx.fillStyle = '#1e1b29';
    ctx.strokeStyle = '#ff007f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8 + faceX, -5 + faceY);
    ctx.lineTo(26 + faceX * 1.3, faceY);
    ctx.lineTo(8 + faceX, 8 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Angry glowing eyes (2.5D shift)
    ctx.strokeStyle = '#00f3ff'; // neon cyan glowing eye
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(3 + faceX, -4 + faceY);
    ctx.lineTo(10 + faceX, -2 + faceY);
    ctx.stroke();

    // Organic multi-segmented crow wings
    ctx.save();
    ctx.translate(-4, 2);
    const baseWingAngle = Math.sin(this.flapCycle) * 0.6;
    ctx.rotate(baseWingAngle);
    
    // We draw 3 layers of overlapping feathers that expand and contract.
    // Feather 1 (Longest outer wing tip, glowing cyan)
    ctx.save();
    const f1Angle = Math.sin(this.flapCycle + 0.3) * 0.2;
    ctx.rotate(f1Angle);
    const gradF1 = ctx.createLinearGradient(0, 0, -26, -5);
    gradF1.addColorStop(0, '#0a0a0f');
    gradF1.addColorStop(1, '#00f3ff');
    ctx.fillStyle = gradF1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-15, -12, -24, -5, -28, 2);
    ctx.bezierCurveTo(-18, 5, -8, 2, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Feather 2 (Middle feather, neon pink)
    ctx.save();
    const f2Angle = Math.sin(this.flapCycle + 0.6) * 0.1;
    ctx.rotate(f2Angle);
    const gradF2 = ctx.createLinearGradient(0, 0, -22, 0);
    gradF2.addColorStop(0, '#0a0a0f');
    gradF2.addColorStop(1, '#ff007f');
    ctx.fillStyle = gradF2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-12, -8, -20, 2, -24, 8);
    ctx.bezierCurveTo(-15, 9, -6, 4, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Feather 3 (Shortest inner fluff, dark purple)
    ctx.save();
    const f3Angle = Math.sin(this.flapCycle + 0.9) * 0.05;
    ctx.rotate(f3Angle);
    ctx.fillStyle = '#4a0e4e';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-8, -4, -15, 6, -18, 12);
    ctx.bezierCurveTo(-12, 10, -5, 5, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }


  private drawWhiteDragon(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.scale(1.3, 1.3);

    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(224, 180, 255, 0.7)';
    }

    // 2.5D Face shift offset (for head features only)
    const faceX = Math.cos(this.angle) * 2.0;
    const faceY = Math.sin(this.angle) * 1.5 - this.vy * 0.1;

    // Head position relative to center: (10, -8)
    const headX = 10 + faceX;
    const headY = -8 + faceY;

    // --- 1. DRAGON TAIL (Undulating, reduced by 50% length: only 3 segments instead of 6) ---
    ctx.save();
    ctx.translate(-20, 6); // Position slightly adjusted due to increased body size
    let prevX = 0;
    let prevY = 0;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    for (let i = 1; i <= 3; i++) { // 3 segments is exactly 50% less than 6
      const tailSegLength = 5.0;
      const angleOffset = i * 0.4;
      const waveAngle = Math.sin(this.flapCycle * 1.3 - angleOffset) * 0.35 + (this.vy * 0.05);
      
      prevX -= Math.cos(waveAngle) * tailSegLength;
      prevY += Math.sin(waveAngle) * tailSegLength;
      ctx.lineTo(prevX, prevY);
    }
    ctx.stroke();
    
    // Tail spade (flaming lavender tip)
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.bezierCurveTo(prevX - 4, prevY - 4, prevX - 8, prevY, prevX - 9, prevY + 1.5);
    ctx.bezierCurveTo(prevX - 8, prevY + 3, prevX - 4, prevY + 7, prevX, prevY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- 2. DRAGON LEGS (Tucked claw legs, scaled up for body increase) ---
    // Hind leg
    ctx.save();
    ctx.translate(-12, 11);
    ctx.rotate(Math.sin(this.flapCycle) * 0.15);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5, 7, 0.4, 0, Math.PI * 2); // slightly larger
    ctx.fill();
    // Talons
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(-1, 6);
    ctx.lineTo(-4, 10);
    ctx.lineTo(-1, 9);
    ctx.lineTo(2, 10);
    ctx.lineTo(1, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Fore leg
    ctx.save();
    ctx.translate(2, 11);
    ctx.rotate(Math.sin(this.flapCycle + Math.PI/2) * 0.15);
    ctx.fillStyle = '#fbcfe8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.5, 7, 0.2, 0, Math.PI * 2); // slightly larger
    ctx.fill();
    // Talons
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(-1, 6);
    ctx.lineTo(-3, 10);
    ctx.lineTo(0, 9);
    ctx.lineTo(3, 10);
    ctx.lineTo(1, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- 3. MAJESTIC SERPENTINE TORSO & NECK (Size increased by ~15%) ---
    const bodyGrad = ctx.createLinearGradient(-22, -6, 14, 14);
    bodyGrad.addColorStop(0, '#f1f5f9');
    bodyGrad.addColorStop(0.5, '#f8fafc');
    bodyGrad.addColorStop(1, '#e2e8f0');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    // Neck starts at head connection
    ctx.moveTo(headX - 4, headY + 4);
    // Outer neck curve down to chest (wider chest area)
    ctx.quadraticCurveTo(7, 0, 4, 10);
    // Underbelly (deeper, fuller curve)
    ctx.bezierCurveTo(0, 16, -15, 14, -22, 6);
    // Rear transition
    ctx.lineTo(-20, 1);
    // Back ridge line curving up to neck
    ctx.bezierCurveTo(-13, -5, -3, -2, headX - 9, headY + 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 4. BACK SPIKES / DORSAL RIDGE ---
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    // Spike 1 (Back)
    ctx.moveTo(-17, 2);
    ctx.lineTo(-21, -5);
    ctx.lineTo(-12, 0);
    // Spike 2 (Mid-back)
    ctx.moveTo(-10, -2);
    ctx.lineTo(-13, -9);
    ctx.lineTo(-5, -3);
    // Spike 3 (Lower neck)
    ctx.moveTo(-4, -4);
    ctx.lineTo(-6, -11);
    ctx.lineTo(1, -5);
    ctx.closePath();
    ctx.fill();

    // --- 5. OVERLAY PROCEDURAL DRAGON SCALES ---
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
    ctx.lineWidth = 1;
    // Draw scales adjusted for larger body size
    const scalePoints = [
      {x: -15, y: 4}, {x: -11, y: 5}, {x: -7, y: 6}, {x: -3, y: 7}, {x: 1, y: 7},
      {x: -13, y: 1}, {x: -9, y: 2}, {x: -5, y: 3}, {x: -1, y: 4}, {x: 3, y: 4},
      {x: -7, y: -2}, {x: -3, y: -1}, {x: 1, y: 0}, {x: 5, y: 1}
    ];
    scalePoints.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.8, 0, Math.PI);
      ctx.stroke();
    });

    // --- 6. DRAGON-BIRD HYBRID HEAD (Rounded bird head with sharp golden-lavender beak) ---
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.3;

    // Draw rounded bird head shape
    ctx.beginPath();
    ctx.arc(headX, headY, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Sharp golden bird beak (falcon-like curved hook)
    const beakGrad = ctx.createLinearGradient(headX + 4, headY - 5, headX + 18, headY + 5);
    beakGrad.addColorStop(0, '#ffd54f'); // Golden yellow base
    beakGrad.addColorStop(0.6, '#ff8f00'); // Deep gold
    beakGrad.addColorStop(1, '#c084fc'); // Lavender tip (blends with white dragon theme!)
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#3d2503';
    ctx.lineWidth = 1.1;

    ctx.beginPath();
    ctx.moveTo(headX + 5, headY - 4); // top base of beak
    ctx.quadraticCurveTo(headX + 16, headY - 3, headX + 14, headY + 4); // curved hook tip pointing down
    ctx.lineTo(headX + 10, headY + 2); // lower cut
    ctx.quadraticCurveTo(headX + 7, headY + 0.5, headX + 3, headY + 0.8); // mouth line connection
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle beak highlight reflection line (gives 3D shiny metallic feel)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(headX + 6, headY - 3);
    ctx.quadraticCurveTo(headX + 12, headY - 2, headX + 11, headY + 1);
    ctx.stroke();

    // Majestic horns (Lilac/Purple)
    ctx.fillStyle = '#c084fc';
    // Horn 1 (Top horn)
    ctx.beginPath();
    ctx.moveTo(headX - 5, headY - 5);
    ctx.quadraticCurveTo(headX - 14, headY - 16, headX - 20, headY - 12);
    ctx.quadraticCurveTo(headX - 10, headY - 6, headX - 3, headY - 3);
    ctx.closePath();
    ctx.fill();
    // Horn 2 (Lower horn)
    ctx.beginPath();
    ctx.moveTo(headX - 6, headY + 1);
    ctx.quadraticCurveTo(headX - 12, headY - 6, headX - 16, headY - 4);
    ctx.quadraticCurveTo(headX - 9, headY + 2, headX - 4, headY + 3);
    ctx.closePath();
    ctx.fill();

    // --- 7. INTENSE MINIATURIZED DRAGON EYE (Reduced size from 4.5 to 2.2 for realistic proportions) ---
    // Outer iris
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.arc(headX + 1, headY - 1, 2.2, 0, Math.PI * 2); // 50% decrease in size
    ctx.fill();
    
    // Slit pupil
    ctx.fillStyle = '#1e1b29';
    ctx.beginPath();
    ctx.ellipse(headX + 1, headY - 1, 0.6, 1.8, 0.1, 0, Math.PI * 2);
    ctx.fill();
    
    // Tiny reflection highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX + 1.6, headY - 1.6, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Defined shadow brow line over the eye (gives a sharp, realistic look)
    ctx.strokeStyle = '#5b21b6';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(headX - 2, headY - 3.5);
    ctx.quadraticCurveTo(headX + 1.5, headY - 3.8, headX + 4, headY - 2.8);
    ctx.stroke();

    // --- 8. WEBBED WINGS (Centered at shoulder: -2, 2) ---
    ctx.save();
    ctx.translate(-2, 2);
    const wingFlap = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(wingFlap);
    
    // Draw Webbing first
    ctx.fillStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    
    const bone1X = -26, bone1Y = -12;
    const bone2X = -15, bone2Y = 6;
    const bone3X = -8, bone3Y = 14;
    
    ctx.lineTo(bone1X, bone1Y);
    ctx.quadraticCurveTo(-20, -2, bone2X, bone2Y);
    ctx.quadraticCurveTo(-11, 10, bone3X, bone3Y);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    
    // Draw bone structure
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2.0;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -4);
    const wristX = -8, wristY = -4;
    
    ctx.moveTo(wristX, wristY);
    ctx.lineTo(bone1X, bone1Y);
    ctx.moveTo(wristX, wristY);
    ctx.lineTo(bone2X, bone2Y);
    ctx.moveTo(wristX, wristY);
    ctx.lineTo(bone3X, bone3Y);
    ctx.stroke();
    
    // Small wrist claw
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.arc(wristX, wristY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    ctx.restore(); // restore the main scale(1.3, 1.3)
  }


  private drawKingfisher(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 112, 67, 0.5)';
    }

    // 2.5D Face shift offset based on bird movement angle
    const faceX = Math.cos(this.angle) * 1.5;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.1;

    // --- 1. Steel-colored Curved Talons (Aggressive battle-claws) ---
    ctx.fillStyle = '#455a64'; // Steel grey
    ctx.strokeStyle = '#263238'; // Dark charcoal edge
    ctx.lineWidth = 1.2;
    // Left talon
    ctx.beginPath();
    ctx.moveTo(-6, 13);
    ctx.quadraticCurveTo(-10, 19, -4, 21); // Curved hook front
    ctx.quadraticCurveTo(-2, 17, -2, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Right talon
    ctx.beginPath();
    ctx.moveTo(1, 12);
    ctx.quadraticCurveTo(-2, 19, 4, 20); // Curved hook
    ctx.quadraticCurveTo(5, 16, 5, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Add golden accent claws
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(-4, 21, 1.2, 0, Math.PI * 2);
    ctx.arc(4, 20, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. Torso (Belly/Breast: High-tech layered boss armor plates) ---
    // Outer shadow / glow border
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();

    const armorGrad = ctx.createLinearGradient(-15, -15, 15, 15);
    armorGrad.addColorStop(0, '#ffe082'); // Gold-yellow top
    armorGrad.addColorStop(0.5, '#ff8f00'); // Amber orange
    armorGrad.addColorStop(1, '#e65100'); // Deep dark orange-red base

    // Draw main angular chest shield
    ctx.fillStyle = armorGrad;
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(13, -10);
    ctx.lineTo(16, 4);
    ctx.lineTo(8, 14);
    ctx.lineTo(-8, 14);
    ctx.lineTo(-16, 4);
    ctx.lineTo(-13, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Layered plates inside chest
    ctx.strokeStyle = '#ffd700'; // Glowing golden seam lines
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Plate 1 horizontal divider
    ctx.moveTo(-14, -2);
    ctx.lineTo(0, 4);
    ctx.lineTo(14, -2);
    // Plate 2 vertical centerline divider
    ctx.moveTo(0, 4);
    ctx.lineTo(0, 14);
    ctx.stroke();

    // --- 3. Jagged Pink/Magenta Energy Tail Spikes (Thruster-like) ---
    ctx.save();
    ctx.translate(-13, 5);
    const tailTilt = -this.vy * 0.05 + Math.sin(this.flapCycle) * 0.1;
    ctx.rotate(tailTilt);
    
    // Gradient: Hot pink / magenta to bright violet
    const energyGrad = ctx.createLinearGradient(0, -8, -26, 12);
    energyGrad.addColorStop(0, '#e040fb'); // Bright violet
    energyGrad.addColorStop(0.5, '#ff007f'); // Hot pink / Magenta
    energyGrad.addColorStop(1, '#ff80ab'); // Light neon pink edge

    ctx.fillStyle = energyGrad;
    ctx.strokeStyle = '#4a0072';
    ctx.lineWidth = 1.5;

    // Draw 3 jagged bladed spikes
    // Top spike
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-24, -14);
    ctx.lineTo(-10, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center/Main spike
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-29, 3);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Bottom spike
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(-22, 12);
    ctx.lineTo(2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glow core for energy tail
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff007f';
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-8, 0, 5, 2, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- 4. Back / Cape / Scapular feathers (Heavy Metallic Navy/Indigo Armor Plates) ---
    const plateGrad = ctx.createLinearGradient(-15, -12, 5, 10);
    plateGrad.addColorStop(0, '#000a12');   // Near black metallic
    plateGrad.addColorStop(0.4, '#0f1b29'); // Dark navy
    plateGrad.addColorStop(0.8, '#1565c0'); // Royal blue plate
    plateGrad.addColorStop(1, '#00e5ff');   // Cyan glowing edge

    ctx.fillStyle = plateGrad;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    // Angular back plate
    ctx.moveTo(-16, -4);
    ctx.lineTo(-5, -13);
    ctx.lineTo(5, -6);
    ctx.lineTo(1, 4);
    ctx.lineTo(-11, 10);
    ctx.lineTo(-16, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Additional shoulder blade detail
    ctx.strokeStyle = '#1565c0';
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.lineTo(-2, -6);
    ctx.stroke();

    // --- 5. Royal Kingfisher Crown & Head (Purple/Magenta crown with red/orange base) ---
    const headGrad = ctx.createLinearGradient(-6, -16, 12, -4);
    headGrad.addColorStop(0, '#6a1b9a'); // Deep purple crown
    headGrad.addColorStop(0.4, '#c2185b'); // Magenta/Pink
    headGrad.addColorStop(0.8, '#d84315'); // Red-orange eyebrow ridge
    headGrad.addColorStop(1, '#ffb300');   // Yellow/Gold face connection

    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(faceX, -6 + faceY, 12.5, 0, Math.PI * 2);
    ctx.fill();

    // Dangerous back-sweeping horns (Magenta energy spikes)
    ctx.strokeStyle = '#c2185b';
    ctx.lineWidth = 1.5;
    
    // Horn 1 (Top horn)
    const hornGrad = ctx.createLinearGradient(faceX, -15 + faceY, -18 + faceX, -22 + faceY);
    hornGrad.addColorStop(0, '#c2185b');
    hornGrad.addColorStop(1, '#ff007f'); // Menacing neon tip
    ctx.fillStyle = hornGrad;
    ctx.beginPath();
    ctx.moveTo(-2 + faceX, -16 + faceY);
    ctx.lineTo(-20 + faceX, -26 + faceY); // Long dangerous swept horn
    ctx.lineTo(-8 + faceX, -12 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Horn 2 (Middle horn)
    ctx.beginPath();
    ctx.moveTo(-6 + faceX, -13 + faceY);
    ctx.lineTo(-22 + faceX, -17 + faceY);
    ctx.lineTo(-10 + faceX, -8 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 6. Cheeks & Throat (Glowing yellow power plate under eye) ---
    ctx.fillStyle = '#ffea00'; // High-intensity yellow neon plate
    ctx.beginPath();
    ctx.ellipse(3 + faceX, 1 + faceY, 4.5, 2.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // --- 7. Normal & Relaxing Eye (Simpler, calm black eye with soft highlights) ---
    // Soft outer cream/light-blue eye ring for a natural kingfisher detail
    ctx.fillStyle = '#e1f5fe'; // Soft sky blue/cream
    ctx.beginPath();
    ctx.arc(4 + faceX, -6 + faceY, 5.0, 0, Math.PI * 2);
    ctx.fill();

    // Calm round black eye
    ctx.fillStyle = '#101726'; // Deep midnight blue/black
    ctx.beginPath();
    ctx.arc(4 + faceX, -6 + faceY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Gentle white highlights (making it look friendly and relaxing)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5.0 + faceX, -7.2 + faceY, 1.2, 0, Math.PI * 2); // Primary light reflection
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(2.8 + faceX, -5.0 + faceY, 0.6, 0, Math.PI * 2); // Secondary subtle reflection
    ctx.fill();

    // --- 8. Giant Red-Orange Beak (Reinforced cyber-alloy plating, pointing slightly upwards) ---
    const beakGrad = ctx.createLinearGradient(faceX, -8 + faceY, 32 + faceX, -2 + faceY);
    beakGrad.addColorStop(0, '#d84315'); // Deep rust base
    beakGrad.addColorStop(0.5, '#ff3d00'); // Fiery orange-red
    beakGrad.addColorStop(1, '#ff6e40'); // Glowing orange tip

    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#37474f'; // Metallic blue-grey outline
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8 + faceX, -11 + faceY); // Top base
    ctx.lineTo(35 + faceX * 1.4, -6 + faceY); // Sharp tip pointing up
    ctx.lineTo(7 + faceX, -1 + faceY); // Bottom base
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Metal alloy support plate near face
    ctx.fillStyle = '#546e7a';
    ctx.beginPath();
    ctx.moveTo(8 + faceX, -11 + faceY);
    ctx.lineTo(13 + faceX, -8 + faceY);
    ctx.lineTo(11 + faceX, -3 + faceY);
    ctx.lineTo(7 + faceX, -1 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Laser cutting beam separator along the beak lip
    ctx.strokeStyle = '#ff9100'; // Heat laser glow
    ctx.lineWidth = 1.5;
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#ff9100';
    }
    ctx.beginPath();
    ctx.moveTo(11 + faceX, -5 + faceY);
    ctx.lineTo(34 + faceX * 1.4, -6 + faceY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // --- 9. Upgraded Large Realistic Royal Kingfisher Wings (Matching pattern with cyan speckles, 25% larger) ---
    ctx.save();
    ctx.translate(-4, 2);
    // Flapping movement angle
    const flapAngle = Math.sin(this.flapCycle) * 0.75;
    ctx.rotate(flapAngle);

    // Main wing gradient: Navy blue base to royal blue to bright cyan tip
    const wingGrad = ctx.createLinearGradient(0, 0, -38, 5);
    wingGrad.addColorStop(0, '#0c1033'); // Dark navy joint
    wingGrad.addColorStop(0.4, '#1565c0'); // Royal blue middle
    wingGrad.addColorStop(0.8, '#00b0ff'); // Sky blue outer
    wingGrad.addColorStop(1, '#00e5ff'); // Glowing cyan tips

    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 1.5;
    
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(0, 229, 255, 0.6)';
    }

    // Draw a large, layered, sharp wing silhouette (epic, dangerous, realistic layout)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Top primary feathers (Longer and sweeping back, size increased by ~25%)
    ctx.bezierCurveTo(-15, -22, -35, -12, -42, 2);
    // Layered feather tips (serrated/bladed tips for dangerous matching look)
    ctx.lineTo(-38, 6);
    ctx.lineTo(-44, 11); // Second long primary feather tip
    ctx.lineTo(-34, 13);
    ctx.lineTo(-38, 19); // Third secondary feather tip
    ctx.lineTo(-24, 16);
    ctx.lineTo(-26, 22); // Fourth secondary feather tip
    ctx.lineTo(-12, 12);
    ctx.quadraticCurveTo(-6, 6, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Turn off shadow for detailed inner patterns
    ctx.shadowBlur = 0;

    // --- Real Matching Detail: Cyan/Turquoise spots & feather bars ---
    // In real kingfishers, wings have rows of glowing turquoise spots
    ctx.fillStyle = '#00e5ff'; // High intensity cyan/turquoise spots
    const spots = [
      { x: -12, y: -2, r: 1.8 },
      { x: -20, y: -4, r: 1.8 },
      { x: -28, y: -4, r: 1.8 },
      { x: -16, y: 3, r: 1.5 },
      { x: -24, y: 4, r: 1.5 },
      { x: -32, y: 3, r: 1.5 },
      { x: -18, y: 10, r: 1.2 },
      { x: -26, y: 11, r: 1.2 },
    ];
    for (const spot of spots) {
      ctx.beginPath();
      ctx.arc(spot.x, spot.y, spot.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing feather shaft lines for a premium metallic/energy look
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Shaft 1
    ctx.moveTo(-4, -1);
    ctx.lineTo(-32, -5);
    // Shaft 2
    ctx.moveTo(-6, 2);
    ctx.lineTo(-30, 4);
    // Shaft 3
    ctx.moveTo(-8, 5);
    ctx.lineTo(-24, 10);
    ctx.stroke();

    // Wing joint cover (Gold armored cap matching the torso accents)
    ctx.fillStyle = '#ffb300';
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawOwl(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(255, 23, 68, 0.7)'; // Blazing ruby red glow
    }

    // 2.5D Face shift offset based on bird movement angle
    const faceX = Math.cos(this.angle) * 1.5;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.1;

    // --- 1. Razor Steel Talons (Profile view facing right/downwards) ---
    ctx.fillStyle = '#37474f';
    ctx.strokeStyle = '#ff1744'; // Glowing ruby red trim
    ctx.lineWidth = 1.2;
    // Back talon
    ctx.beginPath();
    ctx.moveTo(-4, 12);
    ctx.quadraticCurveTo(-9, 19, -3, 21);
    ctx.quadraticCurveTo(-1, 16, -1, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front talon (Larger, facing forward/right)
    ctx.beginPath();
    ctx.moveTo(3, 11);
    ctx.quadraticCurveTo(8, 20, 14, 18); // Facing right
    ctx.quadraticCurveTo(11, 14, 7, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Golden glowing claws
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(-3, 21, 1.2, 0, Math.PI * 2);
    ctx.arc(14, 18, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // --- 2. Body/Torso (Layered Obsidian & Crimson armor in side profile) ---
    const bodyGrad = ctx.createLinearGradient(-15, -15, 15, 15);
    bodyGrad.addColorStop(0, '#1a0033'); // Dark void purple
    bodyGrad.addColorStop(0.5, '#0d001a'); // Dark obsidian
    bodyGrad.addColorStop(1, '#000000'); // Shadow base
    ctx.fillStyle = bodyGrad;
    
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Armored breast-plates (facing right, layered)
    ctx.fillStyle = '#cfd8dc'; // Steel silver plates
    ctx.strokeStyle = '#ff1744'; // Glowing ruby red seams
    ctx.lineWidth = 1.0;
    
    // Drawing overlapping curved plates on the breast (right side)
    // Top plate
    ctx.beginPath();
    ctx.moveTo(4, -13);
    ctx.quadraticCurveTo(16, -6, 15, 2);
    ctx.lineTo(8, 2);
    ctx.quadraticCurveTo(8, -8, 4, -13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Middle plate
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.quadraticCurveTo(16, 6, 12, 12);
    ctx.lineTo(3, 9);
    ctx.quadraticCurveTo(7, 6, 8, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 3. Fan-shaped Tail Feathers (Extending back-left in profile) ---
    ctx.save();
    ctx.translate(-13, 6);
    const tailTilt = -this.vy * 0.04 + Math.sin(this.flapCycle) * 0.08;
    ctx.rotate(tailTilt);

    const tailGrad = ctx.createLinearGradient(0, -6, -20, 12);
    tailGrad.addColorStop(0, '#0d001a');
    tailGrad.addColorStop(1, '#ff1744'); // Glowing ruby red tips
    ctx.fillStyle = tailGrad;
    ctx.strokeStyle = '#1a0033';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-24, -11); // Top feather
    ctx.lineTo(-27, -1);  // Middle feather
    ctx.lineTo(-23, 9);   // Bottom feather
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- 4. Back / Scapular cloak (Feathered cape) ---
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.moveTo(-17, -3);
    ctx.bezierCurveTo(-11, -14, 3, -12, 1, 3);
    ctx.bezierCurveTo(-1, 11, -11, 13, -17, 5);
    ctx.closePath();
    ctx.fill();

    // --- 5. Great Horned Owl Head (Side Profile, facing Right) ---
    const headGrad = ctx.createLinearGradient(-8, -18, 12, -4);
    headGrad.addColorStop(0, '#1a0033'); // Dark purple
    headGrad.addColorStop(0.6, '#0d001a'); // Obsidian
    headGrad.addColorStop(1, '#ff1744'); // Red eyebrow ridge
    ctx.fillStyle = headGrad;
    
    ctx.beginPath();
    ctx.arc(faceX, -6 + faceY, 13.5, 0, Math.PI * 2);
    ctx.fill();

    // Plumicorns/Horns sweeping backward (Left side of the head in profile)
    ctx.fillStyle = '#0d001a';
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 1.5;

    // Main horn sweeping up and left
    ctx.beginPath();
    ctx.moveTo(-6 + faceX, -14 + faceY);
    ctx.quadraticCurveTo(-24 + faceX, -26 + faceY, -26 + faceX, -28 + faceY); // Horn sweep
    ctx.quadraticCurveTo(-14 + faceX, -18 + faceY, 1 + faceX, -17 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner/Secondary horn (partially visible in perspective)
    ctx.beginPath();
    ctx.moveTo(-2 + faceX, -15 + faceY);
    ctx.quadraticCurveTo(-16 + faceX, -28 + faceY, -18 + faceX, -30 + faceY);
    ctx.quadraticCurveTo(-9 + faceX, -20 + faceY, 5 + faceX, -16 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 6. Flat Heart-shaped Face Disc (Profile crescent facing Right) ---
    ctx.fillStyle = '#eceff1'; // Ash/white face disc
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Elliptical disc pushed to the right side of the head
    ctx.ellipse(3.5 + faceX, -6 + faceY, 9, 12.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Runic face disc mark (Eldritch scar)
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.4)';
    ctx.beginPath();
    ctx.moveTo(1 + faceX, -15 + faceY);
    ctx.lineTo(1 + faceX, 3 + faceY);
    ctx.stroke();

    // --- 7. Large Glowing Menacing Eye (Single dominant eye in profile view) ---
    // Outer black frame
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(3.5 + faceX, -6 + faceY, 5.2, 0, Math.PI * 2);
    ctx.fill();

    // Glowing crimson/ruby iris
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(4 + faceX, -6 + faceY, 4.0, 0, Math.PI * 2);
    ctx.fill();

    // Slit pupil looking forward-right
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(4.5 + faceX, -6 + faceY, 1.2, 3.2, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Intense white reflection core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5.2 + faceX, -7.5 + faceY, 1.0, 0, Math.PI * 2);
    ctx.fill();

    // --- 8. Large Hooked Beak (Profile view on the right edge, pointing downwards) ---
    const beakGrad = ctx.createLinearGradient(8 + faceX, -7 + faceY, 20 + faceX, 3 + faceY);
    beakGrad.addColorStop(0, '#212121'); // Carbon grey base
    beakGrad.addColorStop(1, '#ff1744'); // Glowing ruby red hook tip

    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(10 + faceX, -9 + faceY); // Top base
    ctx.quadraticCurveTo(21 + faceX, -6 + faceY, 18 + faceX, 4 + faceY); // Sharp downward hook
    ctx.quadraticCurveTo(11 + faceX, 0 + faceY, 9 + faceX, -3 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 9. Massive Broad Feathered Wings (Obsidian/Crimson, profile layout) ---
    ctx.save();
    ctx.translate(-3, 2);
    const flapAngle = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(flapAngle);

    const wingGrad = ctx.createLinearGradient(0, 0, -42, 8);
    wingGrad.addColorStop(0, '#0d001a'); // Dark void purple
    wingGrad.addColorStop(0.5, '#212121'); // Obsidian/Charcoal
    wingGrad.addColorStop(0.9, '#ff1744'); // Ruby red edge
    wingGrad.addColorStop(1, '#ff80ab'); // Pink highlight tips

    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 1.5;

    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff1744';
    }

    // Draw broad wing
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-15, -20, -38, -12, -45, 6); // Extra long broad feathers
    ctx.lineTo(-40, 10);
    ctx.lineTo(-44, 15);
    ctx.lineTo(-34, 17);
    ctx.lineTo(-37, 23);
    ctx.lineTo(-26, 21);
    ctx.lineTo(-28, 27);
    ctx.lineTo(-15, 18);
    ctx.quadraticCurveTo(-8, 9, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    
    // Bone structure highlights in ruby red
    ctx.strokeStyle = 'rgba(255, 23, 68, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-38, 2);
    ctx.moveTo(-10, 4);
    ctx.lineTo(-32, 9);
    ctx.stroke();

    // Joint cap matching the body armor
    ctx.fillStyle = '#cfd8dc';
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(0, 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawAviatorChick(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 112, 67, 0.4)'; // Soft warm orange glow
    }

    // 2.5D Face shift offset based on bird movement angle
    const faceX = Math.cos(this.angle) * 1.5;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.1;

    // --- 1. Pinkish-Grey Bird Feet ---
    ctx.fillStyle = '#ffab91'; // Pinkish-grey
    ctx.strokeStyle = '#d84315';
    ctx.lineWidth = 1;
    // Left foot
    ctx.beginPath();
    ctx.ellipse(-4, 15, 2.5, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Right foot
    ctx.beginPath();
    ctx.ellipse(3, 14, 2.5, 4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- 2. Waving White Scarf Tail (Flows backwards to the left) ---
    ctx.save();
    ctx.translate(-10, 4);
    // Waving animation based on flapCycle
    const wave = Math.sin(this.flapCycle * 2) * 1.5;
    ctx.fillStyle = '#f5f5f5';
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-12, -4 + wave, -24, 4 + wave, -32, -2 + wave);
    ctx.lineTo(-30, 4 + wave);
    ctx.bezierCurveTo(-22, 10 + wave, -10, 2 + wave, 0, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- 3. Body Torso (Orange Flight Jacket) ---
    // Jacket main base
    ctx.fillStyle = '#e65100'; // Orange leather jacket
    ctx.strokeStyle = '#3e2723'; // Dark brown trim
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 3, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Golden zipper details
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, 15);
    ctx.stroke();

    // Tiny round pilot badge on right chest
    ctx.fillStyle = '#8d6e63'; // Brown badge background
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(6, 4, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Tiny star inside badge
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(6, 4, 1.0, 0, Math.PI * 2);
    ctx.fill();

    // --- 4. Rolled Map Scroll (Beige paper scroll tucked under wing) ---
    ctx.save();
    ctx.translate(-11, 6);
    ctx.rotate(0.25);
    // Draw cylindrical rolled scroll
    const scrollGrad = ctx.createLinearGradient(0, -4, 0, 4);
    scrollGrad.addColorStop(0, '#f5f5dc'); // Beige
    scrollGrad.addColorStop(0.5, '#eef0d5');
    scrollGrad.addColorStop(1, '#d8d9b5'); // Shadowed bottom
    ctx.fillStyle = scrollGrad;
    ctx.strokeStyle = '#795548';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.rect(-10, -3.5, 20, 7);
    ctx.fill();
    ctx.stroke();
    // End circle of rolled paper
    ctx.fillStyle = '#795548';
    ctx.beginPath();
    ctx.ellipse(-10, 0, 1.2, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tiny red ribbon tied around center of scroll
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.rect(-1, -4, 2.5, 8);
    ctx.fill();
    ctx.restore();

    // --- 5. Fluffy Feathered Head & Face ---
    // Base head gradient (lighter on top, darker on neck/throat)
    const headGrad = ctx.createLinearGradient(faceX, -16 + faceY, faceX, 4 + faceY);
    headGrad.addColorStop(0, '#eceff1'); // Light grey forehead
    headGrad.addColorStop(0.5, '#b0bec5'); // Mid grey
    headGrad.addColorStop(0.9, '#546e7a'); // Dark slate-grey neck
    headGrad.addColorStop(1, '#37474f'); // Dark throat base

    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(faceX, -6 + faceY, 13.0, 0, Math.PI * 2);
    ctx.fill();

    // Add fluffy feather tufts around the cheeks
    ctx.fillStyle = '#b0bec5';
    ctx.beginPath();
    // Left cheek fluffy tufts
    ctx.moveTo(-11 + faceX, -3 + faceY);
    ctx.lineTo(-16 + faceX, -1 + faceY);
    ctx.lineTo(-10 + faceX, 3 + faceY);
    ctx.lineTo(-14 + faceX, 6 + faceY);
    ctx.lineTo(-8 + faceX, 6 + faceY);
    // Right cheek fluffy tufts
    ctx.moveTo(11 + faceX, -3 + faceY);
    ctx.lineTo(16 + faceX, -1 + faceY);
    ctx.lineTo(10 + faceX, 3 + faceY);
    ctx.lineTo(14 + faceX, 6 + faceY);
    ctx.lineTo(8 + faceX, 6 + faceY);
    ctx.fill();

    // --- 6. Orange Leather Flight Cap (Helmet) ---
    // Cap dome
    ctx.fillStyle = '#e65100'; // Warm orange leather
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(faceX, -7.5 + faceY, 13.0, Math.PI, 0); // Cap covering top half of head
    ctx.lineTo(faceX + 13, -7.5 + faceY);
    ctx.bezierCurveTo(faceX + 12, -18 + faceY, faceX - 12, -18 + faceY, faceX - 13, -7.5 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Side leather ear flap loop (Left side)
    ctx.beginPath();
    ctx.ellipse(-12 + faceX, -5 + faceY, 3, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Side leather ear flap loop (Right side)
    ctx.beginPath();
    ctx.ellipse(12 + faceX, -5 + faceY, 3, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- 7. Large Glassy Aviator Goggles ---
    ctx.fillStyle = '#1e1e1e'; // Dark goggle frames
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1;
    // Left Frame
    ctx.beginPath();
    ctx.roundRect(-8 + faceX, -16 + faceY, 7.5, 5.5, 2);
    ctx.fill();
    ctx.stroke();
    // Right Frame
    ctx.beginPath();
    ctx.roundRect(1.5 + faceX, -16 + faceY, 7.5, 5.5, 2);
    ctx.fill();
    ctx.stroke();

    // Glassy lens gradient
    const lensGrad = ctx.createLinearGradient(0, -16 + faceY, 0, -10 + faceY);
    lensGrad.addColorStop(0, '#b3e5fc'); // Light sky blue
    lensGrad.addColorStop(0.6, '#0288d1'); // Deep blue glass
    lensGrad.addColorStop(1, '#01579b'); // Dark blue bottom shadow
    
    ctx.fillStyle = lensGrad;
    // Left Lens
    ctx.beginPath();
    ctx.rect(-7 + faceX, -15 + faceY, 5.5, 3.5);
    ctx.fill();
    // Right Lens
    ctx.beginPath();
    ctx.rect(2.5 + faceX, -15 + faceY, 5.5, 3.5);
    ctx.fill();

    // Glass glare highlights (White slash lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-6 + faceX, -14.5 + faceY);
    ctx.lineTo(-4 + faceX, -12 + faceY);
    ctx.moveTo(3.5 + faceX, -14.5 + faceY);
    ctx.lineTo(5.5 + faceX, -12 + faceY);
    ctx.stroke();

    // Goggles strap (wraps around side of helmet)
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-13 + faceX, -12 + faceY);
    ctx.lineTo(-8 + faceX, -13 + faceY);
    ctx.moveTo(9 + faceX, -13 + faceY);
    ctx.lineTo(13 + faceX, -12 + faceY);
    ctx.stroke();

    // --- 8. Wide Expressive Brown Eyes ---
    // White eyeball
    ctx.fillStyle = '#ffffff';
    // Left eye ball
    ctx.beginPath();
    ctx.ellipse(-4.5 + faceX, -5.5 + faceY, 5.5, 4.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // Right eye ball
    ctx.beginPath();
    ctx.ellipse(5.5 + faceX, -5.5 + faceY, 5.5, 4.5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Brown iris
    ctx.fillStyle = '#8d6e63'; // Warm brown iris
    // Left iris
    ctx.beginPath();
    ctx.arc(-3.5 + faceX, -5.2 + faceY, 2.8, 0, Math.PI * 2);
    ctx.fill();
    // Right iris
    ctx.beginPath();
    ctx.arc(4.5 + faceX, -5.2 + faceY, 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Black pupil
    ctx.fillStyle = '#000000';
    // Left pupil
    ctx.beginPath();
    ctx.arc(-3.5 + faceX, -5.2 + faceY, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Right pupil
    ctx.beginPath();
    ctx.arc(4.5 + faceX, -5.2 + faceY, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // White shininess reflections (calm, shiny highlights)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-2.8 + faceX, -6.0 + faceY, 0.8, 0, Math.PI * 2);
    ctx.arc(5.2 + faceX, -6.0 + faceY, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // --- 9. Curved Dark Grey Beak (Open with Pink Tongue inside) ---
    // Draw open mouth base
    ctx.fillStyle = '#37474f'; // Dark beak charcoal
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 1.0;

    // Upper beak (Hooking down)
    ctx.beginPath();
    ctx.moveTo(-1.5 + faceX, -7.5 + faceY);
    ctx.quadraticCurveTo(11 + faceX, -7.5 + faceY, 12 + faceX, -1.5 + faceY); // Sharp tip
    ctx.quadraticCurveTo(4 + faceX, -2.5 + faceY, 0 + faceX, -4.5 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lower beak (Opened mouth cavity)
    ctx.fillStyle = '#546e7a';
    ctx.beginPath();
    ctx.moveTo(0 + faceX, -4.5 + faceY);
    ctx.quadraticCurveTo(5 + faceX, -2.5 + faceY, 9 + faceX, -0.5 + faceY);
    ctx.lineTo(4 + faceX, 3.5 + faceY); // Bottom of open beak
    ctx.quadraticCurveTo(-1 + faceX, 0 + faceY, -1 + faceX, -4.5 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pink tongue inside open mouth gap
    ctx.fillStyle = '#ff8a80'; // Pink tongue
    ctx.beginPath();
    ctx.ellipse(3 + faceX, -0.5 + faceY, 2.0, 1.5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Scarf wrap around neck (White cloth wrap)
    ctx.fillStyle = '#f5f5f5';
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(faceX, 4 + faceY, 9, 3, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- 10. Flapping Wings (Ash-grey feathers) ---
    this.drawFlappingWing(ctx, '#78909c', '#cfd8dc');
  }

  private drawFalcon(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(255, 193, 7, 0.55)'; // Majestic amber-gold glow
    }

    // 2.5D Face shift offset based on bird movement angle
    const faceX = Math.cos(this.angle) * 2.2;
    const faceY = Math.sin(this.angle) * 1.5 - this.vy * 0.12;

    // --- 1. Realistic Muscular Yellow Legs and Black Curved Talons ---
    // Leg bases
    ctx.fillStyle = '#ffca28'; // Peregrine yellow
    ctx.strokeStyle = '#e65100'; // Shade
    ctx.lineWidth = 1.0;

    // Rear leg
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-6, 8);
    ctx.quadraticCurveTo(-12, 16, -6, 20); // Thick thigh/leg
    ctx.lineTo(-3, 19);
    ctx.quadraticCurveTo(-9, 13, -3, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rear claw toes (sharp black claws gripping)
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, 20);
    ctx.quadraticCurveTo(-10, 24, -13, 23); // Back toe
    ctx.moveTo(-6, 20);
    ctx.quadraticCurveTo(-5, 25, -5, 26); // Middle toe
    ctx.stroke();

    // Front leg (in profile, more prominent)
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.moveTo(1, 8);
    ctx.quadraticCurveTo(7, 18, 13, 19); // Muscular yellow leg pointing forward
    ctx.quadraticCurveTo(10, 12, 5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front claw toes (three curved toes with black claws)
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(13, 19);
    ctx.quadraticCurveTo(18, 22, 22, 20); // Front toe 1
    ctx.moveTo(13, 19);
    ctx.quadraticCurveTo(15, 24, 17, 26); // Front toe 2
    ctx.moveTo(13, 19);
    ctx.quadraticCurveTo(11, 23, 9, 25); // Back toe
    ctx.stroke();
    ctx.restore();

    // --- 2. Elongated Torso (Aerodynamic real body profile, slate back, barred cream belly) ---
    // Base gradient for body (slate grey-blue back fading to charcoal)
    const bodyGrad = ctx.createLinearGradient(-30, -18, 24, 18);
    bodyGrad.addColorStop(0, '#546e7a'); // Slate grey
    bodyGrad.addColorStop(0.3, '#37474f'); // Dark slate
    bodyGrad.addColorStop(0.8, '#263238'); // Charcoal
    bodyGrad.addColorStop(1, '#1c2529');
    ctx.fillStyle = bodyGrad;

    // Drawing the elongated aerodynamic body
    ctx.beginPath();
    ctx.moveTo(-28, 4); // Tail base connection
    ctx.bezierCurveTo(-22, -18, 12, -18, 19, -5); // Upper back curve
    ctx.bezierCurveTo(24, 1, 20, 15, 9, 16); // Aerodynamic chest swell
    ctx.bezierCurveTo(-3, 17, -19, 13, -28, 4); // Lower belly taper
    ctx.closePath();
    ctx.fill();

    // White/Cream Breast and Underparts Patch (extends from chin to lower belly)
    const chestGrad = ctx.createLinearGradient(-10, 14, 20, -10);
    chestGrad.addColorStop(0, '#e0f2f1'); // Soft pale teal-grey undertone
    chestGrad.addColorStop(0.5, '#f5f5f5'); // Cream white breast
    chestGrad.addColorStop(1, '#ffffff'); // Pure white upper throat
    ctx.fillStyle = chestGrad;

    ctx.beginPath();
    ctx.moveTo(4, -13);
    ctx.bezierCurveTo(19, -8, 22, 4, 17, 13); // Front curve
    ctx.bezierCurveTo(11, 16, -2, 16, -11, 11); // Tapering down belly
    ctx.bezierCurveTo(-3, 9, 5, 2, 4, -13); // Inside back boundary
    ctx.closePath();
    ctx.fill();

    // Fine dark-grey horizontal barring stripes on belly/breast (realistic falcon trait)
    ctx.strokeStyle = 'rgba(55, 71, 79, 0.8)';
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 7; i++) {
      const barY = -8 + i * 3.6;
      const startX = -3 + i * 1.1;
      const endX = 14 + (6 - i) * 0.9;
      
      // Curved horizontal bars wrap around the 3D chest shape
      ctx.beginPath();
      ctx.moveTo(startX, barY);
      ctx.quadraticCurveTo((startX + endX) / 2, barY + 1.2, endX, barY + 0.4);
      ctx.stroke();
    }

    // --- 3. Long Narrow Tail Feathers (Barred slate-grey with white tip) ---
    ctx.save();
    ctx.translate(-26, 3); // Attached far back on elongated body
    const tailTilt = -this.vy * 0.05 + Math.sin(this.flapCycle) * 0.07;
    ctx.rotate(tailTilt);

    const tailGrad = ctx.createLinearGradient(0, -6, -32, 8);
    tailGrad.addColorStop(0, '#37474f'); // Slate
    tailGrad.addColorStop(0.7, '#263238'); // Dark charcoal
    tailGrad.addColorStop(1, '#cfd8dc'); // Pale grey/white tips

    ctx.fillStyle = tailGrad;
    ctx.strokeStyle = '#1a2327';
    ctx.lineWidth = 1.0;

    // Layered realistic tail profile
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-32, -10); // Long primary tail feather
    ctx.lineTo(-35, -2);
    ctx.lineTo(-31, 8); // Lower feathers
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Real dark bars on tail
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-i * 6, -7);
      ctx.lineTo(-i * 6 - 1, 5);
      ctx.stroke();
    }
    ctx.restore();

    // --- 4. Layered Back/Shoulder Covert Feathers (Armored Slate Cloak) ---
    ctx.fillStyle = '#455a64';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-18, -4);
    ctx.bezierCurveTo(-11, -15, 6, -13, 4, 3);
    ctx.bezierCurveTo(2, 11, -11, 14, -18, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Render feather layering highlights on the back
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(-12, -7); ctx.quadraticCurveTo(-6, -10, 0, -6);
    ctx.moveTo(-14, -2); ctx.quadraticCurveTo(-8, -5, -2, -1);
    ctx.stroke();

    // --- 5. Realistic Peregrine Falcon Head (Dark hood, clean white cheeks & throat) ---
    // Pure white throat/cheek base
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(faceX, -6 + faceY, 12.0, 0, Math.PI * 2);
    ctx.fill();

    // Deep slate-black head hood & distinctive malar stripe (mustache mark)
    const hoodGrad = ctx.createLinearGradient(-7 + faceX, -17 + faceY, 12 + faceX, -2 + faceY);
    hoodGrad.addColorStop(0, '#212121'); // Blackish crown
    hoodGrad.addColorStop(0.5, '#263238'); // Slate blue-black
    hoodGrad.addColorStop(1, '#1b1211');
    ctx.fillStyle = hoodGrad;

    ctx.beginPath();
    // Cap covers the crown and back of the head
    ctx.arc(faceX, -7 + faceY, 12.5, Math.PI, 0); // Upper cap
    ctx.lineTo(12.5 + faceX, -7 + faceY);
    // Malar mustache stripe dangling down the white cheek (iconic peregrine mark)
    ctx.quadraticCurveTo(8.5 + faceX, 3 + faceY, 4.5 + faceX, 6 + faceY); 
    ctx.lineTo(0.5 + faceX, 2 + faceY);
    ctx.bezierCurveTo(-10 + faceX, -1 + faceY, -12.5 + faceX, -6 + faceY, -12.5 + faceX, -7 + faceY);
    ctx.closePath();
    ctx.fill();

    // --- 6. Realistic Falcon Eye (Dark, intense, bright yellow orbital ring) ---
    // Bright yellow orbital ring (eye ring)
    ctx.fillStyle = '#ffc107'; // Bright yellow
    ctx.beginPath();
    ctx.arc(4.0 + faceX, -7.5 + faceY, 4.8, 0, Math.PI * 2);
    ctx.fill();

    // Deep dark brown/black iris
    ctx.fillStyle = '#2d1a18'; // Dark mahogany brown
    ctx.beginPath();
    ctx.arc(4.0 + faceX, -7.5 + faceY, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Pitch black pupil
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(4.0 + faceX, -7.5 + faceY, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Intense tiny white catchlight/glare
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5.0 + faceX, -8.5 + faceY, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Dark menacing brow ridge line (gives the falcon its sharp focus)
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0 + faceX, -11 + faceY);
    ctx.quadraticCurveTo(4.5 + faceX, -11.5 + faceY, 8.5 + faceX, -9.5 + faceY);
    ctx.stroke();

    // --- 7. Hooked Beak on Right (Yellow cere, dark hook with tomial tooth) ---
    // Yellow Cere base
    ctx.fillStyle = '#ffc107';
    ctx.beginPath();
    ctx.moveTo(9 + faceX, -9.5 + faceY);
    ctx.lineTo(12.5 + faceX, -9.5 + faceY);
    ctx.lineTo(11 + faceX, -4 + faceY);
    ctx.lineTo(8 + faceX, -4.5 + faceY);
    ctx.closePath();
    ctx.fill();

    // Dark grey beak with tomial tooth projection
    const beakGrad = ctx.createLinearGradient(8 + faceX, -9.5 + faceY, 22 + faceX, 4 + faceY);
    beakGrad.addColorStop(0, '#546e7a'); // Slate grey base
    beakGrad.addColorStop(0.6, '#263238'); // Dark slate middle
    beakGrad.addColorStop(1, '#111111'); // Black tip

    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(11.5 + faceX, -9.5 + faceY); // Top base
    ctx.quadraticCurveTo(21.5 + faceX, -7.5 + faceY, 18.5 + faceX, 4 + faceY); // Hook tip curving down
    ctx.lineTo(15 + faceX, 1.5 + faceY);
    ctx.lineTo(13.8 + faceX, 2.5 + faceY); // Tomial tooth (sharp notch)
    ctx.quadraticCurveTo(11 + faceX, -0.5 + faceY, 8.5 + faceX, -3.5 + faceY); // Mouth line
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 8. Realistic Swept-Back Falcon Wings (Slate-blue gradients, barred details) ---
    ctx.save();
    ctx.translate(-4, 0);
    // Natural flapping movement angle
    const flapAngle = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(flapAngle);

    // Main wing gradient: slate blue-grey base to dark tips
    const wingGrad = ctx.createLinearGradient(8, -4, -55, 12);
    wingGrad.addColorStop(0, '#607d8b'); // Lighter slate blue-grey at shoulder
    wingGrad.addColorStop(0.3, '#455a64'); // Mid slate
    wingGrad.addColorStop(0.7, '#263238'); // Dark slate grey primaries
    wingGrad.addColorStop(1, '#1e272c'); // Dark tip

    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = '#1b2429';
    ctx.lineWidth = 1.2;

    // Draw the realistic swept back wing profile
    ctx.beginPath();
    ctx.moveTo(8, -3);
    // Sweeping upper edge to the pointed wingtip
    ctx.bezierCurveTo(-12, -30, -46, -26, -58, 6); 
    // Realistic curved feather tips along the trailing edge (smooth bezier curves)
    ctx.bezierCurveTo(-52, 13, -44, 9, -40, 17); // Primary 1
    ctx.bezierCurveTo(-34, 19, -30, 13, -26, 21); // Primary 2
    ctx.bezierCurveTo(-20, 21, -16, 15, -12, 19); // Secondary 1
    ctx.bezierCurveTo(-8, 17, -5, 11, 8, -3);     // Secondary 2
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Delicate light grey shafts pointing towards feather tips
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.0;
    
    // Primary feather shafts
    ctx.beginPath();
    ctx.moveTo(2, -5);
    ctx.quadraticCurveTo(-25, -13, -54, 5);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(2, -3);
    ctx.quadraticCurveTo(-20, -7, -38, 15);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(2, -1);
    ctx.quadraticCurveTo(-15, -1, -24, 19);
    ctx.stroke();

    // Dark checkerboard/barring lines on flight feathers
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1.1;
    for (let bar = 1; bar <= 6; bar++) {
      ctx.beginPath();
      ctx.moveTo(-bar * 8.5, -4 - bar * 1.1);
      ctx.lineTo(-bar * 6.5 - 3, 10 + bar * 1.6);
      ctx.stroke();
    }

    // Wing Coverts Patch (shoulder cover, layered look)
    const covertGrad = ctx.createLinearGradient(8, -4, -12, 8);
    covertGrad.addColorStop(0, '#90a4ae'); // Light highlight
    covertGrad.addColorStop(1, '#546e7a');
    ctx.fillStyle = covertGrad;
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.bezierCurveTo(-4, -17, -21, -11, -23, 2);
    ctx.bezierCurveTo(-16, 8, -6, 6, 8, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawLegendaryEagleKing(ctx: CanvasRenderingContext2D) {
    // 2.5D Face shift offset based on bird movement angle
    const faceX = Math.cos(this.angle) * 2.2;
    const faceY = Math.sin(this.angle) * 1.5 - this.vy * 0.12;

    // --- 1. CONFIDENT WARRIOR LEGS WITH GILDED ARMOR GREAVES ---
    ctx.save();
    // Rear thigh (white feathers)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-7, 8);
    ctx.quadraticCurveTo(-11, 15, -6, 19);
    ctx.lineTo(-3, 18);
    ctx.quadraticCurveTo(-8, 12, -3, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rear leg armor (gold-plated greave with bronze trim)
    const legArmorGrad = ctx.createLinearGradient(-10, 10, -3, 19);
    legArmorGrad.addColorStop(0, '#ffd54f'); // shiny gold
    legArmorGrad.addColorStop(1, '#ff6f00'); // dark bronze-gold
    ctx.fillStyle = legArmorGrad;
    ctx.strokeStyle = '#3d2503';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-9, 11);
    ctx.lineTo(-6, 18);
    ctx.lineTo(-3, 17);
    ctx.lineTo(-6, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Rear claw toes (black talons with white highlights)
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-6, 19);
    ctx.quadraticCurveTo(-10, 23, -13, 22); // back toe
    ctx.moveTo(-6, 19);
    ctx.quadraticCurveTo(-5, 24, -5, 25); // center toe
    ctx.stroke();

    // Front thigh (white feathers)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(1, 8);
    ctx.quadraticCurveTo(6, 17, 12, 18);
    ctx.quadraticCurveTo(9, 12, 5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front leg armor (gold-plated greave)
    ctx.fillStyle = legArmorGrad;
    ctx.strokeStyle = '#3d2503';
    ctx.beginPath();
    ctx.moveTo(2, 9);
    ctx.lineTo(8, 17);
    ctx.lineTo(11, 16);
    ctx.lineTo(5, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front claw toes (black talons)
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(12, 18);
    ctx.quadraticCurveTo(17, 21, 21, 19); // toe 1
    ctx.moveTo(12, 18);
    ctx.quadraticCurveTo(14, 23, 16, 25); // toe 2
    ctx.stroke();
    ctx.restore();

    // --- 2. ELONGATED AERODYNAMIC WHITE-FEATHERED TORSO ---
    // White/light-silver gradient body
    const bodyGrad = ctx.createLinearGradient(-35, -15, 24, 15);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.5, '#f5f5f7');
    bodyGrad.addColorStop(1, '#cfd8dc'); // shadow silver
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#263238'; // Clean outline
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(-34, 4); // Elongated tail base connection
    ctx.bezierCurveTo(-26, -18, 14, -18, 22, -4); // Elongated upper back curve
    ctx.bezierCurveTo(27, 2, 20, 16, 9, 17); // Sleek aerodynamic chest swell
    ctx.bezierCurveTo(-5, 17, -22, 13, -34, 4); // Lower belly taper
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Layers of detailed stylized feathers on body (adds volume and premium texture)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1.2;
    for (let r = 0; r < 4; r++) {
      const fx = -22 + r * 6;
      ctx.beginPath();
      ctx.arc(fx, 2, 5, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(fx + 3, -4, 4, 0, Math.PI);
      ctx.stroke();
    }

    // --- 3. GOLDEN FEATHER EMBELLISHMENTS & CELESTIAL BREASTPLATE (Fantasy RPG Boss) ---
    // Gilded breastplate
    const armorGrad = ctx.createLinearGradient(-4, -12, 18, 12);
    armorGrad.addColorStop(0, '#fff176'); // Shiny gold
    armorGrad.addColorStop(0.5, '#ffd54f'); // Gold
    armorGrad.addColorStop(1, '#ff6f00'); // Deep amber-gold
    ctx.fillStyle = armorGrad;
    ctx.strokeStyle = '#3d2503'; // Dark bronze-gold outline
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(2, -12);
    ctx.bezierCurveTo(16, -7, 19, 4, 15, 12);
    ctx.bezierCurveTo(7, 14, -1, 10, -5, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner collar shield layer
    ctx.fillStyle = '#ff8f00';
    ctx.beginPath();
    ctx.moveTo(3, -7);
    ctx.bezierCurveTo(12, -4, 14, 3, 11, 8);
    ctx.bezierCurveTo(6, 9, 1, 7, -2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Central glowing ruby gem (boss skin theme)
    const gemGrad = ctx.createRadialGradient(5, 1, 1, 5, 1, 4);
    gemGrad.addColorStop(0, '#ff8a80'); // bright ruby center
    gemGrad.addColorStop(1, '#c62828'); // deep red gem border
    ctx.fillStyle = gemGrad;
    ctx.strokeStyle = '#3d0c0c';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(5, -3);
    ctx.lineTo(9, 1);
    ctx.lineTo(5, 5);
    ctx.lineTo(1, 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 4. MAJESTIC FAN TAIL (5 Layered White-and-Gold Feathers) ---
    ctx.save();
    ctx.translate(-30, 3);
    const tailTilt = -this.vy * 0.05 + Math.sin(this.flapCycle) * 0.07;
    ctx.rotate(tailTilt);

    for (let i = 0; i < 5; i++) {
      const angleOffset = (i - 2) * 0.12;
      ctx.save();
      ctx.rotate(angleOffset);
      
      const isEven = i % 2 === 0;
      ctx.fillStyle = isEven ? '#ffffff' : '#ffd54f';
      ctx.strokeStyle = '#3d2503';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(-28, -4);
      ctx.lineTo(-32, 0);
      ctx.lineTo(-28, 4);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Alternate white/gold tip highlight
      ctx.fillStyle = isEven ? '#ff9100' : '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-18, -3);
      ctx.lineTo(-28, -4);
      ctx.lineTo(-32, 0);
      ctx.lineTo(-28, 4);
      ctx.lineTo(-18, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();

    // --- 5. SHOULDERS & CELÈSTIAL SPAULDER (Heavy Fantasy Spaulder) ---
    ctx.fillStyle = '#ffca28'; // Polished gold
    ctx.strokeStyle = '#3d2503';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-8, -4, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Double ring trim
    ctx.strokeStyle = '#ff8f00';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(-8, -4, 5.5, 0, Math.PI * 2);
    ctx.stroke();

    // Star/gem inlay in spaulder (glowing crystal blue)
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(-8, -9);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-8, 1);
    ctx.lineTo(-10, -4);
    ctx.closePath();
    ctx.fill();

    // --- 6. PROUD EAGLE HEAD WITH BACKWARD SPIKED CREST ---
    // Spiked crest feathers at the back of head for dramatic silhouette
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(faceX - 8, faceY - 12 + k * 4);
      ctx.lineTo(faceX - 20, faceY - 8 + k * 4);
      ctx.lineTo(faceX - 10, faceY - 4 + k * 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Main head base
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(faceX, -6 + faceY, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- 7. INTENSE AMBER WARRIOR EYE & BROW ---
    // Amber iris
    ctx.fillStyle = '#ff6f00'; // Intense amber
    ctx.beginPath();
    ctx.arc(3.5 + faceX, -6.5 + faceY, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(3.5 + faceX, -6.5 + faceY, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Shine catchlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4.2 + faceX, -7.2 + faceY, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Menacing Warrior Brow Line
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-1 + faceX, -10 + faceY);
    ctx.lineTo(8 + faceX, -8 + faceY);
    ctx.stroke();

    // --- 8. POLISHED GOLDEN EAGLE BEAK ---
    const beakGrad = ctx.createLinearGradient(8 + faceX, -8 + faceY, 20 + faceX, 3 + faceY);
    beakGrad.addColorStop(0, '#fff59d'); // bright gold top shine
    beakGrad.addColorStop(0.5, '#ffd54f'); // gold
    beakGrad.addColorStop(1, '#f57f17'); // warm amber bottom
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#3d2503';
    ctx.lineWidth = 1.3;

    ctx.beginPath();
    ctx.moveTo(9 + faceX, -8.5 + faceY);
    ctx.quadraticCurveTo(21.5 + faceX, -7.0 + faceY, 17.5 + faceX, 3 + faceY); // Hook tip
    ctx.lineTo(13.8 + faceX, 1.0 + faceY);
    ctx.quadraticCurveTo(11 + faceX, -1.0 + faceY, 8.0 + faceX, -3.0 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Beak highlight reflection line (gives 3D shiny metallic feel)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(10 + faceX, -7.5 + faceY);
    ctx.quadraticCurveTo(17 + faceX, -6.0 + faceY, 14 + faceX, -1.0 + faceY);
    ctx.stroke();

    // --- 9. DECORATED ROYAL GOLDEN CROWN ---
    ctx.save();
    ctx.translate(faceX - 2, faceY - 16);
    ctx.rotate(-0.05);

    const crownGrad = ctx.createLinearGradient(-10, -8, 10, 2);
    crownGrad.addColorStop(0, '#fff59d');
    crownGrad.addColorStop(0.5, '#fbc02d');
    crownGrad.addColorStop(1, '#f57f17');
    ctx.fillStyle = crownGrad;
    ctx.strokeStyle = '#3d2503';
    ctx.lineWidth = 1.3;

    // Ornate crown spikes
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.lineTo(-12, -6);
    ctx.lineTo(-6, -1);
    ctx.lineTo(0, -9); // Tall center point
    ctx.lineTo(6, -1);
    ctx.lineTo(12, -6);
    ctx.lineTo(10, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Base plate with small gems
    ctx.fillStyle = '#ff8f00';
    ctx.beginPath();
    ctx.rect(-10, 2, 20, 3.5);
    ctx.fill();
    ctx.stroke();

    // Inset Gems in crown base (rubies and cyan diamonds)
    ctx.fillStyle = '#d50000'; // red ruby left
    ctx.beginPath();
    ctx.arc(-5, 3.8, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#00e5ff'; // blue gem center
    ctx.beginPath();
    ctx.arc(0, 3.8, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d50000'; // red ruby right
    ctx.beginPath();
    ctx.arc(5, 3.8, 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // --- 10. MULTI-LAYERED FIERY ORANGE-GOLD WINGS WITH DYNAMIC FEATHER WAVE PROPAGATION ---
    ctx.save();
    ctx.translate(-8, 0); // Attached to the shoulder

    // Base wing rotation (shoulder / inner arm)
    const baseFlapAngle = Math.sin(this.flapCycle) * 0.55;
    ctx.rotate(baseFlapAngle);

    // Draw Inner Wing (Secondaries / Coverts base)
    const innerWingGrad = ctx.createLinearGradient(10, -5, -30, 10);
    innerWingGrad.addColorStop(0, '#ffe082'); // Gold
    innerWingGrad.addColorStop(1, '#ff9100'); // Orange
    ctx.fillStyle = innerWingGrad;
    ctx.strokeStyle = '#3d2503';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(10, -4);
    ctx.bezierCurveTo(-5, -25, -25, -20, -32, 2);
    ctx.bezierCurveTo(-26, 12, -10, 10, 10, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw 6 Individual Primary Feathers with propagated wave motion
    // This creates the realistic feather bending and spreading as it flaps!
    const featherColors = [
      '#ffe082', // Yellow-gold
      '#ffd54f', // Gold
      '#ffca28', // Rich gold
      '#ffb300', // Amber gold
      '#ff9100', // Orange
      '#ff3d00'  // Fiery red-orange
    ];
    const featherStrokes = [
      '#3d2503', '#3d2503', '#3d2503', '#3d2503', '#3d2503', '#3d0c0c'
    ];

    for (let j = 0; j < 6; j++) {
      ctx.save();
      // Translate to joint of primary feathers
      ctx.translate(-22, -8);
      
      // Bending angle: primary feathers lag behind the main wing flap for a flexible wingtip look
      const primaryFlapAngle = Math.sin(this.flapCycle - j * 0.12) * 0.25; 
      ctx.rotate(primaryFlapAngle);

      // Feather shape: long pointed primary feather
      const length = 34 + (5 - j) * 4; // Longer primaries at the top, shorter towards the body
      const width = 6.5;

      const fGrad = ctx.createLinearGradient(0, 0, -length, 10);
      fGrad.addColorStop(0, featherColors[j]);
      fGrad.addColorStop(1, '#d84315'); // Reddish tip
      ctx.fillStyle = fGrad;
      ctx.strokeStyle = featherStrokes[j];
      ctx.lineWidth = 1.0;

      ctx.beginPath();
      ctx.moveTo(0, -width/2);
      ctx.quadraticCurveTo(-length * 0.4, -width * 1.5, -length, 0); // Pointy tip
      ctx.quadraticCurveTo(-length * 0.4, width * 1.5, 0, width/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Shaft line inside feather
      ctx.strokeStyle = '#fff9c4';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-length * 0.85, 0);
      ctx.stroke();

      ctx.restore();
    }

    // Gilded shoulder armor cover plate (Spaulder on joint)
    const spaulderGrad = ctx.createLinearGradient(12, -4, -10, 8);
    spaulderGrad.addColorStop(0, '#ffffff'); // Shiny metallic highlight
    spaulderGrad.addColorStop(0.3, '#fff59d');
    spaulderGrad.addColorStop(1, '#ffd54f');
    ctx.fillStyle = spaulderGrad;
    ctx.strokeStyle = '#3d2503';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(12, -4);
    ctx.bezierCurveTo(4, -18, -12, -12, -14, 2);
    ctx.bezierCurveTo(-8, 8, 2, 6, 12, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ===== STORM TEMPEST EAGLE (Eagle Head on a Flappy Bird Structure - Crimson Red & Gold Theme) =====
  private drawStormTempestEagle(ctx: CanvasRenderingContext2D) {
    const outlineColor = '#3f0712'; // Rich dark crimson outline
    
    // Parallax face shifting
    const faceX = Math.cos(this.angle) * 2.0;
    const faceY = Math.sin(this.angle) * 1.3 - this.vy * 0.15;

    // --- 2. BACKWARDS CREST FEATHERS (Eagle detail, White with Crimson tips) ---
    ctx.save();
    ctx.fillStyle = '#ffffff'; // White base
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.0;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(faceX - 16, faceY - 12 + k * 7);
      ctx.lineTo(faceX - 30, faceY - 7 + k * 7);
      ctx.lineTo(faceX - 19, faceY - 2 + k * 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Crimson/Gold tips
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(faceX - 25, faceY - 9 + k * 7);
      ctx.lineTo(faceX - 30, faceY - 7 + k * 7);
      ctx.lineTo(faceX - 26, faceY - 4 + k * 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
    }
    ctx.restore();

    // --- 3. EAGLE HEAD PLUMAGE (White Eagle Crown, now the main body: radius 15) ---
    ctx.save();
    const headGrad = ctx.createRadialGradient(faceX - 3, faceY - 3, 2, faceX, faceY, 15);
    headGrad.addColorStop(0, '#ffffff'); // Pure white center
    headGrad.addColorStop(0.7, '#f9fafb'); // Off-white
    headGrad.addColorStop(1, '#e5e7eb'); // Light grey shading at edges
    
    ctx.fillStyle = headGrad;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(faceX, faceY, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Feathery details inside crown
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(faceX - 3.5, faceY - 1.8, 10.6, 0.3 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // --- 4. INTENSE WARRIOR EYE & BROW (Eagle detail, Gold/Amber theme) ---
    ctx.save();
    // Glowing Gold Iris
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(faceX + 3.5, faceY - 0.9, 5.0, 0, Math.PI * 2);
    ctx.fill();

    // Black Pupil
    ctx.fillStyle = '#1e1b29';
    ctx.beginPath();
    ctx.arc(faceX + 3.5, faceY - 0.9, 2.1, 0, Math.PI * 2);
    ctx.fill();

    // Eye Shine
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(faceX + 4.4, faceY - 1.8, 1.0, 0, Math.PI * 2);
    ctx.fill();

    // Menacing Brow
    ctx.strokeStyle = '#450a0a';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(faceX - 2.6, faceY - 5.6);
    ctx.lineTo(faceX + 9.7, faceY - 3.2);
    ctx.stroke();
    ctx.restore();

    // --- 5. HOOKED GOLDEN PREDATOR BEAK WITH FIRE CRACK (Eagle detail) ---
    ctx.save();
    const beakGrad = ctx.createLinearGradient(faceX + 8.8, faceY - 3.5, faceX + 19.7, faceY + 9.9);
    beakGrad.addColorStop(0, '#fef08a'); // Bright gold shine
    beakGrad.addColorStop(0.5, '#fbbf24'); // Gold
    beakGrad.addColorStop(1, '#f59e0b'); // Warm amber
    
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 2.1;

    ctx.beginPath();
    ctx.moveTo(faceX + 8.8, faceY - 3.5);
    ctx.quadraticCurveTo(faceX + 26.4, faceY - 1.8, faceX + 21.1, faceY + 12.3); // hooked down tip
    ctx.lineTo(faceX + 15.8, faceY + 9.7);
    ctx.quadraticCurveTo(faceX + 12.3, faceY + 6.7, faceX + 7.9, faceY + 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing fiery red line crack running along beak mouth
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(faceX + 8.8, faceY + 5.6);
    ctx.quadraticCurveTo(faceX + 15.0, faceY + 8.4, faceX + 19.7, faceY + 9.9);
    ctx.stroke();
    ctx.restore();

    // --- 6. FLAPPING WING (Classic rounded shape upgraded with layered flame-trail outlines) ---
    ctx.save();
    ctx.translate(faceX - 2, faceY + 1);
    const wingFlap = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(wingFlap);

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';

    const makeFeatherGrad = (x1: number, y1: number, x2: number, y2: number, startCol: string, endCol: string) => {
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, startCol);
      grad.addColorStop(1, endCol);
      return grad;
    };

    // Draw Flame-Trail Outlines first (behind feathers, extending further left/backward)
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';

    // 1. Bottom flame shadow
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.quadraticCurveTo(-7, 12, -14, 6);
    ctx.quadraticCurveTo(-15, 0, -4, -2);
    ctx.stroke();

    // 2. Middle flame shadow
    ctx.beginPath();
    ctx.moveTo(2, -1);
    ctx.quadraticCurveTo(-17, 3, -20, -6);
    ctx.quadraticCurveTo(-19, -12, -3, -6);
    ctx.stroke();

    // 3. Top flame shadow
    ctx.beginPath();
    ctx.moveTo(2, -5);
    ctx.quadraticCurveTo(-14, -14, -12, -23);
    ctx.quadraticCurveTo(-7, -22, 3, -11);
    ctx.stroke();
    ctx.restore();

    // Now draw the 3 main rounded feathers overlapping the flame trails
    // Feather 1: Bottom
    ctx.fillStyle = makeFeatherGrad(-10, 5, -5, -1, '#991b1b', '#450a0a');
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.quadraticCurveTo(-5, 9, -10, 5);
    ctx.quadraticCurveTo(-12, 1, -5, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Feather 2: Middle
    ctx.fillStyle = makeFeatherGrad(-15, -5, -4, -5, '#dc2626', '#991b1b');
    ctx.beginPath();
    ctx.moveTo(1, -2);
    ctx.quadraticCurveTo(-13, 1, -15, -5);
    ctx.quadraticCurveTo(-15, -9, -4, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Feather 3: Top (with electric golden tip)
    ctx.fillStyle = makeFeatherGrad(-9, -18, 2, -9, '#fbbf24', '#dc2626');
    ctx.beginPath();
    ctx.moveTo(1, -6);
    ctx.quadraticCurveTo(-11, -11, -9, -18);
    ctx.quadraticCurveTo(-5, -18, 2, -9);
    ctx.quadraticCurveTo(4, -4, 2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Flame overlay detailing on the feathers (golden veins/spikes)
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 1.0;
    
    // Top feather flame detail
    ctx.beginPath();
    ctx.moveTo(-1, -9);
    ctx.quadraticCurveTo(-5, -13, -7, -16);
    ctx.stroke();

    // Middle feather flame detail
    ctx.beginPath();
    ctx.moveTo(-2, -3);
    ctx.quadraticCurveTo(-9, -4, -11, -5);
    ctx.stroke();

    ctx.restore();
  }

  // ===== FURIOUS RED (Angry Bird-style) =====
  private drawAngryBird(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = 'rgba(255, 30, 0, 0.85)';
    }

    // 2.5D Face shift offset for dynamic parallax expression
    const faceX = Math.cos(this.angle) * 1.8;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.18;

    // --- 1. FAR FLAPPY WING (Drawn behind the body to establish 3D camera depth) ---
    ctx.save();
    ctx.translate(-7, -2);
    const farFlapAngle = Math.sin(this.flapCycle + 0.3) * 0.55;
    ctx.rotate(farFlapAngle);

    ctx.fillStyle = '#990000'; // Muted dark red for far wing
    ctx.strokeStyle = '#550000'; // Darker outline
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(2, 2);
    
    // Bottom feather
    ctx.quadraticCurveTo(-5, 9, -10, 5);
    ctx.quadraticCurveTo(-12, 1, -5, -1);
    
    // Middle feather
    ctx.quadraticCurveTo(-13, 1, -15, -5);
    ctx.quadraticCurveTo(-15, -9, -4, -5);
    
    // Top feather
    ctx.quadraticCurveTo(-11, -11, -9, -18);
    ctx.quadraticCurveTo(-5, -18, 2, -9);
    
    // Back to base
    ctx.quadraticCurveTo(4, -4, 2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // --- 2. CLASSIC MAIN ROUND BODY (Head/body is the major part) ---
    const bodyGrad = ctx.createRadialGradient(-2, -4, 3, 0, 0, 17);
    bodyGrad.addColorStop(0, '#ff4444');   // Bright red highlight
    bodyGrad.addColorStop(0.4, '#e81200'); // Classic Angry Bird red
    bodyGrad.addColorStop(0.8, '#cc0000'); // Deeper red
    bodyGrad.addColorStop(1, '#8b0000');   // Dark red edge

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#660000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // --- 3. BELLY PATCH (cream/beige underbelly, profile style) ---
    const bellyGrad = ctx.createRadialGradient(2 + faceX * 0.3, 6 + faceY * 0.3, 1, 2, 6, 10);
    bellyGrad.addColorStop(0, '#ffe8cc');   // Light cream center
    bellyGrad.addColorStop(0.6, '#f5d0a9');  // Warm beige
    bellyGrad.addColorStop(1, 'rgba(204, 68, 0, 0)'); // fade out to blend with red
    
    ctx.fillStyle = bellyGrad;
    ctx.beginPath();
    ctx.ellipse(2 + faceX * 0.3, 6 + faceY * 0.3, 9, 7, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // --- 4. HEAD FEATHER CREST (two red feathers on top of head) ---
    ctx.save();
    ctx.translate(faceX * 0.5, faceY * 0.5);

    // Left crest feather
    ctx.fillStyle = '#990000';
    ctx.strokeStyle = '#550000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-3, -15);
    ctx.quadraticCurveTo(-10, -22, -12, -20);
    ctx.quadraticCurveTo(-7, -18, -3, -15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right crest feather
    ctx.fillStyle = '#cc0000';
    ctx.strokeStyle = '#880000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(1, -15);
    ctx.quadraticCurveTo(4, -25, 6, -21);
    ctx.quadraticCurveTo(5, -18, 3, -15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // --- 5. SINGLE EYE IN TRUE SIDE VIEW (far eye hidden) ---
    ctx.save();
    ctx.translate(faceX, faceY);

    // Eye white
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(5.0, -3.5, 4.5, 5.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Pupil (black, looking forward-right)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(6.5, -3.5, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Eye catchlight highlight (white glint)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5.8, -4.3, 0.6, 0, Math.PI * 2);
    ctx.fill();

    // Thick angry eyebrow (slanting down towards the front)
    ctx.fillStyle = '#1a1a1a';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0.5, -7.0);  // Back-top of brow
    ctx.lineTo(10.5, -4.5); // Front-bottom of brow
    ctx.lineTo(9.5, -7.0);  // Front-top of brow
    ctx.lineTo(1.0, -9.0);  // Back-top of brow
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // --- 6. BEAK IN PROFILE VIEW ---
    ctx.save();
    ctx.translate(faceX, faceY);
    const beakGrad = ctx.createLinearGradient(10, -1, 23, 1);
    beakGrad.addColorStop(0, '#ffcc00'); // Bright yellow
    beakGrad.addColorStop(0.5, '#ff9900'); // Orange
    beakGrad.addColorStop(1, '#ff6600'); // Deep orange tip
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#cc5500';
    ctx.lineWidth = 1.0;

    // Upper beak
    ctx.beginPath();
    ctx.moveTo(10, -2.5);
    ctx.quadraticCurveTo(18, -3.5, 23, -0.5); // pointed sharp tip pointing forward/down slightly
    ctx.lineTo(10, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lower beak
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(10, 0.5);
    ctx.quadraticCurveTo(16, 1.0, 20.5, -0.2);
    ctx.lineTo(23, -0.5);
    ctx.lineTo(10, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Beak mouth line
    ctx.strokeStyle = '#993300';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10, 0.0);
    ctx.lineTo(21.5, 0.0);
    ctx.stroke();

    ctx.restore();

    // --- 7. NEAR FLAPPY WING (Drawn in front of the body, copying the Flappy Birds style in red) ---
    ctx.save();
    ctx.translate(-3, 1);
    const nearFlapAngle = Math.sin(this.flapCycle) * 0.5;
    ctx.rotate(nearFlapAngle);

    ctx.fillStyle = '#ff3333'; // Bright red
    ctx.strokeStyle = '#660000'; // Dark red outline
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(2, 2);
    
    // Bottom feather (rounded)
    ctx.quadraticCurveTo(-5, 9, -10, 5);
    ctx.quadraticCurveTo(-12, 1, -5, -1);
    
    // Middle feather (rounded)
    ctx.quadraticCurveTo(-13, 1, -15, -5);
    ctx.quadraticCurveTo(-15, -9, -4, -5);
    
    // Top feather (rounded)
    ctx.quadraticCurveTo(-11, -11, -9, -18);
    ctx.quadraticCurveTo(-5, -18, 2, -9);
    
    // Back to base
    ctx.quadraticCurveTo(4, -4, 2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // White wing highlight (like a glossy reflection on the top feather)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-1, -9);
    ctx.quadraticCurveTo(-4, -14, -7, -16);
    ctx.stroke();

    ctx.restore();
  }



  // ===== ARTICUNO (Legendary Ice Bird) =====
  private drawArticuno(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = 'rgba(100, 200, 255, 0.8)';
    }

    // 2.5D Face shift offset
    const faceX = Math.cos(this.angle) * 1.8;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.18;

    // --- 1. FAR WING (Drawn behind the body to establish 3D camera depth) ---
    ctx.save();
    ctx.translate(-10, -3);

    // Far wing flaps with a slight phase shift delay and smaller amplitude
    const farFlapAngle = Math.sin(this.flapCycle + 0.45) * 0.55;
    ctx.rotate(farFlapAngle);

    // Far wing plate (shaded darker)
    const farWingGrad = ctx.createLinearGradient(6, -3, -26, 6);
    farWingGrad.addColorStop(0, '#1565c0');
    farWingGrad.addColorStop(1, '#0c2240');
    ctx.fillStyle = farWingGrad;
    ctx.strokeStyle = '#051224';
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(6, -2);
    ctx.bezierCurveTo(-2, -18, -20, -14, -26, 2);
    ctx.bezierCurveTo(-20, 10, -6, 8, 6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Far primary feathers (darker shading)
    const farFeatherBlues = ['#1e88e5', '#1976d2', '#1565c0', '#0d47a1', '#0b2b5c', '#071c3c'];
    for (let j = 0; j < 6; j++) {
      ctx.save();
      ctx.translate(-18, -5);
      const primaryAngle = Math.sin(this.flapCycle + 0.45 - j * 0.12) * 0.18;
      ctx.rotate(primaryAngle - 0.1);
      const len = 28 + (5 - j) * 3;
      const w = 4.8;

      const fGrad = ctx.createLinearGradient(0, 0, -len, 4);
      fGrad.addColorStop(0, farFeatherBlues[j]);
      fGrad.addColorStop(0.7, '#0d47a1');
      fGrad.addColorStop(1, '#07122a');
      ctx.fillStyle = fGrad;
      ctx.strokeStyle = '#050a1b';
      ctx.lineWidth = 0.6;

      ctx.beginPath();
      ctx.moveTo(0, -w / 2);
      ctx.quadraticCurveTo(-len * 0.4, -w * 1.3, -len, 0);
      ctx.quadraticCurveTo(-len * 0.4, w * 1.3, 0, w / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // --- 2. DUAL FLOWING ICE TAIL RIBBONS (drawn behind body) ---
    ctx.save();
    ctx.translate(-14, 2);
    const tailWave1 = Math.sin(this.flapCycle * 0.35) * 0.16;
    const tailWave2 = Math.sin(this.flapCycle * 0.35 + 0.8) * 0.14;

    // Far ribbon (longer, darker)
    ctx.save();
    ctx.rotate(tailWave2);
    const tailGrad2 = ctx.createLinearGradient(0, 0, -75, 12);
    tailGrad2.addColorStop(0, '#0d47a1');
    tailGrad2.addColorStop(0.6, '#051937');
    tailGrad2.addColorStop(1, '#020a16');
    ctx.fillStyle = tailGrad2;
    ctx.strokeStyle = '#020a16';
    ctx.lineWidth = 0.7;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-20, -5, -45, 15, -60, 20);
    ctx.bezierCurveTo(-72, 22, -80, 8, -75, -5);
    ctx.bezierCurveTo(-62, -25, -100, -30, -125, -18);
    // Split tip
    ctx.lineTo(-132, -26);
    ctx.lineTo(-121, -15);
    ctx.lineTo(-129, -5);
    ctx.bezierCurveTo(-100, -18, -65, -12, -68, 2);
    ctx.bezierCurveTo(-70, 12, -60, 14, -50, 12);
    ctx.bezierCurveTo(-38, 10, -18, 0, 0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Near ribbon (shorter, brighter)
    ctx.save();
    ctx.rotate(tailWave1);
    const tailGrad1 = ctx.createLinearGradient(0, 0, -60, 10);
    tailGrad1.addColorStop(0, '#1a237e'); // Royal blue base
    tailGrad1.addColorStop(0.5, '#0d47a1'); // Indigo
    tailGrad1.addColorStop(1, '#1565c0'); // Light edge highlight
    ctx.fillStyle = tailGrad1;
    ctx.strokeStyle = '#051937';
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.bezierCurveTo(-15, -6, -35, 10, -45, 15);
    ctx.bezierCurveTo(-55, 17, -60, 5, -55, -4);
    ctx.bezierCurveTo(-45, -18, -75, -22, -95, -12);
    // Split tip
    ctx.lineTo(-100, -18);
    ctx.lineTo(-92, -10);
    ctx.lineTo(-98, -2);
    ctx.bezierCurveTo(-75, -12, -48, -8, -50, 2);
    ctx.bezierCurveTo(-52, 10, -45, 12, -38, 10);
    ctx.bezierCurveTo(-28, 8, -12, -2, 0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // --- 3. ORGANIC MAJESTIC BIRD TORSO PATH ---
    const bodyGrad = ctx.createRadialGradient(-3, 0, 4, 0, 2, 17);
    bodyGrad.addColorStop(0, '#80d8ff');   // Shimmering sky blue center
    bodyGrad.addColorStop(0.5, '#29b6f6'); // Rich cobalt blue
    bodyGrad.addColorStop(1, '#0288d1');   // Deep Articuno blue

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#07487c';
    ctx.lineWidth = 1.3;

    ctx.beginPath();
    // Start rump
    ctx.moveTo(-14, 3);
    // Sloped back curve up to neck
    ctx.quadraticCurveTo(-6, -6, 2, -4.5);
    // Neck throat line connecting up to chin
    ctx.bezierCurveTo(7.5, -4.5, 9.5, -8.5, 9.0, -11);
    // Rounded head crown
    ctx.arc(5.0, -11, 6.2, -0.15, -Math.PI - 0.15, true);
    // Throat curve down to prominent proud breast
    ctx.bezierCurveTo(1, -7, 13, 0.5, 12.5, 5);
    // Belly curve back to tapered lower rump
    ctx.quadraticCurveTo(9, 12, -2, 11);
    ctx.quadraticCurveTo(-9, 10, -14, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 4. FLUFFY SNOWY CHEST PLUMAGE ---
    const chestGrad = ctx.createRadialGradient(5 + faceX * 0.4, 2 + faceY * 0.4, 2, 5 + faceX * 0.4, 2 + faceY * 0.4, 10);
    chestGrad.addColorStop(0, '#ffffff');    // Pure white center
    chestGrad.addColorStop(0.6, '#f0f8ff');  // Ice blue tint
    chestGrad.addColorStop(1, 'rgba(187, 222, 251, 0)'); // fade out

    ctx.fillStyle = chestGrad;
    ctx.beginPath();
    ctx.ellipse(5 + faceX * 0.4, 3 + faceY * 0.4, 7, 9, 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Plumage texture lines
    ctx.strokeStyle = 'rgba(144, 202, 249, 0.3)';
    ctx.lineWidth = 0.65;
    for (let i = 0; i < 3; i++) {
      const cy = 1 + i * 3.5 + faceY * 0.4;
      ctx.beginPath();
      ctx.moveTo(0 + faceX * 0.4, cy);
      ctx.quadraticCurveTo(5 + faceX * 0.4, cy + 2.0, 10 + faceX * 0.4, cy);
      ctx.stroke();
    }

    // --- 5. THREE-POINTED DARK BLUE CREST (Layered with 2.5D camera perspective) ---
    ctx.save();
    ctx.translate(5.0 + faceX * 0.5, -16.5 + faceY * 0.5);

    const crestGrad = ctx.createLinearGradient(0, 0, -10, -16);
    crestGrad.addColorStop(0, '#1565c0');
    crestGrad.addColorStop(0.5, '#0d47a1');
    crestGrad.addColorStop(1, '#1a237e');
    ctx.fillStyle = crestGrad;
    ctx.strokeStyle = '#051937';
    ctx.lineWidth = 0.8;

    // Center tall crest feather
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(-2, -7, -4, -16);
    ctx.lineTo(1, -12);
    ctx.quadraticCurveTo(2, -5, 0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Far crest feather (drawn slightly offset to show perspective)
    ctx.save();
    ctx.translate(-2, -1);
    ctx.scale(0.85, 0.85);
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(-4, -5, -8, -14);
    ctx.lineTo(-3, -10);
    ctx.quadraticCurveTo(1, -4, 0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Near crest feather (curved slightly down)
    ctx.beginPath();
    ctx.moveTo(-1, 3);
    ctx.quadraticCurveTo(-6, -4, -12, -9);
    ctx.lineTo(-7, -6);
    ctx.quadraticCurveTo(-2, -1, -1, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shimmer glints on crest tips
    ctx.fillStyle = '#bbdefb';
    ctx.beginPath();
    ctx.arc(-3.5, -15, 0.9, 0, Math.PI * 2);
    ctx.arc(-8.8, -12, 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // --- 6. SINGLE EYE IN TRUE SIDE VIEW (far eye hidden) ---
    ctx.save();
    ctx.translate(faceX, faceY);

    // Brow ridge
    ctx.fillStyle = '#0f2c59';
    ctx.strokeStyle = '#051937';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(1, -14);
    ctx.lineTo(8, -12);
    ctx.lineTo(6.5, -14.5);
    ctx.lineTo(0.5, -15.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Single Eye (Near eye)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a237e';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.ellipse(4.8, -11, 2.4, 2.8, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Iris (determined reddish-brown)
    ctx.fillStyle = '#5d4037';
    ctx.beginPath();
    ctx.arc(5.2, -10.8, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(5.2, -10.8, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // Catchlight highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4.7, -11.4, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- 7. BEAK IN PROFILE VIEW ---
    ctx.save();
    ctx.translate(faceX, faceY);
    const beakGrad = ctx.createLinearGradient(9.6, -11, 24, -9.5);
    beakGrad.addColorStop(0, '#b0bec5');
    beakGrad.addColorStop(0.5, '#90a4ae');
    beakGrad.addColorStop(1, '#78909c');
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#455a64';
    ctx.lineWidth = 0.75;

    ctx.beginPath();
    ctx.moveTo(9.6, -12.0);
    ctx.quadraticCurveTo(18, -12, 23, -10); // Upper beak point
    ctx.lineTo(9.6, -9.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(9.6, -9.0);
    ctx.quadraticCurveTo(15, -8.5, 19, -9.5);
    ctx.lineTo(23, -10);
    ctx.lineTo(9.6, -9.0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- 8. ICE TALONS/FEET ---
    ctx.save();
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 10);
    ctx.lineTo(-3, 15);
    ctx.moveTo(3, 10);
    ctx.lineTo(4, 15);
    ctx.stroke();
    ctx.restore();

    // --- 9. NEAR WING (Drawn in front of body, vibrant sky blue) ---
    ctx.save();
    ctx.translate(-6, -1);

    const baseFlapAngle = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(baseFlapAngle);

    // Inner wing plate
    const innerWingGradNear = ctx.createLinearGradient(8, -4, -30, 8);
    innerWingGradNear.addColorStop(0, '#42a5f5');
    innerWingGradNear.addColorStop(1, '#1565c0');
    ctx.fillStyle = innerWingGradNear;
    ctx.strokeStyle = '#0a3268';
    ctx.lineWidth = 1.0;

    ctx.beginPath();
    ctx.moveTo(8, -3);
    ctx.bezierCurveTo(-3, -22, -24, -18, -30, 2);
    ctx.bezierCurveTo(-24, 12, -8, 10, 8, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 7 primary feathers
    const featherBlues = ['#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1'];
    for (let j = 0; j < 7; j++) {
      ctx.save();
      ctx.translate(-22, -7);

      const primaryAngle = Math.sin(this.flapCycle - j * 0.12) * 0.22;
      ctx.rotate(primaryAngle);

      const len = 32 + (6 - j) * 3.5;
      const w = 5.5;

      const fGrad = ctx.createLinearGradient(0, 0, -len, 5);
      fGrad.addColorStop(0, featherBlues[j]);
      fGrad.addColorStop(0.7, '#0d47a1');
      fGrad.addColorStop(1, '#1a237e');
      ctx.fillStyle = fGrad;
      ctx.strokeStyle = '#0a2050';
      ctx.lineWidth = 0.7;

      ctx.beginPath();
      ctx.moveTo(0, -w / 2);
      ctx.quadraticCurveTo(-len * 0.4, -w * 1.4, -len, 0);
      ctx.quadraticCurveTo(-len * 0.4, w * 1.3, 0, w / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Feather shaft highlight
      ctx.strokeStyle = '#bbdefb';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-len * 0.8, 0);
      ctx.stroke();

      ctx.restore();
    }

    // Wing shoulder cover
    const shoulderGradNear = ctx.createRadialGradient(8, -2, 1, 8, -2, 8);
    shoulderGradNear.addColorStop(0, '#90caf9');
    shoulderGradNear.addColorStop(0.5, '#42a5f5');
    shoulderGradNear.addColorStop(1, '#1565c0');
    ctx.fillStyle = shoulderGradNear;
    ctx.strokeStyle = '#0a3268';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(8, -2, 7, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
  // ===== JADE LOTUS HUMMINGBIRD (Rare) =====
  private drawJadeLotus(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = 'rgba(0, 230, 118, 0.7)';
    }

    const faceX = Math.cos(this.angle) * 1.8;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.18;

    // Hummingbirds flap wings at extremely high speeds
    const wingFlapCycle = this.flapCycle * 2.3;

    // --- 1. FLOWING TAIL FEATHERS (drawn behind body) ---
    ctx.save();
    ctx.translate(-12, 2);
    const tailWave = Math.sin(wingFlapCycle * 0.3) * 0.14;
    ctx.rotate(tailWave);

    const tailFeathers = [
      { len: 40, rot: -0.16, colStart: '#66bb6a', colEnd: '#1b5e20' },
      { len: 48, rot: 0, colStart: '#4caf50', colEnd: '#123e16' },
      { len: 37, rot: 0.18, colStart: '#81c784', colEnd: '#0d2d10' }
    ];

    tailFeathers.forEach((f) => {
      ctx.save();
      ctx.rotate(f.rot);
      const grad = ctx.createLinearGradient(0, 0, -f.len, 0);
      grad.addColorStop(0, f.colStart);
      grad.addColorStop(0.7, f.colEnd);
      grad.addColorStop(1, '#ff4081'); // Pink blossom petal tip!
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#051b08';
      ctx.lineWidth = 0.7;

      ctx.beginPath();
      ctx.moveTo(0, -1.5);
      ctx.quadraticCurveTo(-f.len * 0.4, -2.5, -f.len, 0);
      ctx.quadraticCurveTo(-f.len * 0.4, 2.5, 0, 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    // Lotus petal ornaments on tail base
    ctx.fillStyle = '#ff80ab';
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 3; i++) {
      const px = -8 - i * 10;
      const py = -1 + Math.sin(wingFlapCycle * 0.2 + i) * 2;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tailWave + i * 0.4);
      ctx.beginPath();
      ctx.ellipse(0, 0, 3.5, 1.8, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1.0;
    ctx.restore();

    // --- 2. ORGANIC HUMMINGBIRD TORSO & HEAD PATH ---
    const bodyGrad = ctx.createRadialGradient(-3, 0, 4, 0, 2, 16);
    bodyGrad.addColorStop(0, '#a5d6a7');   // Light glossy center
    bodyGrad.addColorStop(0.6, '#4caf50'); // Rich jade
    bodyGrad.addColorStop(1, '#1b5e20');   // Dark forest jade

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#0d3c13';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    // Start at rump (very thin lower abdomen)
    ctx.moveTo(-15, 2.5);
    // Back line sloping up-forward to neck base
    ctx.quadraticCurveTo(-6, -4, 2, -3.5);
    // Throat bridge connecting to head chin
    ctx.bezierCurveTo(7.5, -3.5, 9, -7.5, 8.5, -10);
    // Sleek small head crown curve (radius 4.8 for typical hummingbird profile)
    ctx.arc(4.8, -10, 4.8, -0.1, -Math.PI - 0.1, true);
    // Chin and proud chest swell (very plump front chest)
    ctx.bezierCurveTo(0.5, -6, 14, -1, 13, 4.5);
    // Sleek tapered belly line curving back to the thin rump
    ctx.quadraticCurveTo(9, 10, -2, 8.5);
    ctx.quadraticCurveTo(-10, 7, -15, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 3. SOFT PINK PLUMP CHEST PLUMAGE ---
    const chestGrad = ctx.createRadialGradient(4 + faceX * 0.4, 2 + faceY * 0.4, 1, 4 + faceX * 0.4, 2 + faceY * 0.4, 8);
    chestGrad.addColorStop(0, '#ffffff'); // center highlight
    chestGrad.addColorStop(0.5, '#f8bbd0'); // light pink
    chestGrad.addColorStop(1, 'rgba(255, 64, 129, 0)'); // fade out

    ctx.fillStyle = chestGrad;
    ctx.beginPath();
    ctx.ellipse(4 + faceX * 0.4, 2 + faceY * 0.4, 6, 8, 0.45, 0, Math.PI * 2);
    ctx.fill();

    // --- 4. LOTUS PETAL HEAD CREST (Mounted on back of head) ---
    ctx.save();
    ctx.translate(4.8 + faceX * 0.6, -15.5 + faceY * 0.6);

    const crestGrad = ctx.createLinearGradient(0, 0, -8, -12);
    crestGrad.addColorStop(0, '#ff80ab');
    crestGrad.addColorStop(0.5, '#ff4081');
    crestGrad.addColorStop(1, '#f50057');
    ctx.fillStyle = crestGrad;
    ctx.strokeStyle = '#880e4f';
    ctx.lineWidth = 0.8;

    // 3 delicate lotus crest feathers curving back
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.bezierCurveTo(-2, -5, -6, -10, -10, -13);
    ctx.bezierCurveTo(-5, -9, -1, -3, 0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-2, 3);
    ctx.bezierCurveTo(-5, -3, -11, -8, -16, -10);
    ctx.bezierCurveTo(-10, -7, -4, -1, -2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.bezierCurveTo(0, -4, -2, -9, -4, -14);
    ctx.bezierCurveTo(1, -9, 3, -3, 2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // --- 5. ELEGANT REALISTIC EYE ---
    ctx.save();
    ctx.translate(faceX, faceY);

    ctx.fillStyle = '#0a230c';
    ctx.beginPath();
    ctx.arc(4.8, -11, 2.0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(4.8, -11, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Catchlight highlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4.3, -11.5, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- 6. LONG SLENDER BEAK ---
    ctx.save();
    ctx.translate(faceX, faceY);
    const beakGrad = ctx.createLinearGradient(9.6, -10, 39, -9);
    beakGrad.addColorStop(0, '#388e3c');
    beakGrad.addColorStop(1, '#002200');
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#001a00';
    ctx.lineWidth = 0.7;

    ctx.beginPath();
    ctx.moveTo(9.6, -11.0);
    ctx.lineTo(39, -9.5); // long needle tip
    ctx.lineTo(9.6, -8.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- 7. TINY SLENDER LEG/FOOT ---
    ctx.save();
    ctx.strokeStyle = '#388e3c';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 8);
    ctx.lineTo(-3, 13);
    ctx.moveTo(3, 8);
    ctx.lineTo(4, 13);
    ctx.stroke();
    ctx.restore();

    // --- 8. RAPID BLOSSOM PINK WINGS (SWEPT-BACK & BLADE-LIKE) ---
    ctx.save();
    ctx.translate(-5, -2);

    const rapidFlapAngle = Math.sin(wingFlapCycle) * 0.82;
    ctx.rotate(rapidFlapAngle);

    // Inner wing plate
    const innerWingGrad = ctx.createLinearGradient(6, -3, -25, 6);
    innerWingGrad.addColorStop(0, '#ff80ab');
    innerWingGrad.addColorStop(1, '#ad1457');
    ctx.fillStyle = innerWingGrad;
    ctx.strokeStyle = '#6a0033';
    ctx.lineWidth = 0.8;

    ctx.beginPath();
    ctx.moveTo(6, -2);
    ctx.bezierCurveTo(-2, -22, -24, -18, -28, 1);
    ctx.bezierCurveTo(-22, 8, -6, 6, 6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 6 primary blossom feathers (extra thin, swept-back sword blade style)
    const featherPinks = ['#f8bbd0', '#ff80ab', '#ff4081', '#f50057', '#d81b60', '#ad1457'];
    for (let j = 0; j < 6; j++) {
      ctx.save();
      ctx.translate(-18, -5);

      const primaryAngle = Math.sin(wingFlapCycle - j * 0.12) * 0.20;
      ctx.rotate(primaryAngle - 0.18); // Swept-back angle offset

      const len = 34 + (5 - j) * 4;
      const w = 3.2; // Extra thin!

      const fGrad = ctx.createLinearGradient(0, 0, -len, 3);
      fGrad.addColorStop(0, featherPinks[j]);
      fGrad.addColorStop(0.7, '#c2185b');
      fGrad.addColorStop(1, '#880e4f');
      ctx.fillStyle = fGrad;
      ctx.strokeStyle = '#5a0022';
      ctx.lineWidth = 0.5;

      ctx.beginPath();
      ctx.moveTo(0, -w / 2);
      ctx.quadraticCurveTo(-len * 0.4, -w * 1.3, -len, 0);
      ctx.quadraticCurveTo(-len * 0.4, w * 1.3, 0, w / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wing shaft highlights
      ctx.strokeStyle = '#f8bbd0';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-len * 0.8, 0);
      ctx.stroke();

      ctx.restore();
    }

    // Wing shoulder cover
    const shoulderGrad = ctx.createRadialGradient(6, -1, 1, 6, -1, 6);
    shoulderGrad.addColorStop(0, '#f8bbd0');
    shoulderGrad.addColorStop(0.5, '#ff80ab');
    shoulderGrad.addColorStop(1, '#d81b60');
    ctx.fillStyle = shoulderGrad;
    ctx.strokeStyle = '#880e4f';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.ellipse(6, -1, 6, 4.2, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ===== COSMIC NOVA (Epic) =====
  private drawCosmicNova(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(24, 255, 255, 0.8)';
    }

    const faceX = Math.cos(this.angle) * 1.8;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.18;

    // --- 1. LAYERED CYBER TAIL FEATHERS (drawn behind body) ---
    ctx.save();
    ctx.translate(-12, 2);
    const tailWave = Math.sin(this.flapCycle * 0.4) * 0.16;
    ctx.rotate(tailWave);

    const tailFeathers = [
      { len: 42, rot: -0.12, col: '#7c4dff' },
      { len: 50, rot: 0, col: '#18ffff' },
      { len: 38, rot: 0.15, col: '#00b0ff' }
    ];

    tailFeathers.forEach((tf) => {
      ctx.save();
      ctx.rotate(tf.rot);
      const grad = ctx.createLinearGradient(0, 0, -tf.len, 0);
      grad.addColorStop(0, '#311b92');
      grad.addColorStop(0.7, tf.col);
      grad.addColorStop(1, '#0d001a');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#18ffff';
      ctx.lineWidth = 0.8;

      ctx.beginPath();
      ctx.moveTo(0, -1.8);
      ctx.lineTo(-tf.len, 0);
      ctx.lineTo(0, 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();

    // --- 2. ORGANIC BIRD TORSO & HEAD PATH (SPACE-BIRD CORONA) ---
    const bodyGrad = ctx.createRadialGradient(-3, 0, 4, 0, 2, 16);
    bodyGrad.addColorStop(0, '#7c4dff');   // Indigo glow center
    bodyGrad.addColorStop(0.6, '#311b92'); // Deep space violet
    bodyGrad.addColorStop(1, '#090014');   // Infinite black-indigo

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#18ffff';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(-13, 3);
    ctx.quadraticCurveTo(-5, -5, 2, -4);
    ctx.bezierCurveTo(7, -4, 9, -8, 8, -11);
    ctx.arc(4, -11, 6.5, -0.2, -Math.PI - 0.2, true);
    ctx.bezierCurveTo(1, -7, 12, 1, 11, 5);
    ctx.quadraticCurveTo(8, 12, -2, 11);
    ctx.quadraticCurveTo(-9, 10, -13, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Render tiny stardust spots on body
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(-8, 3, 0.8, 0, Math.PI * 2);
    ctx.arc(-3, 7, 0.7, 0, Math.PI * 2);
    ctx.arc(-6, -1, 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // --- 3. NEON CYAN PLUMAGE / ENERGY CORE ---
    const coreGrad = ctx.createRadialGradient(4 + faceX * 0.4, 3 + faceY * 0.4, 1, 4 + faceX * 0.4, 3 + faceY * 0.4, 9);
    coreGrad.addColorStop(0, '#ffffff'); // core center
    coreGrad.addColorStop(0.5, '#18ffff'); // cyan glow
    coreGrad.addColorStop(1, 'rgba(124, 77, 255, 0)'); // fade

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.ellipse(4 + faceX * 0.4, 3 + faceY * 0.4, 5.5, 7.5, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // --- 4. CROWN CREST (CYAN ENERGY SPikes CURVING BACK) ---
    ctx.save();
    ctx.translate(4 + faceX * 0.5, -17.5 + faceY * 0.5);

    const crestGrad = ctx.createLinearGradient(0, 0, -8, -12);
    crestGrad.addColorStop(0, '#18ffff');
    crestGrad.addColorStop(0.7, '#651fff');
    crestGrad.addColorStop(1, '#0d001a');
    ctx.fillStyle = crestGrad;
    ctx.strokeStyle = '#18ffff';
    ctx.lineWidth = 0.9;

    // 3 horn spikes curving backwards
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.quadraticCurveTo(-5, -6, -11, -9);
    ctx.quadraticCurveTo(-4, -4, 0, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-2, 3);
    ctx.quadraticCurveTo(-8, -3, -15, -5);
    ctx.quadraticCurveTo(-7, -2, -2, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.quadraticCurveTo(-2, -7, -5, -12);
    ctx.quadraticCurveTo(0, -5, 2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // --- 5. FUTURISTIC GLOWING CYAN VISOR ---
    ctx.save();
    ctx.translate(faceX, faceY);

    ctx.strokeStyle = '#651fff';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = '#18ffff';
    ctx.beginPath();
    ctx.ellipse(4.2, -12, 3.2, 2.2, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Visor shine glare line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(2.2, -12.7);
    ctx.lineTo(5.8, -11.7);
    ctx.stroke();
    ctx.restore();

    // --- 6. SHARP FUTURISTIC METALLIC BEAK ---
    ctx.save();
    ctx.translate(faceX, faceY);
    const beakGrad = ctx.createLinearGradient(8, -11, 20, -10);
    beakGrad.addColorStop(0, '#651fff');
    beakGrad.addColorStop(0.6, '#7c4dff');
    beakGrad.addColorStop(1, '#18ffff');
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#0d001a';
    ctx.lineWidth = 0.9;

    ctx.beginPath();
    ctx.moveTo(8, -12.2);
    ctx.quadraticCurveTo(15, -12, 20, -10);
    ctx.lineTo(8, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // --- 7. METALLIC TALONS ---
    ctx.save();
    ctx.strokeStyle = '#7c4dff';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 10);
    ctx.lineTo(-3, 14);
    ctx.moveTo(3, 10);
    ctx.lineTo(4, 14);
    ctx.stroke();
    ctx.restore();

    // --- 8. LARGE SPACE-WINGS (STARRY NEBULA WINGS) ---
    ctx.save();
    ctx.translate(-5, 0);

    const baseFlapAngle = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(baseFlapAngle);

    // Inner wing plate
    const innerWingGrad = ctx.createLinearGradient(8, -4, -30, 8);
    innerWingGrad.addColorStop(0, '#651fff');
    innerWingGrad.addColorStop(0.5, '#311b92');
    innerWingGrad.addColorStop(1, '#0d001a');
    ctx.fillStyle = innerWingGrad;
    ctx.strokeStyle = '#18ffff';
    ctx.lineWidth = 0.9;

    ctx.beginPath();
    ctx.moveTo(8, -3);
    ctx.bezierCurveTo(-3, -22, -24, -18, -30, 2);
    ctx.bezierCurveTo(-24, 12, -8, 10, 8, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 7 primary space feathers (realistic curved blade feathers)
    const featherColors = ['#e040fb', '#d500f9', '#7c4dff', '#651fff', '#3f51b5', '#18ffff', '#00b0ff'];
    for (let j = 0; j < 7; j++) {
      ctx.save();
      ctx.translate(-22, -7);

      const primaryAngle = Math.sin(this.flapCycle - j * 0.11) * 0.22;
      ctx.rotate(primaryAngle);

      const len = 31 + (6 - j) * 3.5;
      const w = 5.2;

      const fGrad = ctx.createLinearGradient(0, 0, -len, 5);
      fGrad.addColorStop(0, featherColors[j]);
      fGrad.addColorStop(0.6, '#311b92');
      fGrad.addColorStop(1, '#090014');
      ctx.fillStyle = fGrad;
      ctx.strokeStyle = '#090014';
      ctx.lineWidth = 0.6;

      ctx.beginPath();
      ctx.moveTo(0, -w / 2);
      ctx.quadraticCurveTo(-len * 0.4, -w * 1.4, -len, 0);
      ctx.quadraticCurveTo(-len * 0.4, w * 1.4, 0, w / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cyan neon energy veins
      ctx.strokeStyle = '#18ffff';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-len * 0.8, 0);
      ctx.stroke();

      // Stardust tips
      if (j % 2 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(-len * 0.85, 0, 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      ctx.restore();
    }

    // Wing shoulder cover
    const shoulderGrad = ctx.createRadialGradient(8, -2, 1, 8, -2, 8);
    shoulderGrad.addColorStop(0, '#18ffff');
    shoulderGrad.addColorStop(0.6, '#7c4dff');
    shoulderGrad.addColorStop(1, '#090014');
    ctx.fillStyle = shoulderGrad;
    ctx.strokeStyle = '#18ffff';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.ellipse(8, -2, 7, 5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
