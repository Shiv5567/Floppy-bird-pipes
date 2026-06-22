import { ParticleEngine } from '../engine/ParticleEngine.ts';
import { SoundManager } from '../engine/SoundManager.ts';

export interface BossAttack {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
}

export interface PlayerMissile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  targetX: number;
  targetY: number;
  active: boolean;
}

export class BossManager {
  private active = false;
  private bossX = 800;
  private bossY = 250;
  private targetBossY = 250;
  private health = 25;
  private maxHealth = 25;
  private state: 'entering' | 'fighting' | 'charging' | 'defeated' = 'entering';
  private timer = 0;
  
  // Attack patterns
  private projectiles: BossAttack[] = [];
  private playerMissiles: PlayerMissile[] = [];
  private fireCooldown = 0;
  private chargePulseX = 0;
  private chargePulseY = 0;
  private chargePulseActive = false;

  private worldId = 'jungle';

  constructor() {}

  public reset() {
    this.active = false;
    this.bossX = 800;
    this.bossY = 250;
    this.targetBossY = 250;
    this.health = 25;
    this.maxHealth = 25;
    this.state = 'entering';
    this.timer = 0;
    this.projectiles = [];
    this.playerMissiles = [];
    this.fireCooldown = 0;
    this.chargePulseActive = false;
  }

  public isBossActive(): boolean {
    return this.active;
  }

  public getBossX(): number {
    return this.bossX;
  }

  public getBossY(): number {
    return this.bossY;
  }

  public getHealth(): number {
    return this.health;
  }

  public getMaxHealth(): number {
    return this.maxHealth;
  }

  public getState(): string {
    return this.state;
  }

  public triggerBossFight(worldId: string, width: number, height: number) {
    this.active = true;
    this.worldId = worldId;
    this.bossX = width + 150;
    this.bossY = height / 3;
    this.targetBossY = height / 2;

    const gameEngine = (window as any).gameEngine;
    const isSquadMode = gameEngine && gameEngine.gameMode === 'flock';
    if (isSquadMode) {
      const score = gameEngine ? gameEngine.score : 0;
      if (score <= 150) {
        this.health = 3;
        this.maxHealth = 3;
      } else {
        this.health = 4;
        this.maxHealth = 4;
      }
    } else {
      this.health = 25 + (worldId === 'volcano' ? 13 : 0); // Lava Dragon is tougher (38 HP)
      this.maxHealth = this.health;
    }

    this.state = 'entering';
    this.timer = 0;
    this.projectiles = [];
    this.playerMissiles = [];
    this.chargePulseActive = false;
  }

  public update(
    deltaTime: number,
    birdX: number,
    birdY: number,
    birdRadius: number,
    width: number,
    height: number,
    particleEngine: ParticleEngine,
    soundManager: SoundManager,
    timeScale: number
  ): boolean {
    if (!this.active) return false;
    
    const dtCoeff = deltaTime * 60 * timeScale;
    this.timer += deltaTime * timeScale;

    // 1. Manage state machine
    if (this.state === 'entering') {
      // Float from offscreen
      this.bossX += (width - 122 - this.bossX) * 0.04 * dtCoeff;
      if (Math.abs(this.bossX - (width - 122)) < 10) {
        this.state = 'fighting';
        this.timer = 0;
      }
    } else if (this.state === 'fighting') {
      // Hover vertically following bird with delay
      this.targetBossY = birdY;
      this.bossY += (this.targetBossY - this.bossY) * 0.036 * dtCoeff;

      // Keep inside bounds
      this.bossY = Math.max(100, Math.min(height - 150, this.bossY));

      // Boss weapon fire cooldown
      this.fireCooldown -= deltaTime * timeScale;
      if (this.fireCooldown <= 0) {
        this.fireCooldown = 1.5 + Math.random() * 1.5;
        this.fireBossAttack(birdX, birdY, soundManager);
      }

      // Spawn charge pulses occasionally for the player to collect and damage the boss
      if (!this.chargePulseActive && Math.random() < 0.009 * dtCoeff) {
        this.chargePulseX = width + 40; // Spawn offscreen on the right
        this.chargePulseY = 120 + Math.random() * (height - 260); // In the comfortable flight zone
        this.chargePulseActive = true;
      }

      // Check if bird collected the charge pulse
      if (this.chargePulseActive) {
        // Drift from right to left so it crosses the bird's flight path naturally
        this.chargePulseX -= 3.6 * dtCoeff;
        
        // If it goes past the screen to the left, deactivate so a new one can spawn
        if (this.chargePulseX < -40) {
          this.chargePulseActive = false;
        } else {
          const dx = birdX - this.chargePulseX;
          const dy = birdY - this.chargePulseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < birdRadius + 16) {
            this.chargePulseActive = false;
            // Spawn plasma player missile homing to boss
            this.playerMissiles.push({
              x: birdX,
              y: birdY,
              vx: 0,
              vy: 0,
              radius: 8,
              targetX: this.bossX,
              targetY: this.bossY,
              active: true
            });
            soundManager.playZap();
          }
        }
      }
    } else if (this.state === 'defeated') {
      // Defeated spinning / exploding drift
      this.bossX += 3 * dtCoeff;
      this.bossY += 1.5 * dtCoeff;
      
      if (Math.random() < 0.25 * dtCoeff) {
        particleEngine.emitExplosion(this.bossX + (Math.random() - 0.5) * 60, this.bossY + (Math.random() - 0.5) * 60, '#ffd700', 5);
      }

      if (this.timer >= 2.5) {
        this.active = false;
        return true; // Boss defeated!
      }
    }

    // 2. Update Boss attacks projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dtCoeff;
      p.y += p.vy * dtCoeff;

      // Projectiles trails
      if (Math.random() < 0.25) {
        particleEngine.spawn(p.x, p.y, -p.vx * 0.2, (Math.random() - 0.5) * 0.5, p.color, 3, 0.7, 0.03, 'circle', true, p.glowColor);
      }

      // Remove offscreen projectiles
      if (p.x < -50 || p.x > width + 100 || p.y < -50 || p.y > height + 100) {
        this.projectiles.splice(i, 1);
      }
    }

    // 3. Update Player homing missiles to Boss
    for (let i = this.playerMissiles.length - 1; i >= 0; i--) {
      const pm = this.playerMissiles[i];
      if (!pm.active) continue;

      // Track Boss position
      pm.targetX = this.bossX;
      pm.targetY = this.bossY;

      const dx = pm.targetX - pm.x;
      const dy = pm.targetY - pm.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 30) {
        pm.active = false;
        this.playerMissiles.splice(i, 1);
        
        // Damage Boss!
        const gameEngine = (window as any).gameEngine;
        const isSquadMode = gameEngine && gameEngine.gameMode === 'flock';
        if (isSquadMode) {
          this.health -= 1;
        } else {
          this.health -= 25;
        }
        particleEngine.emitExplosion(this.bossX, this.bossY, '#ff007f', 15);
        soundManager.playExplosion();

        if (this.health <= 0) {
          this.health = 0;
          this.state = 'defeated';
          this.timer = 0;
        }
      } else {
        const speed = 12 * dtCoeff;
        pm.x += (dx / dist) * speed;
        pm.y += (dy / dist) * speed;

        // Trail particles
        particleEngine.spawn(pm.x, pm.y, 0, 0, '#00ffcc', 4, 1.0, 0.05, 'star', true, '#00ffcc');
      }
    }

    return false;
  }

  private fireBossAttack(birdX: number, birdY: number, soundManager: SoundManager) {
    const dx = birdX - this.bossX;
    const dy = birdY - this.bossY;

    const baseSpeed = 5.72 * 1.15; // 15% speed increase
    soundManager.playZap();

    const gameEngine = (window as any).gameEngine;
    const score = gameEngine ? gameEngine.score : 0;

    let projectileCount = 2;
    if (score < 300) {
      projectileCount = 2;
    } else if (score <= 500) {
      projectileCount = 3;
    } else {
      projectileCount = 4;
    }

    const baseAngle = Math.atan2(dy, dx);
    const spreadAngle = 0.20; // radians spread between each energy ball
    const startAngle = baseAngle - (projectileCount - 1) * spreadAngle / 2;

    const spawnY = this.bossY;
    
    let spawnX = this.bossX - 55;
    if (this.worldId === 'volcano') {
      spawnX = this.bossX - 65;
    } else if (this.worldId === 'jungle') {
      spawnX = this.bossX - 45;
    } else if (this.worldId === 'heaven') {
      spawnX = this.bossX - 40;
    }

    for (let i = 0; i < projectileCount; i++) {
      const angle = startAngle + i * spreadAngle;
      
      let color = '#9400d3';
      let glowColor = '#ff00ff';
      let radius = 8;

      if (this.worldId === 'jungle') {
        color = '#ffd700';
        glowColor = '#ffaa00';
      } else if (this.worldId === 'ice') {
        color = '#80d8ff';
        glowColor = '#80d8ff';
      } else if (this.worldId === 'desert') {
        color = '#ffd54f';
        glowColor = '#ffb300';
      } else if (this.worldId === 'volcano') {
        color = '#ff3d00';
        glowColor = '#ff9100';
        radius = 10;
      } else if (this.worldId === 'space') {
        color = '#d500f9';
        glowColor = '#e040fb';
      } else if (this.worldId === 'underwater') {
        color = '#2979ff';
        glowColor = '#2979ff';
      } else if (this.worldId === 'heaven') {
        color = '#ffea00';
        glowColor = '#ffd600';
      }

      this.projectiles.push({
        x: spawnX,
        y: spawnY,
        vx: Math.cos(angle) * baseSpeed,
        vy: Math.sin(angle) * baseSpeed,
        radius,
        color,
        glowColor
      });
    }
  }

  // Collision checks with active Boss or his bullets (highly optimized squared distance checks)
  public checkCollisions(birdX: number, birdY: number, birdRadius: number): boolean {
    if (!this.active || this.state === 'defeated') return false;

    // 1. Check collision with Boss Body itself (squared distance)
    const dx = birdX - this.bossX;
    const dy = birdY - this.bossY;
    const distSq = dx * dx + dy * dy;
    
    const bossTouchRadius = 45;
    const minDist = birdRadius + bossTouchRadius;
    if (distSq < minDist * minDist) {
      return true;
    }

    // 2. Check collision with Boss Projectiles (squared distance)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const pdx = birdX - p.x;
      const pdy = birdY - p.y;
      const pDistSq = pdx * pdx + pdy * pdy;
      const minPDist = birdRadius + p.radius;

      if (pDistSq < minPDist * minPDist) {
        this.projectiles.splice(i, 1); // Delete bullet
        return true;
      }
    }

    return false;
  }

  // Draw boss graphic using beautiful procedural shapes
  public render(ctx: CanvasRenderingContext2D, isBirdCrashing = false) {
    if (!this.active || isBirdCrashing) return;

    // 1. Draw glowing floating light pulse to collect
    if (this.chargePulseActive) {
      ctx.save();
      ctx.translate(Math.round(this.chargePulseX), Math.round(this.chargePulseY));
      
      const pulsePulse = Math.sin(this.timer * 6) * 4;
      if (!(window as any).gameDisableShadows) {
        ctx.shadowBlur = 15 + pulsePulse;
        ctx.shadowColor = '#00ffcc';
      }

      const pulseGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 14);
      pulseGrad.addColorStop(0, '#ffffff');
      pulseGrad.addColorStop(0.5, '#00ffcc');
      pulseGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = pulseGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 14 + pulsePulse / 2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }

    // 2. Draw homing missile lines
    for (let i = 0; i < this.playerMissiles.length; i++) {
      const pm = this.playerMissiles[i];
      ctx.save();
      if (!(window as any).gameDisableShadows) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ffcc';
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(Math.round(pm.x), Math.round(pm.y), pm.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Draw active Boss projectiles
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      if (!(window as any).gameDisableShadows) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.glowColor;
      }
      
      const pGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, p.radius);
      pGrad.addColorStop(0, '#ffffff');
      pGrad.addColorStop(0.6, p.color);
      pGrad.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Draw Boss body itself
    ctx.save();
    ctx.translate(Math.round(this.bossX), Math.round(this.bossY));
    


    // Flip horizontally so the boss head/beak faces left towards the bird/squad
    ctx.scale(-1, 1);

    // Entry warning glow
    if (this.state === 'entering') {
      if (!(window as any).gameDisableShadows) {
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ff003c';
      }
    }

    if (this.worldId === 'volcano') {
      this.drawLavaBoss(ctx);
    } else if (this.worldId === 'ice') {
      this.drawIceBoss(ctx);
    } else if (this.worldId === 'desert') {
      this.drawDesertBoss(ctx);
    } else if (this.worldId === 'space') {
      this.drawSpaceBoss(ctx);
    } else if (this.worldId === 'underwater') {
      this.drawWaterBoss(ctx);
    } else if (this.worldId === 'heaven') {
      this.drawHeavenBoss(ctx);
    } else if (this.worldId === 'retro') {
      this.drawRetroBoss(ctx);
    } else {
      this.drawJungleBoss(ctx);
    }

    ctx.restore();
  }

  private drawRetroBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ff003c';
    }

    // Crimson pixel blocky cyber-demon body
    ctx.fillStyle = '#c2185b';
    ctx.strokeStyle = '#2d0012';
    ctx.lineWidth = 3.5;

    // Draw a jagged, pixelated monstrous head shape
    ctx.beginPath();
    ctx.moveTo(10, -35);
    ctx.lineTo(25, -35); // top pixel spike
    ctx.lineTo(25, -20);
    ctx.lineTo(40, -20); // face front
    ctx.lineTo(40, 15);
    ctx.lineTo(20, 15);  // lower jaw joint
    ctx.lineTo(35, 30);  // chin spike
    ctx.lineTo(5, 30);
    ctx.lineTo(-10, 45); // tail pixel spikes
    ctx.lineTo(-25, 20);
    ctx.lineTo(-45, 10); // back pixel horn
    ctx.lineTo(-25, -10);
    ctx.lineTo(-35, -30); // top back pixel spike
    ctx.lineTo(-10, -20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Angry digital slit eyes
    ctx.fillStyle = '#ffeb3b';
    ctx.fillRect(12, -22, 18, 6);
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(16, -21, 6, 4);

    // Gaping blocky jaw with glowing teeth
    ctx.fillStyle = '#2d0012';
    ctx.fillRect(20, -5, 25, 18); // Mouth void
    // Cyber teeth (green pixel fangs)
    ctx.fillStyle = '#00e676';
    ctx.fillRect(24, -5, 4, 6);
    ctx.fillRect(34, -5, 4, 6);
    ctx.fillRect(28, 7, 4, 6);

    // Pixelated glitch wing
    ctx.save();
    ctx.translate(-20, 0);
    const flap = Math.sin(this.timer * 4.5) * 0.4;
    ctx.rotate(flap);
    ctx.fillStyle = '#ff1744';
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 2.5;
    // Wing outline drawn as blocky steps
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-20, -30);
    ctx.lineTo(-40, -30);
    ctx.lineTo(-40, -10);
    ctx.lineTo(-60, -10);
    ctx.lineTo(-60, 10);
    ctx.lineTo(-30, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawLavaBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#ff3d00';
    }

    // Scorched obsidian rock body
    ctx.fillStyle = '#1b0a0a';
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 4.0;

    // Draw jagged volcanic dragon head
    ctx.beginPath();
    ctx.moveTo(35, -25);
    ctx.lineTo(48, -5);   // snout
    ctx.lineTo(38, 15);
    ctx.lineTo(15, 35);
    ctx.lineTo(-10, 48);  // jaw horn
    ctx.lineTo(-12, 25);
    ctx.lineTo(-45, 15);  // back body spike
    ctx.lineTo(-30, -8);
    ctx.lineTo(-55, -35); // main volcanic horn
    ctx.lineTo(-18, -25);
    ctx.lineTo(8, -45);   // forehead crest
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lava cracks/veins flowing through the body
    ctx.strokeStyle = '#ff9100';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-25, 5);
    ctx.lineTo(-10, -15);
    ctx.lineTo(15, -5);
    ctx.moveTo(-15, 20);
    ctx.lineTo(5, 10);
    ctx.stroke();

    // Glowing magma beak/jaws (open mouth showing molten core)
    ctx.fillStyle = '#ffd600';
    ctx.strokeStyle = '#ff3d00';
    ctx.lineWidth = 2.0;
    // Upper beak
    ctx.beginPath();
    ctx.moveTo(36, -12);
    ctx.quadraticCurveTo(65, -5, 68, 10); // long sharp hook
    ctx.quadraticCurveTo(45, 12, 33, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Lower beak
    ctx.beginPath();
    ctx.moveTo(30, 4);
    ctx.lineTo(52, 16);
    ctx.lineTo(32, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Molten mouth cavity with jagged fire fangs
    ctx.fillStyle = '#ff3d00';
    ctx.beginPath();
    ctx.moveTo(33, 2);
    ctx.lineTo(46, 8);
    ctx.lineTo(31, 11);
    ctx.closePath();
    ctx.fill();
    // Sharp white-hot fangs
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(36, 3);
    ctx.lineTo(38, 7);
    ctx.lineTo(40, 3);
    ctx.moveTo(42, 4);
    ctx.lineTo(44, 8);
    ctx.lineTo(46, 4);
    ctx.fill();

    // Blazing lava wings (spiky, demonic shape)
    ctx.save();
    ctx.translate(-25, 0);
    const flap = Math.sin(this.timer * 4.0) * 0.45;
    ctx.rotate(flap);
    // Draw dual wing layer
    ctx.fillStyle = '#ff3d00';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-65, -60, -95, -20, -90, 15);
    ctx.lineTo(-75, 5);
    ctx.lineTo(-65, 20);
    ctx.lineTo(-50, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Glowing magma eye (slanted and menacing)
    ctx.save();
    ctx.translate(18, -14);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawJungleBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00ff66'; // Glowing poison green aura
    }

    // Ancient golden statue bird - Aggressive head armor shape
    const bodyGrad = ctx.createLinearGradient(-45, -45, 45, 45);
    bodyGrad.addColorStop(0, '#ffd700'); // Shiny gold
    bodyGrad.addColorStop(0.5, '#c59b27'); // Bronze gold
    bodyGrad.addColorStop(1, '#5d4003'); // Dark gold-brown

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#271902';
    ctx.lineWidth = 3.5;

    // Draw aggressive armored beast head (shield-like with cheek spikes)
    ctx.beginPath();
    ctx.moveTo(35, -25);
    ctx.lineTo(45, -5); // Front snout
    ctx.lineTo(35, 15);
    ctx.lineTo(15, 30);
    ctx.lineTo(-10, 45);  // Lower cheek spike
    ctx.lineTo(-15, 20);
    ctx.lineTo(-40, 15);  // Back spike
    ctx.lineTo(-30, -10);
    ctx.lineTo(-45, -35); // Upper back horn
    ctx.lineTo(-15, -30);
    ctx.lineTo(10, -42);  // Forehead
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Giant crown feathers (spiky, sharp blade feathers)
    ctx.fillStyle = '#ffaa00';
    ctx.strokeStyle = '#3a2503';
    ctx.lineWidth = 2.0;
    
    // Feather Spike 1
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.quadraticCurveTo(-15, -65, -10, -75);
    ctx.quadraticCurveTo(5, -60, 10, -41);
    ctx.fill();
    ctx.stroke();

    // Feather Spike 2 (Rear)
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(-15, -33);
    ctx.quadraticCurveTo(-35, -58, -32, -68);
    ctx.quadraticCurveTo(-15, -50, -5, -35);
    ctx.fill();
    ctx.stroke();

    // Feather Spike 3 (Front)
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(15, -35);
    ctx.quadraticCurveTo(25, -55, 32, -62);
    ctx.quadraticCurveTo(25, -45, 22, -32);
    ctx.fill();
    ctx.stroke();

    // Roaring predator beak/jaws (Aggressive curved shape)
    const beakGrad = ctx.createLinearGradient(15, -15, 60, 15);
    beakGrad.addColorStop(0, '#ffd700');
    beakGrad.addColorStop(1, '#ff6600'); // Orange beak tips for venom/heat
    ctx.fillStyle = beakGrad;
    ctx.strokeStyle = '#271902';
    ctx.lineWidth = 2.5;

    // Upper beak (Curved down aggressively)
    ctx.beginPath();
    ctx.moveTo(35, -12);
    ctx.quadraticCurveTo(62, -5, 65, 8); // Sharp hook
    ctx.quadraticCurveTo(45, 12, 33, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lower beak (Slightly open mouth to look like a roaring beast)
    ctx.beginPath();
    ctx.moveTo(30, 2);
    ctx.lineTo(48, 14);
    ctx.lineTo(32, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Roaring mouth cavity (dark void with sharp teeth)
    ctx.fillStyle = '#1a0005';
    ctx.beginPath();
    ctx.moveTo(33, 2);
    ctx.lineTo(44, 8);
    ctx.lineTo(30, 10);
    ctx.closePath();
    ctx.fill();
    
    // Sharp fangs inside mouth
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(35, 3);
    ctx.lineTo(37, 6);
    ctx.lineTo(39, 3);
    ctx.moveTo(41, 4);
    ctx.lineTo(43, 7);
    ctx.lineTo(45, 4);
    ctx.fill();

    // Majestic bladed wings (Dual layers of sharp gold/bronze blades)
    // Wing Layer 1 (Back layer, darker)
    ctx.save();
    ctx.translate(-20, -5);
    const flapOuter = Math.sin(this.timer * 3.5) * 0.42;
    ctx.rotate(flapOuter + 0.2);
    ctx.fillStyle = '#b8860b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-65, -55, -95, -15);
    ctx.quadraticCurveTo(-60, 35, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Wing Layer 2 (Front layer, bright gold with individual blade feather cuts)
    ctx.save();
    ctx.translate(-15, 0);
    const flapInner = Math.sin(this.timer * 3.5) * 0.38;
    ctx.rotate(flapInner);
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-50, -50, -85, -15, -75, 20);
    ctx.lineTo(-62, 5);  // Blade cut 1
    ctx.lineTo(-55, 15); // Blade cut 2
    ctx.lineTo(-42, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Glowing green jewel eyes (Slanted, angry reptilian look)
    ctx.fillStyle = '#00ff66';
    ctx.strokeStyle = '#004d1a';
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.translate(18, -12);
    ctx.rotate(-Math.PI / 8); // Slant the eye
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Slit pupil (Reptilian pupil)
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.5, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Angry eyebrow ridge
    ctx.strokeStyle = '#271902';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(8, -19);
    ctx.lineTo(26, -15);
    ctx.stroke();
  }



  // Visual themed boss vector graphics for remaining worlds (Visual Weather & Aura Pack)
  private drawIceBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00e5ff';
    }

    // Ice crystals plates body (frost titan core)
    ctx.fillStyle = '#0a1d37';
    ctx.strokeStyle = '#80d8ff';
    ctx.lineWidth = 3.5;
    
    // Jagged 8-point ice shield
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const radius = i % 2 === 0 ? 46 : 30;
      // Add small offsets to make it look cracked/natural ice
      const offset = Math.sin(this.timer * 4 + i) * 2;
      ctx.lineTo(Math.cos(angle) * (radius + offset), Math.sin(angle) * (radius + offset));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glacial fangs beak (gaping mouth with icy fangs)
    ctx.fillStyle = '#e0f7fa';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.0;
    
    // Upper beak (curved, sharp icicle)
    ctx.beginPath();
    ctx.moveTo(30, -12);
    ctx.quadraticCurveTo(56, -8, 58, 4); // hooked down
    ctx.quadraticCurveTo(42, 6, 28, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lower beak
    ctx.beginPath();
    ctx.moveTo(25, 3);
    ctx.lineTo(44, 13);
    ctx.lineTo(26, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Frozen mouth cavity with icicle fangs
    ctx.fillStyle = '#0a1d37';
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(40, 5);
    ctx.lineTo(26, 7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(30, 1);
    ctx.lineTo(32, 4);
    ctx.lineTo(34, 1);
    ctx.moveTo(36, 2);
    ctx.lineTo(38, 5);
    ctx.lineTo(40, 2);
    ctx.fill();

    // Swirling ice shard wings (bladed ice shards)
    ctx.save();
    ctx.translate(-20, -5);
    const flap = Math.sin(this.timer * 3.6) * 0.40;
    ctx.rotate(flap);
    ctx.fillStyle = '#00b0ff';
    ctx.strokeStyle = '#e0f7fa';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-45, -50);
    ctx.lineTo(-70, -35);
    ctx.lineTo(-50, -10);
    ctx.lineTo(-75, 10);
    ctx.lineTo(-30, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Sub-zero glowing cyan slit eye
    ctx.save();
    ctx.translate(18, -12);
    ctx.rotate(-Math.PI / 8);
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDesertBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ffab40';
    }

    // Ancient sandstone pharaoh mask core
    ctx.fillStyle = '#3e2723';
    ctx.strokeStyle = '#ffe082';
    ctx.lineWidth = 3.5;

    // Draw sandstone skull/pharaoh head shape
    ctx.beginPath();
    ctx.moveTo(25, -30);
    ctx.lineTo(35, -10);
    ctx.lineTo(25, 15);
    ctx.lineTo(10, 32);  // pharaoh chin beard start
    ctx.lineTo(15, 48);  // chin beard tip
    ctx.lineTo(2, 35);
    ctx.lineTo(-20, 30);
    ctx.lineTo(-38, 15);
    ctx.lineTo(-30, -15);
    ctx.lineTo(-45, -35); // crown side spike left
    ctx.lineTo(-10, -25);
    ctx.lineTo(5, -45);   // crown central peak
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pharaoh crown stripes (gold & dark brown)
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, -25);
    ctx.lineTo(-18, 10);
    ctx.moveTo(5, -28);
    ctx.lineTo(0, 20);
    ctx.moveTo(18, -20);
    ctx.lineTo(12, 15);
    ctx.stroke();

    // Pharaoh chin beard gold bands
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(8, 33, 7, 3);
    ctx.fillRect(10, 39, 6, 3);

    // Gaping pharaoh jaw
    ctx.fillStyle = '#3e2723';
    ctx.strokeStyle = '#ffe082';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(22, -8);
    ctx.lineTo(48, 2);
    ctx.lineTo(24, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gaping teeth
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(26, -5);
    ctx.lineTo(28, -2);
    ctx.lineTo(30, -5);
    ctx.moveTo(32, -4);
    ctx.lineTo(34, -1);
    ctx.lineTo(36, -4);
    ctx.fill();

    // Outer orbiting scythe blades (spinning sand blades)
    ctx.fillStyle = '#ffe082';
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.rotate(this.timer * 1.5);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      // Draw a curved sand scythe blade
      ctx.moveTo(55, -4);
      ctx.quadraticCurveTo(72, -15, 78, 5);
      ctx.quadraticCurveTo(62, 10, 55, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Sandstone golden eagle wings with blade cuts
    ctx.save();
    ctx.translate(-22, 0);
    const flap = Math.sin(this.timer * 3.0) * 0.35;
    ctx.rotate(flap);
    ctx.fillStyle = '#bcaaa4';
    ctx.strokeStyle = '#ffe082';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-50, -50, -85, -20, -75, 20);
    ctx.lineTo(-60, 5);  // Blade cut 1
    ctx.lineTo(-50, 15); // Blade cut 2
    ctx.lineTo(-40, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Cursed glowing purple sun gem eye
    ctx.save();
    ctx.translate(14, -14);
    ctx.rotate(-Math.PI / 8);
    ctx.fillStyle = '#d500f9';
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawSpaceBoss(ctx: CanvasRenderingContext2D) {
    // Swirling dark matter gravitational singular core
    const spaceGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 48);
    spaceGrad.addColorStop(0, '#ffffff');
    spaceGrad.addColorStop(0.3, '#d500f9');
    spaceGrad.addColorStop(0.7, '#311b92');
    spaceGrad.addColorStop(1, 'rgba(0,0,0,0.1)');

    ctx.fillStyle = spaceGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();

    // Space stardust orbit particles & spikes
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e040fb';
    ctx.lineWidth = 1.5;
    ctx.save();
    ctx.rotate(-this.timer * 1.5);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      // Orbiting stardust
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 36, Math.sin(angle) * 36, 2, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting spatial tear spikes
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 44, Math.sin(angle) * 44);
      ctx.lineTo(Math.cos(angle) * 58, Math.sin(angle) * 58);
      ctx.lineTo(Math.cos(angle + 0.15) * 42, Math.sin(angle + 0.15) * 42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Void portal mouth/jaws (opening of the void)
    ctx.fillStyle = '#120024';
    ctx.strokeStyle = '#d500f9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(25, -12);
    ctx.quadraticCurveTo(55, -15, 62, 5); // portal beak tip
    ctx.quadraticCurveTo(35, 18, 22, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gaping cosmic void fangs
    ctx.fillStyle = '#00e676'; // Neon green void teeth
    ctx.beginPath();
    ctx.moveTo(28, -6);
    ctx.lineTo(31, -1);
    ctx.lineTo(33, -6);
    ctx.moveTo(35, -5);
    ctx.lineTo(38, -0);
    ctx.lineTo(40, -5);
    ctx.fill();

    // Cosmic void portal wings (scythe portal wings)
    ctx.save();
    ctx.translate(-15, 0);
    const flap = Math.sin(this.timer * 3.8) * 0.45;
    ctx.rotate(flap);
    ctx.strokeStyle = '#e040fb';
    ctx.fillStyle = 'rgba(49, 27, 146, 0.6)';
    ctx.lineWidth = 3.0;
    
    // Draw a scythe shaped portal wing
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-60, -65, -95, -35);
    ctx.quadraticCurveTo(-55, 10, -25, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw smaller sub-wing layer
    ctx.strokeStyle = '#d500f9';
    ctx.beginPath();
    ctx.moveTo(-10, 5);
    ctx.quadraticCurveTo(-50, -25, -75, -5);
    ctx.stroke();
    ctx.restore();

    // Multiple glowing neon purple eyes
    ctx.fillStyle = '#e040fb';
    ctx.beginPath();
    ctx.arc(16, -14, 4, 0, Math.PI * 2);
    ctx.arc(24, -8, 3, 0, Math.PI * 2);
    ctx.arc(8, -18, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupils
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(16, -14, 1.5, 0, Math.PI * 2);
    ctx.arc(24, -8, 1.0, 0, Math.PI * 2);
    ctx.arc(8, -18, 1.0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawWaterBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ff1744'; // Red alarm laser glow
    }

    // Abyssal deep sea mecha steel hull (armored plates)
    ctx.fillStyle = '#101726';
    ctx.strokeStyle = '#00b0ff';
    ctx.lineWidth = 3.5;

    // Draw armored elliptical sub-hull with mechanical rear spikes
    ctx.beginPath();
    ctx.moveTo(35, -20);
    ctx.lineTo(45, 0);
    ctx.lineTo(35, 20);
    ctx.lineTo(15, 30);
    ctx.lineTo(-20, 32);
    ctx.lineTo(-40, 42);  // rear lower engine spike
    ctx.lineTo(-30, 15);
    ctx.lineTo(-48, 0);   // middle exhaust spike
    ctx.lineTo(-30, -15);
    ctx.lineTo(-40, -42); // rear upper engine spike
    ctx.lineTo(-20, -32);
    ctx.lineTo(15, -30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Steel plate rivets
    ctx.fillStyle = '#00b0ff';
    ctx.beginPath();
    ctx.arc(-15, -15, 2.5, 0, Math.PI * 2);
    ctx.arc(-5, -20, 2.5, 0, Math.PI * 2);
    ctx.arc(-15, 15, 2.5, 0, Math.PI * 2);
    ctx.arc(-5, 20, 2.5, 0, Math.PI * 2);
    ctx.arc(-25, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Red laser fangs jaws
    ctx.fillStyle = '#1c2d42';
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 2.0;
    
    // Upper jaw
    ctx.beginPath();
    ctx.moveTo(32, -12);
    ctx.lineTo(55, -2);
    ctx.lineTo(32, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Lower jaw
    ctx.beginPath();
    ctx.moveTo(30, 5);
    ctx.lineTo(48, 13);
    ctx.lineTo(30, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red laser teeth fangs
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.moveTo(35, -8);
    ctx.lineTo(37, -3);
    ctx.lineTo(39, -8);
    ctx.moveTo(43, -7);
    ctx.lineTo(45, -2);
    ctx.lineTo(47, -7);
    ctx.fill();

    // Heavy water fins (bladed edge fins)
    for (let dir = -1; dir <= 1; dir += 2) {
      ctx.save();
      ctx.translate(-15, dir * 18);
      const flap = Math.sin(this.timer * 3.8 + dir) * 0.42;
      ctx.rotate(flap);
      ctx.fillStyle = '#0d47a1';
      ctx.strokeStyle = '#00b0ff';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      // Bladed fin steps
      ctx.lineTo(-45, -dir * 35);
      ctx.lineTo(-65, -dir * 15);
      ctx.lineTo(-48, -dir * 5);
      ctx.lineTo(-58, dir * 10);
      ctx.lineTo(-30, dir * 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Glowing bio-luminescent deep sea angler red laser scanner
    ctx.save();
    ctx.strokeStyle = '#ff1744';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Angler wire (curved forward)
    ctx.moveTo(25, -20);
    ctx.quadraticCurveTo(45, -35, 38, -48);
    ctx.stroke();
    // Laser scanner bulb
    ctx.fillStyle = '#ff1744';
    ctx.beginPath();
    ctx.arc(38, -48, 6, 0, Math.PI * 2);
    ctx.fill();
    // Inner white laser core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(38, -48, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Glowing scanner red visor eye (tactical/intimidating)
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(14, -12, 16, 5);
  }

  private drawHeavenBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#ffd600';
    }

    // Celestial angel white/gold mask (judgment visage)
    const heavenGrad = ctx.createLinearGradient(-35, -35, 35, 35);
    heavenGrad.addColorStop(0, '#ffffff');
    heavenGrad.addColorStop(0.5, '#fffde7');
    heavenGrad.addColorStop(1, '#fff9c4');

    ctx.fillStyle = heavenGrad;
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 3.5;

    // Draw sharp angelic helmet/visage mask
    ctx.beginPath();
    ctx.moveTo(20, -32);
    ctx.lineTo(35, -15);
    ctx.lineTo(20, 15);
    ctx.lineTo(8, 35);   // visor bottom
    ctx.lineTo(-8, 35);
    ctx.lineTo(-20, 15);
    ctx.lineTo(-35, -15); // back plate
    ctx.lineTo(-20, -32);
    ctx.lineTo(0, -48);   // central crown spike
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gold filigree visor border lines
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-20, -15);
    ctx.lineTo(0, -28);
    ctx.lineTo(20, -15);
    ctx.moveTo(-15, 10);
    ctx.lineTo(0, 20);
    ctx.lineTo(15, 10);
    ctx.stroke();

    // Gaping divine beak/jaws (golden judgment beak)
    ctx.fillStyle = '#ffea00';
    ctx.strokeStyle = '#ffb300';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(22, -10);
    ctx.quadraticCurveTo(52, -6, 56, 6);
    ctx.quadraticCurveTo(34, 10, 20, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Divine glowing saw-blade halos (spinning golden saw-blades)
    ctx.save();
    ctx.rotate(this.timer * 1.8);
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.stroke();
    // Saw teeth
    ctx.fillStyle = '#ffea00';
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 52, Math.sin(angle) * 52);
      ctx.lineTo(Math.cos(angle + 0.1) * 58, Math.sin(angle + 0.1) * 58);
      ctx.lineTo(Math.cos(angle + 0.15) * 50, Math.sin(angle + 0.15) * 50);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Multiple layered seraphim golden scythe wings
    ctx.fillStyle = 'rgba(255, 235, 59, 0.75)';
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 1.8;
    for (let w = 0; w < 3; w++) {
      ctx.save();
      ctx.translate(-18, -2);
      const flap = Math.sin(this.timer * 3.5 + w * 0.42) * 0.40;
      ctx.rotate(flap - w * 0.3);
      // Sharp feathered scythe wing shape
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-50, -55 - w * 8, -85, -25 - w * 5, -70, 20);
      ctx.lineTo(-12, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Giant central glowing Judge Eye
    ctx.save();
    ctx.translate(12, -10);
    ctx.rotate(-Math.PI / 8);
    // Outer glow
    ctx.fillStyle = '#ffea00';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner red slit pupil (ominous divine gaze)
    ctx.fillStyle = '#d500f9';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 1.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
