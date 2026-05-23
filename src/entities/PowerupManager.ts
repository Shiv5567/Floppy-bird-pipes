import { ParticleEngine } from '../engine/ParticleEngine.ts';
import type { Obstacle } from './ObstacleManager.ts';

export type PowerupType = 'shield' | 'slowmo' | 'magnet' | 'double' | 'revive' | 'turbo' | 'ghost' | 'mini';

export interface PowerupItem {
  x: number;
  y: number;
  radius: number;
  type: PowerupType | 'coin' | 'gem';
  active: boolean;
  pulseTimer: number;
  initialY: number;
}

export class PowerupManager {
  private list: PowerupItem[] = [];

  constructor() {}

  public getList(): PowerupItem[] {
    return this.list;
  }

  public clear() {
    this.list = [];
  }

  public update(
    deltaTime: number,
    scrollSpeed: number,
    birdX: number,
    birdY: number,
    hasMagnet: boolean,
    width: number,
    height: number,
    timeScale: number,
    obstacles: Obstacle[]
  ) {
    const dtCoeff = deltaTime * 60 * timeScale;
    const actualScrollSpeed = scrollSpeed * dtCoeff;

    // 1. Update powerups positions & magnet attraction
    for (let i = this.list.length - 1; i >= 0; i--) {
      const item = this.list[i];

      // Float hovering animation via sine wave
      item.pulseTimer += deltaTime * 4 * timeScale;
      
      if (hasMagnet && (item.type === 'coin' || item.type === 'gem' || Math.random() < 0.2)) {
        // Pull items towards the bird!
        const dx = birdX - item.x;
        const dy = birdY - item.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 280) {
          const pullForce = 8 * dtCoeff;
          item.x += (dx / distance) * pullForce;
          item.y += (dy / distance) * pullForce;
        } else {
          item.x -= actualScrollSpeed;
          item.y = item.initialY + Math.sin(item.pulseTimer) * 12;
        }
      } else {
        item.x -= actualScrollSpeed;
        item.y = item.initialY + Math.sin(item.pulseTimer) * 12;
      }

      // Remove offscreen items
      if (item.x + item.radius < -50) {
        this.list.splice(i, 1);
      }
    }

    // 2. Guide-based Spawning: Centered inside upcoming obstacles gaps
    const unrewardedObstacle = obstacles.find(obs => !obs.hasSpawnedRewards && obs.x >= width - 150);
    if (unrewardedObstacle) {
      unrewardedObstacle.hasSpawnedRewards = true;

      const gapTop = unrewardedObstacle.topHeight;
      const gapBottom = height - unrewardedObstacle.bottomHeight;
      const gapCenterY = gapTop + (gapBottom - gapTop) * 0.5;
      const baseOffset = unrewardedObstacle.width / 2;
      const targetX = unrewardedObstacle.x + baseOffset;

      const rand = Math.random();
      if (rand < 0.82) {
        // Spawn a beautiful horizontal row of 3 coins guiding the player through the center of the gap
        this.spawnItem('coin', width, height, targetX - 55, gapCenterY);
        this.spawnItem('coin', width, height, targetX, gapCenterY);
        this.spawnItem('coin', width, height, targetX + 55, gapCenterY);
      } else if (rand < 0.94) {
        // Spawn a gem in the center
        this.spawnItem('gem', width, height, targetX, gapCenterY);
      } else {
        // Spawn a powerup in the center
        const types: PowerupType[] = ['shield', 'slowmo', 'magnet', 'double', 'turbo', 'ghost', 'mini', 'revive'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        this.spawnItem(randomType, width, height, targetX, gapCenterY);
      }
    }

    // 3. Fallback rare random spawns if no obstacles are currently active
    if (obstacles.length === 0) {
      if (Math.random() < 0.005 * dtCoeff) {
        this.spawnItem('coin', width, height);
      }
      if (Math.random() < 0.001 * dtCoeff) {
        this.spawnItem('gem', width, height);
      }
    }
  }

  public spawnItem(
    type: PowerupItem['type'],
    width: number,
    height: number,
    customX?: number,
    customY?: number
  ) {
    let radius = 20; // enlarged from 14
    if (type === 'coin') radius = 16; // enlarged from 10
    else if (type === 'gem') radius = 14; // enlarged from 8

    const spawnX = customX !== undefined ? customX : (width + 50);
    let spawnY = customY;
    
    if (spawnY === undefined) {
      const margin = 100;
      spawnY = margin + Math.random() * (height - margin * 2 - 40);
    }

    this.list.push({
      x: spawnX,
      y: spawnY,
      initialY: spawnY,
      radius,
      type,
      active: true,
      pulseTimer: Math.random() * Math.PI * 2
    });
  }

  // Handle bird coin/powerup collisions
  public checkItemCollisions(
    birdX: number,
    birdY: number,
    birdRadius: number,
    particleEngine: ParticleEngine,
    soundManager: any
  ): PowerupItem['type'] | null {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const item = this.list[i];
      const dx = birdX - item.x;
      const dy = birdY - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < birdRadius + item.radius) {
        const type = item.type;

        // Visual collection particles
        if (item.type === 'coin') {
          particleEngine.emitCoinSparkle(item.x, item.y, '#ffd700');
          soundManager.playCoin();
        } else if (item.type === 'gem') {
          particleEngine.emitCoinSparkle(item.x, item.y, '#00ffcc');
          soundManager.playGem();
        } else {
          particleEngine.emitRing(item.x, item.y, this.getPowerupGlowColor(item.type));
          soundManager.playShieldDeflect();
        }

        this.list.splice(i, 1);
        return type;
      }
    }
    return null;
  }

  private getPowerupGlowColor(type: PowerupItem['type']): string {
    switch (type) {
      case 'shield': return '#00bfff';
      case 'slowmo': return '#da70d6';
      case 'magnet': return '#ff003c';
      case 'double': return '#ffd700';
      case 'turbo': return '#ff4500';
      case 'ghost': return '#9400d3';
      case 'mini': return '#00ff7f';
      case 'revive': return '#ffa07a';
      default: return '#ffffff';
    }
  }

  // Draw glowing powerup vector boxes
  public render(ctx: CanvasRenderingContext2D) {
    for (let i = 0; i < this.list.length; i++) {
      const item = this.list[i];
      
      ctx.save();
      ctx.translate(Math.round(item.x), Math.round(item.y));

      if (item.type === 'coin') {
        this.drawCoin(ctx, item);
      } else if (item.type === 'gem') {
        this.drawGem(ctx, item);
      } else {
        this.drawPowerupBox(ctx, item);
      }

      ctx.restore();
    }
  }

  private drawCoin(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffd700';
    }

    // Spinning gold coin gradient
    const coinGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, item.radius);
    coinGrad.addColorStop(0, '#fff');
    coinGrad.addColorStop(0.3, '#ffd700');
    coinGrad.addColorStop(1, '#c59b27');

    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    // Squish slightly to simulate spin
    const spinWidth = item.radius * (0.8 + Math.sin(item.pulseTimer * 2) * 0.2);
    ctx.ellipse(0, 0, spinWidth, item.radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#996515';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner details star
    ctx.fillStyle = '#996515';
    ctx.fillRect(-1.5, -3, 3, 6);
  }

  private drawGem(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00ffcc';
    }

    const gemGrad = ctx.createLinearGradient(-item.radius, -item.radius, item.radius, item.radius);
    gemGrad.addColorStop(0, '#e0ffff');
    gemGrad.addColorStop(0.5, '#00ffcc');
    gemGrad.addColorStop(1, '#008b8b');

    ctx.fillStyle = gemGrad;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;

    // Diamond faceted geometry shape
    ctx.beginPath();
    ctx.moveTo(0, -item.radius);
    ctx.lineTo(item.radius, 0);
    ctx.lineTo(0, item.radius);
    ctx.lineTo(-item.radius, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawPowerupBox(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    const color = this.getPowerupGlowColor(item.type);
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = color;
    }

    // Draw glowing crystal energy bubble
    const bub = ctx.createRadialGradient(-3, -3, 3, 0, 0, item.radius);
    bub.addColorStop(0, '#ffffff');
    bub.addColorStop(0.5, color + '66'); // 40% opacity
    bub.addColorStop(1, '#000000aa');

    ctx.fillStyle = bub;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.0;

    ctx.beginPath();
    ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw customized symbolic letter inside
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Outfit, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let symbol = 'P';
    if (item.type === 'shield') symbol = 'S';
    else if (item.type === 'slowmo') symbol = 'T'; // Time Stop
    else if (item.type === 'magnet') symbol = 'M';
    else if (item.type === 'double') symbol = '2x';
    else if (item.type === 'turbo') symbol = 'F'; // Fast
    else if (item.type === 'ghost') symbol = 'G';
    else if (item.type === 'mini') symbol = 'm';
    else if (item.type === 'revive') symbol = 'R';

    ctx.fillText(symbol, 0, 0.5);
  }
}
