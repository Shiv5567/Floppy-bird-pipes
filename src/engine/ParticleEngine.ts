export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  growth: number;
  glow: boolean;
  glowColor?: string;
  shape: 'circle' | 'square' | 'snowflake' | 'star' | 'bubble' | 'spark';
  angle: number;
  rotationSpeed: number;
}

export class ParticleEngine {
  private pool: Particle[] = [];
  private maxParticles = 1000;

  constructor() {
    this.initPool();
  }

  private initPool() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        color: '#fff',
        size: 0,
        alpha: 1,
        decay: 0.02,
        growth: 0,
        glow: false,
        shape: 'circle',
        angle: 0,
        rotationSpeed: 0
      });
    }
  }

  private getFreeParticle(): Particle | null {
    for (let i = 0; i < this.maxParticles; i++) {
      if (!this.pool[i].active) return this.pool[i];
    }
    return null;
  }

  public spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    alpha: number,
    decay: number,
    shape: Particle['shape'] = 'circle',
    glow = false,
    glowColor?: string,
    growth = 0
  ) {
    const p = this.getFreeParticle();
    if (!p) return;

    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.color = color;
    p.size = size;
    p.alpha = alpha;
    p.decay = decay;
    p.growth = growth;
    p.glow = glow;
    p.glowColor = glowColor;
    p.shape = shape;
    p.angle = Math.random() * Math.PI * 2;
    p.rotationSpeed = (Math.random() - 0.5) * 0.1;
  }

  public update(deltaTime: number) {
    // scale delta to preserve standard velocities based on 60fps
    const speedCoeff = deltaTime * 60;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.x += p.vx * speedCoeff;
      p.y += p.vy * speedCoeff;
      p.alpha -= p.decay * speedCoeff;
      p.size += p.growth * speedCoeff;
      p.angle += p.rotationSpeed * speedCoeff;

      if (p.alpha <= 0 || p.size <= 0.1) {
        p.active = false;
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    const disableShadows = (window as any).gameDisableShadows;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      // Direct draw mode for performance!
      if ((p.shape === 'circle' || p.shape === 'square' || p.shape === 'bubble') && (!p.glow || disableShadows)) {
        ctx.globalAlpha = p.alpha;

        if (p.glow && p.glowColor) {
          ctx.fillStyle = p.glowColor;
          ctx.globalAlpha = p.alpha * 0.25;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = p.alpha;
        }

        ctx.fillStyle = p.color;
        ctx.strokeStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'square') {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        } else if (p.shape === 'bubble') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.lineWidth = 1;
          ctx.stroke();
          
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.25, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.rotate(p.angle);

      if (p.glow && p.glowColor) {
        if (!disableShadows) {
          ctx.shadowBlur = p.size * 2;
          ctx.shadowColor = p.glowColor;
        } else {
          // High-performance double-drawn glowing aura
          ctx.fillStyle = p.glowColor;
          ctx.globalAlpha = p.alpha * 0.25;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
        }
      }

      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;

      switch (p.shape) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'square':
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;

        case 'spark':
          // Cross hair spark
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.lineTo(p.size, 0);
          ctx.moveTo(0, -p.size);
          ctx.lineTo(0, p.size);
          ctx.lineWidth = p.size * 0.3;
          ctx.stroke();
          break;

        case 'star':
          ctx.beginPath();
          for (let k = 0; k < 5; k++) {
            ctx.lineTo(
              Math.cos(((18 + k * 72) * Math.PI) / 180) * p.size,
              Math.sin(((18 + k * 72) * Math.PI) / 180) * p.size
            );
            ctx.lineTo(
              Math.cos(((54 + k * 72) * Math.PI) / 180) * (p.size * 0.4),
              Math.sin(((54 + k * 72) * Math.PI) / 180) * (p.size * 0.4)
            );
          }
          ctx.closePath();
          ctx.fill();
          break;

        case 'bubble':
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.lineWidth = 1;
          ctx.stroke();
          // Subtle highlight reflection inside the bubble
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath();
          ctx.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.25, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'snowflake':
          ctx.beginPath();
          for (let m = 0; m < 6; m++) {
            ctx.moveTo(0, 0);
            ctx.lineTo(0, p.size);
            ctx.moveTo(-p.size * 0.3, p.size * 0.5);
            ctx.lineTo(0, p.size * 0.8);
            ctx.lineTo(p.size * 0.3, p.size * 0.5);
            ctx.rotate(Math.PI / 3);
          }
          ctx.lineWidth = 1.2;
          ctx.stroke();
          break;
      }

      ctx.restore();
    }
  }

  // Pre-configured emitter types
  public emitExplosion(x: number, y: number, color: string, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 5;
      const size = 2 + Math.random() * 4;
      const decay = 0.015 + Math.random() * 0.02;
      this.spawn(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        size,
        1.0,
        decay,
        Math.random() > 0.5 ? 'square' : 'circle',
        true,
        color
      );
    }
  }

  public emitRing(x: number, y: number, color: string, count = 16) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 3;
      this.spawn(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        3,
        1.0,
        0.025,
        'spark',
        true,
        color
      );
    }
  }

  public emitCoinSparkle(x: number, y: number, color = '#ffd700') {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      this.spawn(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        color,
        2.5 + Math.random() * 2.5,
        1.0,
        0.02 + Math.random() * 0.03,
        'star',
        true,
        color
      );
    }
  }

  public clear() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool[i].active = false;
    }
  }
}
