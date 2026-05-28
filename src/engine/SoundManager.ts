export class SoundManager {
  private ctx: AudioContext | null = null;
  private musicInterval: any = null;
  private isMuted = false;
  private beatStep = 0;
  private isMusicPlaying = false;
  private masterVolumeNode: GainNode | null = null;
  private customAudioElement: HTMLAudioElement | null = null;

  constructor() {
    // AudioContext will be initialized on first user interaction (click/touch/key) to respect browser safety rules
  }

  public init() {
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
    if (this.customAudioElement) {
      this.customAudioElement.volume = muted ? 0 : 0.25;
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

    // High-fidelity procedural configurations for all 10 worlds!
    const worldConfigs: Record<string, {
      tempo: number;
      baseNotes: number[];
      melodyNotes: number[];
      oscType: OscillatorType;
      leadOscType: OscillatorType;
      percussionType: 'woodblock' | 'hihat' | 'bongo' | 'retro' | 'noise' | 'none';
    }> = {
      jungle: {
        tempo: 104,
        baseNotes: [110.00, 130.81, 146.83, 164.81], // A2-C3-D3-E3
        melodyNotes: [220.00, 261.63, 293.66, 329.63, 392.00, 440.00], // Pentatonic Minor
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'bongo'
      },
      jungle_temple: {
        tempo: 96,
        baseNotes: [87.31, 98.00, 110.00, 130.81], // F2-G2-A2-C3
        melodyNotes: [174.61, 196.00, 220.00, 261.63, 311.13, 349.23], // Mystical / Acoustic Scale
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'woodblock'
      },
      cyberpunk: {
        tempo: 125,
        baseNotes: [73.42, 82.41, 110.00, 97.99], // D2-E2-A2-G2
        melodyNotes: [293.66, 329.63, 392.00, 440.00, 493.88, 587.33], // Neon cyberpunk scale
        oscType: 'triangle',
        leadOscType: 'sawtooth',
        percussionType: 'hihat'
      },
      ice: {
        tempo: 86,
        baseNotes: [130.81, 146.83, 164.81, 196.00], // C3-D3-E3-G3
        melodyNotes: [523.25, 587.33, 659.25, 739.99, 783.99, 987.77], // Lydian Crystalline
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'noise'
      },
      desert: {
        tempo: 92,
        baseNotes: [82.41, 87.31, 123.47, 110.00], // E2-F2-B2-A2
        melodyNotes: [164.81, 174.61, 207.65, 220.00, 246.94, 261.63, 311.13], // Phrygian exotic
        oscType: 'triangle',
        leadOscType: 'triangle',
        percussionType: 'bongo'
      },
      volcano: {
        tempo: 136,
        baseNotes: [55.00, 65.41, 73.42, 69.30], // A1-C2-D2-C#2
        melodyNotes: [110.00, 116.54, 138.59, 146.83, 164.81, 196.00], // Locrian panic scale
        oscType: 'sawtooth',
        leadOscType: 'sawtooth',
        percussionType: 'hihat'
      },
      space: {
        tempo: 82,
        baseNotes: [146.83, 164.81, 110.00, 130.81], // D3-E3-A2-C3
        melodyNotes: [293.66, 349.23, 392.00, 440.00, 523.25], // Cosmic scale
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'none'
      },
      underwater: {
        tempo: 88,
        baseNotes: [98.00, 116.54, 130.81, 146.83], // G2-Bb2-C3-D3
        melodyNotes: [196.00, 233.08, 261.63, 293.66, 349.23, 392.00], // Muffled bubble minor
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'bongo'
      },
      heaven: {
        tempo: 98,
        baseNotes: [130.81, 164.81, 196.00, 261.63], // C3-E3-G3-C4
        melodyNotes: [523.25, 659.25, 783.99, 880.00, 987.77, 1046.50], // Celestial major
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'woodblock'
      },
      retro: {
        tempo: 114,
        baseNotes: [130.81, 164.81, 196.00, 220.00], // C3-E3-G3-A3
        melodyNotes: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25], // 8-bit NES style
        oscType: 'square',
        leadOscType: 'square',
        percussionType: 'retro'
      }
    };

    const config = worldConfigs[worldId] || worldConfigs['jungle'];
    const intervalTime = (60 / config.tempo) * 1000 / 2; // Tick every eighth note

    this.musicInterval = setInterval(() => {
      if (this.isMuted || !this.ctx || this.ctx.state === 'suspended') return;

      const engine = (window as any).gameEngine;
      const score = engine ? engine.score : 0;
      const isUltimate = engine ? engine.ultimateActive : false;
      const isBossFight = engine ? (engine.state === 'BOSS_FIGHT' || engine.state === 'BOSS_WARNING') : false;

      const barStep = this.beatStep % 16;
      const baseNoteIndex = Math.floor(this.beatStep / 4) % config.baseNotes.length;
      let baseFreq = config.baseNotes[baseNoteIndex];

      // Transpose up by a minor third (3 semitones) in boss fights for heightened battle tension!
      if (isBossFight) {
        baseFreq = baseFreq * 1.189;
      }

      // --- LAYER 1: BASELINE (Always Active) ---
      const arpFreqs = [baseFreq, baseFreq * 1.5, baseFreq * 2.0, baseFreq * 1.2];
      const currentArpFreq = arpFreqs[barStep % arpFreqs.length];
      
      let bassVolume = 0.16;
      if (worldId === 'underwater') bassVolume = 0.22; // underwater sine waves need boost
      if (isUltimate) bassVolume = 0.24;

      this.playTone(currentArpFreq, currentArpFreq, 0.15, config.oscType, bassVolume, 'linear');

      // --- LAYER 2: DRUMS & PERCUSSION (Active when score >= 5 or in boss fight) ---
      if (score >= 5 || isBossFight) {
        // Bass kick drum on beats 1 and 3 (steps 0 and 8)
        if (barStep === 0 || barStep === 8) {
          this.playTone(55, 10, 0.12, 'sine', 0.28, 'exp');
        }

        // Snare / woodblock accent on beats 2 and 4 (steps 4 and 12)
        if (barStep === 4 || barStep === 12) {
          if (config.percussionType === 'hihat' || config.percussionType === 'retro') {
            this.playSnare();
          } else if (config.percussionType === 'bongo') {
            this.playBongo(150, 0.14, 0.2);
          } else if (config.percussionType === 'woodblock') {
            this.playWoodblock(1000, 0.08, 0.1);
          } else if (config.percussionType === 'noise') {
            this.playNoiseWind(0.1, 0.05, 800);
          }
        }

        // Ticking hihats on offbeats (steps 2, 6, 10, 14)
        if (barStep % 4 === 2) {
          if (config.percussionType === 'hihat') {
            this.playHihat();
          } else if (config.percussionType === 'retro') {
            this.playWoodblock(2000, 0.03, 0.05); // High retro synth tick
          } else if (config.percussionType === 'bongo') {
            this.playBongo(300, 0.05, 0.08); // High bongo sound
          } else if (config.percussionType === 'woodblock') {
            this.playWoodblock(1600, 0.03, 0.06);
          } else if (config.percussionType === 'noise') {
            this.playHihat();
          }
        }
      }

      // --- LAYER 3: HARMONIC CELESTIAL CHORD PAD (Active when score >= 12 or in boss fight) ---
      if (score >= 12 || isBossFight) {
        if (barStep === 0 || barStep === 8) {
          const chordFreq1 = baseFreq * 2.0;
          const chordFreq2 = baseFreq * 3.0;
          const chordFreq3 = baseFreq * 4.0;
          
          let chordVol = 0.08;
          if (worldId === 'space' || worldId === 'heaven') chordVol = 0.12;

          this.playTone(chordFreq1, chordFreq1 * 1.01, 0.65, 'sine', chordVol, 'linear');
          this.playTone(chordFreq2, chordFreq2 * 1.01, 0.65, 'sine', chordVol * 0.7, 'linear');
          this.playTone(chordFreq3, chordFreq3 * 1.01, 0.65, 'sine', chordVol * 0.5, 'linear');
        }
      }

      // --- LAYER 4: MELODIC LEADS (Active when score >= 22 or in boss fight) ---
      if (score >= 22 || isBossFight) {
        const melodyPattern = [0, 2, 4, 3, 5, 4, 2, 1, 3, 2, 4, 5, 3, 1, 0, 2];
        const currentMelodyIndex = melodyPattern[barStep % melodyPattern.length];
        const melodyFreq = config.melodyNotes[currentMelodyIndex % config.melodyNotes.length];

        if (barStep % 2 === 0) {
          let leadVol = 0.11;
          if (isBossFight) leadVol = 0.16;

          if (worldId === 'underwater') {
            this.playTone(melodyFreq * 0.5, melodyFreq * 0.5, 0.22, 'sine', leadVol, 'linear'); // muffled filter style
          } else {
            this.playTone(melodyFreq, melodyFreq, 0.18, config.leadOscType, leadVol, 'linear');
          }
        }
      }

      // --- LAYER 5: ULTIMATE SPECIAL OVERDRIVE (Active during Ultimate mode) ---
      if (isUltimate) {
        const ultArpIndex = this.beatStep % config.melodyNotes.length;
        const ultFreq = config.melodyNotes[ultArpIndex] * 2.0; // Play hyper double-octave lead runs
        this.playTone(ultFreq, ultFreq * 1.05, 0.08, 'sawtooth', 0.08, 'linear');
      }

      this.beatStep++;
    }, intervalTime);
  }

  public stopMusic() {
    if (this.customAudioElement) {
      this.customAudioElement.pause();
      this.customAudioElement.currentTime = 0;
      this.customAudioElement = null;
    }
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
    osc.frequency.setValueAtTime(10000, this.ctx.currentTime);

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

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
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

  // Helper sound synthesizers
  private playBongo(pitch = 120, duration = 0.12, gainValue = 0.15) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterVolumeNode || this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playWoodblock(pitch = 800, duration = 0.08, gainValue = 0.08) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterVolumeNode || this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoiseWind(duration = 0.5, gainValue = 0.02, lowPassFreq = 1200) {
    if (!this.ctx || this.isMuted) return;
    try {
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lowPassFreq, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(lowPassFreq * 0.2, this.ctx.currentTime + duration);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterVolumeNode || this.ctx.destination);
      noise.start();
      noise.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  }
}
