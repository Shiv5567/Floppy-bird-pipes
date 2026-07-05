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
  public weatherTime = 0;
  private lightningFlash = 0;
  private lightningStrikeX = 0;

  // Day/Night cycle
   public timeOfDay = 6.0; // Start at 6:00 AM (Morning Scene)
  private timeSpeed = 0.0025;

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
        this.weather = { type: 'rain', windSpeed: 1, density: 68, lightning: true }; // 20% increased density
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
          // Spawn rain drops falling fast diagonally, reacting to flight wind speed (size increased by 30%)
          this.particleEngine.spawn(
            Math.random() * (width + 300) - 100,
            -10,
            -3 - Math.random() * 3 - this.currentSpeed * 1.4, // Wind sweeps backwards based on scrolling speed
            12 + Math.random() * 5,
            'rgba(174, 219, 240, 0.45)',
            (1.5 + Math.random() * 1.5) * 1.3, // 30% larger rain drops
            0.8,
            0.015,
            'square'
          );
          
          // Spawn wind-blown green leaves flowing right to left
          if (Math.random() < 0.18) {
            this.particleEngine.spawn(
              width + 20, // start offscreen on the right
              Math.random() * (height - 50), // random Y height
              -8 - Math.random() * 6 - this.currentSpeed * 1.2, // fast horizontal wind-blown speed to the left
              1 + Math.random() * 2, // gentle downward drift
              Math.random() > 0.5 ? '#2e7d32' : '#4caf50', // varied green leaf colors
              4 + Math.random() * 5, // size of leaves
              0.85,
              0.008 + Math.random() * 0.006, // slow decay so they traverse the screen
              'leaf', // Use the built-in 'leaf' shape
              false
            );
          }
          
          // Spawn a splash ripple on the bottom boundary (frequency increased by 20% to 0.36)
          if (Math.random() < 0.36) {
            this.particleEngine.spawn(
              Math.random() * width,
              height - 15 - Math.random() * 10,
              -this.currentSpeed * 0.2, // Drifts slightly with speed
              0,
              'rgba(174, 219, 240, 0.35)',
              1.3, // 30% larger splash ripples
              0.7,
              0.04,
              'bubble',
              false,
              undefined,
              0.39 // 30% larger growth factor (0.3 * 1.3)
            );
          }
          break;
        }

        case 'snow': {
          // 1. Soft snowflake drifting down with wavy wind gusts
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

          // 2. Real Ice Particles (Glittering ice pellets / crystals of random circle shapes)
          if (Math.random() < 0.45) {
            this.particleEngine.spawn(
              Math.random() * (width + 300) - 150,
              -10,
              snowWind - Math.random() * 2.5, // fast horizontal wind drift
              3.0 + Math.random() * 4.5, // falls fast (hail/ice pellets)
              Math.random() > 0.5 ? 'rgba(186, 242, 255, 0.82)' : 'rgba(255, 255, 255, 0.9)', // icy cyan/white
              1.5 + Math.random() * 3.5, // random circle sizes (1.5 to 5 pixels)
              0.95,
              0.006 + Math.random() * 0.004, // decay
              'circle', // Set the shape to 'circle' as requested!
              true, // enable glow
              'rgba(14, 165, 233, 0.35)' // light sky blue glow aura
            );
          }
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
          // Heavenly Feathers and golden sparkles falling slowly
          const isFeather = Math.random() > 0.5;
          this.particleEngine.spawn(
            Math.random() * width,
            -10,
            (Math.random() - 0.5) * 1.5 - this.currentSpeed * (isFeather ? 0.05 : 0.1),
            isFeather ? (0.5 + Math.random() * 0.8) : (1.0 + Math.random() * 1.5),
            isFeather ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 215, 0, 0.85)',
            isFeather ? (6 + Math.random() * 4) : (2.5 + Math.random() * 3.5),
            0.85,
            isFeather ? 0.005 : 0.01,
            isFeather ? 'feather' : 'star',
            true,
            isFeather ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 215, 0, 0.5)'
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
        skyGrad.addColorStop(0, '#04281a');
        skyGrad.addColorStop(1, '#0e4634');
        break;
      case 'ice':
        skyGrad.addColorStop(0, '#0d1e3a');
        skyGrad.addColorStop(1, '#2c4266');
        break;
      case 'desert': {
        const time = this.timeOfDay;
        
        // 4-Keyframe Continuous Day/Night Cycle Colors for Desert World
        const nightTop = [8, 4, 20];
        const nightBottom = [24, 16, 48];
        
        const morningTop = [253, 186, 116]; // Golden orange
        const morningBottom = [234, 88, 12];  // Deep orange
        
        const dayTop = [234, 179, 8];       // Scorching gold-yellow
        const dayBottom = [254, 240, 138];   // Warm light yellow
        
        const eveningTop = [194, 65, 12];    // Deep crimson-orange
        const eveningBottom = [124, 45, 18];   // Dark desert dust
        
        let r0, g0, b0, r1, g1, b1;
        
        if (time >= 0 && time < 6) {
          const progress = time / 6;
          r0 = Math.round(nightTop[0] + (morningTop[0] - nightTop[0]) * progress);
          g0 = Math.round(nightTop[1] + (morningTop[1] - nightTop[1]) * progress);
          b0 = Math.round(nightTop[2] + (morningTop[2] - nightTop[2]) * progress);
          
          r1 = Math.round(nightBottom[0] + (morningBottom[0] - nightBottom[0]) * progress);
          g1 = Math.round(nightBottom[1] + (morningBottom[1] - nightBottom[1]) * progress);
          b1 = Math.round(nightBottom[2] + (morningBottom[2] - nightBottom[2]) * progress);
        } else if (time >= 6 && time < 12) {
          const progress = (time - 6) / 6;
          r0 = Math.round(morningTop[0] + (dayTop[0] - morningTop[0]) * progress);
          g0 = Math.round(morningTop[1] + (dayTop[1] - morningTop[1]) * progress);
          b0 = Math.round(morningTop[2] + (dayTop[2] - morningTop[2]) * progress);
          
          r1 = Math.round(morningBottom[0] + (dayBottom[0] - morningBottom[0]) * progress);
          g1 = Math.round(morningBottom[1] + (dayBottom[1] - morningBottom[1]) * progress);
          b1 = Math.round(morningBottom[2] + (dayBottom[2] - morningBottom[2]) * progress);
        } else if (time >= 12 && time < 18) {
          const progress = (time - 12) / 6;
          r0 = Math.round(dayTop[0] + (eveningTop[0] - dayTop[0]) * progress);
          g0 = Math.round(dayTop[1] + (eveningTop[1] - dayTop[1]) * progress);
          b0 = Math.round(dayTop[2] + (eveningTop[2] - dayTop[2]) * progress);
          
          r1 = Math.round(dayBottom[0] + (eveningBottom[0] - dayBottom[0]) * progress);
          g1 = Math.round(dayBottom[1] + (eveningBottom[1] - dayBottom[1]) * progress);
          b1 = Math.round(dayBottom[2] + (eveningBottom[2] - dayBottom[2]) * progress);
        } else {
          const progress = (time - 18) / 6;
          r0 = Math.round(eveningTop[0] + (nightTop[0] - eveningTop[0]) * progress);
          g0 = Math.round(eveningTop[1] + (nightTop[1] - eveningTop[1]) * progress);
          b0 = Math.round(eveningTop[2] + (nightTop[2] - eveningTop[2]) * progress);
          
          r1 = Math.round(eveningBottom[0] + (nightBottom[0] - eveningBottom[0]) * progress);
          g1 = Math.round(eveningBottom[1] + (nightBottom[1] - eveningBottom[1]) * progress);
          b1 = Math.round(eveningBottom[2] + (nightBottom[2] - eveningBottom[2]) * progress);
        }
        
        skyGrad.addColorStop(0, `rgb(${r0}, ${g0}, ${b0})`);
        skyGrad.addColorStop(1, `rgb(${r1}, ${g1}, ${b1})`);
        break;
      }
      case 'volcano':
        skyGrad.addColorStop(0, '#110300');
        skyGrad.addColorStop(1, '#3b0a00');
        break;
      case 'space': {
        const time = this.timeOfDay;
        
        // 4-Keyframe Continuous Day/Night Cycle Colors for Twilight Horizon
        const nightTop = [0, 4, 10];
        const nightBottom = [9, 24, 48];
        
        const morningTop = [254, 215, 170];  // Warm peach sunrise
        const morningBottom = [234, 88, 12]; // Deep orange horizon
        
        const dayTop = [224, 242, 254];      // White-blue day
        const dayBottom = [186, 230, 253];   // Light blue day
        
        const eveningTop = [240, 150, 150];   // Soft rose-red sunset
        const eveningBottom = [220, 80, 80];  // Warm coral-red sunset
        
        let r0, g0, b0, r1, g1, b1;
        
        if (time >= 0 && time < 6) {
          // Midnight to Morning (0:00 - 6:00)
          const progress = time / 6;
          r0 = Math.round(nightTop[0] + (morningTop[0] - nightTop[0]) * progress);
          g0 = Math.round(nightTop[1] + (morningTop[1] - nightTop[1]) * progress);
          b0 = Math.round(nightTop[2] + (morningTop[2] - nightTop[2]) * progress);
          
          r1 = Math.round(nightBottom[0] + (morningBottom[0] - nightBottom[0]) * progress);
          g1 = Math.round(nightBottom[1] + (morningBottom[1] - nightBottom[1]) * progress);
          b1 = Math.round(nightBottom[2] + (morningBottom[2] - nightBottom[2]) * progress);
        } else if (time >= 6 && time < 12) {
          // Morning to Midday (6:00 - 12:00)
          const progress = (time - 6) / 6;
          r0 = Math.round(morningTop[0] + (dayTop[0] - morningTop[0]) * progress);
          g0 = Math.round(morningTop[1] + (dayTop[1] - morningTop[1]) * progress);
          b0 = Math.round(morningTop[2] + (dayTop[2] - morningTop[2]) * progress);
          
          r1 = Math.round(morningBottom[0] + (dayBottom[0] - morningBottom[0]) * progress);
          g1 = Math.round(morningBottom[1] + (dayBottom[1] - morningBottom[1]) * progress);
          b1 = Math.round(morningBottom[2] + (dayBottom[2] - morningBottom[2]) * progress);
        } else if (time >= 12 && time < 18) {
          // Midday to Sunset (12:00 - 18:00)
          const progress = (time - 12) / 6;
          r0 = Math.round(dayTop[0] + (eveningTop[0] - dayTop[0]) * progress);
          g0 = Math.round(dayTop[1] + (eveningTop[1] - dayTop[1]) * progress);
          b0 = Math.round(dayTop[2] + (eveningTop[2] - dayTop[2]) * progress);
          
          r1 = Math.round(dayBottom[0] + (eveningBottom[0] - dayBottom[0]) * progress);
          g1 = Math.round(dayBottom[1] + (eveningBottom[1] - dayBottom[1]) * progress);
          b1 = Math.round(dayBottom[2] + (eveningBottom[2] - dayBottom[2]) * progress);
        } else {
          // Sunset to Midnight (18:00 - 24:00)
          const progress = (time - 18) / 6;
          r0 = Math.round(eveningTop[0] + (nightTop[0] - eveningTop[0]) * progress);
          g0 = Math.round(eveningTop[1] + (nightTop[1] - eveningTop[1]) * progress);
          b0 = Math.round(eveningTop[2] + (nightTop[2] - eveningTop[2]) * progress);
          
          r1 = Math.round(eveningBottom[0] + (nightBottom[0] - eveningBottom[0]) * progress);
          g1 = Math.round(eveningBottom[1] + (nightBottom[1] - eveningBottom[1]) * progress);
          b1 = Math.round(eveningBottom[2] + (nightBottom[2] - eveningBottom[2]) * progress);
        }
        
        skyGrad.addColorStop(0, `rgb(${r0}, ${g0}, ${b0})`);
        skyGrad.addColorStop(1, `rgb(${r1}, ${g1}, ${b1})`);
        break;
      }
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
      default: {
        const time = this.timeOfDay;
        
        // 4-Keyframe Continuous Day/Night Cycle Colors for Classic World
        const nightTop = [4, 8, 20];
        const nightBottom = [13, 27, 58];
        
        const morningTop = [254, 215, 170];  // Rose gold
        const morningBottom = [253, 186, 116]; // Golden orange
        
        const dayTop = [125, 211, 252];      // Sky blue (#7dd3fc)
        const dayBottom = [255, 255, 255];   // White (#ffffff)
        
        const eveningTop = [248, 113, 113];   // Warm red
        const eveningBottom = [249, 115, 22];  // Deep orange
        
        let r0, g0, b0, r1, g1, b1;
        
        if (time >= 0 && time < 6) {
          const progress = time / 6;
          r0 = Math.round(nightTop[0] + (morningTop[0] - nightTop[0]) * progress);
          g0 = Math.round(nightTop[1] + (morningTop[1] - nightTop[1]) * progress);
          b0 = Math.round(nightTop[2] + (morningTop[2] - nightTop[2]) * progress);
          
          r1 = Math.round(nightBottom[0] + (morningBottom[0] - nightBottom[0]) * progress);
          g1 = Math.round(nightBottom[1] + (morningBottom[1] - nightBottom[1]) * progress);
          b1 = Math.round(nightBottom[2] + (morningBottom[2] - nightBottom[2]) * progress);
        } else if (time >= 6 && time < 12) {
          const progress = (time - 6) / 6;
          r0 = Math.round(morningTop[0] + (dayTop[0] - morningTop[0]) * progress);
          g0 = Math.round(morningTop[1] + (dayTop[1] - morningTop[1]) * progress);
          b0 = Math.round(morningTop[2] + (dayTop[2] - morningTop[2]) * progress);
          
          r1 = Math.round(morningBottom[0] + (dayBottom[0] - morningBottom[0]) * progress);
          g1 = Math.round(morningBottom[1] + (dayBottom[1] - morningBottom[1]) * progress);
          b1 = Math.round(morningBottom[2] + (dayBottom[2] - morningBottom[2]) * progress);
        } else if (time >= 12 && time < 18) {
          const progress = (time - 12) / 6;
          r0 = Math.round(dayTop[0] + (eveningTop[0] - dayTop[0]) * progress);
          g0 = Math.round(dayTop[1] + (eveningTop[1] - dayTop[1]) * progress);
          b0 = Math.round(dayTop[2] + (eveningTop[2] - dayTop[2]) * progress);
          
          r1 = Math.round(dayBottom[0] + (eveningBottom[0] - dayBottom[0]) * progress);
          g1 = Math.round(dayBottom[1] + (eveningBottom[1] - dayBottom[1]) * progress);
          b1 = Math.round(dayBottom[2] + (eveningBottom[2] - dayBottom[2]) * progress);
        } else {
          const progress = (time - 18) / 6;
          r0 = Math.round(eveningTop[0] + (nightTop[0] - eveningTop[0]) * progress);
          g0 = Math.round(eveningTop[1] + (nightTop[1] - eveningTop[1]) * progress);
          b0 = Math.round(eveningTop[2] + (nightTop[2] - eveningTop[2]) * progress);
          
          r1 = Math.round(eveningBottom[0] + (nightBottom[0] - eveningBottom[0]) * progress);
          g1 = Math.round(eveningBottom[1] + (nightBottom[1] - eveningBottom[1]) * progress);
          b1 = Math.round(eveningBottom[2] + (nightBottom[2] - eveningBottom[2]) * progress);
        }
        
        skyGrad.addColorStop(0, `rgb(${r0}, ${g0}, ${b0})`);
        skyGrad.addColorStop(1, `rgb(${r1}, ${g1}, ${b1})`);
        break;
      }
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
      case 'jungle': {
        // Draw heavy, thick, rolling storm clouds at the top of the screen (Amazon Rainforest)
        this.ctx.save();
        
        const timeOffset = this.weatherTime * 15; // cloud movement speed
        
        // Layer 1: Distant dark clouds
        this.ctx.fillStyle = 'rgba(22, 45, 36, 0.55)';
        for (let i = -150; i < width + 300; i += 180) {
          const cloudX = i + (timeOffset * 0.15) % 180;
          this.ctx.beginPath();
          this.ctx.arc(cloudX, 20, 100, 0, Math.PI * 2);
          this.ctx.arc(cloudX + 50, 10, 80, 0, Math.PI * 2);
          this.ctx.fill();
        }
        
        // Layer 2: Midground heavy storm clouds
        this.ctx.fillStyle = 'rgba(16, 32, 26, 0.60)';
        for (let i = -150; i < width + 300; i += 220) {
          const cloudX = i + (timeOffset * 0.3) % 220;
          this.ctx.beginPath();
          this.ctx.arc(cloudX, 35, 120, 0, Math.PI * 2);
          this.ctx.arc(cloudX + 80, 20, 90, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Layer 3: Foremost thick black-green clouds
        this.ctx.fillStyle = 'rgba(10, 22, 18, 0.70)';
        for (let i = -150; i < width + 300; i += 260) {
          const cloudX = i + (timeOffset * 0.5) % 260;
          this.ctx.beginPath();
          this.ctx.arc(cloudX, 50, 130, 0, Math.PI * 2);
          this.ctx.arc(cloudX + 100, 30, 100, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Draw lightning flashes in the clouds
        if (this.lightningFlash > 0) {
          this.ctx.fillStyle = `rgba(180, 255, 230, ${this.lightningFlash * 0.35})`;
          this.ctx.fillRect(0, 0, width, height);
        }

        this.ctx.restore();
        break;
      }
      case 'volcano': {
        // Volcanic ash/embers rising in the background
        this.ctx.save();
        const emberCount = 20;
        for (let i = 0; i < emberCount; i++) {
          const seedX = Math.sin(i * 4821.5) * 0.5 + 0.5;
          const seedY = Math.cos(i * 3829.1) * 0.5 + 0.5;
          const x = (seedX * width + this.weatherTime * 20) % width;
          const y = (height - (seedY * height + this.weatherTime * 85) % height);
          const size = 1.5 + Math.sin(this.weatherTime + i) * 0.8;
          
          this.ctx.fillStyle = Math.random() > 0.3 ? '#ff4500' : '#ffcc00';
          this.ctx.beginPath();
          this.ctx.arc(x, y, size, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
        break;
      }
      case 'underwater': {
        this.ctx.save();
        
        // 1. Volumetric God Rays
        const numRays = 4;
        for (let i = 0; i < numRays; i++) {
          const rayWidth = 60 + i * 30;
          const startX = width * 0.15 + i * (width * 0.22) + Math.sin(this.weatherTime * 0.4 + i) * 35;
          
          const rayGrad = this.ctx.createLinearGradient(startX, 0, startX - 80, height);
          rayGrad.addColorStop(0, 'rgba(0, 243, 255, 0.18)');
          rayGrad.addColorStop(0.5, 'rgba(0, 180, 255, 0.05)');
          rayGrad.addColorStop(1, 'rgba(0, 180, 255, 0)');
          
          this.ctx.fillStyle = rayGrad;
          this.ctx.beginPath();
          this.ctx.moveTo(startX - rayWidth / 2, 0);
          this.ctx.lineTo(startX + rayWidth / 2, 0);
          this.ctx.lineTo(startX + rayWidth / 2 - 120, height);
          this.ctx.lineTo(startX - rayWidth / 2 - 120, height);
          this.ctx.closePath();
          this.ctx.fill();
        }
        
        // 2. Glowing Jellyfish floating up
        const jellyCount = 4;
        for (let i = 0; i < jellyCount; i++) {
          const jellySpeed = 12 + i * 4;
          const size = 10 + i * 4;
          const startY = height + 50;
          const currY = startY - ((this.weatherTime * jellySpeed + i * 180) % (height + 100));
          const currX = width * 0.15 + (Math.sin(i * 821.5) * 0.5 + 0.5) * (width * 0.7) + Math.sin(this.weatherTime * 0.5 + i) * 25;
          
          this.ctx.save();
          this.ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.weatherTime * 2 + i);
          
          // Jellyfish dome
          this.ctx.fillStyle = '#00f3ff';
          this.ctx.beginPath();
          this.ctx.arc(currX, currY, size, Math.PI, 0, false);
          this.ctx.ellipse(currX, currY, size, size * 0.3, 0, 0, Math.PI, false);
          this.ctx.fill();
          
          // Jellyfish tentacles
          this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
          this.ctx.lineWidth = 1.2;
          this.ctx.beginPath();
          for (let t = -2; t <= 2; t++) {
            const tx = currX + t * (size * 0.3);
            const ty = currY + size * 0.3;
            this.ctx.moveTo(tx, ty);
            this.ctx.bezierCurveTo(
              tx + Math.sin(this.weatherTime + i + t) * 6, ty + size * 0.6,
              tx - Math.sin(this.weatherTime + i + t) * 4, ty + size * 1.2,
              tx, ty + size * 1.6
            );
          }
          this.ctx.stroke();
          this.ctx.restore();
        }
        this.ctx.restore();
        break;
      }
      case 'retro': {
        this.ctx.save();
        
        // 1. Synthwave Sun
        const sunX = width * 0.5;
        const sunY = height * 0.5;
        const sunRadius = 60;
        
        const sunGrad = this.ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
        sunGrad.addColorStop(0, '#ff007f'); // Neon Pink
        sunGrad.addColorStop(1, '#ffaa00'); // Neon Gold
        
        this.ctx.fillStyle = sunGrad;
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Slicing lines (destination-out to cut lines into the sun)
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = '#000';
        for (let yOffset = -sunRadius + 12; yOffset < sunRadius; yOffset += 10) {
          const thickness = 2 + (yOffset + sunRadius) / (sunRadius * 2) * 5; // thicker lines near bottom
          this.ctx.fillRect(sunX - sunRadius - 10, sunY + yOffset, sunRadius * 2 + 20, thickness);
        }
        
        this.ctx.restore();
        break;
      }
      case 'space': {
        const isMobile = (window as any).gameIsMobile;
        const time = this.timeOfDay;
        
        // Night Opacity (Nebula, Galaxy, Moon, Stars)
        let nightOpacity = 0;
        if (time >= 19 || time < 5) nightOpacity = 1.0;
        else if (time >= 17 && time < 19) nightOpacity = (time - 17) / 2;
        else if (time >= 5 && time < 7) nightOpacity = (7 - time) / 2;
        
        // Day Opacity (Cosmic Sun & Rays)
        let dayOpacity = 0;
        if (time >= 7 && time < 17) dayOpacity = 1.0;
        else if (time >= 5 && time < 7) dayOpacity = (time - 5) / 2;
        else if (time >= 17 && time < 19) dayOpacity = (19 - time) / 2;

        if (!isMobile) {
          // --- 1. Distant Nebula Cloud Glows ---
          if (nightOpacity > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = nightOpacity;
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
            this.ctx.globalAlpha = nightOpacity;
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
            this.ctx.restore(); // matches ctx.save() at spiral arms
          }
        }

        // --- 3. Draw Giant Detailed Moon (Only at Night) ---
        if (nightOpacity > 0) {
          const moonX = width * 0.8;
          const moonY = height * 0.22;
          const moonRadius = 40; // slightly larger for majestic details

          this.ctx.save();
          this.ctx.globalAlpha = nightOpacity;

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
          this.ctx.restore();
        }

        // --- 4. Draw Cosmic Sun (Only during Day) ---
        if (dayOpacity > 0) {
          const sunAngle = Math.PI * (time - 5) / 14;
          const sunX = -100 + (width + 200) * ((time - 5) / 14);
          const sunY = height * 0.62 - height * 0.45 * Math.sin(sunAngle);
          
          this.ctx.save();
          this.ctx.globalAlpha = dayOpacity;
          
          // Calculate redness factor for Sunrise (5-7 AM) and Sunset (5-7 PM)
          let redness = 0;
          if (time >= 5 && time < 7) {
            redness = 1 - (time - 5) / 2;
          } else if (time >= 17 && time < 19) {
            redness = (time - 17) / 2;
          }

          // Calculate how close the time is to midday (12:00)
          // Daytime is 5 to 19. Midday is 12. Maximum distance is 7 hours.
          const distToMidday = Math.abs(time - 12);
          const middayFactor = Math.max(0, 1 - distToMidday / 7); // 1.0 at 12:00, 0.0 at 5:00 and 19:00

          const rayAColor = `rgba(${Math.round(255)}, ${Math.round(248 - redness * 180)}, ${Math.round(200 - redness * 132)}, ${0.22 + middayFactor * 0.12 + redness * 0.06})`;
          const rayBColor = `rgba(${Math.round(255)}, ${Math.round(215 - redness * 177)}, ${Math.round(0 + redness * 38)}, ${0.15 + middayFactor * 0.10 + redness * 0.04})`;
          
          const sunCoreColor = `rgba(${Math.round(255)}, ${Math.round(255 - redness * 200)}, ${Math.round(255 - redness * 200)}, ${0.80 + middayFactor * 0.20})`;

          // 1. Layered Sunburst Rays (Warm White, Yellow & Peach / Sunset Red)
          this.ctx.save();
          this.ctx.translate(sunX, sunY);
          
          // Layer A: Rotating soft peach/white flares (white 40% reduced, soft yellow tint added / Sunset Red)
          this.ctx.save();
          this.ctx.rotate(this.weatherTime * 0.05);
          this.ctx.fillStyle = rayAColor;
          for (let r = 0; r < 8; r++) {
            this.ctx.rotate(Math.PI / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(0, -6);
            this.ctx.lineTo(18, 0);
            this.ctx.lineTo(0, 110); // longer, sweeping flare rays
            this.ctx.lineTo(-18, 0);
            this.ctx.closePath();
            this.ctx.fill();
          }
          this.ctx.restore();

          // Layer B: Counter-rotating golden/red flares
          this.ctx.save();
          this.ctx.rotate(-this.weatherTime * 0.03 + 0.25);
          this.ctx.fillStyle = rayBColor;
          for (let r = 0; r < 8; r++) {
            this.ctx.rotate(Math.PI / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(0, -5);
            this.ctx.lineTo(14, 0);
            this.ctx.lineTo(0, 85);
            this.ctx.lineTo(-14, 0);
            this.ctx.closePath();
            this.ctx.fill();
          }
          this.ctx.restore();
          
          this.ctx.restore();

          // 2. Crisp Solid Sun Core (no blurry radial gradient corona)
          this.ctx.fillStyle = sunCoreColor;
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, 20, 0, Math.PI * 2);
          this.ctx.fill();

          // 3. Midday bright white-hot inner core highlight
          if (middayFactor > 0) {
            this.ctx.save();
            const innerGlow = this.ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 15);
            innerGlow.addColorStop(0, '#ffffff'); // pure white hot center
            innerGlow.addColorStop(0.5, 'rgba(255, 253, 230, 0.95)');
            innerGlow.addColorStop(1, 'rgba(254, 240, 138, 0)'); // fade out to yellow-gold
            this.ctx.fillStyle = innerGlow;
            this.ctx.beginPath();
            this.ctx.arc(sunX, sunY, 15, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
          }
          
          this.ctx.restore();
        }

        // --- 5. Twinkling Stars (Only at Night) ---
        if (nightOpacity > 0) {
          this.ctx.save();
          const starPalette = ['#ffffff', '#fffbeb', '#a5f3fc', '#fbcfe8', '#fef9c3', '#e9d5ff', '#fda4af'];
          const starCount = isMobile ? 35 : 120;
          for (let i = 0; i < starCount; i++) {
            const x = (Math.sin(i * 1421.3) * 0.5 + 0.5) * width;
            const y = (Math.cos(i * 842.1) * 0.5 + 0.5) * (height * 0.88);
            
            // Smoother, deeper breathing twinkle cycle
            const twinkle = 0.25 + 0.75 * (Math.sin(this.weatherTime * 1.8 + i) * 0.5 + 0.5);
            const size = 0.9 + (Math.sin(i * 99.3) * 0.5 + 0.5) * 1.2;
            
            this.ctx.globalAlpha = nightOpacity * twinkle;
            this.ctx.fillStyle = starPalette[i % starPalette.length];
            
            // Draw regular tiny star
            this.ctx.fillRect(x - size/2, y - size/2, size, size);
            
            // Draw special glowing cross flares for 20% of the stars
            if (i % 5 === 0) {
              const flareSize = size * 3.5;
              this.ctx.strokeStyle = starPalette[i % starPalette.length];
              this.ctx.lineWidth = 0.5;
              this.ctx.beginPath();
              this.ctx.moveTo(x - flareSize, y);
              this.ctx.lineTo(x + flareSize, y);
              this.ctx.moveTo(x, y - flareSize);
              this.ctx.lineTo(x, y + flareSize);
              this.ctx.stroke();
            }
          }
          this.ctx.restore();
        }

        // --- 6. Shooting Stars (Meteors - Only at Night) ---
        if (nightOpacity > 0) {
          const cycle = (this.weatherTime * 0.25) % 15; // Streaks every 15 seconds
          if (cycle < 2.0 && !isMobile) {
            this.ctx.save();
            this.ctx.globalAlpha = nightOpacity;
            const t = cycle / 2.0; // Normalized time (0 to 1)
            
            const cycleIdx = Math.floor(this.weatherTime / 15);
            const startX = ((Math.sin(cycleIdx * 71.3) * 0.5 + 0.5) * 0.4 + 0.1) * width;
            const startY = ((Math.cos(cycleIdx * 43.7) * 0.5 + 0.5) * 0.2 + 0.05) * height;
            
            const angle = Math.PI / 6; // Streak downwards at 30 degrees
            const length = 180;
            const distance = 400 * t;
            
            const curX = startX + distance * Math.cos(angle);
            const curY = startY + distance * Math.sin(angle);
            
            const meteorGrad = this.ctx.createLinearGradient(
              curX, curY, 
              curX - length * Math.cos(angle), curY - length * Math.sin(angle)
            );
            meteorGrad.addColorStop(0, 'rgba(167, 139, 250, 0.8)');
            meteorGrad.addColorStop(0.25, 'rgba(103, 232, 249, 0.4)');
            meteorGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            this.ctx.strokeStyle = meteorGrad;
            this.ctx.lineWidth = 1.8;
            this.ctx.beginPath();
            this.ctx.moveTo(curX, curY);
            this.ctx.lineTo(curX - length * Math.cos(angle), curY - length * Math.sin(angle));
            this.ctx.stroke();
            this.ctx.restore();
          }
        }

        // --- 8. Drifting Cosmic Spring Clouds (Day & Night) ---
        this.ctx.save();
        const spaceCloudsCount = 3;
        const spaceTimeOffset = this.weatherTime * 8.6;
        for (let i = 0; i < spaceCloudsCount; i++) {
          const cloudSpeed = 0.4 + (Math.sin(i * 342.1) * 0.5 + 0.5) * 0.6;
          const cloudSize = 40 + (Math.cos(i * 827.4) * 0.5 + 0.5) * 30;
          const startX = -150;
          const currX = startX + ((spaceTimeOffset * cloudSpeed + i * 350) % (width + 300));
          const currY = height * 0.15 + (Math.sin(i * 281.9) * 0.5 + 0.5) * (height * 0.25);
          
          let cloudColor = '';
          if (time >= 7 && time < 17) {
            // Day: pure white spring clouds
            cloudColor = 'rgba(255, 255, 255, 0.65)';
          } else if (time >= 19 || time < 5) {
            // Night: soft glowing cyan/blue space clouds
            cloudColor = 'rgba(103, 232, 249, 0.12)';
          } else {
            // Sunrise/Sunset: peach/gold tinted cosmic clouds transitioning to pure white
            const progress = time >= 5 && time < 7 ? (time - 5) / 2 : (19 - time) / 2;
            const r = Math.round(103 * (1 - progress) + 255 * progress);
            const g = Math.round(232 * (1 - progress) + 255 * progress);
            const b = Math.round(249 * (1 - progress) + 255 * progress);
            cloudColor = `rgba(${r}, ${g}, ${b}, ${0.12 * (1 - progress) + 0.65 * progress})`;
          }
          
          this.ctx.fillStyle = cloudColor;
          this.ctx.beginPath();
          this.ctx.arc(currX, currY, cloudSize * 0.6, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.4, currY - cloudSize * 0.2, cloudSize * 0.8, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.8, currY, cloudSize * 0.6, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.4, currY + cloudSize * 0.2, cloudSize * 0.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
        break;
      }

      case 'ice': {
        // Animate the cold winter sun slowly from left to right across the screen in a parabolic arc
        const speed = 4; // slow drift
        const sunRadius = 35;
        const range = width + 300;
        const sunX = ((this.weatherTime * speed) % range) - 150;
        
        // Curved sky path (parabolic arc)
        const normalizedX = (sunX + 150) / range;
        const peakHeight = height * 0.3;
        const baseHeight = height * 0.45;
        const sunY = baseHeight - Math.sin(normalizedX * Math.PI) * peakHeight;
        
        this.ctx.save();
        // Soft outer glow (cold winter sun)
        const sunGlow = this.ctx.createRadialGradient(sunX, sunY, sunRadius * 0.5, sunX, sunY, sunRadius * 3.5);
        sunGlow.addColorStop(0, 'rgba(224, 242, 254, 0.25)'); // soft light blue/cyan
        sunGlow.addColorStop(0.5, 'rgba(186, 230, 253, 0.08)');
        sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = sunGlow;
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, sunRadius * 3.5, 0, Math.PI * 2);
        this.ctx.fill();

        // Frosty sun core (semi-transparent)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'; // bright white frosty core
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
        break;
      }

      case 'heaven': {
        const isMobile = (window as any).gameIsMobile;

        // --- 1. Draw Subtle Radiant Celestial Sun Glow & Aureola ---
        const sunX = width * 0.5;
        const sunY = -60;
        const sunGlowRad = isMobile ? 220 : 450;
        
        this.ctx.save();
        // Pure White Celestial Sun Glow
        const sunGrad = this.ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunGlowRad);
        sunGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');   // Blinding pure white core
        sunGrad.addColorStop(0.15, 'rgba(255, 255, 255, 0.85)');
        sunGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
        sunGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.15)');
        sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.ctx.fillStyle = sunGrad;
        this.ctx.beginPath();
        this.ctx.arc(sunX, sunY, sunGlowRad, 0, Math.PI * 2);
        this.ctx.fill();

        // Spinning Golden Rings (Aureola)
        if (!isMobile) {
          this.ctx.translate(sunX, sunY);
          
          this.ctx.save();
          this.ctx.rotate(this.weatherTime * 0.2);
          this.ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
          this.ctx.lineWidth = 2;
          this.ctx.setLineDash([15, 20, 5, 20]);
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 180, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.restore();

          this.ctx.save();
          this.ctx.rotate(-this.weatherTime * 0.15);
          this.ctx.strokeStyle = 'rgba(255, 235, 150, 0.25)';
          this.ctx.lineWidth = 4;
          this.ctx.setLineDash([40, 30]);
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 240, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.restore();
          
          this.ctx.translate(-sunX, -sunY);
        }
        this.ctx.restore();

        // --- 2. Draw Static Volumetric God Rays (Light Rays - Now Enabled and Optimized on Mobile as well) ---
        this.ctx.save();
        this.ctx.translate(sunX, sunY);
        this.ctx.globalCompositeOperation = 'screen';

        const numRays = isMobile ? 4 : 7;
        const maxOpacity = isMobile ? 0.12 : 0.18;
        for (let i = 0; i < numRays; i++) {
          const waveOffset = Math.sin(this.weatherTime * 0.5 + i * 0.8) * 0.12;
          const baseAngle = (i - (numRays - 1) / 2) * (isMobile ? 0.4 : 0.35) + waveOffset;
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
        const time = this.timeOfDay;
        
        // 1. Draw Twinkling Stars, Milky Way & Constellation (Visible at Night)
        let starOpacity = 0;
        if (time >= 19 || time < 5) starOpacity = 1.0;
        else if (time >= 17 && time < 19) starOpacity = (time - 17) / 2;
        else if (time >= 5 && time < 7) starOpacity = (7 - time) / 2;
        
        if (starOpacity > 0) {
          this.ctx.save();
          this.ctx.globalAlpha = starOpacity;
          
          // A. Draw Desert Spiral Galaxy (Tilted, rotating, warm purple-orange theme)
          this.ctx.save();
          const galX = width * 0.45;
          const galY = height * 0.25;
          this.ctx.translate(galX, galY);
          this.ctx.rotate(-Math.PI / 4 + this.weatherTime * 0.010); // Slower spinning
          
          // Outer Galaxy dust envelope (warm purple-orange)
          const galGrad = this.ctx.createRadialGradient(0, 0, 10, 0, 0, 180);
          galGrad.addColorStop(0, 'rgba(147, 51, 234, 0.45)'); // bright purple core
          galGrad.addColorStop(0.4, 'rgba(234, 88, 12, 0.25)'); // warm orange dust
          galGrad.addColorStop(0.8, 'rgba(236, 72, 153, 0.1)'); // pink outer rim
          galGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = galGrad;
          this.ctx.scale(2.8, 0.7); // Tilted perspective
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 180, 0, Math.PI * 2);
          this.ctx.fill();
          
          // Draw spiral arm stars
          const numStars = 120; // Double the stars
          this.ctx.fillStyle = '#ffffff';
          for (let i = 0; i < numStars; i++) {
            const angle = i * 0.20;
            const r = 5 + i * 1.4;
            
            // Arm 1
            const x1 = r * Math.cos(angle);
            const y1 = r * Math.sin(angle);
            this.ctx.globalAlpha = starOpacity * (1 - r / 180) * 0.9;
            this.ctx.fillRect(x1, y1, 1.5, 1.5);
            
            // Arm 2 (180 degrees offset)
            const x2 = r * Math.cos(angle + Math.PI);
            const y2 = r * Math.sin(angle + Math.PI);
            this.ctx.fillRect(x2, y2, 1.5, 1.5);
          }
          
          // Bright Glowing Core
          const coreGrad = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 25);
          coreGrad.addColorStop(0, '#ffffff');
          coreGrad.addColorStop(0.3, 'rgba(254, 215, 170, 0.9)'); // bright peach
          coreGrad.addColorStop(1, 'rgba(254, 215, 170, 0)');
          this.ctx.fillStyle = coreGrad;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 25, 0, Math.PI * 2);
          this.ctx.fill();
          
          this.ctx.restore();
          
          // B. Draw Twinkling Stars (with some glowing stars)
          const starCount = isMobile ? 15 : 45;
          for (let i = 0; i < starCount; i++) {
            const x = (Math.sin(i * 3721.3) * 0.5 + 0.5) * width;
            const y = (Math.cos(i * 1842.1) * 0.5 + 0.5) * (height * 0.45);
            const twinkle = 0.3 + 0.7 * (Math.sin(this.weatherTime * 2.5 + i) * 0.5 + 0.5);
            
            if (i % 8 === 0 && !isMobile) {
              // Glowing Star
              const starGlow = this.ctx.createRadialGradient(x, y, 0.5, x, y, 6);
              starGlow.addColorStop(0, '#ffffff');
              starGlow.addColorStop(0.3, 'rgba(254, 215, 170, 0.9)'); // warm peach glow
              starGlow.addColorStop(1, 'rgba(254, 215, 170, 0)');
              this.ctx.fillStyle = starGlow;
              this.ctx.globalAlpha = starOpacity * twinkle;
              this.ctx.beginPath();
              this.ctx.arc(x, y, 6, 0, Math.PI * 2);
              this.ctx.fill();
            } else {
              // Regular Star
              this.ctx.fillStyle = '#ffffff';
              this.ctx.globalAlpha = starOpacity * twinkle;
              this.ctx.fillRect(x, y, 1.5, 1.5);
            }
          }
          
          // C. Draw Constellations (Big Dipper, "S" Scorpio, and Southern Cross)
          const constellations = [
            {
              // 1. Big Dipper
              color: 'rgba(254, 215, 170, 0.18)',
              glowColor: 'rgba(251, 146, 60, 0.4)',
              draw: (c: CanvasRenderingContext2D) => {
                const bx = width * 0.72;
                const by = height * 0.14;
                const pts = [
                  {x: bx, y: by},
                  {x: bx + 25, y: by - 8},
                  {x: bx + 50, y: by - 10},
                  {x: bx + 70, y: by + 8},
                  {x: bx + 90, y: by + 10},
                  {x: bx + 94, y: by + 28},
                  {x: bx + 72, y: by + 26},
                  {x: bx + 70, y: by + 8}
                ];
                c.beginPath();
                c.moveTo(pts[0].x, pts[0].y);
                for (let p = 1; p < pts.length; p++) c.lineTo(pts[p].x, pts[p].y);
                c.stroke();
                return pts;
              }
            },
            {
              // 2. "S" Shape (Scorpio)
              color: 'rgba(254, 215, 170, 0.18)',
              glowColor: 'rgba(249, 115, 22, 0.4)',
              draw: (c: CanvasRenderingContext2D) => {
                const sx = width * 0.18;
                const sy = height * 0.16;
                const pts = [
                  {x: sx + 30, y: sy},
                  {x: sx + 15, y: sy - 4},
                  {x: sx, y: sy + 8},
                  {x: sx + 10, y: sy + 22},
                  {x: sx + 28, y: sy + 32},
                  {x: sx + 20, y: sy + 48},
                  {x: sx, y: sy + 44}
                ];
                c.beginPath();
                c.moveTo(pts[0].x, pts[0].y);
                for (let p = 1; p < pts.length; p++) c.lineTo(pts[p].x, pts[p].y);
                c.stroke();
                return pts;
              }
            },
            {
              // 3. Southern Cross (Tilted Cross)
              color: 'rgba(254, 215, 170, 0.18)',
              glowColor: 'rgba(251, 146, 60, 0.4)',
              draw: (c: CanvasRenderingContext2D) => {
                const cx = width * 0.45;
                const cy = height * 0.13;
                const pts = [
                  {x: cx, y: cy - 25}, // top
                  {x: cx, y: cy + 25}, // bottom
                  {x: cx - 15, y: cy - 4}, // left
                  {x: cx + 15, y: cy + 4}  // right
                ];
                c.beginPath();
                c.moveTo(pts[0].x, pts[0].y);
                c.lineTo(pts[1].x, pts[1].y);
                c.moveTo(pts[2].x, pts[2].y);
                c.lineTo(pts[3].x, pts[3].y);
                c.stroke();
                return pts;
              }
            }
          ];

          this.ctx.save();
          this.ctx.lineWidth = 1.0;
          for (const constel of constellations) {
            this.ctx.strokeStyle = constel.color;
            const pts = constel.draw(this.ctx);
            for (const p of pts) {
              const twinkle = 0.5 + 0.5 * Math.sin(this.weatherTime * 3 + p.x);
              this.ctx.save();
              const starGlow = this.ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, 4);
              starGlow.addColorStop(0, '#ffffff');
              starGlow.addColorStop(0.4, constel.glowColor);
              starGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
              this.ctx.fillStyle = starGlow;
              this.ctx.globalAlpha = starOpacity * twinkle;
              this.ctx.beginPath();
              this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
              this.ctx.fill();
              this.ctx.restore();
            }
          }
          this.ctx.restore();
          
          // D. Procedural Shooting Star (Streaks diagonally every 8 seconds)
          const period = 8;
          const phase = this.weatherTime % period;
          if (phase < 0.8) {
            const progress = phase / 0.8;
            const startX = width * 0.6 - (Math.floor(this.weatherTime / period) * 137) % (width * 0.4);
            const startY = height * 0.04 + (Math.floor(this.weatherTime / period) * 79) % (height * 0.12);
            const length = 110;
            const currX = startX + progress * 200;
            const currY = startY + progress * 70;
            
            this.ctx.save();
            this.ctx.globalAlpha = starOpacity * Math.sin(progress * Math.PI);
            const streakGrad = this.ctx.createLinearGradient(currX, currY, currX - length * 0.6, currY - length * 0.2);
            streakGrad.addColorStop(0, '#ffffff');
            streakGrad.addColorStop(0.3, 'rgba(254, 215, 170, 0.6)');
            streakGrad.addColorStop(1, 'rgba(254, 215, 170, 0)');
            
            this.ctx.strokeStyle = streakGrad;
            this.ctx.lineWidth = 2.0;
            this.ctx.beginPath();
            this.ctx.moveTo(currX, currY);
            this.ctx.lineTo(currX - length, currY - length * 0.35);
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = '#fed7aa';
            this.ctx.beginPath();
            this.ctx.arc(currX, currY, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
          }
          
          this.ctx.restore();
        }

        // 2. Draw Desert Sun (Only visible during day!)
        if (time >= 5 && time < 19) {
          let sunOpacity = 1.0;
          if (time >= 5 && time < 7) sunOpacity = (time - 5) / 2;
          else if (time >= 17 && time < 19) sunOpacity = (19 - time) / 2;
          
          const sunAngle = Math.PI * (time - 5) / 14;
          const sunX = -100 + (width + 200) * ((time - 5) / 14);
          const sunY = height * 0.62 - height * 0.45 * Math.sin(sunAngle);
          const baseRadius = 40;

          this.ctx.save();
          this.ctx.globalAlpha = sunOpacity;

          if (!isMobile) {
            // Corona
            const coronaGrad = this.ctx.createRadialGradient(sunX, sunY, baseRadius * 0.7, sunX, sunY, baseRadius * 4.8);
            coronaGrad.addColorStop(0, 'rgba(255, 220, 120, 0.42)'); // Golden corona rim
            coronaGrad.addColorStop(0.3, 'rgba(255, 150, 30, 0.18)'); // Scorching orange haze
            coronaGrad.addColorStop(0.75, 'rgba(239, 68, 68, 0.05)'); // Soft heat boundary
            coronaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            this.ctx.fillStyle = coronaGrad;
            this.ctx.beginPath();
            this.ctx.arc(sunX, sunY, baseRadius * 4.8, 0, Math.PI * 2);
            this.ctx.fill();

            // Lens ring
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.strokeStyle = 'rgba(255, 230, 180, 0.06)';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(sunX, sunY, baseRadius * 2.2, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
          }

          // Inner sun sphere
          const sunGrad = this.ctx.createRadialGradient(sunX - 3, sunY - 3, 2, sunX, sunY, baseRadius);
          sunGrad.addColorStop(0, '#ffffff'); // Blazing white sun core
          sunGrad.addColorStop(0.25, '#fffbeb'); // Cream yellow halo
          sunGrad.addColorStop(0.7, '#fef08a'); // Rich gold rim
          sunGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
          this.ctx.fillStyle = sunGrad;
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, baseRadius, 0, Math.PI * 2);
          this.ctx.fill();

          // Core sun ball
          this.ctx.fillStyle = '#ffffff';
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, baseRadius * 0.62, 0, Math.PI * 2);
          this.ctx.fill();

          this.ctx.restore();
        }

        // 3. Draw Moon (Visible between 17.0 and 7.0)
        if (time >= 17 || time < 7) {
          let moonOpacity = 1.0;
          if (time >= 17 && time < 19) moonOpacity = (time - 17) / 2;
          else if (time >= 5 && time < 7) moonOpacity = (7 - time) / 2;
          
          let moonTime = time >= 17 ? time - 17 : time + 7;
          const moonAngle = Math.PI * moonTime / 14;
          const moonX = width * 0.15 + width * 0.7 * (moonTime / 14);
          const moonY = height * 0.55 - height * 0.4 * Math.sin(moonAngle);
          
          this.ctx.save();
          this.ctx.globalAlpha = moonOpacity;
          
          const moonGlow = this.ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 35);
          moonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
          moonGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
          this.ctx.fillStyle = moonGlow;
          this.ctx.beginPath();
          this.ctx.arc(moonX, moonY, 35, 0, Math.PI * 2);
          this.ctx.fill();
          
          const moonBody = this.ctx.createRadialGradient(moonX - 3, moonY - 3, 2, moonX, moonY, 12);
          moonBody.addColorStop(0, '#ffffff');
          moonBody.addColorStop(0.7, '#f8fafc');
          moonBody.addColorStop(1, '#cbd5e1');
          this.ctx.fillStyle = moonBody;
          this.ctx.beginPath();
          this.ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();
        }
        break;
      }
      case 'space': {
        // Drifting Space Clouds (Nebula wisps)
        this.ctx.save();
        const numClouds = 3;
        const timeOffset = this.weatherTime * 4;
        for (let i = 0; i < numClouds; i++) {
          const cloudSpeed = 0.3 + (Math.sin(i * 124.5) * 0.5 + 0.5) * 0.4;
          const cloudSize = 50 + (Math.cos(i * 928.3) * 0.5 + 0.5) * 40;
          const startX = -200;
          const currX = startX + ((timeOffset * cloudSpeed + i * 500) % (width + 400));
          const currY = height * 0.2 + (Math.sin(i * 492.1) * 0.5 + 0.5) * (height * 0.3);
          
          this.ctx.fillStyle = `rgba(100, 50, 150, ${0.05 + i * 0.02})`;
          this.ctx.beginPath();
          this.ctx.arc(currX, currY, cloudSize * 0.6, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.4, currY - cloudSize * 0.2, cloudSize * 0.8, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.8, currY, cloudSize * 0.6, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.4, currY + cloudSize * 0.2, cloudSize * 0.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
        break;
      }
      default: {
        const time = this.timeOfDay;
        const isMobile = (window as any).gameIsMobile;
        
        // 1. Draw Twinkling Stars, Milky Way & Constellations
        let starOpacity = 0;
        if (time >= 19 || time < 5) starOpacity = 1.0;
        else if (time >= 17 && time < 19) starOpacity = (time - 17) / 2;
        else if (time >= 5 && time < 7) starOpacity = (7 - time) / 2;
        
        if (starOpacity > 0) {
          this.ctx.save();
          this.ctx.globalAlpha = starOpacity;
          
          // A. Draw Classic Spiral Galaxy (Tilted, rotating, cold purple-blue theme)
          this.ctx.save();
          const galX = width * 0.45;
          const galY = height * 0.25;
          this.ctx.translate(galX, galY);
          this.ctx.rotate(-Math.PI / 4 + this.weatherTime * 0.010); // Slower spinning
          
          // Outer Galaxy dust envelope (purple-blue)
          const galGrad = this.ctx.createRadialGradient(0, 0, 10, 0, 0, 180);
          galGrad.addColorStop(0, 'rgba(147, 51, 234, 0.45)'); // bright purple core
          galGrad.addColorStop(0.4, 'rgba(59, 130, 246, 0.25)'); // blue dust
          galGrad.addColorStop(0.8, 'rgba(14, 165, 233, 0.1)'); // light blue outer rim
          galGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          this.ctx.fillStyle = galGrad;
          this.ctx.scale(2.8, 0.7); // Tilted perspective
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 180, 0, Math.PI * 2);
          this.ctx.fill();
          
          // Draw spiral arm stars
          const numStars = 120; // Double the stars
          this.ctx.fillStyle = '#ffffff';
          for (let i = 0; i < numStars; i++) {
            const angle = i * 0.20;
            const r = 5 + i * 1.4;
            
            // Arm 1
            const x1 = r * Math.cos(angle);
            const y1 = r * Math.sin(angle);
            this.ctx.globalAlpha = starOpacity * (1 - r / 180) * 0.9;
            this.ctx.fillRect(x1, y1, 1.5, 1.5);
            
            // Arm 2 (180 degrees offset)
            const x2 = r * Math.cos(angle + Math.PI);
            const y2 = r * Math.sin(angle + Math.PI);
            this.ctx.fillRect(x2, y2, 1.5, 1.5);
          }
          
          // Bright Glowing Core
          const coreGrad = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 25);
          coreGrad.addColorStop(0, '#ffffff');
          coreGrad.addColorStop(0.3, 'rgba(224, 242, 254, 0.9)'); // bright blue-white
          coreGrad.addColorStop(1, 'rgba(224, 242, 254, 0)');
          this.ctx.fillStyle = coreGrad;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, 25, 0, Math.PI * 2);
          this.ctx.fill();
          
          this.ctx.restore();
          
          // B. Draw Twinkling Stars (with some glowing stars)
          const starCount = isMobile ? 15 : 45;
          for (let i = 0; i < starCount; i++) {
            const x = (Math.sin(i * 3721.3) * 0.5 + 0.5) * width;
            const y = (Math.cos(i * 1842.1) * 0.5 + 0.5) * (height * 0.45);
            const twinkle = 0.3 + 0.7 * (Math.sin(this.weatherTime * 2.5 + i) * 0.5 + 0.5);
            
            if (i % 8 === 0 && !isMobile) {
              // Glowing Star
              const starGlow = this.ctx.createRadialGradient(x, y, 0.5, x, y, 6);
              starGlow.addColorStop(0, '#ffffff');
              starGlow.addColorStop(0.3, 'rgba(224, 242, 254, 0.9)'); // blue-white glow
              starGlow.addColorStop(1, 'rgba(224, 242, 254, 0)');
              this.ctx.fillStyle = starGlow;
              this.ctx.globalAlpha = starOpacity * twinkle;
              this.ctx.beginPath();
              this.ctx.arc(x, y, 6, 0, Math.PI * 2);
              this.ctx.fill();
            } else {
              // Regular Star
              this.ctx.fillStyle = '#ffffff';
              this.ctx.globalAlpha = starOpacity * twinkle;
              this.ctx.fillRect(x, y, 1.5, 1.5);
            }
          }
          
          // C. Draw Constellations (Big Dipper, "S" Scorpio, and Southern Cross)
          const constellations = [
            {
              // 1. Big Dipper
              color: 'rgba(224, 242, 254, 0.18)',
              glowColor: 'rgba(14, 165, 233, 0.4)',
              draw: (c: CanvasRenderingContext2D) => {
                const bx = width * 0.72;
                const by = height * 0.14;
                const pts = [
                  {x: bx, y: by},
                  {x: bx + 25, y: by - 8},
                  {x: bx + 50, y: by - 10},
                  {x: bx + 70, y: by + 8},
                  {x: bx + 90, y: by + 10},
                  {x: bx + 94, y: by + 28},
                  {x: bx + 72, y: by + 26},
                  {x: bx + 70, y: by + 8}
                ];
                c.beginPath();
                c.moveTo(pts[0].x, pts[0].y);
                for (let p = 1; p < pts.length; p++) c.lineTo(pts[p].x, pts[p].y);
                c.stroke();
                return pts;
              }
            },
            {
              // 2. "S" Shape (Scorpio)
              color: 'rgba(224, 242, 254, 0.18)',
              glowColor: 'rgba(249, 115, 22, 0.4)',
              draw: (c: CanvasRenderingContext2D) => {
                const sx = width * 0.18;
                const sy = height * 0.16;
                const pts = [
                  {x: sx + 30, y: sy},
                  {x: sx + 15, y: sy - 4},
                  {x: sx, y: sy + 8},
                  {x: sx + 10, y: sy + 22},
                  {x: sx + 28, y: sy + 32},
                  {x: sx + 20, y: sy + 48},
                  {x: sx, y: sy + 44}
                ];
                c.beginPath();
                c.moveTo(pts[0].x, pts[0].y);
                for (let p = 1; p < pts.length; p++) c.lineTo(pts[p].x, pts[p].y);
                c.stroke();
                return pts;
              }
            },
            {
              // 3. Southern Cross (Tilted Cross)
              color: 'rgba(224, 242, 254, 0.18)',
              glowColor: 'rgba(14, 165, 233, 0.4)',
              draw: (c: CanvasRenderingContext2D) => {
                const cx = width * 0.45;
                const cy = height * 0.13;
                const pts = [
                  {x: cx, y: cy - 25}, // top
                  {x: cx, y: cy + 25}, // bottom
                  {x: cx - 15, y: cy - 4}, // left
                  {x: cx + 15, y: cy + 4}  // right
                ];
                c.beginPath();
                c.moveTo(pts[0].x, pts[0].y);
                c.lineTo(pts[1].x, pts[1].y);
                c.moveTo(pts[2].x, pts[2].y);
                c.lineTo(pts[3].x, pts[3].y);
                c.stroke();
                return pts;
              }
            }
          ];

          this.ctx.save();
          this.ctx.lineWidth = 1.0;
          for (const constel of constellations) {
            this.ctx.strokeStyle = constel.color;
            const pts = constel.draw(this.ctx);
            for (const p of pts) {
              const twinkle = 0.5 + 0.5 * Math.sin(this.weatherTime * 3 + p.x);
              this.ctx.save();
              const starGlow = this.ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, 4);
              starGlow.addColorStop(0, '#ffffff');
              starGlow.addColorStop(0.4, constel.glowColor);
              starGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
              this.ctx.fillStyle = starGlow;
              this.ctx.globalAlpha = starOpacity * twinkle;
              this.ctx.beginPath();
              this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
              this.ctx.fill();
              this.ctx.restore();
            }
          }
          this.ctx.restore();
          
          // D. Procedural Shooting Star (Streaks diagonally every 8 seconds)
          const period = 8;
          const phase = this.weatherTime % period;
          if (phase < 0.8) {
            const progress = phase / 0.8;
            const startX = width * 0.6 - (Math.floor(this.weatherTime / period) * 137) % (width * 0.4);
            const startY = height * 0.04 + (Math.floor(this.weatherTime / period) * 79) % (height * 0.12);
            const length = 110;
            const currX = startX + progress * 200;
            const currY = startY + progress * 70;
            
            this.ctx.save();
            this.ctx.globalAlpha = starOpacity * Math.sin(progress * Math.PI);
            const streakGrad = this.ctx.createLinearGradient(currX, currY, currX - length * 0.6, currY - length * 0.2);
            streakGrad.addColorStop(0, '#ffffff');
            streakGrad.addColorStop(0.3, 'rgba(224, 242, 254, 0.6)');
            streakGrad.addColorStop(1, 'rgba(224, 242, 254, 0)');
            
            this.ctx.strokeStyle = streakGrad;
            this.ctx.lineWidth = 2.0;
            this.ctx.beginPath();
            this.ctx.moveTo(currX, currY);
            this.ctx.lineTo(currX - length, currY - length * 0.35);
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = '#bae6fd';
            this.ctx.beginPath();
            this.ctx.arc(currX, currY, 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
          }
          
          this.ctx.restore();
        }

        // 2. Draw Sun (Visible between 5.0 and 19.0)
        if (time >= 5 && time < 19) {
          let sunOpacity = 1.0;
          if (time >= 5 && time < 7) sunOpacity = (time - 5) / 2;
          else if (time >= 17 && time < 19) sunOpacity = (19 - time) / 2;
          
          const sunAngle = Math.PI * (time - 5) / 14;
          const sunX = -100 + (width + 200) * ((time - 5) / 14);
          const sunY = height * 0.62 - height * 0.45 * Math.sin(sunAngle);
          
          this.ctx.save();
          this.ctx.globalAlpha = sunOpacity;
          
          // 1. Layered Sunburst Rays (White and Yellow mixed)
          this.ctx.save();
          this.ctx.translate(sunX, sunY);
          
          // Layer A: Rotating soft white-yellow rays
          this.ctx.save();
          this.ctx.rotate(this.weatherTime * 0.08);
          this.ctx.fillStyle = 'rgba(255, 255, 230, 0.14)';
          for (let r = 0; r < 8; r++) {
            this.ctx.rotate(Math.PI / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(0, -6);
            this.ctx.lineTo(12, 0);
            this.ctx.lineTo(0, 65);
            this.ctx.lineTo(-12, 0);
            this.ctx.closePath();
            this.ctx.fill();
          }
          this.ctx.restore();

          // Layer B: Counter-rotating bright yellow rays
          this.ctx.save();
          this.ctx.rotate(-this.weatherTime * 0.05 + 0.2);
          this.ctx.fillStyle = 'rgba(255, 235, 50, 0.03)';
          for (let r = 0; r < 8; r++) {
            this.ctx.rotate(Math.PI / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(0, -5);
            this.ctx.lineTo(10, 0);
            this.ctx.lineTo(0, 50);
            this.ctx.lineTo(-10, 0);
            this.ctx.closePath();
            this.ctx.fill();
          }
          this.ctx.restore();
          
          this.ctx.restore();

          // 2. Realistic White-Yellow Gradient Corona
          const sunGlow = this.ctx.createRadialGradient(sunX, sunY, 16, sunX, sunY, 70);
          sunGlow.addColorStop(0, 'rgb(255, 230, 230)'); // white with 10% red tint
          sunGlow.addColorStop(0.25, 'rgba(255, 240, 240, 0.92)'); // hot white-red transition
          sunGlow.addColorStop(0.5, 'rgba(255, 234, 0, 0.29)'); // reduced yellow by 30%
          sunGlow.addColorStop(0.8, 'rgba(255, 245, 160, 0.10)'); // reduced outer yellow by 30%
          sunGlow.addColorStop(1, 'rgba(255, 245, 160, 0)');
          this.ctx.fillStyle = sunGlow;
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
          this.ctx.fill();
          
          // 3. Blinding White Sun Core (Increased by 30%, tinted 10% red)
          this.ctx.fillStyle = 'rgb(255, 230, 230)';
          this.ctx.beginPath();
          this.ctx.arc(sunX, sunY, 21, 0, Math.PI * 2);
          this.ctx.fill();
          
          this.ctx.restore();
        }

        // 3. Draw Moon (Visible between 17.0 and 7.0)
        if (time >= 17 || time < 7) {
          let moonOpacity = 1.0;
          if (time >= 17 && time < 19) moonOpacity = (time - 17) / 2;
          else if (time >= 5 && time < 7) moonOpacity = (7 - time) / 2;
          
          let moonTime = time >= 17 ? time - 17 : time + 7;
          const moonAngle = Math.PI * moonTime / 14;
          const moonX = width * 0.15 + width * 0.7 * (moonTime / 14);
          const moonY = height * 0.55 - height * 0.4 * Math.sin(moonAngle);
          
          this.ctx.save();
          this.ctx.globalAlpha = moonOpacity;
          
          const moonGlow = this.ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 35);
          moonGlow.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
          moonGlow.addColorStop(1, 'rgba(255, 255, 255, 0)');
          this.ctx.fillStyle = moonGlow;
          this.ctx.beginPath();
          this.ctx.arc(moonX, moonY, 35, 0, Math.PI * 2);
          this.ctx.fill();
          
          const moonBody = this.ctx.createRadialGradient(moonX - 3, moonY - 3, 2, moonX, moonY, 12);
          moonBody.addColorStop(0, '#ffffff');
          moonBody.addColorStop(0.7, '#f8fafc');
          moonBody.addColorStop(1, '#cbd5e1');
          this.ctx.fillStyle = moonBody;
          this.ctx.beginPath();
          this.ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.restore();
        }

        // 4. Draw Drifting Spring Clouds (Day & Night)
        this.ctx.save();
        const numClouds = 4;
        const timeOffset = this.weatherTime * 11.5;
        for (let i = 0; i < numClouds; i++) {
          const cloudSpeed = 0.5 + (Math.sin(i * 124.5) * 0.5 + 0.5) * 0.7;
          const cloudSize = 30 + (Math.cos(i * 928.3) * 0.5 + 0.5) * 20;
          const startX = -120;
          const currX = startX + ((timeOffset * cloudSpeed + i * 280) % (width + 240));
          const currY = height * 0.12 + (Math.sin(i * 492.1) * 0.5 + 0.5) * (height * 0.22);
          
          let cloudColor = '';
          if (time >= 7 && time < 17) {
            // Day: pure white spring clouds
            cloudColor = 'rgba(255, 255, 255, 0.85)';
          } else if (time >= 19 || time < 5) {
            // Night: soft moonlit silver-grey
            cloudColor = 'rgba(200, 210, 225, 0.18)';
          } else {
            // Sunrise/Sunset: peach/gold tinted clouds transitioning to pure white
            const progress = time >= 5 && time < 7 ? (time - 5) / 2 : (19 - time) / 2;
            const r = Math.round(200 * (1 - progress) + 255 * progress);
            const g = Math.round(210 * (1 - progress) + 255 * progress);
            const b = Math.round(225 * (1 - progress) + 255 * progress);
            cloudColor = `rgba(${r}, ${g}, ${b}, ${0.18 * (1 - progress) + 0.85 * progress})`;
          }
          
          this.ctx.fillStyle = cloudColor;
          this.ctx.beginPath();
          this.ctx.arc(currX, currY, cloudSize * 0.6, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.4, currY - cloudSize * 0.2, cloudSize * 0.8, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.8, currY, cloudSize * 0.6, 0, Math.PI * 2);
          this.ctx.arc(currX + cloudSize * 0.4, currY + cloudSize * 0.2, cloudSize * 0.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
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
      if (worldId === 'ice' && layer === 1) continue; // Remove furthest static mountain layer
      this.ctx.save();
      const offset = this.offsets[layer];
      const color = this.getLayerColor(worldId, layer);
      this.ctx.fillStyle = color;

      const segmentWidth = 600;
      let drawWavyMountain = true;
      if (worldId === 'desert' && layer === 1) {
        drawWavyMountain = false; // Only draw pyramids in layer 1 for Desert
      }

      if (drawWavyMountain) {
        this.ctx.beginPath();
        this.ctx.moveTo(0, height);
        
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

        this.ctx.lineTo(width + segmentWidth, height);
        this.ctx.lineTo(-segmentWidth, height);
        this.ctx.closePath();
        this.ctx.fill();
      } else {
        if (worldId === 'desert') {
          // Draw flat desert ground base for pyramids
          const pyBase = height * 0.55 + layer * 70 - 45;
          const finalBaseY = Math.round(pyBase - this.cameraY * (layer * 0.25));
          this.ctx.fillRect(-100, finalBaseY, width + 200, height);
        }
      }

      // --- Draw Desert Ruins & Obelisks (Premium Environment Upgrade) ---
      if (worldId === 'desert') {
        this.ctx.fillStyle = color;
        
        if (layer === 1) {
          // Layer 1: Massive Pyramids in the far background
          const pyramidSpacing = 900;
          for (let x = -pyramidSpacing; x < width + pyramidSpacing; x += pyramidSpacing) {
            const px = x - (offset % pyramidSpacing);
            const py = height * 0.55 + layer * 70 - 45; 
            const finalPy = Math.round(py - this.cameraY * (layer * 0.25));
            const pSize = 180;
            
            this.ctx.beginPath();
            this.ctx.moveTo(px - pSize, finalPy);
            this.ctx.lineTo(px, finalPy - pSize * 0.75); // pyramid tip
            this.ctx.lineTo(px + pSize, finalPy);
            this.ctx.closePath();
            this.ctx.fill();
            
            // 3D Shadow side
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
            this.ctx.beginPath();
            this.ctx.moveTo(px, finalPy - pSize * 0.75);
            this.ctx.lineTo(px + pSize, finalPy);
            this.ctx.lineTo(px, finalPy);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.fillStyle = color; // restore
          }
        }
      }



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
          '#85a5c7', // Layer 1 (Furthest)
          '#5d85ab', // Layer 2 (Midground - Frosted ice blue)
          '#d8e6f3'  // Layer 3 (Closest - Bright snow-white/blue)
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

      case 'space': {
        const time = this.timeOfDay;
        let dayWeight = 0;
        if (time >= 5 && time < 7) {
          dayWeight = (time - 5) / 2; // Sunrise transition
        } else if (time >= 7 && time < 17) {
          dayWeight = 1.0; // Daytime
        } else if (time >= 17 && time < 19) {
          dayWeight = 1.0 - (time - 17) / 2; // Sunset transition
        } else {
          dayWeight = 0; // Night
        }

        // Interpolate color for Layer 3 (closest mountain): Night rgb(6,0,15) -> Day rgb(4,32,15) [added 30% blackness]
        const r = Math.round(6 + (4 - 6) * dayWeight);
        const g = Math.round(0 + (32 - 0) * dayWeight);
        const b = Math.round(15 + (15 - 15) * dayWeight);
        const layer3Color = `rgba(${r}, ${g}, ${b}, 0.95)`;

        return [
          'rgba(20, 5, 40, 0.4)',
          'rgba(14, 2, 28, 0.7)',
          layer3Color
        ][layer - 1];
      }

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
      const isLava = this.weather.type === 'lava';
      this.ctx.save();
      this.ctx.globalAlpha = this.lightningFlash;
      this.ctx.fillStyle = isLava ? 'rgba(255, 50, 50, 0.85)' : 'rgba(255, 255, 255, 0.85)';
      this.ctx.fillRect(0, 0, width, height);

      this.ctx.strokeStyle = isLava ? '#ff3333' : '#ffffff';
      this.ctx.lineWidth = isLava ? 6 + Math.random() * 6 : 3 + Math.random() * 4;
      if (!(window as any).gameDisableShadows) {
        this.ctx.shadowBlur = isLava ? 25 : 20;
        this.ctx.shadowColor = isLava ? '#ff0000' : '#00f3ff';
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
    if ((window as any).gameDisableShadows || worldId === 'retro' || worldId === 'space') {
      // Bypassed on mobile / Low-Graphics Mode / Retro World / Space (Twilight Horizon)
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

    // Apply Chaos Events screen transforms
    const engine = (window as any).gameEngine;
    if (engine && engine.progressManager.getState().selectedZone === 'chaos' && engine.gameMode === 'flock') {
      if (engine.activeChaosEvent === 'earthquake') {
        const shakeX = (Math.random() - 0.5) * 12;
        const shakeY = (Math.random() - 0.5) * 12;
        this.ctx.translate(shakeX, shakeY);
      }
    }
  }

  public endCamera() {
    this.ctx.restore();
  }

  public applyAmbientLighting(worldId: string) {
    // Skip for Twilight Horizon — the multiply blend smears moving objects
    if (worldId === 'space') return;

    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    let ambientColor = '';
    let intensity = 0;

    if (worldId === 'jungle') {
      // Constant dark, gloomy, green-teal storm atmosphere for Amazon Rainforest
      ambientColor = '#0b1d17';
      intensity = 0.26;
    } else {
      const time = this.timeOfDay;
      // 0 to 24 hour scale
      if (time >= 20 || time < 4) {
        // Dead of night: deep midnight blue overlay
        ambientColor = '#0b0c2a';
        intensity = 0.38;
      } else if (time >= 4 && time < 7) {
        // Sunrise: transition from night to warm orange
        const progress = (time - 4) / 3; // 0 to 1
        const r = Math.round(11 + (255 - 11) * progress);
        const g = Math.round(12 + (120 - 12) * progress);
        const b = Math.round(42 + (50 - 42) * progress);
        ambientColor = `rgb(${r}, ${g}, ${b})`;
        intensity = 0.38 * (1 - progress) + 0.18 * progress;
      } else if (time >= 7 && time < 17) {
        // Day: very light warm golden sunlight tint
        ambientColor = '#fff6d5';
        intensity = 0.04;
      } else {
        // Sunset: transition from day to deep crimson/purple
        const progress = (time - 17) / 3; // 0 to 1
        const r = Math.round(255 * (1 - progress) + 11 * progress);
        const g = Math.round(120 * (1 - progress) + 12 * progress);
        const b = Math.round(50 * (1 - progress) + 42 * progress);
        ambientColor = `rgb(${r}, ${g}, ${b})`;
        intensity = 0.18 * (1 - progress) + 0.38 * progress;
      }
    }

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'multiply';
    this.ctx.fillStyle = ambientColor;
    this.ctx.globalAlpha = intensity;
    this.ctx.fillRect(0, 0, width, height);
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
