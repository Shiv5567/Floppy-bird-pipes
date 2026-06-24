import { ParticleEngine } from './ParticleEngine.ts';

export interface WeatherConfig {
  type: 'clear' | 'rain' | 'snow' | 'sandstorm' | 'lava' | 'underwater' | 'fog' | 'heavenly' | 'jungle_fog';
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
  public activeLevelNum = 1;

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
  private shakeIntensity = 0;
  private shakeDuration = 0;
  public zoomFactor = 0.90;
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
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;
    const maxDpr = isMobile ? 1.15 : 2.0; // Enforce lower DPR on mobile for ultra smooth performance (reduces pixel counts by ~3-4x)
    this.dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    
    // Enable canvas bilinear interpolation smoothing to make all vector outlines and scaled images smooth and crisp
    this.ctx.imageSmoothingEnabled = true;
    (this.ctx as any).mozImageSmoothingEnabled = true;
    (this.ctx as any).webkitImageSmoothingEnabled = true;
    (this.ctx as any).msImageSmoothingEnabled = true;

    // Base scale based on standard height
    this.scale = rect.height / 720;
  }

  public setWeather(worldId: string) {
    this.weatherTime = 0;
    this.lightningFlash = 0;
    switch (worldId) {
      case 'jungle':
        this.weather = { type: 'rain', windSpeed: 1, density: 56, lightning: true };
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
        this.weather = { type: 'heavenly', windSpeed: 0.5, density: 3, lightning: false }; // Reduced density to make world lightweight
        break;
      case 'retro':
        this.weather = { type: 'clear', windSpeed: 0, density: 0, lightning: false };
        break;
      default:
        this.weather = { type: 'clear', windSpeed: 0, density: 0, lightning: false };
    }
    this.generateParallaxCache(worldId);
  }

  private generateParallaxCache(worldId: string) {
    this.cachedProfiles = [[], [], [], []];
    const P_LEN = 16000; // Expanded to 16000 for ultra-wide seamless looping and wider waves
    for (let layer = 1; layer <= 3; layer++) {
      const profile = new Float32Array(P_LEN);
      for (let x = 0; x < P_LEN; x++) {
        let dy = 0;
        const lookupX = x;
        const baseFreq = (2 * Math.PI) / P_LEN; // Periodic frequency unit
        
        switch (worldId) {
          case 'jungle':
            dy += Math.sin(lookupX * baseFreq * 8 * (4 - layer)) * 80 * (4 - layer);
            dy += Math.sin(lookupX * baseFreq * 38) * 8;
            break;
          case 'ice':
            dy += Math.sin(lookupX * baseFreq * 10) * 90 * (4 - layer);
            dy += Math.abs(Math.sin(lookupX * baseFreq * 50) * 20);
            break;
          case 'desert':
            dy += Math.cos(lookupX * baseFreq * 6 * (4 - layer)) * 70 * (4 - layer);
            break;
          case 'volcano':
            dy += Math.sin(lookupX * baseFreq * 8) * 100 * (4 - layer);
            if (lookupX % 200 < 30) {
              dy -= 40;
            }
            break;
          case 'space':
            dy += Math.sin(lookupX * baseFreq * 4) * 60;
            dy += Math.cos(lookupX * baseFreq * 20) * 15;
            break;
          case 'underwater':
            dy += Math.sin(lookupX * baseFreq * 8 * layer) * 50 * (4 - layer);
            dy += Math.cos(lookupX * baseFreq * 26) * 10;
            break;
          case 'heaven':
            // Structured all 3 layers with completely different wave patterns, shapes, and phases for dynamic depth
            if (layer === 1) {
              // Layer 1 (Furthest background): massive slow-undulating smooth clouds
              dy += Math.sin(lookupX * baseFreq * 1) * 35;
              dy += Math.cos(lookupX * baseFreq * 4) * 5;
            } else if (layer === 2) {
              // Layer 2 (Middle ground): medium waves with a phase offset to break alignment
              dy += Math.cos(lookupX * baseFreq * 2 + Math.PI / 4) * 22;
              dy += Math.sin(lookupX * baseFreq * 6) * 4;
            } else {
              // Layer 3 (Closest foreground): flatter, fluffier details
              dy += Math.sin(lookupX * baseFreq * 3 + Math.PI / 2) * 12;
              dy += Math.cos(lookupX * baseFreq * 8) * 3;
            }
            break;
          case 'retro':
            dy = -30 * layer;
            break;
          default:
            dy += Math.sin(lookupX * baseFreq * 10 * (4 - layer)) * 50 * (4 - layer);
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
      this.offsets[i] = (this.offsets[i] + this.speeds[i] * speedMultiplier) % 16000;
    }

    // Camera smoothly follows the bird vertically to keep it in focus
    const targetCameraY = (birdY - 360) * 0.65; // Dampen the tracking slightly for stability
    this.cameraY += (targetCameraY - this.cameraY) * 0.12 * (deltaTime * 60);

    // Dynamic micro-camera zoom based on gameplay state (zoomed out by 10%)
    let targetZoom = 1.0; // standard native 1:1 scale to avoid hardware blur
    const isPerformanceMode = (window as any).gameDisableShadows;
    if (isPerformanceMode) {
      targetZoom = 1.0; // Enforce native pixel grid on low-graphics/mobile
      if (gameState === 'BOSS_FIGHT') {
        targetZoom = 0.77;
      }
    } else {
      targetZoom = 0.90;
      if (gameState === 'BOSS_FIGHT') {
        targetZoom = 0.77; // Zoom out for grand scale modular boss fight
      } else if (timeScale < 0.9) {
        targetZoom = 1.09; // Micro zoom-in during epic matrix slow-mo grazes
      } else if (isTurbo) {
        targetZoom = 1.14; // Zoom in during turbo speed blast
      }
    }

    const gameEngine = (window as any).gameEngine;
    const isFlockMode = gameEngine && (gameEngine.gameMode === 'flock');
    if (isFlockMode) {
      targetZoom *= 0.96; // Zoom out by 4% in squad mode!
    }

    const isJadeLotusUltimate = gameEngine && gameEngine.ultimateActive && gameEngine.bird && gameEngine.bird.getSkin().id === 'jade_lotus';
    if (isJadeLotusUltimate) {
      targetZoom *= 0.85; // 15% zoom out (scale to 85%)
    }

    // Hard-lock zoom to 1.0 in performance mode, otherwise smoothly interpolate (allow zoom in flock mode, boss fight, and Hummingbird ultimate)
    if (isPerformanceMode && !isFlockMode && gameState !== 'BOSS_FIGHT' && !isJadeLotusUltimate) {
      this.zoomFactor = 1.0;
    } else {
      this.zoomFactor += (targetZoom - this.zoomFactor) * 0.08 * (deltaTime * 60);
    }

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

    // Cap the spawn delta-time at 60fps (~0.016s) to completely avoid lag death spirals and particle bursts during performance spikes
    const spawnDelta = Math.min(0.016, deltaTime);
    const rateCoeff = spawnDelta * this.weather.density;
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
        case 'jungle_fog': {
          // Keep the ambient golden energy rising from ground (represents sacred golden light)
          if (Math.random() < 0.35) {
            this.particleEngine.spawn(
              Math.random() * width,
              height + 10,
              (Math.random() - 0.5) * 1.5 - this.currentSpeed * 0.15,
              -0.8 - Math.random() * 1.5,
              'rgba(255, 215, 0, 0.85)',
              2.0 + Math.random() * 2.5,
              0.85,
              0.008,
              'bubble',
              true,
              'rgba(255, 170, 0, 0.5)'
            );
          }
          // Spawn horizontal flowing leaves from the right side of the screen
          if (Math.random() < 0.40) {
            const size = 5 + Math.random() * 7;
            const decay = 0.0015 + Math.random() * 0.002; // Slow decay to let them drift across the screen
            const spawnY = Math.random() * (height - 100) + 30; // Spawn within screen heights
            const vx = -this.currentSpeed * 0.85 - 1.5 - Math.random() * 2.0; // Horizontal sweep to the left
            const vy = (Math.random() - 0.5) * 0.8 + Math.sin(this.weatherTime * 1.2 + spawnY) * 0.3; // Wavy wind drift
            
            const leafColors = [
              'rgba(46, 125, 50, 0.85)',   // Forest Green
              'rgba(76, 175, 80, 0.85)',   // Vibrant Green
              'rgba(139, 195, 74, 0.85)',  // Lime Green
              'rgba(230, 81, 0, 0.85)',    // Autumn Amber/Orange
              'rgba(255, 167, 38, 0.85)'   // Gold Orange
            ];
            const color = leafColors[Math.floor(Math.random() * leafColors.length)];

            this.particleEngine.spawn(
              width + 20,
              spawnY,
              vx,
              vy,
              color,
              size,
              0.9,
              decay,
              'leaf'
            );
          }
          // Ambient soft background mist/fog
          if (Math.random() < 0.15) {
            this.particleEngine.spawn(
              Math.random() * width,
              height - Math.random() * 40,
              -this.currentSpeed * 0.25,
              -0.2 - Math.random() * 0.5,
              'rgba(255, 255, 255, 0.12)',
              20.0 + Math.random() * 30.0,
              0.5,
              0.008,
              'circle',
              false,
              undefined,
              0.15
            );
          }
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

    if (this.activeLevelNum === 44) {
      // Final Boss level dramatic dark void backdrop
      const bossGrad = this.ctx.createLinearGradient(0, 0, 0, height);
      bossGrad.addColorStop(0, '#0f001a'); // Dark Void Purple
      bossGrad.addColorStop(0.5, '#2b0014'); // Dark Crimson
      bossGrad.addColorStop(1, '#050002'); // Black
      this.ctx.fillStyle = bossGrad;
      this.ctx.fillRect(0, 0, width, height);

      // Distant flashing lightning storm representing Peak Boss energy
      if (Math.sin(this.weatherTime * 8.0) > 0.96 && Math.random() < 0.15) {
        this.ctx.fillStyle = 'rgba(138, 43, 226, 0.15)'; // electric purple flash
        this.ctx.fillRect(0, 0, width, height);
      }
      return;
    }

    // Draw solid color backdrop depending on active world
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, height);
    switch (worldId) {
      case 'jungle':
        skyGrad.addColorStop(0, '#001a11');
        skyGrad.addColorStop(1, '#0c3527');
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
        skyGrad.addColorStop(0, '#00040a');
        skyGrad.addColorStop(1, '#091830');
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
      case 'retro':
        skyGrad.addColorStop(0, '#1a1a1a');
        skyGrad.addColorStop(1, '#1a1a1a');
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

    // Procedural Glowing Golden Speed Lines during hyper booster active state
    const engine = (window as any).gameEngine;
    if (engine && engine.boosterActive) {
      this.drawSpeedLines(width, height);
    }
  }

  private drawSpeedLines(width: number, height: number) {
    const numLines = 25;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.28)'; // Glowing golden speed lines
    this.ctx.lineWidth = 2.0;

    for (let i = 0; i < numLines; i++) {
      // Procedural speed line positions
      const y = (Math.sin(i * 913.7) * 0.5 + 0.5) * height;
      const speed = 2500 + (Math.cos(i * 123.4) * 0.5 + 0.5) * 1500; // super fast
      const len = 120 + (Math.sin(i * 567.8) * 0.5 + 0.5) * 180;
      
      const xOffset = (this.weatherTime * speed + i * 400) % (width + len * 2);
      const x = width - xOffset;

      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + len, y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  public restoreScreen() {
    this.ctx.restore();
  }

  private drawSkyDetails(worldId: string, width: number, height: number) {
    // Allow sky details drawing even in performance mode since shadows are disabled globally anyway
    this.ctx.save();

    if (this.activeLevelNum === 44) {
      // Swirling digital neon grid storm or giant vortex in the sky for the Final Boss!
      this.ctx.save();
      this.ctx.translate(width / 2, height * 0.4);
      this.ctx.rotate(this.weatherTime * 0.5);
      this.ctx.strokeStyle = 'rgba(255, 0, 127, 0.12)';
      this.ctx.lineWidth = 1.5;
      for (let r = 50; r < 350; r += 50) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, r, 0, Math.PI * 1.7);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    switch (worldId) {
      case 'space': {
        const isMobile = (window as any).gameIsMobile;

        if (!isMobile) {
          // --- 1. Distant Nebula Cloud Glows ---
          this.ctx.save();
          // Purple Nebula Top-Left
          const nebulaGrad1 = this.ctx.createRadialGradient(width * 0.15, height * 0.25, 10, width * 0.15, height * 0.25, 220);
          nebulaGrad1.addColorStop(0, 'rgba(88, 28, 135, 0.18)'); // deep purple
          nebulaGrad1.addColorStop(0.5, 'rgba(124, 58, 237, 0.08)'); // violet
          nebulaGrad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = nebulaGrad1;
          this.ctx.beginPath();
          this.ctx.arc(width * 0.15, height * 0.25, 220, 0, Math.PI * 2);
          this.ctx.fill();

          // Magenta/Pink Nebula near center-right
          const nebulaGrad2 = this.ctx.createRadialGradient(width * 0.65, height * 0.4, 20, width * 0.65, height * 0.4, 280);
          nebulaGrad2.addColorStop(0, 'rgba(157, 23, 77, 0.15)'); // deep magenta
          nebulaGrad2.addColorStop(0.4, 'rgba(219, 39, 119, 0.06)'); // pink
          nebulaGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = nebulaGrad2;
          this.ctx.beginPath();
          this.ctx.arc(width * 0.65, height * 0.4, 280, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();

          // --- 2. Draw Milky Way Galaxy Nebula ---
          this.ctx.save();
          const galX = width * 0.35;
          const galY = height * 0.32;
          this.ctx.translate(galX, galY);
          this.ctx.rotate(-Math.PI / 5); // Tilted galaxy

          // Galaxy Outer Glow (Nebula Dust)
          this.ctx.save();
          const galOuterGradA = this.ctx.createRadialGradient(0, 0, 5, 0, 0, 160);
          galOuterGradA.addColorStop(0, 'rgba(109, 40, 217, 0.32)'); // purple nebula core
          galOuterGradA.addColorStop(0.4, 'rgba(192, 38, 211, 0.18)'); // fuchsia dust
          galOuterGradA.addColorStop(0.75, 'rgba(6, 182, 212, 0.08)'); // cyan tail
          galOuterGradA.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = galOuterGradA;
          this.ctx.scale(2.5, 0.75); // Stretch horizontally
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 160, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();

          // Layer B: Bright cyan-blue inner envelope
          this.ctx.save();
          const galOuterGradB = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 90);
          galOuterGradB.addColorStop(0, 'rgba(6, 182, 212, 0.35)'); // vibrant cyan
          galOuterGradB.addColorStop(0.5, 'rgba(59, 130, 246, 0.15)'); // blue
          galOuterGradB.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = galOuterGradB;
          this.ctx.scale(2.2, 0.65);
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 90, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();

          // Galaxy Core (Bright white center glow)
          const galCoreGrad = this.ctx.createRadialGradient(0, 0, 1, 0, 0, 28);
          galCoreGrad.addColorStop(0, '#ffffff'); // bright core
          galCoreGrad.addColorStop(0.2, '#fef08a'); // gold center
          galCoreGrad.addColorStop(0.5, 'rgba(249, 115, 22, 0.6)'); // orange boundary
          galCoreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = galCoreGrad;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 28, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();

          // Galaxy Spiral Arms (Slow rotating star clusters)
          this.ctx.save();
          this.ctx.translate(galX, galY);
          this.ctx.rotate(-Math.PI / 5 + this.weatherTime * 0.012); // Slow spinning effect
          
          // Multi-colored spiral stars
          const starColors = ['#ffffff', '#e0f2fe', '#fbcfe8', '#cffafe', '#fef9c3'];
          const numStars = 80;
          for (let i = 0; i < numStars; i++) {
            const angle = i * 0.32;
            const r = 10 + i * 2.2;
            
            // Arm 1
            const x1 = r * Math.cos(angle);
            const y1 = r * Math.sin(angle) * 0.38;
            const size1 = 1.0 + (Math.sin(i * 12.3) * 0.5 + 0.5) * 2.0;
            this.ctx.globalAlpha = 0.2 + (Math.sin(this.weatherTime * 2.0 + i) * 0.5 + 0.5) * 0.8;
            this.ctx.fillStyle = starColors[i % starColors.length];
            this.ctx.fillRect(x1, y1, size1, size1);

            // Arm 2 (180 deg opposite)
            const x2 = r * Math.cos(angle + Math.PI);
            const y2 = r * Math.sin(angle + Math.PI) * 0.38;
            this.ctx.fillRect(x2, y2, size1, size1);
          }
          this.ctx.restore();
        }

        // --- 3. Draw Giant Detailed Moon ---
        const moonX = width * 0.8;
        const moonY = height * 0.22;
        const moonRadius = 40; // slightly larger for majestic details

        if (isMobile) {
          // Optimized flat moon drawing for mobile devices (removes radial gradients, craters, and corona glows)
          this.ctx.fillStyle = '#cbd5e1'; // solid pale silver
          this.ctx.beginPath();
          this.ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
          this.ctx.fill();
        } else {
          // Outer Moon Corona Glow (cyan-violet space atmosphere rim - brightened)
          this.ctx.save();
          const moonGlow = this.ctx.createRadialGradient(moonX, moonY, moonRadius * 0.9, moonX, moonY, moonRadius * 2.4);
          moonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.42)'); // bright white corona rim
          moonGlow.addColorStop(0.3, 'rgba(103, 232, 249, 0.20)'); // cyan secondary glow
          moonGlow.addColorStop(0.7, 'rgba(139, 92, 246, 0.06)'); // faint purple outer boundary
          moonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = moonGlow;
          this.ctx.beginPath();
          this.ctx.arc(moonX, moonY, moonRadius * 2.4, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();

          // Moon Body Sphere (3D spherical shade - brightened)
          this.ctx.save();
          const moonBody = this.ctx.createRadialGradient(moonX - 10, moonY - 10, 4, moonX, moonY, moonRadius);
          moonBody.addColorStop(0, '#ffffff'); // Sunlit white
          moonBody.addColorStop(0.4, '#f8fafc'); // Pale silver
          moonBody.addColorStop(0.75, '#cbd5e1'); // Silver grey shadow boundary (lighter)
          moonBody.addColorStop(1, '#94a3b8'); // Much lighter shadow side
          this.ctx.fillStyle = moonBody;
          this.ctx.beginPath();
          this.ctx.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
          this.ctx.fill();

          // Lunar Maria (Subtle light-silver lunar plains for a clean surface look)
          this.ctx.fillStyle = 'rgba(241, 245, 249, 0.15)';
          const drawMare = (mx: number, my: number, rx: number, ry: number, rot: number) => {
            this.ctx.save();
            this.ctx.translate(moonX + mx, moonY + my);
            this.ctx.rotate(rot);
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
          };
          drawMare(-12, -10, 10, 6, Math.PI / 6);
          drawMare(8, -15, 7, 5, -Math.PI / 4);
          drawMare(-22, 5, 8, 12, Math.PI / 12);
          drawMare(-5, 18, 14, 8, -Math.PI / 8);
          drawMare(15, 10, 9, 6, Math.PI / 4);

          // Moon Craters (with subtle highlights for premium depth without dark spots)
          const drawCrater = (cx: number, cy: number, r: number) => {
            // Crater bowl (light silver-grey instead of dark slate)
            this.ctx.fillStyle = 'rgba(248, 250, 252, 0.25)';
            this.ctx.beginPath();
            this.ctx.arc(moonX + cx, moonY + cy, r, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Subtle soft rim (light silver-grey instead of dark)
            this.ctx.strokeStyle = 'rgba(203, 213, 225, 0.25)';
            this.ctx.lineWidth = 0.8;
            this.ctx.beginPath();
            this.ctx.arc(moonX + cx - 0.5, moonY + cy - 0.5, r, Math.PI * 1.7, Math.PI * 0.7);
            this.ctx.stroke();

            // Bright rim highlight (sunlit side)
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            this.ctx.lineWidth = 0.8;
            this.ctx.beginPath();
            this.ctx.arc(moonX + cx + 0.8, moonY + cy + 0.8, r, Math.PI * 0.7, Math.PI * 1.7);
            this.ctx.stroke();
          };

          // Draw multiple craters
          drawCrater(-12, -6, 6);
          drawCrater(6, 12, 5.5);
          drawCrater(-18, 14, 4);
          drawCrater(16, -10, 5);
          drawCrater(2, -18, 3);
          drawCrater(-3, 20, 3.5);
          drawCrater(22, 6, 2.5);
          drawCrater(-24, -12, 3);
          drawCrater(12, 22, 2);
          this.ctx.restore();
        }

        // --- 4. Twinkling Stars (Deep Parallax Atmosphere) ---
        // Twinkling stars of different color variants (white, cyan, fuchsia, gold)
        const starPalette = ['#ffffff', '#ffffff', '#cffafe', '#fbcfe8', '#fef9c3'];
        const starCount = isMobile ? 25 : 90; // Significantly reduced star density on mobile to cut redraw path overhead
        for (let i = 0; i < starCount; i++) {
          const x = (Math.sin(i * 1421.3) * 0.5 + 0.5) * width;
          const y = (Math.cos(i * 842.1) * 0.5 + 0.5) * (height * 0.88);
          const size = 0.8 + (Math.sin(i * 77.3) * 0.5 + 0.5) * 1.6;
          const speed = 1.2 + (Math.sin(i * 33.3) * 0.5 + 0.5) * 2.5;
          const alpha = 0.2 + (Math.sin(this.weatherTime * speed + i) * 0.5 + 0.5) * 0.8;
          
          this.ctx.globalAlpha = alpha;
          this.ctx.fillStyle = starPalette[i % starPalette.length];
          this.ctx.fillRect(x, y, size, size);
        }
        this.ctx.globalAlpha = 1.0;

        // --- 5. Shooting Stars (Meteors) ---
        // Procedurally trigger a shooting star streak across the background
        const cycle = (this.weatherTime * 0.25) % 15; // Streaks every 15 seconds
        if (cycle < 2.0 && !isMobile) { // Metors disabled on mobile devices to optimize updates
          this.ctx.save();
          const t = cycle / 2.0; // Normalized time (0 to 1)
          
          // Meteor start & end coordinate logic based on cycle index
          const cycleIdx = Math.floor(this.weatherTime / 15);
          const startX = ((Math.sin(cycleIdx * 71.3) * 0.5 + 0.5) * 0.4 + 0.1) * width;
          const startY = ((Math.cos(cycleIdx * 43.7) * 0.5 + 0.5) * 0.2 + 0.05) * height;
          
          const angle = Math.PI / 6; // Streak downwards at 30 degrees
          const length = 180;
          const distance = 400 * t; // slide distance
          
          const curX = startX + distance * Math.cos(angle);
          const curY = startY + distance * Math.sin(angle);
          
          // Draw meteor trail
          const meteorGrad = this.ctx.createLinearGradient(
            curX, curY, 
            curX - length * Math.cos(angle), curY - length * Math.sin(angle)
          );
          meteorGrad.addColorStop(0, 'rgba(167, 139, 250, 0.8)'); // Purple tip
          meteorGrad.addColorStop(0.25, 'rgba(103, 232, 249, 0.4)'); // Cyan trail
          meteorGrad.addColorStop(1, 'rgba(0, 0, 0, 0)'); // fade out
          
          this.ctx.strokeStyle = meteorGrad;
          this.ctx.lineWidth = 1.8;
          this.ctx.beginPath();
          this.ctx.moveTo(curX, curY);
          this.ctx.lineTo(curX - length * Math.cos(angle), curY - length * Math.sin(angle));
          this.ctx.stroke();
          this.ctx.restore();
        }
        break;
      }

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
        const isMobile = (window as any).gameIsMobile;

        // --- 1. Draw Subtle Radiant Celestial Sun Glow (No sharp half moon outline) ---
        const sunX = width * 0.5;
        const sunY = -60;
        const sunGlowRad = isMobile ? 220 : 450; // Soft wide glow
        
        this.ctx.save();
        const sunGrad = this.ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunGlowRad);
        sunGrad.addColorStop(0, 'rgba(255, 248, 220, 0.35)'); // Soft warm cream
        sunGrad.addColorStop(0.3, 'rgba(255, 235, 180, 0.18)'); // Soft golden white
        sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = sunGrad;
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, sunGlowRad, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();

        // --- 2. Draw Static Volumetric God Rays (Light Rays - Now Enabled and Optimized on Mobile as well) ---
        this.ctx.save();
        this.ctx.translate(sunX, sunY);
        this.ctx.globalCompositeOperation = 'screen';

        const numRays = isMobile ? 4 : 7;
        const maxOpacity = isMobile ? 0.12 : 0.18;
        for (let i = 0; i < numRays; i++) {
          const baseAngle = (i - (numRays - 1) / 2) * (isMobile ? 0.4 : 0.35);
          const rayAngle = Math.PI / 2 + baseAngle;

          const rayWidth = isMobile ? 0.08 : 0.09;
          const rayOpacity = maxOpacity;

          const rayLen = height * 1.8;
          const leftX = Math.cos(rayAngle - rayWidth) * rayLen;
          const leftY = Math.sin(rayAngle - rayWidth) * rayLen;
          const rightX = Math.cos(rayAngle + rayWidth) * rayLen;
          const rightY = Math.sin(rayAngle + rayWidth) * rayLen;

          const grad = this.ctx.createLinearGradient(0, 0, (leftX + rightX) / 2, (leftY + rightY) / 2);
          grad.addColorStop(0, `rgba(255, 244, 215, ${rayOpacity})`);
          grad.addColorStop(0.3, `rgba(255, 250, 235, ${rayOpacity * 0.6})`);
          grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

          this.ctx.fillStyle = grad;
          this.ctx.beginPath();
          this.ctx.moveTo(0, 0);
          this.ctx.lineTo(leftX, leftY);
          this.ctx.lineTo(rightX, rightY);
          this.ctx.closePath();
          this.ctx.fill();
        }
        this.ctx.restore();

        // --- 4. Draw Floating Sparkles & Halo particles (Rising slowly) ---
        this.ctx.save();
        const floatParticlesCount = isMobile ? 3 : 8; // Fewer particles on mobile
        for (let i = 0; i < floatParticlesCount; i++) {
          const randSeed = i * 789.23;
          const x = (Math.sin(randSeed) * 0.5 + 0.5) * width;
          const yStart = (Math.cos(randSeed * 1.5) * 0.5 + 0.5) * height;
          const floatDist = (this.weatherTime * (15 + (i % 5) * 5)) % (height + 50);
          const y = (yStart - floatDist + height) % height;

          const size = 1.2 + (Math.sin(randSeed * 4.3) * 0.5 + 0.5) * 2.2;
          const pulse = Math.sin(this.weatherTime * 1.8 + i) * 0.5 + 0.5;
          const alpha = (0.2 + pulse * 0.6) * (y / height); // Fades out as it goes higher

          this.ctx.globalAlpha = alpha;
          this.ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#fef08a'; // Alternate white and gold
          
          if (!(window as any).gameDisableShadows) {
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = '#ffd700';
          }

          // Draw small glowing diamond/star or soft bubble
          if (i % 3 === 0) {
            // Draw diamond sparkle
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - size);
            this.ctx.lineTo(x + size * 0.7, y);
            this.ctx.lineTo(x, y + size);
            this.ctx.lineTo(x - size * 0.7, y);
            this.ctx.closePath();
            this.ctx.fill();
          } else {
            // Draw soft light bubble
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
          }
        }
        this.ctx.restore();
        break;
      }
      case 'desert': {
        const isMobile = (window as any).gameIsMobile;
        
        // Animate the sun slowly from left to right across the screen in a parabolic arc
        const speed = 6; // Slowed down from 16 pixels per second
        const baseRadius = 40;
        const range = width + 300;
        const sunX = ((this.weatherTime * speed) % range) - 150;
        
        // Curved sky path (parabolic arc)
        const normalizedX = (sunX + 150) / range;
        const peakHeight = height * 0.32;
        const baseHeight = height * 0.48;
        const sunY = baseHeight - Math.sin(normalizedX * Math.PI) * peakHeight;

        if (!isMobile) {
          // --- 2. Outer Scorching Heat Haze Corona Glow ---
          this.ctx.save();
          const coronaGrad = this.ctx.createRadialGradient(sunX, sunY, baseRadius * 0.7, sunX, sunY, baseRadius * 4.8);
          coronaGrad.addColorStop(0, 'rgba(255, 220, 120, 0.42)'); // Golden corona rim
          coronaGrad.addColorStop(0.3, 'rgba(255, 150, 30, 0.18)'); // Scorching orange haze
          coronaGrad.addColorStop(0.75, 'rgba(239, 68, 68, 0.05)'); // Soft heat boundary
          coronaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = coronaGrad;
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, baseRadius * 4.8, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();

          // --- 3. Dynamic Sun Lens Ring (Real Sun Glow Accent) ---
          this.ctx.save();
          this.ctx.globalCompositeOperation = 'screen';
          this.ctx.strokeStyle = 'rgba(255, 230, 180, 0.06)';
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, baseRadius * 2.2, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.restore();
        }

        // --- 4. Inner Scorching Hot Sun Sphere ---
        this.ctx.save();
        if (isMobile) {
          // Flat sun core without radial blending gradients to boost mobile FPS
          this.ctx.fillStyle = '#ffd700'; // scorching hot yellow
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, baseRadius, 0, Math.PI * 2);
          this.ctx.fill();
        } else {
          const sunGrad = this.ctx.createRadialGradient(sunX - 3, sunY - 3, 2, sunX, sunY, baseRadius);
          sunGrad.addColorStop(0, '#ffffff'); // Blazing white sun core
          sunGrad.addColorStop(0.25, '#fffbeb'); // Cream yellow halo
          sunGrad.addColorStop(0.7, '#fef08a'); // Rich gold rim
          sunGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
          this.ctx.fillStyle = sunGrad;
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, baseRadius, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Core sun ball
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, baseRadius * 0.62, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
        
        break;
      }

    }
    this.ctx.restore();
  }

  private drawParallaxHills(worldId: string, width: number, height: number) {
    const isMobile = (window as any).gameIsMobile || false;
    
    // 3 separate layers of hills / city silhouettes
    for (let layer = 1; layer <= 3; layer++) {
      this.ctx.save();
      const offset = this.offsets[layer];
      const color = this.getLayerColor(worldId, layer);
      this.ctx.fillStyle = color;

      this.ctx.beginPath();
      this.ctx.moveTo(0, height);

      const segmentWidth = 600;
      
      // Dynamically adjust step size per world to cut path complexity by 60-70%
      // On mobile devices, we double stepX to dramatically optimize draw paths!
      let baseStepX = 30;
      if (worldId === 'space') {
        baseStepX = 35;
      } else if (worldId === 'volcano' || worldId === 'ice') {
        baseStepX = 25;
      } else if (worldId === 'heaven') {
        baseStepX = 60; // Significantly reduce path drawing complexity for heaven world lightweighting
      }
      
      const stepX = isMobile ? baseStepX * 3.8 : baseStepX;

      const profile = this.cachedProfiles[layer];
      const hasProfile = profile && profile.length > 0;

      // Loop over the screen width to draw the mountains/skyscrapers
      for (let x = -segmentWidth; x < width + segmentWidth + stepX; x += stepX) {
        const lookupX = ((Math.floor(x + offset) % 16000) + 16000) % 16000;
        let y = height * 0.55 + layer * 70; // baseline height

        if (hasProfile) {
          y += profile[lookupX];
        }

        // Connect minor wave oscillation swaying the hill heights for Levels Mode
        if (this.activeLevelNum >= 1) {
          const sway = Math.sin(this.weatherTime * 2.0 + x * 0.003) * (8 * (4 - layer));
          y += sway;
        }

        // Subtract camera height tracker with pixel-perfect integer precision
        const finalY = Math.round(y - this.cameraY * (layer * 0.25));
        const finalX = Math.round(x);
        this.ctx.lineTo(finalX, finalY);
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

      case 'retro':
        return [
          '#2e2e2e',
          '#424242',
          '#5c5c5c'
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
    if ((window as any).gameDisableShadows || worldId === 'retro') {
      // Bypassed on mobile / Low-Graphics Mode / Retro World to save immense GPU fill-rate!
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
    if (worldId === 'volcano') glowColor = 'rgba(255, 69, 0, 0.15)';
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

    // Translate standard coordinate space downwards by active cameraY with float precision for smooth tracking
    this.ctx.translate(0, -this.cameraY);
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
    const dx = Math.round((Math.random() - 0.5) * intensity);
    const dy = Math.round((Math.random() - 0.5) * intensity);
    ctx.translate(dx, dy);
  }
}
