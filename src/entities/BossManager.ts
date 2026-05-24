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
  private health = 100;
  private maxHealth = 100;
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
    this.health = 100 + (worldId === 'volcano' ? 50 : 0); // Lava Dragon is tougher
    this.maxHealth = this.health;
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
      this.bossX += (width - 150 - this.bossX) * 0.04 * dtCoeff;
      if (Math.abs(this.bossX - (width - 150)) < 10) {
        this.state = 'fighting';
        this.timer = 0;
      }
    } else if (this.state === 'fighting') {
      // Hover vertically following bird with delay
      this.targetBossY = birdY;
      this.bossY += (this.targetBossY - this.bossY) * 0.03 * dtCoeff;

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
        this.health -= 25;
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
    const dist = Math.sqrt(dx * dx + dy * dy);

    const baseSpeed = 5.2;
    const vx = (dx / dist) * baseSpeed;
    const vy = (dy / dist) * baseSpeed;

    soundManager.playZap();

    switch (this.worldId) {
      case 'jungle': {
        // Fires 3 green vine barbs in a narrow horizontal spread
        for (let i = -1; i <= 1; i++) {
          const spreadAngle = 0.16 * i;
          const rx = vx * Math.cos(spreadAngle) - vy * Math.sin(spreadAngle);
          const ry = vx * Math.sin(spreadAngle) + vy * Math.cos(spreadAngle);
          this.projectiles.push({
            x: this.bossX - 40,
            y: this.bossY,
            vx: rx * 0.95,
            vy: ry * 0.95,
            radius: 6.5,
            color: '#00ff66',
            glowColor: '#00ff66'
          });
        }
        break;
      }
      case 'jungle_temple': {
        for (let i = -1; i <= 1; i++) {
          const spreadAngle = 0.20 * i;
          const rx = vx * Math.cos(spreadAngle) - vy * Math.sin(spreadAngle);
          const ry = vx * Math.sin(spreadAngle) + vy * Math.cos(spreadAngle);
          this.projectiles.push({
            x: this.bossX - 40,
            y: this.bossY,
            vx: rx * 0.90,
            vy: ry * 0.90,
            radius: 8.0,
            color: '#ffd700',
            glowColor: '#ffaa00'
          });
        }
        break;
      }

      case 'cyberpunk': {
        // Dual rapid neon bolts tracking bird
        for (let i = -1; i <= 1; i += 2) {
          this.projectiles.push({
            x: this.bossX - 30,
            y: this.bossY + i * 15,
            vx: vx * 1.3,
            vy: vy * 1.3 + (Math.random() - 0.5) * 0.8,
            radius: 7,
            color: '#00f3ff',
            glowColor: '#00f3ff'
          });
        }
        break;
      }

      case 'ice': {
        // Sub-zero frost shards spread
        for (let i = -2; i <= 2; i++) {
          const angle = Math.atan2(dy, dx) + i * 0.18;
          const speed = baseSpeed * 1.05;
          this.projectiles.push({
            x: this.bossX - 40,
            y: this.bossY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 6,
            color: '#80d8ff',
            glowColor: '#80d8ff'
          });
        }
        break;
      }

      case 'desert': {
        // Obelisk Sand rings sweeping outwards
        const baseAngle = Math.atan2(dy, dx);
        for (let i = -1; i <= 1; i++) {
          const angle = baseAngle + i * 0.3;
          this.projectiles.push({
            x: this.bossX - 45,
            y: this.bossY,
            vx: Math.cos(angle) * baseSpeed * 0.85,
            vy: Math.sin(angle) * baseSpeed * 0.85,
            radius: 8,
            color: '#ffd54f',
            glowColor: '#ffb300'
          });
        }
        break;
      }

      case 'volcano': {
        // Heavy volcanic lava rocks lobbed upwards to arc down
        this.projectiles.push({
          x: this.bossX - 40,
          y: this.bossY,
          vx: -5.5 - Math.random() * 2,
          vy: -4.5 + Math.random() * 3, // Initial upward velocity
          radius: 12,
          color: '#ff3d00',
          glowColor: '#ff9100'
        });
        break;
      }

      case 'space': {
        // Gravity portals - heavy vortex pulses
        this.projectiles.push({
          x: this.bossX - 50,
          y: this.bossY,
          vx: vx * 0.9,
          vy: vy * 0.9,
          radius: 14,
          color: '#d500f9',
          glowColor: '#e040fb'
        });
        break;
      }

      case 'underwater': {
        // Deep-sea mine torpedoes - slow, massive collision threat
        this.projectiles.push({
          x: this.bossX - 40,
          y: this.bossY,
          vx: vx * 0.65,
          vy: vy * 0.65,
          radius: 13,
          color: '#2979ff',
          glowColor: '#2979ff'
        });
        break;
      }

      case 'heaven': {
        // Golden plasma rays fanning out
        for (let i = -1; i <= 1; i++) {
          const angle = Math.atan2(dy, dx) + i * 0.25;
          this.projectiles.push({
            x: this.bossX - 40,
            y: this.bossY,
            vx: Math.cos(angle) * baseSpeed * 1.15,
            vy: Math.sin(angle) * baseSpeed * 1.15,
            radius: 8,
            color: '#ffea00',
            glowColor: '#ffd600'
          });
        }
        break;
      }

      default: {
        this.projectiles.push({
          x: this.bossX - 40,
          y: this.bossY,
          vx,
          vy,
          radius: 8,
          color: '#9400d3',
          glowColor: '#ff00ff'
        });
        break;
      }
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
    
    // Slight hovering oscillation
    const hoverOffset = Math.sin(this.timer * 2.5) * 8;
    ctx.translate(0, Math.round(hoverOffset));

    // Entry warning glow
    if (this.state === 'entering') {
      if (!(window as any).gameDisableShadows) {
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ff003c';
      }
    }

    if (this.worldId === 'cyberpunk') {
      this.drawCyberBoss(ctx);
    } else if (this.worldId === 'jungle_temple') {
      this.drawJungleTempleBoss(ctx);
    } else if (this.worldId === 'volcano') {
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
    // A simple clean solid red retro blocky bird boss
    ctx.fillStyle = '#ff3333';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.0;

    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Large pixel-style eye
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(10, -20, 16, 16);
    ctx.strokeRect(10, -20, 16, 16);
    ctx.fillStyle = '#000000';
    ctx.fillRect(16, -14, 8, 8);

    // Simple flat yellow beak
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(25, -8);
    ctx.lineTo(55, 0);
    ctx.lineTo(25, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Simple flat wing
    ctx.save();
    ctx.translate(-15, 0);
    const flap = Math.sin(this.timer * 3) * 0.35;
    ctx.rotate(flap);
    ctx.fillStyle = '#cc1111';
    ctx.fillRect(-35, -15, 40, 30);
    ctx.strokeRect(-35, -15, 40, 30);
    ctx.restore();
  }

  private drawCyberBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00f3ff';
    }

    // Core chassis body frame
    ctx.fillStyle = '#22222a';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 3.0;

    ctx.beginPath();
    ctx.moveTo(35, -20);
    ctx.lineTo(15, -45);
    ctx.lineTo(-45, -30);
    ctx.lineTo(-35, 30);
    ctx.lineTo(15, 45);
    ctx.lineTo(35, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cyber robotic mechanical wing drawing
    ctx.save();
    ctx.translate(-20, -10);
    const flap = Math.sin(this.timer * 4) * 0.4;
    ctx.rotate(flap);
    
    ctx.fillStyle = '#111116';
    ctx.strokeStyle = '#ff007f';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-50, -45);
    ctx.lineTo(-80, -35);
    ctx.lineTo(-45, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Giant digital laser cannon beak
    ctx.fillStyle = '#ffaa00';
    ctx.beginPath();
    ctx.moveTo(25, -12);
    ctx.lineTo(55, 0);
    ctx.lineTo(25, 12);
    ctx.closePath();
    ctx.fill();

    // Glowing cyber eye visor
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(20, -12, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawLavaBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff4500';
    }

    // Scorched charcoal obsidian skin
    ctx.fillStyle = '#150606';
    ctx.strokeStyle = '#ff4500';
    ctx.lineWidth = 3.5;

    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fiery dragon spikes
    ctx.fillStyle = '#ff4500';
    ctx.beginPath();
    ctx.moveTo(-35, -35);
    ctx.lineTo(-58, -58);
    ctx.lineTo(-20, -40);
    ctx.moveTo(-45, 0);
    ctx.lineTo(-68, 0);
    ctx.lineTo(-45, 15);
    ctx.fill();

    // Large glowing lava beak jaws
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.moveTo(35, -15);
    ctx.lineTo(65, 0);
    ctx.lineTo(35, 15);
    ctx.closePath();
    ctx.fill();

    // Blazing lava wings
    ctx.save();
    ctx.translate(-25, 0);
    const flap = Math.sin(this.timer * 3) * 0.35;
    ctx.rotate(flap);
    ctx.fillStyle = '#ff3c00';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-60, -70, -85, -40);
    ctx.quadraticCurveTo(-45, 20, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Molten golden eye
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(20, -14, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawJungleBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#ffd700';
    }

    // Ancient golden statue bird
    const bodyGrad = ctx.createLinearGradient(-40, -40, 40, 40);
    bodyGrad.addColorStop(0, '#ffd700');
    bodyGrad.addColorStop(0.5, '#daa520');
    bodyGrad.addColorStop(1, '#8b6508');

    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#3a2503';
    ctx.lineWidth = 3.0;

    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Giant crown feathers
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(10, -40);
    ctx.lineTo(15, -60);
    ctx.lineTo(25, -42);
    ctx.fill();
    ctx.stroke();

    // Giant majestic golden wing
    ctx.save();
    ctx.translate(-15, 0);
    const flap = Math.sin(this.timer * 3.5) * 0.38;
    ctx.rotate(flap);
    ctx.fillStyle = '#daa520';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-50, -50, -80, -10, -70, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Glowing green jewel eyes
    ctx.fillStyle = '#00ff66';
    ctx.beginPath();
    ctx.arc(18, -10, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawJungleTempleBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ffd700';
    }

    ctx.fillStyle = '#d4af37';
    ctx.strokeStyle = '#3a2503';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const numRays = 8;
    for (let i = 0; i < numRays; i++) {
      const angle = (Math.PI / (numRays - 1)) * i - Math.PI;
      const rxOuter = Math.cos(angle) * 65;
      const ryOuter = Math.sin(angle) * 65;
      const rxInner1 = Math.cos(angle - 0.25) * 35;
      const ryInner1 = Math.sin(angle - 0.25) * 35;
      const rxInner2 = Math.cos(angle + 0.25) * 35;
      const ryInner2 = Math.sin(angle + 0.25) * 35;

      ctx.moveTo(rxInner1, ryInner1);
      ctx.lineTo(rxOuter, ryOuter);
      ctx.lineTo(rxInner2, ryInner2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const stoneGrad = ctx.createLinearGradient(-35, -35, 35, 35);
    stoneGrad.addColorStop(0, '#5a6b5c');
    stoneGrad.addColorStop(0.6, '#3a473b');
    stoneGrad.addColorStop(1, '#1b241e');

    ctx.fillStyle = stoneGrad;
    ctx.strokeStyle = '#0e120f';
    ctx.lineWidth = 3.0;

    ctx.beginPath();
    ctx.moveTo(-25, -45);
    ctx.lineTo(25, -45);
    ctx.lineTo(40, -15);
    ctx.lineTo(35, 25);
    ctx.lineTo(0, 48);
    ctx.lineTo(-35, 25);
    ctx.lineTo(-40, -15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(34, 139, 34, 0.45)';
    ctx.beginPath();
    ctx.moveTo(-25, -43);
    ctx.lineTo(25, -43);
    ctx.lineTo(35, -20);
    ctx.lineTo(-35, -20);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#0e120f';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-15, 10);
    ctx.lineTo(-28, 18);
    ctx.lineTo(-32, 5);
    ctx.moveTo(10, -25);
    ctx.lineTo(28, -35);
    ctx.stroke();

    ctx.fillStyle = '#ff9900';
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff5500';
    }
    ctx.beginPath();
    ctx.arc(-16, -12, 6, 0, Math.PI * 2);
    ctx.arc(16, -12, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#0e120f';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = '#4c574d';
    
    const numDebris = 3;
    for (let i = 0; i < numDebris; i++) {
      const angle = this.timer * 2.8 + (i * (Math.PI * 2 / numDebris));
      const dx = Math.cos(angle) * 78;
      const dy = Math.sin(angle) * 40;
      
      ctx.beginPath();
      ctx.rect(dx - 5, dy - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Visual themed boss vector graphics for remaining worlds (Visual Weather & Aura Pack)
  private drawIceBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00e5ff';
    }

    // Ice crystals plates body
    ctx.fillStyle = '#102542';
    ctx.strokeStyle = '#80d8ff';
    ctx.lineWidth = 3.0;
    
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const radius = i % 2 === 0 ? 46 : 32;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glacial fangs beak
    ctx.fillStyle = '#e0f7fa';
    ctx.beginPath();
    ctx.moveTo(25, -12);
    ctx.lineTo(55, -2);
    ctx.lineTo(35, 4);
    ctx.lineTo(48, 12);
    ctx.lineTo(25, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Swirling ice shard wings
    ctx.save();
    ctx.translate(-20, -5);
    const flap = Math.sin(this.timer * 3.2) * 0.35;
    ctx.rotate(flap);
    ctx.fillStyle = '#00b0ff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-40, -45);
    ctx.lineTo(-65, -35);
    ctx.lineTo(-30, 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Sub-zero glowing cyan eye
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(20, -12, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDesertBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#ffab40';
    }

    // Ancient sandstone sphinx plate core
    ctx.fillStyle = '#3e2723';
    ctx.strokeStyle = '#ffe082';
    ctx.lineWidth = 3.2;

    ctx.beginPath();
    ctx.rect(-35, -35, 70, 70);
    ctx.fill();
    ctx.stroke();

    // Outer orbiting obelisk sand pieces
    ctx.fillStyle = '#ffe082';
    ctx.save();
    ctx.rotate(this.timer * 0.8);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(55, -8);
      ctx.lineTo(68, 0);
      ctx.lineTo(55, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Sandstone golden eagle wings
    ctx.save();
    ctx.translate(-25, 0);
    const flap = Math.sin(this.timer * 2.8) * 0.32;
    ctx.rotate(flap);
    ctx.fillStyle = '#bcaaa4';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-60, -60, -80, -30);
    ctx.quadraticCurveTo(-40, 20, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Golden sun gem eye
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.arc(15, -15, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSpaceBoss(ctx: CanvasRenderingContext2D) {
    // Swirling dark matter gravitational singular core
    const spaceGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, 48);
    spaceGrad.addColorStop(0, '#ffffff');
    spaceGrad.addColorStop(0.3, '#d500f9');
    spaceGrad.addColorStop(0.7, '#311b92');
    spaceGrad.addColorStop(1, 'rgba(0,0,0,0.2)');

    ctx.fillStyle = spaceGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fill();

    // Space stardust orbit particles
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.rotate(-this.timer * 1.5);
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 36, Math.sin(angle) * 36, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Cosmic void portal wings
    ctx.save();
    ctx.translate(-15, 0);
    const flap = Math.sin(this.timer * 3.6) * 0.42;
    ctx.rotate(flap);
    ctx.strokeStyle = '#e040fb';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(-35, -20, 40, 15, -Math.PI / 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawWaterBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00b0ff';
    }

    // Abyssal deep sea mecha steel hull
    ctx.fillStyle = '#1a237e';
    ctx.strokeStyle = '#00b0ff';
    ctx.lineWidth = 3.0;

    ctx.beginPath();
    ctx.ellipse(0, 0, 48, 36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Dual flapping water fins
    for (let dir = -1; dir <= 1; dir += 2) {
      ctx.save();
      ctx.translate(-20, dir * 15);
      const flap = Math.sin(this.timer * 3.5 + dir) * 0.38;
      ctx.rotate(flap);
      ctx.fillStyle = '#0d47a1';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-45, -dir * 35, -60, -dir * 15);
      ctx.quadraticCurveTo(-30, dir * 10, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Glowing bio-luminescent deep sea angler lantern
    ctx.save();
    ctx.strokeStyle = '#00b0ff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(32, -18, 4, 0, Math.PI * 2);
    ctx.stroke();
    // Angler bulb
    ctx.fillStyle = '#40c4ff';
    ctx.beginPath();
    ctx.arc(38, -32, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawHeavenBoss(ctx: CanvasRenderingContext2D) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#ffd600';
    }

    // Celestial angel marble core
    const heavenGrad = ctx.createLinearGradient(-35, -35, 35, 35);
    heavenGrad.addColorStop(0, '#ffffff');
    heavenGrad.addColorStop(0.6, '#fff9c4');
    heavenGrad.addColorStop(1, '#ffeb3b');

    ctx.fillStyle = heavenGrad;
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 2.8;

    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Twin spinning halo rings surrounding the core
    ctx.save();
    ctx.rotate(this.timer * 0.6);
    ctx.strokeStyle = 'rgba(255, 214, 0, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, 52, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.rotate(-this.timer * 1.2);
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Multiple layered seraphim golden wings
    ctx.fillStyle = 'rgba(255, 235, 59, 0.8)';
    for (let w = 0; w < 3; w++) {
      ctx.save();
      ctx.translate(-15, 0);
      const flap = Math.sin(this.timer * 3.0 + w * 0.5) * 0.35;
      ctx.rotate(flap - w * 0.25);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-45, -45 - w * 10, -75, -20 - w * 5, -60, 20);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}
