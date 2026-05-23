export class SoundManager {
  private ctx: AudioContext | null = null;
  private musicInterval: any = null;
  private isMuted = false;
  private beatStep = 0;
  private isMusicPlaying = false;
  private masterVolumeNode: GainNode | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction (click/touch/key) to respect browser safety rules
  }

  private init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterVolumeNode = this.ctx.createGain();
      this.masterVolumeNode.gain.setValueAtTime(0.3, this.ctx.currentTime); // Dynamic, subtle volumes
      this.masterVolumeNode.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API not supported on this browser.', e);
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterVolumeNode && this.ctx) {
      this.masterVolumeNode.gain.setValueAtTime(muted ? 0 : 0.3, this.ctx.currentTime);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainStart = 0.5,
    freqCurve: 'linear' | 'exp' = 'exp'
  ) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    // Resume context if suspended
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
    if (freqCurve === 'exp' && freqStart > 0 && freqEnd > 0) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
    } else {
      osc.frequency.linearRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(gainStart, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    if (this.masterVolumeNode) {
      gain.connect(this.masterVolumeNode);
    } else {
      gain.connect(this.ctx.destination);
    }

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // SFX Synthesizers
  public playFlap() {
    // Deep wind whoosh sound
    this.playTone(180, 40, 0.15, 'triangle', 0.6, 'linear');
  }

  public playCoin() {
    // Beautiful double-chime bell
    this.playTone(523.25, 1046.50, 0.1, 'sine', 0.4, 'linear');
    setTimeout(() => {
      this.playTone(1046.50, 1567.98, 0.15, 'sine', 0.3, 'linear');
    }, 60);
  }

  public playGem() {
    // Ultra high-pitched magical crystal sparkle
    this.playTone(1567.98, 2093.00, 0.2, 'sine', 0.3, 'linear');
    setTimeout(() => {
      this.playTone(2093.00, 2793.83, 0.25, 'sine', 0.2, 'linear');
    }, 50);
  }

  public playZap() {
    // Futuristic cyber laser zap
    this.playTone(1200, 100, 0.2, 'sawtooth', 0.35, 'exp');
  }

  public playShieldDeflect() {
    // Bright resonance bell with metallic crunch
    this.playTone(800, 300, 0.3, 'square', 0.4, 'exp');
    // Layer with a fast noise frequency sweep
    this.playTone(100, 2000, 0.15, 'triangle', 0.25, 'linear');
  }

  public playSpeedBoost() {
    // Rising jetengine whoosh
    this.playTone(80, 1600, 0.5, 'sawtooth', 0.4, 'linear');
  }

  public playExplosion() {
    // Heavy low-pass filtered explosion noise
    this.init();
    if (!this.ctx || this.isMuted) return;

    const bufferSize = this.ctx.sampleRate * 0.6; // 0.6 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Fill buffer with random white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;

    const filterNode = this.ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(400, this.ctx.currentTime);
    filterNode.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.5);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.8, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.55);

    noiseNode.connect(filterNode);
    filterNode.connect(gainNode);
    if (this.masterVolumeNode) {
      gainNode.connect(this.masterVolumeNode);
    } else {
      gainNode.connect(this.ctx.destination);
    }

    noiseNode.start();
    noiseNode.stop(this.ctx.currentTime + 0.6);
  }

  public playLevelUp() {
    // Majestic rising arpeggio (C Major chord)
    const tones = [523.25, 659.25, 783.99, 1046.50];
    tones.forEach((f, idx) => {
      setTimeout(() => {
        this.playTone(f, f * 1.05, 0.25, 'sine', 0.4, 'linear');
      }, idx * 100);
    });
  }

  public playCrateUnlock() {
    // Mystery chest chime
    const tones = [392.00, 523.25, 659.25, 783.99, 987.77, 1174.66];
    tones.forEach((f, idx) => {
      setTimeout(() => {
        this.playTone(f, f * 1.02, 0.15, 'triangle', 0.3, 'linear');
      }, idx * 60);
    });
  }

  // Dynamic Procedural Background Music System
  public startMusic(worldId: string) {
    this.init();
    if (!this.ctx) return;
    if (this.isMusicPlaying) this.stopMusic();

    this.isMusicPlaying = true;
    this.beatStep = 0;

    let tempo = 110;
    let baseNotes = [110, 130.81, 146.83, 164.81]; // Bass loop

    if (worldId === 'cyberpunk') {
      tempo = 125;
      baseNotes = [73.42, 82.41, 110.00, 97.99]; // Cyber D-E-A-G bass
    } else if (worldId === 'ice') {
      tempo = 95;
      baseNotes = [130.81, 146.83, 164.81, 196.00]; // Cold C-D-E-G bass
    } else if (worldId === 'volcano') {
      tempo = 135;
      baseNotes = [55.00, 65.41, 73.42, 69.30]; // Intense A-C-D-C#
    } else if (worldId === 'space') {
      tempo = 90;
      baseNotes = [146.83, 164.81, 110.00, 130.81]; // Cosmic ambient
    }

    const isPerformanceMode = (window as any).gameDisableShadows;
    const intervalTime = isPerformanceMode 
      ? (60 / tempo) * 1000 // Quarter notes on mobile (twice as slow, half the ticks!)
      : (60 / tempo) * 1000 / 2; // Eighth notes on desktop

    this.musicInterval = setInterval(() => {
      if (this.isMuted || !this.ctx || this.ctx.state === 'suspended') return;

      const barStep = this.beatStep % (isPerformanceMode ? 8 : 16);
      const baseNoteIndex = Math.floor(this.beatStep / (isPerformanceMode ? 2 : 4)) % baseNotes.length;
      const baseFreq = baseNotes[baseNoteIndex];

      // Play bass arpeggiator (1 node)
      this.playTone(baseFreq, baseFreq, isPerformanceMode ? 0.35 : 0.22, 'sine', 0.18, 'linear');

      if (!isPerformanceMode) {
        // Desktop only: Add atmospheric chords / leads on specific beats
        if (barStep === 0) {
          // Melodic root chord
          this.playTone(baseFreq * 2, baseFreq * 2.02, 0.6, 'sine', 0.12, 'linear');
          this.playTone(baseFreq * 3, baseFreq * 3.02, 0.6, 'sine', 0.08, 'linear');
        } else if (barStep === 6) {
          // High melodic chord accent
          this.playTone(baseFreq * 2.4, baseFreq * 2.42, 0.3, 'sine', 0.08, 'linear');
        } else if (barStep === 10) {
          this.playTone(baseFreq * 3.2, baseFreq * 3.22, 0.4, 'sine', 0.06, 'linear');
        }

        // Minimal synthesized highhat rhythm
        if (barStep % 4 === 2) {
          // Synth Highhat noise burst
          this.playHihat();
        }

        // Minimal synth snare on beat 2 and 4 (steps 4 and 12)
        if (worldId === 'cyberpunk' || worldId === 'volcano') {
          if (barStep === 4 || barStep === 12) {
            this.playSnare();
          }
        }
      }

      this.beatStep++;
    }, intervalTime);
  }

  public stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    this.isMusicPlaying = false;
  }

  private playHihat() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(10000, this.ctx.currentTime); // High pitch noise

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    if (this.masterVolumeNode) {
      gain.connect(this.masterVolumeNode);
    } else {
      gain.connect(this.ctx.destination);
    }

    osc.start();
    osc.stop(this.ctx.currentTime + 0.06);
  }

  private playSnare() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    if (this.masterVolumeNode) {
      gain.connect(this.masterVolumeNode);
    } else {
      gain.connect(this.ctx.destination);
    }

    osc.start();
    osc.stop(this.ctx.currentTime + 0.13);
  }
}
