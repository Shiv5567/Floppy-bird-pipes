import { ParticleEngine } from '../engine/ParticleEngine.ts';
import type { Obstacle } from './ObstacleManager.ts';

export type PowerupType = 'shield' | 'slowmo' | 'magnet' | 'double' | 'revive' | 'turbo' | 'ghost' | 'mini' | 'booster';

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
  private endlessSpawnPlans: Record<number, { index: number, type: PowerupType }[]> = {};

  constructor() {}

  public getList(): PowerupItem[] {
    return this.list;
  }

  private getEndlessSpawnPlan(blockNum: number): { index: number, type: PowerupType }[] {
    if (!this.endlessSpawnPlans[blockNum]) {
      // Spawn at equal intervals (25, 50, 75) in the 100-obstacle block
      const indices = [25, 50, 75];

      const pool: PowerupType[] = ['shield', 'slowmo', 'magnet', 'turbo', 'mini'];
      const chosenTypes: PowerupType[] = [];
      while (chosenTypes.length < 3) {
        const type = pool[Math.floor(Math.random() * pool.length)];
        if (!chosenTypes.includes(type)) {
          chosenTypes.push(type);
        }
      }

      this.endlessSpawnPlans[blockNum] = [
        { index: indices[0], type: chosenTypes[0] },
        { index: indices[1], type: chosenTypes[1] },
        { index: indices[2], type: chosenTypes[2] }
      ];
    }
    return this.endlessSpawnPlans[blockNum];
  }

  public clear() {
    this.list = [];
    this.endlessSpawnPlans = {};
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
    obstacles: Obstacle[],
    gameMode: 'endless' | 'level' = 'endless',
    particleEngine?: ParticleEngine
  ) {
    const dtCoeff = deltaTime * 60 * timeScale;
    const actualScrollSpeed = scrollSpeed * dtCoeff;

    // 1. Update powerups positions & magnet attraction
    for (let i = this.list.length - 1; i >= 0; i--) {
      const item = this.list[i];

      // Float hovering animation via sine wave
      item.pulseTimer += deltaTime * 4 * timeScale;
      
      if (item.type === 'booster' && particleEngine) {
        if (Math.random() < 0.15 * dtCoeff) {
          particleEngine.spawn(
            item.x + (Math.random() - 0.5) * 16,
            item.y + (Math.random() - 0.5) * 16,
            -scrollSpeed * 0.2 + (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.8,
            '#ffd700',
            1.5 + Math.random() * 2,
            0.8,
            0.02,
            'star',
            true,
            '#ffd700'
          );
        }
      }
      
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

      let spawnedPowerup = false;
      if (gameMode === 'endless') {
        const obsIdx = unrewardedObstacle.obstacleIdx !== undefined ? unrewardedObstacle.obstacleIdx : 0;
        const blockNum = Math.floor(obsIdx / 100);
        const indexInBlock = obsIdx % 100;
        const plan = this.getEndlessSpawnPlan(blockNum);
        const planItem = plan.find(item => item.index === indexInBlock);
        
        if (planItem) {
          // Spawn exactly in the center of the gap (targetX, gapCenterY) as requested
          this.spawnItem(planItem.type, width, height, targetX, gapCenterY);
          spawnedPowerup = true;
        }
      }

      if (!spawnedPowerup) {
        const rand = Math.random();
        if (rand < 0.50) {
          // Spawn a beautiful horizontal row of 3 coins guiding the player through the center of the gap (Avg: 0.50 * 3 = 1.5 coins per pipe = 150 coins per 100 score!)
          this.spawnItem('coin', width, height, targetX - 55, gapCenterY);
          this.spawnItem('coin', width, height, targetX, gapCenterY);
          this.spawnItem('coin', width, height, targetX + 55, gapCenterY);
        } else if (rand < 0.62) {
          // Spawn a gem in the center
          this.spawnItem('gem', width, height, targetX, gapCenterY);
        } else if (rand < 0.655 && gameMode === 'level') {
          // Spawn a powerup in the center (reduced from 10% rate to 3.5% rate: 65% reduction)
          const types: PowerupType[] = ['shield', 'slowmo', 'magnet', 'turbo', 'mini'];
          const randomType = types[Math.floor(Math.random() * types.length)];
          this.spawnItem(randomType, width, height, targetX, gapCenterY);
        }
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
          const gameScore = (window as any).gameEngine ? (window as any).gameEngine.score : 0;
          let sparkleColor = '#ffd700';
          if (gameScore >= 300 && gameScore < 500) {
            sparkleColor = '#00e5ff';
          } else if (gameScore >= 500) {
            sparkleColor = '#ff3d00';
          }
          particleEngine.emitCoinSparkle(item.x, item.y, sparkleColor);
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
      case 'booster': return '#ffd700';
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
      } else if (item.type === 'booster') {
        this.drawLightningBolt(ctx, item);
      } else {
        this.drawPowerupBox(ctx, item);
      }

      ctx.restore();
    }
  }

  private drawLightningBolt(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    if (!(window as any).gameDisableShadows) {
      ctx.shadowBlur = 18 + Math.sin(item.pulseTimer * 3) * 6; // Pulsing glow!
      ctx.shadowColor = '#ffd700';
    }

    const rad = item.radius;
    // Pulsing size animation
    const pulseScale = 1.0 + Math.sin(item.pulseTimer * 4) * 0.12;
    ctx.scale(pulseScale, pulseScale);

    // Glowing golden gradient
    const grad = ctx.createLinearGradient(-rad, -rad, rad, rad);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#ffea00');
    grad.addColorStop(1, '#ffd700');

    ctx.fillStyle = grad;
    ctx.strokeStyle = '#e6ad00';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    // Lightning shape centered at (0,0)
    ctx.moveTo(rad * 0.1, -rad * 0.9);  // Top point
    ctx.lineTo(rad * 0.5, -rad * 0.15); // Top right bend
    ctx.lineTo(rad * 0.15, -rad * 0.15); // Middle inner bend
    ctx.lineTo(rad * 0.4, rad * 0.85);  // Bottom point
    ctx.lineTo(-rad * 0.35, rad * 0.1);  // Lower left bend
    ctx.lineTo(0.0, rad * 0.1);       // Middle inner bend left
    ctx.closePath();
    
    ctx.fill();
    ctx.stroke();
  }

  private drawCoin(ctx: CanvasRenderingContext2D, item: PowerupItem) {
    // Coins ma dynamic light haru use na garne lightweight hunu laro
    // We completely omit shadow blurs/glows on coins for maximum performance!
    const gameEngine = (window as any).gameEngine;
    const score = gameEngine ? gameEngine.score : 0;

    let coinGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, item.radius);

    if (score >= 300 && score < 500) {
      // Gradient mixed of light blue and yellow
      coinGrad.addColorStop(0, '#e0f7fa');   // White/Very Light Blue
      coinGrad.addColorStop(0.3, '#00e5ff'); // Light Blue
      coinGrad.addColorStop(0.7, '#ffd700'); // Yellow
      coinGrad.addColorStop(1, '#c59b27');   // Darker Gold/Yellow
    } else if (score >= 500) {
      // Gradient mixed of yellow and red
      coinGrad.addColorStop(0, '#ffffff');   // White
      coinGrad.addColorStop(0.3, '#ffea00'); // Yellow
      coinGrad.addColorStop(0.7, '#ff3d00'); // Red
      coinGrad.addColorStop(1, '#b30000');   // Dark Red
    } else {
      // Standard Yellow/Gold coin gradient
      coinGrad.addColorStop(0, '#fff');
      coinGrad.addColorStop(0.3, '#ffd700');
      coinGrad.addColorStop(1, '#c59b27');
    }

    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    // Squish slightly to simulate spin
    const spinWidth = item.radius * (0.8 + Math.sin(item.pulseTimer * 2) * 0.2);
    ctx.ellipse(0, 0, spinWidth, item.radius, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark stroke contour
    if (score >= 300 && score < 500) {
      ctx.strokeStyle = '#00838f'; // Cyan/Blue stroke
    } else if (score >= 500) {
      ctx.strokeStyle = '#800000'; // Dark Red stroke
    } else {
      ctx.strokeStyle = '#996515'; // Golden stroke
    }
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner details star / sign
    if (score >= 300 && score < 500) {
      ctx.fillStyle = '#00838f';
    } else if (score >= 500) {
      ctx.fillStyle = '#800000';
    } else {
      ctx.fillStyle = '#996515';
    }
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

    // Glossy light reflection highlight on the bubble surface
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(-item.radius * 0.35, -item.radius * 0.35, item.radius * 0.3, item.radius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw customized symbolic vector logo inside
    ctx.save();

    // Radial highlight glow behind logo inside bubble
    const logoGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, item.radius * 0.75);
    logoGlow.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    logoGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = logoGlow;
    ctx.beginPath();
    ctx.arc(0, 0, item.radius * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Increase logo size inside bubble by 1.35x
    ctx.scale(1.35, 1.35);

    if (item.type === 'shield') {
      // Shield logo
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5.5, -4);
      ctx.lineTo(4.5, 1.5);
      ctx.quadraticCurveTo(4.5, 4.5, 0, 7.5);
      ctx.quadraticCurveTo(-4.5, 4.5, -4.5, 1.5);
      ctx.lineTo(-5.5, -4);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      
      // Inner cross line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -3.5);
      ctx.lineTo(0, 4);
      ctx.moveTo(-2.5, -0.5);
      ctx.lineTo(2.5, -0.5);
      ctx.stroke();
    } else if (item.type === 'slowmo') {
      // Clock face
      ctx.beginPath();
      ctx.arc(0, 0.5, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      
      // Clock hands
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0.5);
      ctx.lineTo(0, -3.0); // 12 o'clock
      ctx.moveTo(0, 0.5);
      ctx.lineTo(2.5, 2.0); // 4 o'clock
      ctx.stroke();
      
      // Stopwatch top trigger ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(0, -7.5, 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (item.type === 'magnet') {
      // U-Magnet
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(-4, 0.5);
      ctx.arc(0, 0.5, 4, Math.PI, 0, true);
      ctx.lineTo(4, -4);
      ctx.stroke();
      
      // Red pole tips
      ctx.lineWidth = 3.0;
      ctx.strokeStyle = '#ff3d00';
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(-4, -6.5);
      ctx.moveTo(4, -4);
      ctx.lineTo(4, -6.5);
      ctx.stroke();
    } else if (item.type === 'turbo') {
      // Double chevron >>
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      // First chevron
      ctx.moveTo(-4.5, -4.5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-4.5, 4.5);
      // Second chevron
      ctx.moveTo(0.5, -4.5);
      ctx.lineTo(5, 0);
      ctx.lineTo(0.5, 4.5);
      ctx.stroke();
    } else if (item.type === 'mini') {
      // Mini Bird head
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0.5, 0.5, 4.5, 0, Math.PI * 2);
      ctx.fill();
      
      // Beak
      ctx.fillStyle = '#ff9100';
      ctx.beginPath();
      ctx.moveTo(-3, -0.5);
      ctx.lineTo(-6.5, 0.5);
      ctx.lineTo(-3, 1.5);
      ctx.closePath();
      ctx.fill();
      
      // Eye
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(-1.0, -1.0, 1.0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Fallback text drawing for any other unregistered powerups
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px Outfit, Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', 0, 0.5);
    }
    ctx.restore();
  }
}
