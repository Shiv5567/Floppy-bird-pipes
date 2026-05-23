import { ParticleEngine } from './ParticleEngine.ts';

export interface WeatherConfig {
  type: 'clear' | 'rain' | 'snow' | 'sandstorm' | 'lava' | 'underwater' | 'fog' | 'heavenly';
  windSpeed: number;
  density: number;
  lightning: boolean;
}

export class Renderer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private particleEngine: ParticleEngine;
  private cachedProfiles: number[][] = [];
  public dpr = 1.0;

  // Parallax background offsets
  private offsets: number[] = [0, 0, 0, 0, 0];
  private speeds: number[] = [0.05, 0.15, 0.35, 0.65, 1.0]; // Velocity coefficients

  // Weather state
  private weather: WeatherConfig = { type: 'clear', windSpeed: 0, density: 0, lightning: false };
  private weatherTime = 0;
  private lightningFlash = 0;
  private lightningStrikeX = 0;

  // Day/Night cycle
  private timeOfDay = 12.0; // 0-24 hour scale
  private timeSpeed = 0.01;

  // Game scrolling speed (Visual Weather & Aura Pack)
  private currentSpeed = 5.0;

  // Camera settings
  private cameraY = 0;
  private targetCameraY = 0;
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private zoomFactor = 0.85;
  public scale = 1.0;

  constructor(canvas: HTMLCanvasElement, particleEngine: ParticleEngine) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not acquire 2D canvas context.');
    this.ctx = context;
    this.particleEngine = particleEngine;
    this.resize();
  }

  public resize() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const maxDpr = isMobile ? 1.5 : 2.0;
    this.dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    // Base scale based on standard height
    this.scale = rect.height / 720;
  }

  public setWeather(worldId: string) {
    this.weatherTime = 0;
    this.lightningFlash = 0;
    switch (worldId) {
      case 'jungle':
        this.weather = { type: 'rain', windSpeed: 1, density: 40, lightning: true };
        break;
      case 'cyberpunk':
        this.weather = { type: 'fog', windSpeed: 0.2, density: 10, lightning: false };
        break;
      case 'ice':
        this.weather = { type: 'snow', windSpeed: 2, density: 35, lightning: false };
        break;
      case 'desert':
        this.weather = { type: 'sandstorm', windSpeed: 4, density: 60, lightning: false };
        break;
      case 'volcano':
        this.weather = { type: 'lava', windSpeed: 1.5, density: 25, lightning: true };
        break;
      case 'space':
        this.weather = { type: 'clear', windSpeed: 0, density: 0, lightning: false };
        break;
      case 'underwater':
        this.weather = { type: 'underwater', windSpeed: 0.1, density: 15, lightning: false };
        break;
      case 'heaven':
        this.weather = { type: 'heavenly', windSpeed: 0.5, density: 8, lightning: false };
        break;
      default:
        this.weather = { type: 'clear', windSpeed: 0, density: 0, lightning: false };
    }
    this.generateParallaxCache(worldId);
  }

  private generateParallaxCache(worldId: string) {
    this.cachedProfiles = [[], [], [], []];
    for (let layer = 1; layer <= 3; layer++) {
      const profile = new Float32Array(2000);
      for (let x = 0; x < 2000; x++) {
        let dy = 0;
        const lookupX = x;
        switch (worldId) {
          case 'jungle':
            dy += Math.sin(lookupX * 0.003 * (4 - layer)) * 80 * (4 - layer);
            dy += Math.sin(lookupX * 0.015) * 8;
            break;
          case 'cyberpunk': {
            const buildingSeed = Math.floor(lookupX / 80);
            const heightFactor = (Math.sin(buildingSeed * 1234.5) * 0.5 + 0.5);
            dy -= heightFactor * 130 * (4 - layer);
            break;
          }
          case 'ice':
            dy += Math.sin(lookupX * 0.004) * 90 * (4 - layer);
            dy += Math.abs(Math.sin(lookupX * 0.02) * 20);
            break;
          case 'desert':
            dy += Math.cos(lookupX * 0.002 * (4 - layer)) * 70 * (4 - layer);
            break;
          case 'volcano':
            dy += Math.sin(lookupX * 0.003) * 100 * (4 - layer);
            if (lookupX % 180 < 30) {
              dy -= 40;
            }
            break;
          case 'space':
            dy += Math.sin(lookupX * 0.0015) * 60;
            dy += Math.cos(lookupX * 0.008) * 15;
            break;
          case 'underwater':
            dy += Math.sin(lookupX * 0.003 * layer) * 50 * (4 - layer);
            dy += Math.cos(lookupX * 0.01) * 10;
            break;
          case 'heaven':
            dy += Math.sin(lookupX * 0.0025 * (4 - layer)) * 40 * (4 - layer);
            dy += Math.sin(lookupX * 0.01) * 15;
            break;
          default:
            dy += Math.sin(lookupX * 0.004 * (4 - layer)) * 50 * (4 - layer);
        }
        profile[x] = dy;
      }
      this.cachedProfiles[layer] = profile as any;
    }
  }

  public update(
    deltaTime: number,
    speed: number,
    birdY: number,
    timeScale: number,
    gameState: string = 'PLAYING',
    isTurbo: boolean = false
  ) {
    this.currentSpeed = speed; // Save the scrolling speed for wind drift physics
    const speedMultiplier = deltaTime * speed * 60;

    // Update parallax offsets
    for (let i = 0; i < this.offsets.length; i++) {
      this.offsets[i] = (this.offsets[i] + this.speeds[i] * speedMultiplier) % 2000;
    }

    // Dynamic camera vertical tracking
    const screenHeight = this.canvas.height / this.dpr;
    this.targetCameraY = birdY - screenHeight / 2;
    // Smooth camera catchup
    this.cameraY += (this.targetCameraY - this.cameraY) * 0.08 * (deltaTime * 60);

    // Dynamic micro-camera zoom based on gameplay state
    let targetZoom = 0.85;
    if (gameState === 'BOSS_FIGHT') {
      targetZoom = 0.72; // Zoom out for grand scale modular boss fight
    } else if (timeScale < 0.9) {
      targetZoom = 1.02; // Micro zoom-in during epic matrix slow-mo grazes
    } else if (isTurbo) {
      targetZoom = 1.08; // Zoom in during turbo speed blast
    }

    // Smoothly interpolate zoomFactor
    this.zoomFactor += (targetZoom - this.zoomFactor) * 0.08 * (deltaTime * 60);

    // Day/Night progression
    this.timeOfDay = (this.timeOfDay + this.timeSpeed * (deltaTime * 60)) % 24;

    // Camera shake decay
    if (this.shakeDuration > 0) {
      this.shakeDuration -= deltaTime;
      if (this.shakeDuration <= 0) {
        this.shakeIntensity = 0;
      }
    }

    // Weather procedural timings
    this.weatherTime += deltaTime;
    if (this.weather.lightning) {
      if (this.lightningFlash > 0) {
        this.lightningFlash -= deltaTime;
      } else if (Math.random() < 0.005) {
        this.lightningFlash = 0.1 + Math.random() * 0.25; // Duration of flash
        this.lightningStrikeX = Math.random() * (this.canvas.width / this.dpr);
      }
    }

    // Emit atmospheric particles based on active weather
    this.updateWeatherParticles(deltaTime);
  }

  public triggerScreenShake(intensity = 15, duration = 0.3) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  private updateWeatherParticles(deltaTime: number) {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;


    // Spawn rare space shooting stars drifting super fast in clear weather (for Space world)
    if (this.weather.type === 'clear') {
      if (Math.random() < 0.008 * deltaTime * 60) {
        this.particleEngine.spawn(
          Math.random() * width,
          -10,
          -14 - Math.random() * 8 - this.currentSpeed * 0.5,
          6 + Math.random() * 6,
          'rgba(255, 255, 255, 0.95)',
          2 + Math.random() * 2,
          1.0,
          0.025,
          'spark',
          true,
          'rgba(0, 243, 255, 0.5)'
        );
      }
      return;
    }

    const rateCoeff = deltaTime * this.weather.density;
    const isPerformanceMode = (window as any).gameDisableShadows;
    const spawnRate = isPerformanceMode ? rateCoeff * 0.12 : rateCoeff * 0.3;
    if (Math.random() < spawnRate) {
      switch (this.weather.type) {
        case 'rain': {
          // Spawn rain drops falling fast diagonally, reacting to flight wind speed
          this.particleEngine.spawn(
            Math.random() * (width + 300) - 100,
            -10,
            -3 - Math.random() * 3 - this.currentSpeed * 1.4, // Wind sweeps backwards based on scrolling speed
            12 + Math.random() * 5,
            'rgba(174, 219, 240, 0.45)',
            1.5 + Math.random() * 1.5,
            0.8,
            0.015,
            'square'
          );
          
          // Spawn a splash ripple on the bottom boundary
          if (Math.random() < 0.3) {
            this.particleEngine.spawn(
              Math.random() * width,
              height - 15 - Math.random() * 10,
              -this.currentSpeed * 0.2, // Drifts slightly with speed
              0,
              'rgba(174, 219, 240, 0.35)',
              1.0,
              0.7,
              0.04,
              'bubble',
              false,
              undefined,
              0.3 // Grow bubble outwards simulating splash ripples!
            );
          }
          break;
        }

        case 'snow': {
          // Soft snowflake drifting down with wavy wind gusts
          const snowWind = Math.sin(this.weatherTime * 0.6) * 1.6 - this.currentSpeed * 0.35;
          this.particleEngine.spawn(
            Math.random() * (width + 300) - 150,
            -10,
            snowWind - Math.random() * 1,
            1.5 + Math.random() * 2,
            'rgba(255, 255, 255, 0.95)',
            2 + Math.random() * 3.5,
            0.9,
            0.004,
            'snowflake'
          );
          break;
        }

        case 'sandstorm': {
          // Large soft sand dust cloud sweep
          this.particleEngine.spawn(
            width + 50,
            Math.random() * height,
            -12 - Math.random() * 6 - this.currentSpeed * 1.8,
            (Math.random() - 0.5) * 2,
            'rgba(222, 184, 135, 0.45)',
            5 + Math.random() * 8,
            0.6,
            0.015,
            'circle',
            false,
            undefined,
            0.04 // Expand sand clouds slightly
          );
          break;
        }

        case 'lava': {
          // Burning ember rising up from below the screen
          this.particleEngine.spawn(
            Math.random() * width,
            height + 10,
            (Math.random() - 0.5) * 3 - this.currentSpeed * 0.15,
            -2 - Math.random() * 3,
            'rgba(255, 90, 0, 0.95)',
            2.5 + Math.random() * 3,
            1.0,
            0.012,
            'circle',
            true,
            'rgba(255, 90, 0, 0.8)'
          );
          
          // Rare basalt ember burst shatters
          if (Math.random() < 0.12) {
            this.particleEngine.emitExplosion(
              Math.random() * width,
              height - 50 - Math.random() * 200,
              '#ff7700',
              5
            );
          }
          break;
        }

        case 'underwater': {
          // Gentle columns of rising bubbles drifting backwards with speed
          this.particleEngine.spawn(
            Math.random() * (width + 100),
            height + 20,
            -this.currentSpeed * 0.15 + (Math.random() - 0.5) * 0.6,
            -1 - Math.random() * 1.8,
            'rgba(173, 216, 230, 0.45)',
            2 + Math.random() * 4,
            0.75,
            0.004,
            'bubble'
          );
          break;
        }

        case 'heavenly': {
          // Golden sparkles falling slowly
          this.particleEngine.spawn(
            Math.random() * width,
            -10,
            (Math.random() - 0.5) * 1.2 - this.currentSpeed * 0.1,
            1.0 + Math.random() * 1.5,
            'rgba(255, 215, 0, 0.85)',
            2.5 + Math.random() * 3.5,
            0.85,
            0.01,
            'star',
            true,
            'rgba(255, 215, 0, 0.5)'
          );
          break;
        }
      }
    }
  }

  // Master render pipeline
  public clearScreen(worldId: string) {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    ctxSaveApplyShake(this.ctx, this.shakeIntensity, this.shakeDuration);

    // Draw solid color backdrop depending on active world
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, height);
    switch (worldId) {
      case 'jungle':
        skyGrad.addColorStop(0, '#001a11');
        skyGrad.addColorStop(1, '#0c3527');
        break;
      case 'cyberpunk':
        skyGrad.addColorStop(0, '#04001a');
        skyGrad.addColorStop(0.5, '#0b002c');
        skyGrad.addColorStop(1, '#1b0042');
        break;
      case 'ice':
        skyGrad.addColorStop(0, '#0d1e3a');
        skyGrad.addColorStop(1, '#2c4266');
        break;
      case 'desert':
        skyGrad.addColorStop(0, '#5a462c');
        skyGrad.addColorStop(1, '#ab7c43');
        break;
      case 'volcano':
        skyGrad.addColorStop(0, '#110300');
        skyGrad.addColorStop(1, '#3b0a00');
        break;
      case 'space':
        skyGrad.addColorStop(0, '#010006');
        skyGrad.addColorStop(1, '#0e0114');
        break;
      case 'underwater':
        skyGrad.addColorStop(0, '#00132b');
        skyGrad.addColorStop(1, '#003554');
        break;
      case 'heaven':
        skyGrad.addColorStop(0, '#1e3f66');
        skyGrad.addColorStop(0.6, '#528aae');
        skyGrad.addColorStop(1, '#bcd4e6');
        break;
      default:
        skyGrad.addColorStop(0, '#70c5ce');
        skyGrad.addColorStop(1, '#3a95a8');
    }

    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, width, height);
  }

  public renderBackgroundLayers(worldId: string) {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    // Layer 0: Sky Details & Atmosphere (Sun, moon, stars, auroras, nebulae)
    this.drawSkyDetails(worldId, width, height);

    // Layer 1-3: Parallax mountains, silhouettes, ruins
    this.drawParallaxHills(worldId, width, height);
  }

  public restoreScreen() {
    this.ctx.restore();
  }

  private drawSkyDetails(worldId: string, width: number, height: number) {
    this.ctx.save();
    switch (worldId) {
      case 'space':
        // Nebula gradient shapes
        const nebulaGrad = this.ctx.createRadialGradient(width * 0.7, height * 0.3, 20, width * 0.7, height * 0.3, 300);
        nebulaGrad.addColorStop(0, 'rgba(255, 20, 147, 0.25)');
        nebulaGrad.addColorStop(0.5, 'rgba(128, 0, 128, 0.15)');
        nebulaGrad.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = nebulaGrad;
        this.ctx.fillRect(0, 0, width, height);

        // Draw twinkling stars procedurally
        this.ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 30; i++) {
          const x = (Math.sin(i * 1421.3) * 0.5 + 0.5) * width;
          const y = (Math.cos(i * 842.1) * 0.5 + 0.5) * (height * 0.7);
          const alpha = 0.3 + (Math.sin(this.weatherTime * 2 + i) * 0.5 + 0.5) * 0.7;
          this.ctx.globalAlpha = alpha;
          this.ctx.fillRect(x, y, 1.5, 1.5);
        }
        break;

      case 'cyberpunk':
        // Giant digital hologram neon grid in the distant background
        this.ctx.strokeStyle = 'rgba(255, 0, 243, 0.08)';
        this.ctx.lineWidth = 1.0;
        this.ctx.beginPath();
        const gridOffset = Math.round((this.offsets[0] * 0.5) % 80);
        for (let x = -gridOffset; x < width; x += 80) {
          this.ctx.moveTo(Math.round(x), Math.round(height * 0.2));
          this.ctx.lineTo(Math.round(x - 200), Math.round(height * 0.9));
        }
        for (let y = height * 0.2; y < height * 0.8; y += 40) {
          this.ctx.moveTo(0, Math.round(y));
          this.ctx.lineTo(Math.round(width), Math.round(y));
        }
        this.ctx.stroke();
        break;

      case 'ice':
        // Gorgeous Aurora sky ribbons
        const auroraGrad = this.ctx.createLinearGradient(0, 0, width, 0);
        auroraGrad.addColorStop(0, 'rgba(0, 255, 128, 0.0)');
        auroraGrad.addColorStop(0.3, 'rgba(0, 243, 255, 0.15)');
        auroraGrad.addColorStop(0.6, 'rgba(0, 128, 255, 0.12)');
        auroraGrad.addColorStop(1, 'rgba(0, 255, 128, 0.0)');
        this.ctx.fillStyle = auroraGrad;
        this.ctx.save();
        this.ctx.beginPath();
        // Wavy ribbon path
        this.ctx.moveTo(0, height * 0.2);
        for (let x = 0; x < width; x += 50) {
          const y = height * 0.25 + Math.sin(x * 0.005 + this.weatherTime * 0.2) * 50;
          this.ctx.lineTo(x, y);
        }
        this.ctx.lineTo(width, height * 0.55);
        this.ctx.lineTo(0, height * 0.55);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
        break;

      case 'heaven': {
        // Celestial sunrays drawing
        const rayGrad = this.ctx.createRadialGradient(width * 0.5, 0, 50, width * 0.5, 0, 500);
        rayGrad.addColorStop(0, 'rgba(255, 235, 180, 0.35)');
        rayGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.15)');
        rayGrad.addColorStop(1, 'rgba(255,255,255,0)');
        this.ctx.fillStyle = rayGrad;
        this.ctx.beginPath();
        this.ctx.arc(width * 0.5, 0, 600, 0, Math.PI, false);
        this.ctx.fill();
        
        // Draw sweeping volumetric rays
        this.ctx.save();
        this.ctx.translate(width * 0.5, 0);
        this.ctx.globalCompositeOperation = 'screen';
        
        const numRays = 4;
        for (let i = 0; i < numRays; i++) {
          const rayAngle = Math.sin(this.weatherTime * 0.15 + i * 1.5) * 0.25 + (i - numRays / 2) * 0.45;
          const rayWidth = 0.12 + Math.sin(this.weatherTime * 0.35 + i) * 0.04;
          
          const grad = this.ctx.createLinearGradient(0, 0, 0, height);
          grad.addColorStop(0, 'rgba(255, 243, 210, 0.24)');
          grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
          
          this.ctx.fillStyle = grad;
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0);
          this.ctx.lineTo(Math.sin(rayAngle - rayWidth) * height * 1.5, height);
          this.ctx.lineTo(Math.sin(rayAngle + rayWidth) * height * 1.5, height);
          this.ctx.closePath();
          this.ctx.fill();
        }
        this.ctx.restore();
        break;
      }
    }
    this.ctx.restore();
  }

  private drawParallaxHills(worldId: string, width: number, height: number) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // 3 separate layers of hills / city silhouettes
    for (let layer = 1; layer <= 3; layer++) {
      this.ctx.save();
      const offset = this.offsets[layer];
      const color = this.getLayerColor(worldId, layer);
      this.ctx.fillStyle = color;

      this.ctx.beginPath();
      this.ctx.moveTo(0, height);

      const segmentWidth = 100;
      
      // Dynamically adjust step size per world to cut path complexity by 60-70%
      // On mobile devices, we double stepX to dramatically optimize draw paths!
      let baseStepX = 30;
      if (worldId === 'cyberpunk') {
        baseStepX = 40;
      } else if (worldId === 'space') {
        baseStepX = 35;
      } else if (worldId === 'volcano' || worldId === 'ice') {
        baseStepX = 25;
      }
      
      const stepX = isMobile ? baseStepX * 2.2 : baseStepX;

      const profile = this.cachedProfiles[layer];
      const hasProfile = profile && profile.length > 0;

      // Loop over the screen width to draw the mountains/skyscrapers
      for (let x = -segmentWidth; x < width + segmentWidth; x += stepX) {
        const lookupX = Math.floor(Math.abs(x + offset)) % 2000;
        let y = height * 0.55 + layer * 70; // baseline height

        if (hasProfile) {
          y += profile[lookupX];
        }

        // Subtract camera height tracker and round to integer
        const finalY = Math.round(y - this.cameraY * (layer * 0.25));
        this.ctx.lineTo(x, finalY);
      }

      this.ctx.lineTo(width, height);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.restore();
    }
  }

  private getLayerColor(worldId: string, layer: number): string {
    // Return layered gradient shadows
    switch (worldId) {
      case 'jungle':
        return [
          '#0c2a1c', // Layer 1 (Furthest)
          '#081e13', // Layer 2
          '#05120a'  // Layer 3 (Closest)
        ][layer - 1];

      case 'cyberpunk':
        return [
          '#130129',
          '#0a001a',
          '#03000a'
        ][layer - 1];

      case 'ice':
        return [
          '#203657',
          '#142540',
          '#071426'
        ][layer - 1];

      case 'desert':
        return [
          '#8e612f',
          '#734b21',
          '#4e2f11'
        ][layer - 1];

      case 'volcano':
        return [
          '#2c0400',
          '#1e0200',
          '#0e0100'
        ][layer - 1];

      case 'space':
        return [
          'rgba(20, 5, 40, 0.4)',
          'rgba(14, 2, 28, 0.7)',
          'rgba(6, 0, 15, 0.95)'
        ][layer - 1];

      case 'underwater':
        return [
          '#002946',
          '#001e35',
          '#000f1c'
        ][layer - 1];

      case 'heaven':
        return [
          'rgba(240, 248, 255, 0.3)',
          'rgba(240, 248, 255, 0.65)',
          'rgba(240, 248, 255, 0.9)'
        ][layer - 1];

      default:
        return [
          '#2b738c',
          '#225d73',
          '#153d4c'
        ][layer - 1];
    }
  }

  // Draw environmental foregrounds and weather overlays
  public renderWeatherEffects() {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    // Branching lightning strike rendering
    if (this.weather.lightning && this.lightningFlash > 0 && Math.random() < 0.3) {
      this.ctx.save();
      this.ctx.globalAlpha = this.lightningFlash;
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      this.ctx.fillRect(0, 0, width, height);

      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3 + Math.random() * 4;
      if (!(window as any).gameDisableShadows) {
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = '#00f3ff';
      }
      this.ctx.beginPath();
      
      let currX = this.lightningStrikeX;
      let currY = 0;
      this.ctx.moveTo(currX, currY);
      while (currY < height) {
        currX += (Math.random() - 0.5) * 50;
        currY += Math.random() * 60;
        this.ctx.lineTo(currX, currY);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  // Volumetric bloom/lighting filter overlay (AAA polish)
  public applyCinematicBloom(worldId: string) {
    if ((window as any).gameDisableShadows) {
      // Bypassed on mobile / Low-Graphics Mode to save immense GPU fill-rate!
      return;
    }

    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    this.ctx.save();
    
    // 1. Cinematic overlay vignette
    const vig = this.ctx.createRadialGradient(width / 2, height / 2, width * 0.3, width / 2, height / 2, width * 0.75);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    this.ctx.fillStyle = vig;
    this.ctx.fillRect(0, 0, width, height);

    // 2. High-polish screen blend overlay
    this.ctx.globalCompositeOperation = 'screen';
    
    let glowColor = 'rgba(255, 255, 255, 0.05)';
    if (worldId === 'cyberpunk') glowColor = 'rgba(255, 0, 243, 0.1)';
    else if (worldId === 'volcano') glowColor = 'rgba(255, 69, 0, 0.15)';
    else if (worldId === 'heaven') glowColor = 'rgba(255, 223, 137, 0.15)';
    else if (worldId === 'ice') glowColor = 'rgba(0, 243, 255, 0.08)';

    const glowGrad = this.ctx.createRadialGradient(width * 0.5, height * 0.5, 100, width * 0.5, height * 0.5, width * 0.6);
    glowGrad.addColorStop(0, glowColor);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.fillStyle = glowGrad;
    this.ctx.fillRect(0, 0, width, height);

    // 3. Dynamic color filters
    this.ctx.globalCompositeOperation = 'multiply';
    let filterColor = 'rgba(255, 255, 255, 1.0)';
    if (worldId === 'volcano') filterColor = 'rgba(255, 230, 220, 1.0)';
    else if (worldId === 'ice') filterColor = 'rgba(220, 245, 255, 1.0)';
    else if (worldId === 'cyberpunk') filterColor = 'rgba(240, 220, 255, 1.0)';

    this.ctx.fillStyle = filterColor;
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.restore();
  }

  public beginCamera() {
    this.ctx.save();
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    
    // Zoom from screen center
    this.ctx.translate(width / 2, height / 2);
    this.ctx.scale(this.zoomFactor, this.zoomFactor);
    this.ctx.translate(-width / 2, -height / 2);

    // Translate standard coordinate space downwards by active cameraY and round to integer
    this.ctx.translate(0, -Math.round(this.cameraY));
  }

  public endCamera() {
    this.ctx.restore();
  }


  public getCameraY(): number {
    return this.cameraY;
  }
}

// Utility helper to handle screen-shakes safely in context
function ctxSaveApplyShake(ctx: CanvasRenderingContext2D, intensity: number, duration: number) {
  ctx.save();
  if (duration > 0 && intensity > 0) {
    const dx = (Math.random() - 0.5) * intensity;
    const dy = (Math.random() - 0.5) * intensity;
    ctx.translate(dx, dy);
  }
}
