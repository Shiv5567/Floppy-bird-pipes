export class SoundManager {
  private ctx: AudioContext | null = null;
  private musicInterval: any = null;
  private isMuted = false;
  private beatStep = 0;
  private isMusicPlaying = false;
  private masterVolumeNode: GainNode | null = null;
  private customAudioElement: HTMLAudioElement | null = null;

  // Add individual volume controls (Music and System SFX)
  private musicVolume = 0.5; // 0.0 to 1.0 (50% default)
  private sfxVolume = 0.8;   // 0.0 to 1.0 (80% default)

  constructor() {
    this.musicVolume = parseFloat(localStorage.getItem('flight_of_legends_music_volume') || '0.5');
    this.sfxVolume = parseFloat(localStorage.getItem('flight_of_legends_sfx_volume') || '0.8');
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterVolumeNode = this.ctx.createGain();
      this.masterVolumeNode.gain.setValueAtTime(0.55, this.ctx.currentTime); // Boosted Master
      this.masterVolumeNode.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API not supported on this browser.', e);
    }
  }

  // Getters and setters for volume control
  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setMusicVolume(vol: number) {
    this.musicVolume = Math.max(0.0, Math.min(1.0, vol));
    localStorage.setItem('flight_of_legends_music_volume', this.musicVolume.toString());
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0.0, Math.min(1.0, vol));
    localStorage.setItem('flight_of_legends_sfx_volume', this.sfxVolume.toString());
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterVolumeNode && this.ctx) {
      this.masterVolumeNode.gain.setValueAtTime(muted ? 0 : 0.55, this.ctx.currentTime);
    }
    if (this.customAudioElement) {
      this.customAudioElement.volume = muted ? 0 : 0.45 * this.musicVolume;
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
    freqCurve: 'linear' | 'exp' = 'exp',
    isMusic = false // Category selection
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

    // Apply specific category volume factor
    const volumeMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.setValueAtTime(gainStart * volumeMultiplier, this.ctx.currentTime);
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

  private playSynthNote(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainVal = 0.3,
    filterConfig?: { type: BiquadFilterType; startFreq: number; endFreq: number; q?: number },
    delayEffect = false,
    portamentoFreqEnd?: number,
    isMusic = false // Category selection
  ) {
    this.init();
    if (!this.ctx || this.isMuted) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    let lastNode: AudioNode = osc;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    // Support Portamento (pitch slide)
    if (portamentoFreqEnd && portamentoFreqEnd > 0) {
      osc.frequency.exponentialRampToValueAtTime(portamentoFreqEnd, this.ctx.currentTime + duration);
    }

    // Support ADSR envelope
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    const attackTime = (type === 'sine' && duration > 0.4) ? 0.12 : 0.012;
    
    // Apply specific category volume factor
    const volumeMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.linearRampToValueAtTime(gainVal * volumeMultiplier, this.ctx.currentTime + attackTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    // Support Resonant Filter Sweeps
    if (filterConfig) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterConfig.type;
      filter.Q.setValueAtTime(filterConfig.q || 1, this.ctx.currentTime);
      filter.frequency.setValueAtTime(filterConfig.startFreq, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(filterConfig.endFreq, this.ctx.currentTime + duration);
      
      osc.connect(filter);
      lastNode = filter;
    }

    lastNode.connect(gain);

    // Support Dynamic Feedback Delay & Echo
    if (delayEffect) {
      const delayNode = this.ctx.createDelay(1.0);
      const feedbackGain = this.ctx.createGain();
      
      delayNode.delayTime.setValueAtTime(0.28, this.ctx.currentTime);
      feedbackGain.gain.setValueAtTime(0.42, this.ctx.currentTime);

      gain.connect(delayNode);
      delayNode.connect(feedbackGain);
      feedbackGain.connect(delayNode);

      gain.connect(this.masterVolumeNode || this.ctx.destination);
      delayNode.connect(this.masterVolumeNode || this.ctx.destination);
    } else {
      gain.connect(this.masterVolumeNode || this.ctx.destination);
    }

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // SFX Synthesizers (System SFX Volume)
  public playFlap() {
    this.playTone(180, 40, 0.15, 'triangle', 0.6, 'linear', false);
  }

  public playCoin() {
    this.playTone(523.25, 1046.50, 0.1, 'sine', 0.4, 'linear', false);
    setTimeout(() => {
      this.playTone(1046.50, 1567.98, 0.15, 'sine', 0.3, 'linear', false);
    }, 60);
  }

  public playGem() {
    this.playTone(1567.98, 2093.00, 0.2, 'sine', 0.3, 'linear', false);
    setTimeout(() => {
      this.playTone(2093.00, 2793.83, 0.25, 'sine', 0.2, 'linear', false);
    }, 50);
  }

  public playZap() {
    this.playTone(1200, 100, 0.2, 'sawtooth', 0.35, 'exp', false);
  }

  public playShieldDeflect() {
    this.playTone(800, 300, 0.3, 'square', 0.4, 'exp', false);
    this.playTone(100, 2000, 0.15, 'triangle', 0.25, 'linear', false);
  }

  public playSpeedBoost() {
    this.playTone(80, 1600, 0.5, 'sawtooth', 0.4, 'linear', false);
  }

  public playExplosion() {
    this.init();
    if (!this.ctx || this.isMuted) return;

    const bufferSize = this.ctx.sampleRate * 0.6;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
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
    // Apply SFX Volume
    gainNode.gain.setValueAtTime(0.8 * this.sfxVolume, this.ctx.currentTime);
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
    const tones = [523.25, 659.25, 783.99, 1046.50];
    tones.forEach((f, idx) => {
      setTimeout(() => {
        this.playTone(f, f * 1.05, 0.25, 'sine', 0.4, 'linear', false);
      }, idx * 100);
    });
  }

  public playCrateUnlock() {
    const tones = [392.00, 523.25, 659.25, 783.99, 987.77, 1174.66];
    tones.forEach((f, idx) => {
      setTimeout(() => {
        this.playTone(f, f * 1.02, 0.15, 'triangle', 0.3, 'linear', false);
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

    const worldConfigs: Record<string, {
      tempo: number;
      baseNotes: number[];
      melodyNotes: number[];
      oscType: OscillatorType;
      leadOscType: OscillatorType;
      percussionType: 'woodblock' | 'hihat' | 'bongo' | 'retro' | 'noise' | 'none';
      useFilterSweep: boolean;
      useDelayEcho: boolean;
      usePortamento: boolean;
    }> = {
      jungle: {
        tempo: 104,
        baseNotes: [110.00, 130.81, 146.83, 164.81],
        melodyNotes: [220.00, 261.63, 293.66, 329.63, 392.00, 440.00],
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'bongo',
        useFilterSweep: false,
        useDelayEcho: true,
        usePortamento: false
      },
      jungle_temple: {
        tempo: 88,
        baseNotes: [87.31, 98.00, 110.00, 130.81],
        melodyNotes: [174.61, 196.00, 220.00, 261.63, 311.13, 349.23],
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'woodblock',
        useFilterSweep: false,
        useDelayEcho: true,
        usePortamento: false
      },
      cyberpunk: {
        tempo: 78,
        baseNotes: [146.83, 164.81, 220.00, 196.00],
        melodyNotes: [587.33, 659.25, 783.99, 880.00, 987.77],
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'none',
        useFilterSweep: true,
        useDelayEcho: true,
        usePortamento: false
      },
      ice: {
        tempo: 82,
        baseNotes: [130.81, 146.83, 164.81, 196.00],
        melodyNotes: [523.25, 587.33, 659.25, 739.99, 783.99, 987.77],
        oscType: 'sine',
        leadOscType: 'triangle',
        percussionType: 'noise',
        useFilterSweep: false,
        useDelayEcho: true,
        usePortamento: false
      },
      desert: {
        tempo: 92,
        baseNotes: [82.41, 87.31, 123.47, 110.00],
        melodyNotes: [164.81, 174.61, 207.65, 220.00, 246.94, 261.63, 311.13],
        oscType: 'triangle',
        leadOscType: 'triangle',
        percussionType: 'bongo',
        useFilterSweep: false,
        useDelayEcho: false,
        usePortamento: true
      },
      volcano: {
        tempo: 136,
        baseNotes: [55.00, 65.41, 73.42, 69.30],
        melodyNotes: [110.00, 116.54, 138.59, 146.83, 164.81, 196.00],
        oscType: 'square',
        leadOscType: 'sawtooth',
        percussionType: 'hihat',
        useFilterSweep: true,
        useDelayEcho: true,
        usePortamento: false
      },
      space: {
        tempo: 80,
        baseNotes: [146.83, 164.81, 110.00, 130.81],
        melodyNotes: [293.66, 349.23, 392.00, 440.00, 523.25],
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'none',
        useFilterSweep: true,
        useDelayEcho: true,
        usePortamento: false
      },
      underwater: {
        tempo: 88,
        baseNotes: [98.00, 116.54, 130.81, 146.83],
        melodyNotes: [196.00, 233.08, 261.63, 293.66, 349.23, 392.00],
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'bongo',
        useFilterSweep: true,
        useDelayEcho: true,
        usePortamento: false
      },
      heaven: {
        tempo: 96,
        baseNotes: [130.81, 164.81, 196.00, 261.63],
        melodyNotes: [523.25, 659.25, 783.99, 880.00, 987.77, 1046.50],
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'woodblock',
        useFilterSweep: false,
        useDelayEcho: true,
        usePortamento: false
      },
      retro: {
        tempo: 114,
        baseNotes: [130.81, 164.81, 196.00, 220.00],
        melodyNotes: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],
        oscType: 'square',
        leadOscType: 'square',
        percussionType: 'retro',
        useFilterSweep: false,
        useDelayEcho: false,
        usePortamento: true
      }
    };

    const config = worldConfigs[worldId] || worldConfigs['jungle'];
    const intervalTime = (60 / config.tempo) * 1000 / 2;

    this.musicInterval = setInterval(() => {
      if (this.isMuted || !this.ctx || this.ctx.state === 'suspended') return;

      const engine = (window as any).gameEngine;
      const score = engine ? engine.score : 0;
      const isUltimate = engine ? engine.ultimateActive : false;
      const isBossFight = engine ? (engine.state === 'BOSS_FIGHT' || engine.state === 'BOSS_WARNING') : false;

      const barStep = this.beatStep % 16;
      const baseNoteIndex = Math.floor(this.beatStep / 4) % config.baseNotes.length;
      let baseFreq = config.baseNotes[baseNoteIndex];

      if (isBossFight) {
        baseFreq = baseFreq * 1.189;
      }

      // --- LAYER 1: BASS / REVERSED TEXTURE (isMusic = true) ---
      if (worldId === 'cyberpunk') {
        if (barStep === 0 || barStep === 8) {
          this.playSynthNote(baseFreq * 0.5, 1.4, 'sine', 0.16, { type: 'lowpass', startFreq: 300, endFreq: 900, q: 1 }, true, baseFreq * 0.75, true);
        }
        if (score >= 35) {
          if (barStep === 0 || barStep === 8) {
            this.playSynthNote(baseFreq * 0.5, 1.2, 'sine', 0.22, { type: 'lowpass', startFreq: 110, endFreq: 80, q: 1 }, false, baseFreq * 0.75, true);
          }
        }
      } else {
        let currentBassFreq = baseFreq;
        if (worldId === 'retro' && barStep % 2 === 1) {
          currentBassFreq = baseFreq * 2.0;
        } else {
          const arpFreqs = [baseFreq, baseFreq * 1.5, baseFreq * 2.0, baseFreq * 1.2];
          currentBassFreq = arpFreqs[barStep % arpFreqs.length];
        }

        let bassVolume = 0.26;
        if (worldId === 'underwater') bassVolume = 0.32;
        if (isUltimate) bassVolume = 0.38;

        if (worldId === 'underwater') {
          this.playSynthNote(currentBassFreq, 0.16, 'sine', bassVolume, { type: 'lowpass', startFreq: 180, endFreq: 120, q: 1 }, false, undefined, true);
        } else if (worldId === 'volcano') {
          this.playSynthNote(currentBassFreq, 0.16, 'square', bassVolume, { type: 'lowpass', startFreq: 800, endFreq: 200, q: 6 }, false, undefined, true);
        } else {
          this.playSynthNote(currentBassFreq, 0.16, config.oscType, bassVolume, undefined, false, undefined, true);
        }
      }

      // --- LAYER 2: DRUMS & PERCUSSION (isMusic = true) ---
      if (worldId === 'cyberpunk') {
        if (score >= 5) {
          if (barStep === 0 || barStep === 8) {
            this.playSynthNote(45, 0.12, 'sine', 0.22, { type: 'lowpass', startFreq: 90, endFreq: 10, q: 1 }, false, undefined, true);
          }
          if (barStep === 4 || barStep === 12) {
            this.playSynthNote(12000, 0.02, 'triangle', 0.04, { type: 'highpass', startFreq: 8000, endFreq: 10000, q: 1 }, false, undefined, true);
          }
          if (barStep % 4 === 2) {
            this.playSynthNote(10000, 0.015, 'triangle', 0.02, { type: 'highpass', startFreq: 9000, endFreq: 11000, q: 1 }, false, undefined, true);
          }
        }
      } else if (score >= 5 || isBossFight) {
        if (barStep === 0 || barStep === 8) {
          this.playSynthNote(55, 0.12, 'sine', 0.45, { type: 'lowpass', startFreq: 120, endFreq: 10, q: 1 }, false, undefined, true);
        }

        if (barStep === 4 || barStep === 12) {
          if (config.percussionType === 'hihat' || config.percussionType === 'retro') {
            this.playSnare(true);
          } else if (config.percussionType === 'bongo') {
            this.playBongo(150, 0.14, 0.32, true);
          } else if (config.percussionType === 'woodblock') {
            this.playWoodblock(950, 0.08, 0.24, true);
          } else if (config.percussionType === 'noise') {
            this.playNoiseWind(0.12, 0.14, 800, true);
          }
        }

        if (barStep % 4 === 2) {
          if (config.percussionType === 'hihat') {
            this.playHihat(true);
          } else if (config.percussionType === 'retro') {
            this.playWoodblock(1800, 0.03, 0.15, true);
          } else if (config.percussionType === 'bongo') {
            this.playBongo(280, 0.05, 0.16, true);
          } else if (config.percussionType === 'woodblock') {
            this.playWoodblock(1500, 0.03, 0.15, true);
          } else if (config.percussionType === 'noise') {
            this.playHihat(true);
          }
        }

        if (worldId === 'jungle_temple' && barStep === 0) {
          this.playSynthNote(80, 1.5, 'sine', 0.25, { type: 'lowpass', startFreq: 400, endFreq: 50, q: 2 }, true, undefined, true);
        }
      }

      // --- LAYER 3: DYNAMIC CELESTIAL CHORD PAD (isMusic = true) ---
      if (worldId === 'cyberpunk') {
        if (barStep === 0 || barStep === 8) {
          const chordFreq1 = baseFreq * 1.5;
          const chordFreq2 = baseFreq * 2.0;
          const chordFreq3 = baseFreq * 2.5;
          this.playSynthNote(chordFreq1, 1.3, 'sine', 0.15, { type: 'lowpass', startFreq: 600, endFreq: 300, q: 1 }, true, undefined, true);
          this.playSynthNote(chordFreq2, 1.3, 'sine', 0.12, { type: 'lowpass', startFreq: 800, endFreq: 400, q: 1 }, true, undefined, true);
          this.playSynthNote(chordFreq3, 1.3, 'sine', 0.10, { type: 'lowpass', startFreq: 1000, endFreq: 500, q: 1 }, true, undefined, true);
          
          if (score >= 12) {
            this.playSynthNote(chordFreq1 * 2.0, 0.5, 'triangle', 0.08, undefined, true, undefined, true);
            this.playSynthNote(chordFreq3 * 2.0, 0.5, 'triangle', 0.06, undefined, true, undefined, true);
          }
        }
      } else if (score >= 12 || isBossFight) {
        if (barStep === 0 || barStep === 8) {
          const chordFreq1 = baseFreq * 2.0;
          const chordFreq2 = baseFreq * 3.0;
          const chordFreq3 = baseFreq * 4.0;
          
          let chordVol = 0.15;
          if (worldId === 'space' || worldId === 'heaven') chordVol = 0.22;

          if (worldId === 'space') {
            this.playSynthNote(chordFreq1, 0.8, 'sine', chordVol, { type: 'lowpass', startFreq: 1200, endFreq: 400, q: 2 }, true, undefined, true);
            this.playSynthNote(chordFreq2, 0.8, 'sine', chordVol * 0.7, { type: 'lowpass', startFreq: 1500, endFreq: 500, q: 2 }, true, undefined, true);
          } else if (worldId === 'heaven' || worldId === 'jungle_temple' || worldId === 'ice') {
            this.playSynthNote(chordFreq1, 0.7, 'sine', chordVol, undefined, true, undefined, true);
            this.playSynthNote(chordFreq2, 0.7, 'sine', chordVol * 0.7, undefined, true, undefined, true);
            this.playSynthNote(chordFreq3, 0.7, 'sine', chordVol * 0.5, undefined, true, undefined, true);
          } else {
            this.playSynthNote(chordFreq1, 0.5, config.oscType, chordVol, undefined, false, undefined, true);
            this.playSynthNote(chordFreq2, 0.5, config.oscType, chordVol * 0.7, undefined, false, undefined, true);
          }
        }
      }

      // --- LAYER 4: MELODIC LEADS (isMusic = true) ---
      if (worldId === 'cyberpunk') {
        if (score >= 22 || isBossFight) {
          if (barStep % 4 === 2) {
            const melodyPattern = [0, 2, 1, 3];
            const currentMelodyIndex = melodyPattern[Math.floor(barStep / 4) % melodyPattern.length];
            const melodyFreq = config.melodyNotes[currentMelodyIndex % config.melodyNotes.length];
            this.playSynthNote(melodyFreq, 0.4, 'sine', 0.16, undefined, true, undefined, true);
          }
        }
      } else if (score >= 22 || isBossFight) {
        const melodyPattern = [0, 2, 4, 3, 5, 4, 2, 1, 3, 2, 4, 5, 3, 1, 0, 2];
        const currentMelodyIndex = melodyPattern[barStep % melodyPattern.length];
        const melodyFreq = config.melodyNotes[currentMelodyIndex % config.melodyNotes.length];

        if (barStep % 2 === 0) {
          let leadVol = 0.22;
          if (isBossFight) leadVol = 0.32;

          if (worldId === 'underwater') {
            this.playSynthNote(melodyFreq * 0.5, 0.22, 'sine', leadVol, { type: 'bandpass', startFreq: 400, endFreq: 2200, q: 4 }, true, undefined, true);
          } else if (worldId === 'desert') {
            const nextIndex = melodyPattern[(barStep + 2) % melodyPattern.length];
            const nextFreq = config.melodyNotes[nextIndex % config.melodyNotes.length];
            this.playSynthNote(melodyFreq, 0.25, 'triangle', leadVol, undefined, false, nextFreq, true);
          } else if (worldId === 'retro') {
            const slideTarget = melodyFreq * 0.6;
            this.playSynthNote(melodyFreq, 0.18, 'square', leadVol, undefined, false, slideTarget, true);
          } else {
            this.playSynthNote(melodyFreq, 0.18, config.leadOscType, leadVol, undefined, config.useDelayEcho, undefined, true);
          }
        }
      }

      // --- LAYER 5: ULTIMATE SPECIAL OVERDRIVE (isMusic = true) ---
      if (isUltimate) {
        if (worldId === 'cyberpunk') {
          const ultArpIndex = this.beatStep % config.melodyNotes.length;
          const ultFreq = config.melodyNotes[ultArpIndex] * 1.5;
          this.playSynthNote(ultFreq, 0.2, 'sine', 0.08, undefined, true, undefined, true);
        } else {
          const ultArpIndex = this.beatStep % config.melodyNotes.length;
          const ultFreq = config.melodyNotes[ultArpIndex] * 2.0;
          
          let ultVol = 0.16;
          if (worldId === 'retro' || worldId === 'desert') {
            this.playSynthNote(ultFreq, 0.08, config.leadOscType, ultVol, undefined, false, ultFreq * 0.8, true);
          } else {
            this.playSynthNote(ultFreq, 0.08, 'sawtooth', ultVol, { type: 'highpass', startFreq: 1500, endFreq: 3000, q: 1 }, false, undefined, true);
          }
        }
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

  private playHihat(isMusic = false) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(10000, this.ctx.currentTime);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, this.ctx.currentTime);

    // Apply music or sfx volume
    const volMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.setValueAtTime(0.04 * volMultiplier, this.ctx.currentTime);
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

  private playSnare(isMusic = false) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.1);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);

    // Apply music or sfx volume
    const volMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.setValueAtTime(0.12 * volMultiplier, this.ctx.currentTime);
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
  private playBongo(pitch = 120, duration = 0.12, gainValue = 0.15, isMusic = false) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, this.ctx.currentTime + duration);
    
    // Apply volume multiplier
    const volMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.setValueAtTime(gainValue * volMultiplier, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterVolumeNode || this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playWoodblock(pitch = 800, duration = 0.08, gainValue = 0.08, isMusic = false) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
    
    // Apply volume multiplier
    const volMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.setValueAtTime(gainValue * volMultiplier, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.masterVolumeNode || this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoiseWind(duration = 0.5, gainValue = 0.02, lowPassFreq = 1200, isMusic = false) {
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
      
      // Apply volume multiplier
      const volMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
      gain.gain.setValueAtTime(gainValue * volMultiplier, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterVolumeNode || this.ctx.destination);
      noise.start();
      noise.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  }
}
