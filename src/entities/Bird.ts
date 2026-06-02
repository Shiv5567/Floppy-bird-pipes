import { ParticleEngine } from '../engine/ParticleEngine.ts';
import type { Skin } from '../systems/ProgressManager.ts';

export class Bird {
  public x = 120;
  public y = 300;
  public vy = 0;
  public radius = 26; // Base collision circle radius
  public baseRadius = 26;
  public angle = 0;
  
  // Physics parameters (Reduced jump height and balanced gravity for maximum precision and precise control)
  private gravity = 0.40;
  private jumpLift = -6.4;
  private maxFallSpeed = 11.0;
  private maxRiseSpeed = -8.5;
  
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
    this.gravity = 0.40;
    this.jumpLift = -6.4;
    this.maxFallSpeed = 11.0;
    this.maxRiseSpeed = -8.5;
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
    const impulse = this.jumpLift * (1 + levelBonus) * jumpScale;
    
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
    const currentGravity = this.gravity * speedMultiplier;
    const currentMaxFallSpeed = this.maxFallSpeed * speedMultiplier;
    
    // Custom progressive score-based jump scaling:
    const jumpScale = this.getJumpScale(effectiveScore);
    
    // Scale maximum rise speed dynamically to stay fully synchronized with jump impulse (unreduced for upward speed!)
    const currentMaxRiseSpeed = this.maxRiseSpeed * jumpScale;
    
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

      case 'neon':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -2 - Math.random() * 1.5, (Math.random() - 0.5) * 2, 'rgba(0, 243, 255, 0.9)', 3 + Math.random() * 2, 1.0, 0.025, 'square', true, 'rgba(0, 243, 255, 0.8)');
        break;

      case 'ice':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -0.5 - Math.random() * 1, (Math.random() - 0.5) * 1, 'rgba(200, 240, 255, 0.8)', 4 + Math.random() * 3, 0.9, 0.02, 'snowflake', true, 'rgba(173, 216, 230, 0.5)');
        break;

      case 'shadow':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -0.5 - Math.random() * 1, (Math.random() - 0.5) * 1, 'rgba(48, 25, 52, 0.8)', 6 + Math.random() * 6, 0.9, 0.02, 'circle', false, undefined, 0.1);
        particleEngine.spawn(offsetBackX, offsetBackY, -1 - Math.random() * 1, (Math.random() - 0.5) * 0.5, 'rgba(128, 0, 128, 0.7)', 3 + Math.random() * 2, 0.8, 0.03, 'spark', true, 'rgba(128, 0, 128, 0.8)');
        break;

      case 'gold':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 2, (Math.random() - 0.5) * 1, 'rgba(212, 175, 55, 0.9)', 4 + Math.random() * 3, 1.0, 0.02, 'star', true, 'rgba(212, 175, 55, 0.6)');
        break;

      case 'cosmic':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 1.5, 'rgba(255, 20, 147, 0.9)', 3 + Math.random() * 3, 1.0, 0.02, 'star', true, 'rgba(148, 0, 211, 0.8)');
        particleEngine.spawn(offsetBackX, offsetBackY, -0.8 - Math.random() * 1, (Math.random() - 0.5) * 1, 'rgba(0, 191, 255, 0.8)', 2.5 + Math.random() * 2, 0.9, 0.03, 'circle', true, '#ff1493');
        break;

      case 'bubble':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -0.5 - Math.random() * 1, -0.2 - Math.random() * 0.8, 'rgba(173, 216, 230, 0.5)', 2.5 + Math.random() * 3, 0.7, 0.015, 'bubble');
        break;

      case 'storm':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -2 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5, '#ffd600', 3 + Math.random() * 2, 1.0, 0.025, 'spark', true, '#00e5ff');
        break;

      case 'void':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 2, (Math.random() - 0.5) * 1.5, '#bc00dd', 3 + Math.random() * 3, 1.0, 0.02, 'star', true, 'rgba(74, 20, 140, 0.85)');
        break;

      case 'valkyrie':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1.2 - Math.random() * 2, (Math.random() - 0.5) * 1.5, '#ff1744', 3.5 + Math.random() * 3.5, 1.0, 0.03, 'circle', true, '#ffd700');
        break;

      case 'wyvern':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 1.5, (Math.random() - 0.5) * 1.5, '#00e676', 3 + Math.random() * 2, 0.9, 0.02, 'spark', true, 'rgba(27, 94, 32, 0.5)');
        break;

      case 'gargoyle':
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -0.8 - Math.random() * 1, (Math.random() - 0.5) * 1, '#37474f', 4 + Math.random() * 3, 0.8, 0.03, 'circle');
        particleEngine.spawn(offsetBackX, offsetBackY, -1.2 - Math.random() * 1, (Math.random() - 0.5) * 0.5, '#ff3d00', 2.5 + Math.random() * 2, 0.9, 0.04, 'spark', true, '#ff9100');
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
      case 'cyber':
        this.drawCyber(ctx);
        break;
      case 'ice':
        this.drawIce(ctx);
        break;
      case 'shadow':
        this.drawShadow(ctx);
        break;
      case 'dragon':
        this.drawDragon(ctx);
        break;
      case 'nebula':
        this.drawNebula(ctx);
        break;
      case 'bubble':
        this.drawBubbleSiren(ctx);
        break;
      case 'cyber_owl':
        this.drawCyberOwl(ctx);
        break;
      case 'neon_crow':
        this.drawNeonCrow(ctx);
        break;
      case 'goofy_pilot':
        this.drawGoofyPilot(ctx);
        break;
      case 'white_dragon':
        this.drawWhiteDragon(ctx);
        break;
      case 'storm_griffin':
        this.drawStormGriffin(ctx);
        break;
      case 'void_sentinel':
        this.drawVoidSentinel(ctx);
        break;
      case 'crimson_valkyrie':
        this.drawCrimsonValkyrie(ctx);
        break;
      case 'emerald_wyvern':
        this.drawEmeraldWyvern(ctx);
        break;
      case 'obsidian_gargoyle':
        this.drawObsidianGargoyle(ctx);
        break;
      case 'kingfisher':
        this.drawKingfisher(ctx);
        break;
      case 'dread_owl':
        this.drawOwl(ctx);
        break;
      default:
        this.drawEagle(ctx); // Default Eagle
    }

    ctx.restore();
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

      case 'cyber': {
        // Futuristic rotating hexagonal tracking HUD
        ctx.strokeStyle = '#00f3ff';
        ctx.save();
        ctx.rotate(-this.auraAngle);
        
        // Draw double hexagon outline
        for (let r = 0; r < 2; r++) {
          const rad = baseRadius * (1.1 + r * 0.25);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            ctx.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
          }
          ctx.closePath();
          ctx.stroke();
        }
        
        // Corner tech nodes
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * (baseRadius * 1.35), Math.sin(angle) * (baseRadius * 1.35), 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
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

      case 'shadow': {
        // Dark void orbit eclipse ring
        ctx.strokeStyle = '#e040fb';
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.25, 0, Math.PI * 2);
        ctx.stroke();

        // Dual swirling shadow crescent blades
        ctx.fillStyle = '#4a148c';
        ctx.save();
        ctx.rotate(this.auraAngle * 2);
        for (let i = 0; i < 2; i++) {
          ctx.rotate(Math.PI);
          ctx.beginPath();
          ctx.arc(baseRadius * 1.2, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case 'dragon': {
        // Jade green ancient serpent/dragon ring
        ctx.strokeStyle = '#00e676';
        ctx.save();
        ctx.rotate(-this.auraAngle * 1.2);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        
        // 3 swirling jade nodes
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 3; i++) {
          const angle = (i * Math.PI * 2) / 3;
          ctx.beginPath();
          ctx.arc(Math.cos(angle) * (baseRadius * 1.25), Math.sin(angle) * (baseRadius * 1.25), 3, 0, Math.PI * 2);
          ctx.fill();
        }
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

      case 'bubble': {
        // Shimmering iridescent water bubble aura with minor ripples
        ctx.strokeStyle = '#40c4ff';
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        
        // Water highlights shining
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(-baseRadius * 0.6, -baseRadius * 0.6, 3, 0, Math.PI * 2);
        ctx.fill();
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

      case 'goofy_pilot': {
        ctx.strokeStyle = 'rgba(255, 170, 0, 0.65)';
        ctx.save();
        ctx.rotate(this.auraAngle * 0.5);
        ctx.setLineDash([4, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.2, 0, Math.PI * 2);
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
    // Body gradient
    const grad = ctx.createLinearGradient(-15, -15, 15, 15);
    grad.addColorStop(0, '#d4af37'); // Gold beak/brown elements
    grad.addColorStop(0.5, '#8b5a2b');
    grad.addColorStop(1, '#4a2f1b');

    ctx.fillStyle = grad;
    // Main round body
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Golden beak
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(10, -5);
    ctx.lineTo(24, 0);
    ctx.lineTo(10, 5);
    ctx.closePath();
    ctx.fill();

    // White eagle crown head detail
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-2, -15);
    ctx.lineTo(10, -10);
    ctx.lineTo(12, 0);
    ctx.lineTo(8, 10);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();

    // Eagle Eye
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(8, -4, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Animated Wings
    this.drawFlappingWing(ctx, '#8b5a2b', '#4a2f1b');
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

  private drawCyber(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(0, 243, 255, 0.8)';
    }

    // Metallic carbon armor body plates
    ctx.fillStyle = '#3a3a44';
    ctx.beginPath();
    ctx.rect(-15, -13, 28, 26);
    ctx.fill();
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Sleek geometric head plate
    ctx.fillStyle = '#222228';
    ctx.beginPath();
    ctx.moveTo(3, -11);
    ctx.lineTo(16, -6);
    ctx.lineTo(13, 6);
    ctx.lineTo(3, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cyber digital glowing visor eye
    ctx.strokeStyle = '#ff007f';
    ctx.fillStyle = '#ff007f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(6, -3);
    ctx.lineTo(13, -1);
    ctx.stroke();

    // Cyber wings (geometric panel lines)
    this.drawCyberWing(ctx);
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

  private drawShadow(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(128, 0, 128, 0.8)';
    }

    // Void smoke body
    const shadowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    shadowGrad.addColorStop(0, '#800080');
    shadowGrad.addColorStop(0.7, '#1a001a');
    shadowGrad.addColorStop(1, '#000000');

    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Shadow glowing purple assassin visor
    ctx.strokeStyle = '#da70d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(5, -4);
    ctx.lineTo(14, -2);
    ctx.stroke();

    // Sleek shadow wings
    this.drawFlappingWing(ctx, '#1a001a', '#800080');
  }

  private drawDragon(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(0, 255, 204, 0.8)';
    }

    // 2.5D Face shift offset
    const faceX = Math.cos(this.angle) * 2.0;
    const faceY = Math.sin(this.angle) * 1.5 - this.vy * 0.1;

    const headX = 10 + faceX;
    const headY = -8 + faceY;

    // --- 1. DRAGON TAIL (Undulating, starts at -16, 6) ---
    ctx.save();
    ctx.translate(-16, 6);
    let prevX = 0;
    let prevY = 0;
    ctx.strokeStyle = '#4b0082';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    for (let i = 1; i <= 6; i++) {
      const tailSegLength = 5.0;
      const angleOffset = i * 0.4;
      const waveAngle = Math.sin(this.flapCycle * 1.3 - angleOffset) * 0.35 + (this.vy * 0.05);
      
      prevX -= Math.cos(waveAngle) * tailSegLength;
      prevY += Math.sin(waveAngle) * tailSegLength;
      ctx.lineTo(prevX, prevY);
    }
    ctx.stroke();
    
    // Tail spade (neon glowing spade)
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.bezierCurveTo(prevX - 6, prevY - 6, prevX - 12, prevY, prevX - 14, prevY + 2);
    ctx.bezierCurveTo(prevX - 12, prevY + 4, prevX - 6, prevY + 10, prevX, prevY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- 2. DRAGON LEGS ---
    // Hind leg
    ctx.save();
    ctx.translate(-10, 10);
    ctx.rotate(Math.sin(this.flapCycle) * 0.15);
    ctx.fillStyle = '#4b0082';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Talons
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.moveTo(-1, 5);
    ctx.lineTo(-4, 9);
    ctx.lineTo(-1, 8);
    ctx.lineTo(2, 9);
    ctx.lineTo(1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Fore leg
    ctx.save();
    ctx.translate(2, 10);
    ctx.rotate(Math.sin(this.flapCycle + Math.PI/2) * 0.15);
    ctx.fillStyle = '#310062';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Talons
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.moveTo(-1, 5);
    ctx.lineTo(-3, 9);
    ctx.lineTo(0, 8);
    ctx.lineTo(3, 9);
    ctx.lineTo(1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- 3. SERPENTINE TORSO & NECK ---
    const bodyGrad = ctx.createLinearGradient(-18, -5, 12, 12);
    bodyGrad.addColorStop(0, '#9400d3');
    bodyGrad.addColorStop(0.5, '#4b0082');
    bodyGrad.addColorStop(1, '#1a0033');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(headX - 3, headY + 3);
    ctx.quadraticCurveTo(8, 0, 4, 8);
    ctx.bezierCurveTo(0, 14, -12, 12, -18, 5);
    ctx.lineTo(-16, 1);
    ctx.bezierCurveTo(-10, -4, -2, -1, headX - 8, headY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 4. BACK SPIKES / DORSAL RIDGE ---
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.moveTo(-14, 2);
    ctx.lineTo(-18, -4);
    ctx.lineTo(-9, 0);
    ctx.moveTo(-8, -1);
    ctx.lineTo(-11, -8);
    ctx.lineTo(-3, -2);
    ctx.moveTo(-2, -3);
    ctx.lineTo(-4, -10);
    ctx.lineTo(2, -4);
    ctx.closePath();
    ctx.fill();

    // --- 5. OVERLAY NEON DRAGON SCALES ---
    ctx.strokeStyle = 'rgba(0, 255, 204, 0.4)';
    ctx.lineWidth = 1;
    const scalePoints = [
      {x: -12, y: 4}, {x: -8, y: 5}, {x: -4, y: 6}, {x: 0, y: 7},
      {x: -10, y: 1}, {x: -6, y: 2}, {x: -2, y: 3}, {x: 2, y: 4},
      {x: -4, y: -1}, {x: 0, y: 0}, {x: 4, y: 1}
    ];
    scalePoints.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI);
      ctx.stroke();
    });

    // --- 6. DRAGON HEAD ---
    ctx.fillStyle = '#4b0082';
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(headX - 8, headY - 4);
    ctx.lineTo(headX + 2, headY - 6);
    ctx.lineTo(headX + 12, headY - 1);
    ctx.lineTo(headX + 11, headY + 3);
    ctx.lineTo(headX + 4, headY + 4);
    ctx.lineTo(headX - 6, headY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Neon glowing snout detail
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.arc(headX + 8, headY + 1, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Majestic back horns (Neon Green / Cyan)
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.moveTo(headX - 5, headY - 5);
    ctx.quadraticCurveTo(headX - 14, headY - 16, headX - 20, headY - 12);
    ctx.quadraticCurveTo(headX - 10, headY - 6, headX - 3, headY - 3);
    ctx.closePath();
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(headX - 6, headY + 1);
    ctx.quadraticCurveTo(headX - 12, headY - 6, headX - 16, headY - 4);
    ctx.quadraticCurveTo(headX - 9, headY + 2, headX - 4, headY + 3);
    ctx.closePath();
    ctx.fill();

    // Fierce glowing eyes
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.arc(headX + 1, headY - 1, 4.0, 0, Math.PI * 2);
    ctx.fill();
    // Slit pupil
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.ellipse(headX + 1, headY - 1, 1.0, 3.0, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // --- 7. WEBBED WINGS ---
    ctx.save();
    ctx.translate(-2, 2);
    const wingFlap = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(wingFlap);
    
    // Webbing
    ctx.fillStyle = 'rgba(255, 0, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    
    const bone1X = -26, bone1Y = -14;
    const bone2X = -17, bone2Y = 6;
    const bone3X = -8, bone3Y = 15;
    
    ctx.lineTo(bone1X, bone1Y);
    ctx.quadraticCurveTo(-22, -3, bone2X, bone2Y);
    ctx.quadraticCurveTo(-12, 11, bone3X, bone3Y);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    
    // Bones
    ctx.strokeStyle = '#4b0082';
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
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.arc(wristX, wristY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
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

  private drawBubbleSiren(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(30, 144, 255, 0.7)';
    }

    // Translucent bubble body
    const bubGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 16);
    bubGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    bubGrad.addColorStop(0.7, 'rgba(30, 144, 255, 0.4)');
    bubGrad.addColorStop(1, 'rgba(0, 0, 128, 0.6)');

    ctx.fillStyle = bubGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Cute large bubbles eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(7, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(7.5, -3, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Fin wings
    this.drawFlappingWing(ctx, 'rgba(0, 191, 255, 0.6)', 'rgba(255, 255, 255, 0.8)');
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

  private drawCyberWing(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(-4, 1);
    const flapAngle = Math.sin(this.flapCycle) * 0.6;
    ctx.rotate(flapAngle);

    ctx.fillStyle = '#222228';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-18, -10);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-14, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Neon panel details
    ctx.strokeStyle = '#ff007f';
    ctx.beginPath();
    ctx.moveTo(-8, -4);
    ctx.lineTo(-18, -1);
    ctx.stroke();

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

  private drawGoofyPilot(ctx: CanvasRenderingContext2D) {
    // 2.5D Face shift offset
    const faceX = Math.cos(this.angle) * 1.5;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.1;

    // Body squash/stretch scaling (squashes when jumping, stretches when diving)
    ctx.save();
    const stretchX = 1 - Math.max(-0.12, Math.min(0.12, this.vy * 0.015));
    const stretchY = 1 + Math.max(-0.12, Math.min(0.12, this.vy * 0.015));
    ctx.scale(stretchX, stretchY);

    // Goofy brown round body
    ctx.fillStyle = '#c68a4c';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Retro pilot leather helmet
    ctx.fillStyle = '#5c4033';
    ctx.beginPath();
    ctx.arc(0, -2, 17, Math.PI, 0); // Helmet dome
    ctx.fill();

    // Hanging ear flaps of helmet - flutters reactively to G-force drag (vy)
    // Left ear flap
    ctx.save();
    ctx.translate(-15, 2);
    const leftFlapDrag = -this.vy * 0.07 + Math.sin(this.flapCycle * 1.5) * 0.15;
    ctx.rotate(leftFlapDrag);
    ctx.fillStyle = '#4b3621';
    ctx.beginPath();
    ctx.rect(-2, -4, 4, 15);
    ctx.fill();
    ctx.restore();

    // Right ear flap
    ctx.save();
    ctx.translate(15, 2);
    const rightFlapDrag = -this.vy * 0.07 + Math.sin(this.flapCycle * 1.5 + Math.PI) * 0.15;
    ctx.rotate(rightFlapDrag);
    ctx.fillStyle = '#4b3621';
    ctx.beginPath();
    ctx.rect(-2, -4, 4, 15);
    ctx.fill();
    ctx.restore();

    // Googly cartoon eyes (2.5D shift)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    
    // Left goofy eye
    ctx.beginPath();
    ctx.arc(-5 + faceX, -6 + faceY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Pupil looking funny (panicked shake under rise speed)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    const shake = Math.sin(this.flapCycle * 4) * (this.vy < 0 ? 0.8 : 0.2);
    ctx.arc(-4 + faceX + shake, -6 + faceY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Right goofy eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4 + faceX, -6 + faceY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Pupil looking funny (cross-eyed)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(2 + faceX - shake, -6 + faceY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Aviator goggles pushed up (tilt and lag behind)
    ctx.save();
    ctx.translate(faceX, faceY - 12);
    const goggleTilt = this.vy * 0.05;
    ctx.rotate(goggleTilt);
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.rect(-12, -2, 24, 4); // Strap
    ctx.fill();
    ctx.fillStyle = '#87ceeb';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-10, -5, 8, 7); // Left goggle glass
    ctx.rect(2, -5, 8, 7);  // Right goggle glass
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Wide funny orange smiling beak with teeth (2.5D shift)
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(8 + faceX, faceY);
    ctx.quadraticCurveTo(18 + faceX, 5 + faceY, 22 + faceX * 1.2, faceY);
    ctx.quadraticCurveTo(18 + faceX, -5 + faceY, 8 + faceX, faceY);
    ctx.fill();

    // Big happy smile cheeks (2.5D shift)
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.arc(6 + faceX, 1 + faceY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Goofy aviator wing bending at elbow joint
    ctx.save();
    const wingSpeed = this.vy < 0 ? 1.8 : 1.4;
    const mainAngle = Math.sin(this.flapCycle * wingSpeed) * 0.7;
    ctx.translate(-4, 2);
    ctx.rotate(mainAngle);
    
    // Draw upper wing bone
    ctx.fillStyle = '#8b5a2b';
    ctx.beginPath();
    ctx.ellipse(-6, -2, 8, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw lower wing bending at joint
    ctx.translate(-10, -2);
    const elbowBend = Math.sin(this.flapCycle * wingSpeed + 0.6) * 0.5;
    ctx.rotate(elbowBend);
    ctx.fillStyle = '#c68a4c';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.bezierCurveTo(-10, -8, -16, 2, -18, 6);
    ctx.bezierCurveTo(-12, 8, -4, 4, 0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore(); // Body scale restore
  }

  private drawWhiteDragon(ctx: CanvasRenderingContext2D) {
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

    // --- 1. DRAGON TAIL (Undulating, starts at rear of torso: -16, 6) ---
    ctx.save();
    ctx.translate(-16, 6);
    let prevX = 0;
    let prevY = 0;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    for (let i = 1; i <= 6; i++) {
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
    ctx.bezierCurveTo(prevX - 6, prevY - 6, prevX - 12, prevY, prevX - 14, prevY + 2);
    ctx.bezierCurveTo(prevX - 12, prevY + 4, prevX - 6, prevY + 10, prevX, prevY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- 2. DRAGON LEGS (Tucked claw legs) ---
    // Hind leg
    ctx.save();
    ctx.translate(-10, 10);
    ctx.rotate(Math.sin(this.flapCycle) * 0.15);
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Talons
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(-1, 5);
    ctx.lineTo(-4, 9);
    ctx.lineTo(-1, 8);
    ctx.lineTo(2, 9);
    ctx.lineTo(1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Fore leg
    ctx.save();
    ctx.translate(2, 10);
    ctx.rotate(Math.sin(this.flapCycle + Math.PI/2) * 0.15);
    ctx.fillStyle = '#fbcfe8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 3, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();
    // Talons
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(-1, 5);
    ctx.lineTo(-3, 9);
    ctx.lineTo(0, 8);
    ctx.lineTo(3, 9);
    ctx.lineTo(1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // --- 3. MAJESTIC SERPENTINE TORSO & NECK ---
    // Torso gradient
    const bodyGrad = ctx.createLinearGradient(-18, -5, 12, 12);
    bodyGrad.addColorStop(0, '#f1f5f9'); // Pastel slate/white
    bodyGrad.addColorStop(0.5, '#f8fafc');
    bodyGrad.addColorStop(1, '#e2e8f0');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.2;

    // Draw main body shape (neck curving up to head, thick chest, tapering back to tail)
    ctx.beginPath();
    // Start at head connection point (top of neck)
    ctx.moveTo(headX - 3, headY + 3);
    // Outer neck curve down to chest
    ctx.quadraticCurveTo(8, 0, 4, 8);
    // Underbelly to rear
    ctx.bezierCurveTo(0, 14, -12, 12, -18, 5);
    // Rear transition to tail
    ctx.lineTo(-16, 1);
    // Back ridge line curving up to neck
    ctx.bezierCurveTo(-10, -4, -2, -1, headX - 8, headY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 4. BACK SPIKES / DORSAL RIDGE ---
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    // Spike 1 (Back)
    ctx.moveTo(-14, 2);
    ctx.lineTo(-18, -4);
    ctx.lineTo(-9, 0);
    // Spike 2 (Mid-back)
    ctx.moveTo(-8, -1);
    ctx.lineTo(-11, -8);
    ctx.lineTo(-3, -2);
    // Spike 3 (Lower neck)
    ctx.moveTo(-2, -3);
    ctx.lineTo(-4, -10);
    ctx.lineTo(2, -4);
    ctx.closePath();
    ctx.fill();

    // --- 5. OVERLAY PROCEDURAL DRAGON SCALES ---
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
    ctx.lineWidth = 1;
    // Draw rows of mini scales along torso
    const scalePoints = [
      {x: -12, y: 4}, {x: -8, y: 5}, {x: -4, y: 6}, {x: 0, y: 7},
      {x: -10, y: 1}, {x: -6, y: 2}, {x: -2, y: 3}, {x: 2, y: 4},
      {x: -4, y: -1}, {x: 0, y: 0}, {x: 4, y: 1}
    ];
    scalePoints.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI);
      ctx.stroke();
    });

    // --- 6. DRAGON HEAD (Reptilian snout, defined jaw, and back horns) ---
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 1.2;

    // Draw majestic head shape
    ctx.beginPath();
    ctx.moveTo(headX - 8, headY - 4); // Back of head
    ctx.lineTo(headX + 2, headY - 6);  // Brow line
    ctx.lineTo(headX + 12, headY - 1); // Top of snout
    ctx.lineTo(headX + 11, headY + 3); // Snout tip
    ctx.lineTo(headX + 4, headY + 4);  // Jaw curve
    ctx.lineTo(headX - 6, headY + 5);  // Back jaw
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cute pink baby snout nostril (2.5D shift)
    ctx.fillStyle = '#fbcfe8';
    ctx.beginPath();
    ctx.arc(headX + 8, headY + 1, 1.5, 0, Math.PI * 2);
    ctx.fill();

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

    // Cute big purple eyes (with sharp reptilian slit and white highlights)
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.arc(headX + 1, headY - 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // Pupil slit
    ctx.fillStyle = '#1e1b29';
    ctx.beginPath();
    ctx.ellipse(headX + 1, headY - 1, 1.2, 3.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX + 2.2, headY - 2.2, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // --- 7. WEBBED WINGS (Centered at shoulder: -2, 2) ---
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
  }

  private drawStormGriffin(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(255, 235, 59, 0.85)';
    }
    const grad = ctx.createLinearGradient(-16, -16, 16, 16);
    grad.addColorStop(0, '#00e5ff');
    grad.addColorStop(0.5, '#ffd600');
    grad.addColorStop(1, '#ff6d00');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Golden electric griffin beak
    ctx.fillStyle = '#ffe100';
    ctx.beginPath();
    ctx.moveTo(10, -5);
    ctx.lineTo(26, 2);
    ctx.lineTo(10, 7);
    ctx.closePath();
    ctx.fill();

    // Feather crown
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.moveTo(-4, -15);
    ctx.lineTo(2, -22);
    ctx.lineTo(8, -12);
    ctx.closePath();
    ctx.fill();

    // Griffin blue eye
    ctx.fillStyle = '#00b0ff';
    ctx.beginPath();
    ctx.arc(7, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Electric wings
    this.drawFlappingWing(ctx, '#00e5ff', '#ffe100', true);
  }

  private drawVoidSentinel(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(188, 0, 221, 0.85)';
    }
    ctx.fillStyle = '#1c0a35';
    ctx.strokeStyle = '#bc00dd';
    ctx.lineWidth = 2.0;

    // Angular dark void shield armor body
    ctx.beginPath();
    ctx.moveTo(-15, -15);
    ctx.lineTo(15, -10);
    ctx.lineTo(10, 15);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing purple laser visor
    ctx.fillStyle = '#d500f9';
    ctx.beginPath();
    ctx.rect(4, -4, 10, 3.5);
    ctx.fill();

    // Void sentinel metal wings
    this.drawFlappingWing(ctx, '#4a148c', '#d500f9', true);
  }

  private drawCrimsonValkyrie(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = 'rgba(211, 47, 47, 0.9)';
    }
    const valkGrad = ctx.createLinearGradient(-15, -15, 15, 15);
    valkGrad.addColorStop(0, '#ffd700');
    valkGrad.addColorStop(0.5, '#d32f2f');
    valkGrad.addColorStop(1, '#5d0000');

    ctx.fillStyle = valkGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Majestic golden crest
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(-6, -16);
    ctx.lineTo(6, -24);
    ctx.lineTo(12, -10);
    ctx.closePath();
    ctx.fill();

    // Glowing valkyrie beak
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.moveTo(9, -4);
    ctx.lineTo(24, -1);
    ctx.lineTo(9, 5);
    ctx.closePath();
    ctx.fill();

    // Valiant golden eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(6, -3, 2, 0, Math.PI * 2);
    ctx.fill();

    // Crimson wings
    this.drawFlappingWing(ctx, '#ff1744', '#ffd700', true);
  }

  private drawEmeraldWyvern(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(0, 230, 118, 0.8)';
    }
    const scaleGrad = ctx.createLinearGradient(-16, -16, 16, 16);
    scaleGrad.addColorStop(0, '#00e676');
    scaleGrad.addColorStop(0.6, '#00b0ff');
    scaleGrad.addColorStop(1, '#1b5e20');

    ctx.fillStyle = scaleGrad;
    ctx.beginPath();
    ctx.moveTo(-16, -5);
    ctx.lineTo(0, -16);
    ctx.lineTo(16, -5);
    ctx.lineTo(12, 14);
    ctx.lineTo(-12, 14);
    ctx.closePath();
    ctx.fill();

    // Jade horns
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.moveTo(5, -15);
    ctx.lineTo(12, -26);
    ctx.lineTo(10, -12);
    ctx.closePath();
    ctx.fill();

    // Snake slit eye
    ctx.fillStyle = '#ffe100';
    ctx.beginPath();
    ctx.arc(6, -2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Emerald webbed wings
    this.drawCrystalWing(ctx);
  }

  private drawObsidianGargoyle(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(255, 110, 64, 0.7)';
    }
    // Obsidian lava-cracked stone texture
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Lava cracks glowing
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.lineTo(0, -6);
    ctx.lineTo(10, 8);
    ctx.stroke();

    // Heavy gargoyle horn
    ctx.fillStyle = '#37474f';
    ctx.beginPath();
    ctx.moveTo(-8, -12);
    ctx.lineTo(-18, -20);
    ctx.lineTo(-4, -14);
    ctx.closePath();
    ctx.fill();

    // Angry fire eyes
    ctx.fillStyle = '#ff3d00';
    ctx.beginPath();
    ctx.arc(6, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Heavy bat wings
    this.drawFlappingWing(ctx, '#37474f', '#ff9100');
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

    // --- 7. Cybernetic Visor plate with Glowing Menacing Red Eye Slit ---
    // Dark visor plate
    ctx.fillStyle = '#212121'; // Charcoal black
    ctx.strokeStyle = '#c2185b'; // Magenta trim
    ctx.lineWidth = 1;
    ctx.beginPath();
    // Angular visor shape
    ctx.moveTo(-1 + faceX, -9 + faceY);
    ctx.lineTo(8 + faceX, -8 + faceY);
    ctx.lineTo(9 + faceX, -4 + faceY);
    ctx.lineTo(2 + faceX, -2 + faceY);
    ctx.lineTo(-1 + faceX, -4 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Menacing glowing red slit eye
    ctx.strokeStyle = '#ff1744'; // Glowing neon red
    ctx.lineWidth = 2.0;
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff1744';
    }
    ctx.beginPath();
    // Diagonal angry glowing line
    ctx.moveTo(1 + faceX, -6 + faceY);
    ctx.lineTo(7 + faceX, -6 + faceY);
    ctx.stroke();

    // Mini hot white laser core inside the red slit
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(3 + faceX, -6 + faceY);
    ctx.lineTo(6 + faceX, -6 + faceY);
    ctx.stroke();

    // Reset shadow for subsequent drawings
    ctx.shadowBlur = 0;

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
      ctx.shadowColor = 'rgba(0, 230, 118, 0.6)'; // Menacing green glow
    }

    // 2.5D Face shift offset based on bird movement angle
    const faceX = Math.cos(this.angle) * 1.5;
    const faceY = Math.sin(this.angle) * 1.2 - this.vy * 0.1;

    // --- 1. Razor Steel Talons (Large owl claws) ---
    ctx.fillStyle = '#37474f';
    ctx.strokeStyle = '#00e676'; // Electric green highlights
    ctx.lineWidth = 1.2;
    
    // Left talon
    ctx.beginPath();
    ctx.moveTo(-6, 12);
    ctx.quadraticCurveTo(-12, 20, -3, 23);
    ctx.quadraticCurveTo(0, 17, -1, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right talon
    ctx.beginPath();
    ctx.moveTo(2, 12);
    ctx.quadraticCurveTo(-3, 20, 6, 22);
    ctx.quadraticCurveTo(7, 16, 7, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 2. Body/Torso (Layered armored feather scales - Charcoal & Ash brown) ---
    const bodyGrad = ctx.createLinearGradient(-16, -16, 16, 16);
    bodyGrad.addColorStop(0, '#4e342e'); // Deep wood brown
    bodyGrad.addColorStop(0.5, '#2d1f1d'); // Very dark brown-black
    bodyGrad.addColorStop(1, '#1b1211'); // Pitch black base
    ctx.fillStyle = bodyGrad;
    
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();

    // Draw armored feather plate markings on belly
    ctx.strokeStyle = '#00e676'; // Menacing green glowing trim
    ctx.lineWidth = 1.0;
    
    // Scale row 1
    ctx.beginPath();
    ctx.arc(-8, 4, 4, 0, Math.PI);
    ctx.arc(0, 4, 4, 0, Math.PI);
    ctx.arc(8, 4, 4, 0, Math.PI);
    ctx.stroke();

    // Scale row 2
    ctx.beginPath();
    ctx.arc(-4, 9, 4, 0, Math.PI);
    ctx.arc(4, 9, 4, 0, Math.PI);
    ctx.stroke();

    // --- 3. Fan-shaped Tail Feathers (Heavy, broad dark feathers) ---
    ctx.save();
    ctx.translate(-14, 6);
    const tailTilt = -this.vy * 0.04 + Math.sin(this.flapCycle) * 0.08;
    ctx.rotate(tailTilt);

    const tailGrad = ctx.createLinearGradient(0, -6, -20, 12);
    tailGrad.addColorStop(0, '#2d1f1d');
    tailGrad.addColorStop(1, '#00e676'); // Glowing tips
    ctx.fillStyle = tailGrad;
    ctx.strokeStyle = '#1b1211';
    ctx.lineWidth = 1;

    // Draw fan tail
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-24, -14);
    ctx.lineTo(-28, -4);
    ctx.lineTo(-28, 6);
    ctx.lineTo(-22, 14);
    ctx.lineTo(0, 4);
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

    // --- 5. Massive Great Horned Owl Head (With large plumicorns/horns) ---
    const headGrad = ctx.createLinearGradient(-8, -18, 12, -4);
    headGrad.addColorStop(0, '#3e2723'); // Dark brown crown
    headGrad.addColorStop(0.5, '#212121'); // Ash charcoal
    headGrad.addColorStop(1, '#00e676'); // Green brow connection
    ctx.fillStyle = headGrad;
    
    ctx.beginPath();
    ctx.arc(faceX, -6 + faceY, 14, 0, Math.PI * 2); // Slightly larger head for owl feel
    ctx.fill();

    // Prominent sweeping horned feather tufts (Plumicorns)
    ctx.fillStyle = '#212121';
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.5;
    
    // Left Horn
    ctx.beginPath();
    ctx.moveTo(-10 + faceX, -14 + faceY);
    ctx.quadraticCurveTo(-26 + faceX, -28 + faceY, -28 + faceX, -30 + faceY); // Very tall horned tuft
    ctx.quadraticCurveTo(-18 + faceX, -20 + faceY, -3 + faceX, -18 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Horn
    ctx.beginPath();
    ctx.moveTo(-4 + faceX, -16 + faceY);
    ctx.quadraticCurveTo(-12 + faceX, -32 + faceY, -14 + faceX, -34 + faceY); // Symmetrical offset horn
    ctx.quadraticCurveTo(-6 + faceX, -22 + faceY, 3 + faceX, -18 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 6. Flat Heart-shaped Face Disc (Real owl signature face disc) ---
    ctx.fillStyle = '#d7ccc8'; // Soft ash face disc
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // Heart-like boundary of face disc
    ctx.moveTo(faceX, -12 + faceY);
    ctx.bezierCurveTo(-10 + faceX, -22 + faceY, -15 + faceX, -2 + faceY, faceX, 3 + faceY);
    ctx.bezierCurveTo(15 + faceX, -2 + faceY, 10 + faceX, -22 + faceY, faceX, -12 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 7. Large Glowing Monster Eyes (Huge, round owl eyes) ---
    // Outer black frame
    ctx.fillStyle = '#1b1211';
    ctx.beginPath();
    ctx.arc(-4 + faceX, -6 + faceY, 5, 0, Math.PI * 2);
    ctx.arc(6 + faceX, -6 + faceY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Neon Yellow/Green iris
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.arc(-4 + faceX, -6 + faceY, 3.8, 0, Math.PI * 2);
    ctx.arc(6 + faceX, -6 + faceY, 3.8, 0, Math.PI * 2);
    ctx.fill();

    // Menacing slit pupils (Monster look)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(-4 + faceX, -6 + faceY, 1.0, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(6 + faceX, -6 + faceY, 1.0, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Intense tiny red reflections (Laser focus core)
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(-3.5 + faceX, -7 + faceY, 0.8, 0, Math.PI * 2);
    ctx.arc(6.5 + faceX, -7 + faceY, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // --- 8. Short, Hooked Black Beak (Owl signature downward-curved beak) ---
    ctx.fillStyle = '#1b1211';
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0 + faceX, -7 + faceY);
    ctx.quadraticCurveTo(8 + faceX, -3 + faceY, 6 + faceX, 3 + faceY); // Curved hook down
    ctx.quadraticCurveTo(0 + faceX, 0 + faceY, 0 + faceX, -7 + faceY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // --- 9. Broad, Heavy Feathered Wings (Huge owl wings) ---
    ctx.save();
    ctx.translate(-3, 2);
    // Flapping movement angle (slower, heavy wingbeat style)
    const flapAngle = Math.sin(this.flapCycle) * 0.65;
    ctx.rotate(flapAngle);

    // Grad: Charcoal to dark brown to electric green edge
    const wingGrad = ctx.createLinearGradient(0, 0, -42, 8);
    wingGrad.addColorStop(0, '#1b1211');
    wingGrad.addColorStop(0.5, '#3e2723');
    wingGrad.addColorStop(0.9, '#00e676');
    wingGrad.addColorStop(1, '#ffffff');

    ctx.fillStyle = wingGrad;
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.5;

    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00e676';
    }

    // Draw huge broad owl wing with layered, curved flight feathers
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Broad wing sweeping backward
    ctx.bezierCurveTo(-15, -20, -38, -12, -45, 6);
    // Broad feathered tips
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

    // Inner wing bone structure highlights
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0, 230, 118, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(-38, 2);
    ctx.moveTo(-10, 4);
    ctx.lineTo(-32, 9);
    ctx.stroke();

    // Wing joint cap
    ctx.fillStyle = '#2d1f1d';
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 1, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
