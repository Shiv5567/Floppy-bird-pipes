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

  public jump(soundManager?: any, score = 0) {
    if (this.isCrashing) return;
    
    // Jump lift scaled with skin upgrade level (minor bonus)
    const levelBonus = (this.activeSkin.upgradeLevel - 1) * 0.05;
    
    // Custom progressive score-based jump scaling:
    // Score 0-100: starting displacement (1.0x)
    // Score 100-200: +5.0% smooth increase
    // Score 200-300: +6.0% smooth increase
    // Score 300-400: +3.0% smooth increase
    // Score 400+: Fixed at the capped maximum increase (1.05 * 1.06 * 1.03)
    let jumpScale = 1.0;
    if (score <= 100) {
      jumpScale = 1.0;
    } else if (score <= 200) {
      const progress = (score - 100) / 100;
      jumpScale = 1.0 + progress * 0.05;
    } else if (score <= 300) {
      const progress = (score - 200) / 100;
      jumpScale = 1.05 * (1.0 + progress * 0.06);
    } else if (score <= 400) {
      const progress = (score - 300) / 100;
      jumpScale = 1.05 * 1.06 * (1.0 + progress * 0.03);
    } else {
      jumpScale = 1.05 * 1.06 * 1.03; // Fixed maximum: ~1.14639
    }
    
    const impulse = this.jumpLift * (1 + levelBonus) * jumpScale;
    
    // Instant, sharp, and highly responsive jump:
    // Instantly set vertical velocity to the jump impulse to give an immediate response.
    // This guarantees a perfectly predictable jump height on every single tap and prevents wild speed-stacking!
    this.vy = impulse;
    
    this.flapCycle = 0; // Reset wing animation cycle to start flap
    if (soundManager) soundManager.playFlap();
  }

  public update(deltaTime: number, particleEngine: ParticleEngine, isPlaying: boolean, timeScale: number, score = 0) {
    const dtCoeff = deltaTime * 60 * timeScale;
    
    // Synchronize physics gravity and max fall speed caps with 5% speed increase every 25 score
    const speedMultiplier = 1.0 + Math.floor(score / 25.0) * 0.05;
    const currentGravity = this.gravity * speedMultiplier;
    const currentMaxFallSpeed = this.maxFallSpeed * speedMultiplier;
    
    // Custom progressive score-based jump scaling:
    let jumpScale = 1.0;
    if (score <= 100) {
      jumpScale = 1.0;
    } else if (score <= 200) {
      const progress = (score - 100) / 100;
      jumpScale = 1.0 + progress * 0.05;
    } else if (score <= 300) {
      const progress = (score - 200) / 100;
      jumpScale = 1.05 * (1.0 + progress * 0.06);
    } else if (score <= 400) {
      const progress = (score - 300) / 100;
      jumpScale = 1.05 * 1.06 * (1.0 + progress * 0.03);
    } else {
      jumpScale = 1.05 * 1.06 * 1.03;
    }
    
    // Scale maximum rise speed dynamically to stay fully synchronized with jump impulse scaling!
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

      default:
        particleEngine.spawn(offsetBackX + rx, offsetBackY + ry, -1 - Math.random() * 1, (Math.random() - 0.5) * 0.5, 'rgba(255, 255, 255, 0.4)', 2, 0.8, 0.03, 'circle');
    }
  }

  // Draw procedural birds depending on active skin
  public render(ctx: CanvasRenderingContext2D) {
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
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.3, 0, Math.PI * 2);
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
}
