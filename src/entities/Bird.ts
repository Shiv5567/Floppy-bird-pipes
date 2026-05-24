import { ParticleEngine } from '../engine/ParticleEngine.ts';
import type { Skin } from '../systems/ProgressManager.ts';

export class Bird {
  public x = 120;
  public y = 300;
  public vy = 0;
  public radius = 26; // Base collision circle radius
  public baseRadius = 26;
  public angle = 0;
  
  // Physics parameters (tighter, snappier responsiveness: gravity increased from 0.40 to 0.52, jumpLift increased from -7.4 to -8.8)
  private gravity = 0.52;
  private jumpLift = -8.8;
  private maxFallSpeed = 14.0;
  private maxRiseSpeed = -14.0;
  
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
    void difficulty; // Enforce medium physics across all modes for constant tap responsiveness
    this.gravity = 0.52;
    this.jumpLift = -8.8;
    this.maxFallSpeed = 14.0;
    this.maxRiseSpeed = -14.0;
  }

  public setSkin(skin: Skin) {
    this.activeSkin = skin;
  }

  public getSkin(): Skin {
    return this.activeSkin;
  }

  public jump(soundManager?: any, score = 0) {
    void score;
    if (this.isCrashing) return;
    
    // Jump lift scaled with skin upgrade level (minor bonus)
    const levelBonus = (this.activeSkin.upgradeLevel - 1) * 0.05;
    const impulse = this.jumpLift * (1 + levelBonus);
    
    // Instant, sharp, and skill-based responsiveness:
    // If we are falling or rising slowly, instantly reset velocity to the upward jump impulse for an immediate, crisp response.
    // If we are already rising quickly and tap again, accumulate upward speed (additive) to reward fast tapping with rapid flight!
    if (this.vy > -4) {
      this.vy = impulse;
    } else {
      this.vy += impulse * 0.85; // Increased additive thrust reward for rapid taps (0.85 instead of 0.7) for superior control
    }
    
    // Clamp to ensure it doesn't exceed maximum rising velocity bounds
    if (this.vy < this.maxRiseSpeed) this.vy = this.maxRiseSpeed;
    
    this.flapCycle = 0; // Reset wing animation cycle to start flap
    if (soundManager) soundManager.playFlap();
  }

  public update(deltaTime: number, particleEngine: ParticleEngine, isPlaying: boolean, timeScale: number, score = 0) {
    const dtCoeff = deltaTime * 60 * timeScale;
    
    // Synchronize physics gravity and max fall speed caps with 5% speed increase every 25 score
    const speedMultiplier = 1.0 + Math.floor(score / 25.0) * 0.05;
    const currentGravity = this.gravity * speedMultiplier;
    const currentMaxFallSpeed = this.maxFallSpeed * speedMultiplier;
    
    if (isPlaying) {
      // Apply gravity
      this.vy += currentGravity * dtCoeff;
      if (this.vy > currentMaxFallSpeed) this.vy = currentMaxFallSpeed;
      if (this.vy < this.maxRiseSpeed) this.vy = this.maxRiseSpeed; // Keep upward rise cap constant

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
    ctx.translate(this.x, this.y);
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
      ctx.shadowColor = 'rgba(255, 0, 255, 0.8)';
    }

    // Neon scale body
    const dragonGrad = ctx.createLinearGradient(-15, -15, 15, 15);
    dragonGrad.addColorStop(0, '#9400d3');
    dragonGrad.addColorStop(0.5, '#4b0082');
    dragonGrad.addColorStop(1, '#000000');

    ctx.fillStyle = dragonGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    // Majestic horn horns
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.moveTo(-5, -14);
    ctx.quadraticCurveTo(-14, -24, -20, -18);
    ctx.quadraticCurveTo(-11, -12, -2, -11);
    ctx.closePath();
    ctx.fill();

    // Dragon glowing eye
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.arc(7, -3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Dragon wing
    this.drawFlappingWing(ctx, '#4b0082', '#ff00ff', true);
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
}
