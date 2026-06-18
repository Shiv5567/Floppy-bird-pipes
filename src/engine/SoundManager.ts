export class SoundManager {
  private ctx: AudioContext | null = null;
  private musicInterval: any = null;
  private isMuted = false;
  private beatStep = 0;
  private isMusicPlaying = false;
  private masterVolumeNode: GainNode | null = null;
  private customAudioElement: HTMLAudioElement | null = null;
  private explosionBuffer: AudioBuffer | null = null;
  private menuAudioElement: HTMLAudioElement | null = null; // Glass Alibi menu BGM
  private isMenuMusicPlaying = false;

  // Add individual volume controls (Music and System SFX)
  private musicVolume = 0.6; // 0.0 to 1.0 (60% default)
  private sfxVolume = 0.4;   // 0.0 to 1.0 (40% default)

  constructor() {
    this.musicVolume = parseFloat(localStorage.getItem('flight_of_legends_music_vol_v2') || '0.6');
    this.sfxVolume = parseFloat(localStorage.getItem('flight_of_legends_sfx_vol_v2') || '0.4');
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterVolumeNode = this.ctx.createGain();
      this.masterVolumeNode.gain.setValueAtTime(0.55, this.ctx.currentTime); // Boosted Master
      this.masterVolumeNode.connect(this.ctx.destination);

      // Pre-compute explosion noise buffer for fast responsiveness on crash
      const bufferSize = this.ctx.sampleRate * 0.6;
      this.explosionBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.explosionBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
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
    localStorage.setItem('flight_of_legends_music_vol_v2', this.musicVolume.toString());
    
    if (this.menuAudioElement) {
      this.menuAudioElement.volume = this.isMuted ? 0 : 0.45 * this.musicVolume;
    }
    if (this.customAudioElement) {
      this.customAudioElement.volume = this.isMuted ? 0 : 0.45 * this.musicVolume;
    }
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setSfxVolume(vol: number) {
    this.sfxVolume = Math.max(0.0, Math.min(1.0, vol));
    localStorage.setItem('flight_of_legends_sfx_vol_v2', this.sfxVolume.toString());
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterVolumeNode && this.ctx) {
      this.masterVolumeNode.gain.setValueAtTime(muted ? 0 : 0.55, this.ctx.currentTime);
    }
    if (this.customAudioElement) {
      this.customAudioElement.volume = muted ? 0 : 0.45 * this.musicVolume;
    }
    if (this.menuAudioElement) {
      this.menuAudioElement.volume = muted ? 0 : 0.45 * this.musicVolume;
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // ── MENU MUSIC: Glass Alibi (plays on all non-gameplay screens) ──────────
  public startMenuMusic() {
    if (this.isMenuMusicPlaying) return; // Already running — don't restart
    this.isMenuMusicPlaying = true;

    const audio = new Audio('/Glass Alibi_102453106.mp3');
    audio.loop = true;
    audio.volume = this.isMuted ? 0 : 0.45 * this.musicVolume;
    this.menuAudioElement = audio;

    audio.play().catch(() => {
      // Autoplay blocked — will retry on next user gesture
      this.isMenuMusicPlaying = false;
      this.menuAudioElement = null;
    });
  }

  public stopMenuMusic() {
    if (this.menuAudioElement) {
      this.menuAudioElement.pause();
      this.menuAudioElement.currentTime = 0;
      this.menuAudioElement = null;
    }
    this.isMenuMusicPlaying = false;
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
    if (!this.ctx || this.isMuted || !this.explosionBuffer) return;

    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = this.explosionBuffer;

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

  // ─── UI INTERACTION SOUNDS (Premium Beat-Driven) ─────────────────────────

  /** Short punchy click: sub kick + crisp snap (≈60ms total) */
  public playUIClick() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const vol = this.sfxVolume;
    const dest = this.masterVolumeNode || this.ctx.destination;

    // Punchy sub thump
    const kick = this.ctx.createOscillator();
    const kGain = this.ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(160, t);
    kick.frequency.exponentialRampToValueAtTime(45, t + 0.05);
    kGain.gain.setValueAtTime(0.5 * vol, t);
    kGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    kick.connect(kGain); kGain.connect(dest);
    kick.start(t); kick.stop(t + 0.07);

    // Crisp high snap
    const snap = this.ctx.createOscillator();
    const sGain = this.ctx.createGain();
    snap.type = 'triangle';
    snap.frequency.setValueAtTime(2000, t);
    snap.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    sGain.gain.setValueAtTime(0.2 * vol, t);
    sGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    snap.connect(sGain); sGain.connect(dest);
    snap.start(t); snap.stop(t + 0.06);
  }

  /** Short tab/select: quick punch + 2-note chime (≈150ms total) */
  public playUISelect() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const vol = this.sfxVolume;
    const dest = this.masterVolumeNode || this.ctx.destination;

    // Quick low punch
    const punch = this.ctx.createOscillator();
    const pGain = this.ctx.createGain();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(100, t);
    punch.frequency.exponentialRampToValueAtTime(28, t + 0.06);
    pGain.gain.setValueAtTime(0.38 * vol, t);
    pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    punch.connect(pGain); pGain.connect(dest);
    punch.start(t); punch.stop(t + 0.09);

    // 2-note quick ascending chime (C5 → G5)
    [[523.25, 0.01, 0.12], [783.99, 0.07, 0.12]].forEach(([freq, delay, dur]) => {
      const osc = this.ctx!.createOscillator();
      const g   = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);
      g.gain.setValueAtTime(0.001, t + delay);
      g.gain.linearRampToValueAtTime(0.28 * vol, t + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      osc.connect(g); g.connect(dest);
      osc.start(t + delay); osc.stop(t + delay + dur + 0.02);
    });
  }

  /** Premium back: descending thud + soft sweep */
  public playUIBack() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const vol = this.sfxVolume;
    const dest = this.masterVolumeNode || this.ctx.destination;

    // Thuddy sub drop
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(35, t + 0.1);
    subGain.gain.setValueAtTime(0.35 * vol, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    sub.connect(subGain); subGain.connect(dest);
    sub.start(t); sub.stop(t + 0.16);

    // Descending 2-note sweep (G5 → C5)
    [
      { freq: 783.99, delay: 0, dur: 0.18 },
      { freq: 523.25, delay: 0.09, dur: 0.20 },
    ].forEach(({ freq, delay, dur }) => {
      const osc = this.ctx!.createOscillator();
      const g   = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, t + delay + dur);
      g.gain.setValueAtTime(0.24 * vol, t + delay);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      osc.connect(g); g.connect(dest);
      osc.start(t + delay); osc.stop(t + delay + dur + 0.05);
    });
  }

  /** Premium CLAIM sound: golden coin cascade + triumphant rising shimmer */
  public playUIClaim() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const vol = this.sfxVolume;
    const dest = this.masterVolumeNode || this.ctx.destination;

    // Warm low punch
    const punch = this.ctx.createOscillator();
    const pGain = this.ctx.createGain();
    punch.type = 'sine';
    punch.frequency.setValueAtTime(90, t);
    punch.frequency.exponentialRampToValueAtTime(25, t + 0.08);
    pGain.gain.setValueAtTime(0.4 * vol, t);
    pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    punch.connect(pGain); pGain.connect(dest);
    punch.start(t); punch.stop(t + 0.12);

    // Golden coin cascade — 4 ascending sparkling notes
    const coinNotes = [
      { freq: 659.25, delay: 0.0,  dur: 0.15 },
      { freq: 783.99, delay: 0.06, dur: 0.15 },
      { freq: 987.77, delay: 0.12, dur: 0.18 },
      { freq: 1318.5, delay: 0.19, dur: 0.25 },
    ];
    coinNotes.forEach(({ freq, delay, dur }) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);
      osc.frequency.linearRampToValueAtTime(freq * 1.02, t + delay + dur);
      g.gain.setValueAtTime(0.001, t + delay);
      g.gain.linearRampToValueAtTime(0.32 * vol, t + delay + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
      osc.connect(g); g.connect(dest);
      osc.start(t + delay); osc.stop(t + delay + dur + 0.04);
    });

    // Final triumphant high chime tail
    const chime = this.ctx.createOscillator();
    const cGain = this.ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(2093, t + 0.22);
    chime.frequency.linearRampToValueAtTime(2637, t + 0.38);
    cGain.gain.setValueAtTime(0.001, t + 0.22);
    cGain.gain.linearRampToValueAtTime(0.22 * vol, t + 0.26);
    cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    chime.connect(cGain); cGain.connect(dest);
    chime.start(t + 0.22); chime.stop(t + 0.48);
  }

  /** Premium UPGRADE sound: power-up charge sweep + bright burst */
  public playUIUpgrade() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    const vol = this.sfxVolume;
    const dest = this.masterVolumeNode || this.ctx.destination;

    // Rising energy sweep (sawtooth filtered — gives "power charge" feel)
    const sweep = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    const sweepFilter = this.ctx.createBiquadFilter();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(80, t);
    sweep.frequency.exponentialRampToValueAtTime(880, t + 0.22);
    sweepFilter.type = 'bandpass';
    sweepFilter.frequency.setValueAtTime(400, t);
    sweepFilter.frequency.exponentialRampToValueAtTime(1600, t + 0.22);
    sweepFilter.Q.setValueAtTime(3, t);
    sweepGain.gain.setValueAtTime(0.001, t);
    sweepGain.gain.linearRampToValueAtTime(0.3 * vol, t + 0.08);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    sweep.connect(sweepFilter); sweepFilter.connect(sweepGain); sweepGain.connect(dest);
    sweep.start(t); sweep.stop(t + 0.26);

    // Bright burst chord at peak (C6 + E6 + G6 together)
    [[1046.5, 0.20], [1318.5, 0.21], [1568.0, 0.22]].forEach(([freq, delay]) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);
      g.gain.setValueAtTime(0.001, t + delay);
      g.gain.linearRampToValueAtTime(0.25 * vol, t + delay + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.2);
      osc.connect(g); g.connect(dest);
      osc.start(t + delay); osc.stop(t + delay + 0.25);
    });

    // Sub punch at the burst moment
    const sub = this.ctx.createOscillator();
    const subG = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, t + 0.20);
    sub.frequency.exponentialRampToValueAtTime(35, t + 0.30);
    subG.gain.setValueAtTime(0.45 * vol, t + 0.20);
    subG.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    sub.connect(subG); subG.connect(dest);
    sub.start(t + 0.20); sub.stop(t + 0.34);
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
        tempo: 82, // Slower, more relaxing tempo
        baseNotes: [87.31, 110.00, 130.81, 146.83], // Lower, softer base notes for foundation
        melodyNotes: [174.61, 220.00, 261.63, 293.66, 329.63, 392.00], // Pentatonic/engaging melodic notes
        oscType: 'triangle', // Warm, mellow bass/pad texture
        leadOscType: 'sine', // Pure, relaxing lead synth
        percussionType: 'bongo', // Fits the environment
        useFilterSweep: true,
        useDelayEcho: true, // Echo for space/engagement
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
        tempo: 72, // Slow, majestic premium feel
        baseNotes: [130.81, 164.81, 196.00, 220.00], // C3 E3 G3 A3
        melodyNotes: [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50], // C5-C6 range
        oscType: 'sine',
        leadOscType: 'sine',
        percussionType: 'none',
        useFilterSweep: false,
        useDelayEcho: true,
        usePortamento: true
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

    // Heaven world gets its own dedicated premium piano music system
    if (worldId === 'heaven') {
      this.startHeavenMusic();
      return;
    }

    const intervalTime = (60 / config.tempo) * 1000 / 2;

    const playNextBeat = () => {
      const engine = (window as any).gameEngine;
      const score = engine ? engine.score : 0;
      const gameMode = engine ? engine.gameMode : 'endless';

      let currentInterval = intervalTime;
      if (gameMode !== 'level' && score >= 100) {
        const speedBoostMultiplier = Math.pow(1.03, Math.floor(score / 100));
        currentInterval = intervalTime / speedBoostMultiplier;
      }

      this.musicInterval = setTimeout(playNextBeat, currentInterval);

      if (this.isMuted || !this.ctx || this.ctx.state === 'suspended') return;

      const isUltimate = engine ? engine.ultimateActive : false;
      const isBossFight = engine ? (engine.state === 'BOSS_FIGHT' || engine.state === 'BOSS_WARNING') : false;

      const barStep = this.beatStep % 16;
      const baseNoteIndex = Math.floor(this.beatStep / 4) % config.baseNotes.length;
      let baseFreq = config.baseNotes[baseNoteIndex];

      if (isBossFight) {
        baseFreq = baseFreq * 1.189;
      }

      // --- LAYER 1: BASS / REVERSED TEXTURE (isMusic = true) ---
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

      // --- LAYER 2: DRUMS & PERCUSSION (isMusic = true) ---
      const elapsedSeconds = (this.beatStep * intervalTime) / 1000;
      if (elapsedSeconds >= 30 || isBossFight) {
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

        if ((worldId === 'jungle_temple' || worldId === 'jungle') && barStep === 0) {
          this.playSynthNote(80, 1.5, 'sine', 0.25, { type: 'lowpass', startFreq: 400, endFreq: 50, q: 2 }, true, undefined, true);
        }
      }

      // --- LAYER 3: DYNAMIC CELESTIAL CHORD PAD (isMusic = true) ---
      if (elapsedSeconds >= 60 || isBossFight) {
        if (barStep === 0 || barStep === 8) {
          const chordFreq1 = baseFreq * 2.0;
          const chordFreq2 = baseFreq * 3.0;
          const chordFreq3 = baseFreq * 4.0;
          
          let chordVol = 0.15;
          if (worldId === 'space' || worldId === 'heaven') chordVol = 0.22;

          if (worldId === 'space') {
            this.playSynthNote(chordFreq1, 0.8, 'sine', chordVol, { type: 'lowpass', startFreq: 1200, endFreq: 400, q: 2 }, true, undefined, true);
            this.playSynthNote(chordFreq2, 0.8, 'sine', chordVol * 0.7, { type: 'lowpass', startFreq: 1500, endFreq: 500, q: 2 }, true, undefined, true);
          } else if (worldId === 'heaven') {
            // Premium cinematic 3-note filtered chord
            this.playSynthNote(chordFreq1, 0.85, 'triangle', chordVol, { type: 'lowpass', startFreq: 1800, endFreq: 400, q: 1.5 }, true, undefined, true);
            this.playSynthNote(chordFreq2, 0.85, 'triangle', chordVol * 0.7, { type: 'lowpass', startFreq: 2200, endFreq: 500, q: 1.5 }, true, undefined, true);
            this.playSynthNote(chordFreq3, 0.85, 'sine', chordVol * 0.4, { type: 'lowpass', startFreq: 2600, endFreq: 600, q: 1.5 }, true, undefined, true);
          } else if (worldId === 'jungle_temple' || worldId === 'ice' || worldId === 'jungle') {
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
      if (elapsedSeconds >= 90 || isBossFight) {
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
          } else if (worldId === 'heaven') {
            // Premium smooth portamento bell
            const nextIndex = melodyPattern[(barStep + 2) % melodyPattern.length];
            const nextFreq = config.melodyNotes[nextIndex % config.melodyNotes.length];
            this.playSynthNote(melodyFreq, 0.4, 'sine', leadVol, { type: 'lowpass', startFreq: 2500, endFreq: 800, q: 1.5 }, true, nextFreq, true);
          } else {
            this.playSynthNote(melodyFreq, 0.18, config.leadOscType, leadVol, undefined, config.useDelayEcho, undefined, true);
          }
        }
      }

      // --- LAYER 5: ULTIMATE SPECIAL OVERDRIVE (isMusic = true) ---
      if (isUltimate) {
        const ultArpIndex = this.beatStep % config.melodyNotes.length;
        const ultFreq = config.melodyNotes[ultArpIndex] * 2.0;
        
        let ultVol = 0.16;
        if (worldId === 'retro' || worldId === 'desert') {
          this.playSynthNote(ultFreq, 0.08, config.leadOscType, ultVol, undefined, false, ultFreq * 0.8, true);
        } else {
          this.playSynthNote(ultFreq, 0.08, 'sawtooth', ultVol, { type: 'highpass', startFreq: 1500, endFreq: 3000, q: 1 }, false, undefined, true);
        }
      }

      // --- LAYER 6: PIANO ARPEGGIOS (Time-based expansion: ~120 seconds in) ---
      if (elapsedSeconds >= 120) {
        const pianoPattern = [0, 2, 1, 3, 2, 4, 3, 5];
        if (barStep % 2 === 1) { // Upbeat rhythms
          const pIndex = pianoPattern[Math.floor(this.beatStep / 2) % pianoPattern.length];
          const pFreq = config.melodyNotes[pIndex % config.melodyNotes.length] * 0.5; // Lower register for piano
          this.playPianoNote(pFreq, true);
        }
      }

      // --- LAYER 7: FLUTE COUNTER-MELODY (Time-based expansion: ~60 seconds in) ---
      // Removed as per user request
      /*
      if (this.beatStep >= 256) {
        const flutePattern = [4, 5, 3, 4, 2, 3];
        if (barStep % 8 === 0) { // Long flowing notes
          const fIndex = flutePattern[Math.floor(this.beatStep / 8) % flutePattern.length];
          const fFreq = config.melodyNotes[fIndex % config.melodyNotes.length] * 2.0; // Higher register for flute
          this.playFluteNote(fFreq, 1.2, true);
        }
      }
      */

      this.beatStep++;
    };
    this.musicInterval = setTimeout(playNextBeat, intervalTime);
  }

  // ─── HEAVEN FANTASY REALM: DEDICATED PREMIUM PIANO AMBIENT MUSIC ──────────
  private startHeavenMusic() {
    if (!this.ctx) return;

    this.isMusicPlaying = true;
    this.beatStep = 0;

    // Am → F → C → G harmonic progression (frequencies in Hz)
    // Each chord: [root, third, fifth, octave]
    const chordProgressionBass: number[][] = [
      [110.00, 130.81, 164.81, 220.00], // Am  — A2 C3 E3 A3
      [87.31,  110.00, 130.81, 174.61], // F   — F2 A2 C3 F3
      [130.81, 164.81, 196.00, 261.63], // C   — C3 E3 G3 C4
      [98.00,  123.47, 146.83, 196.00], // G   — G2 B2 D3 G3
    ];

    const heavenMelody: number[] = [
      523.25, 587.33, 659.25, 698.46,  // C5 D5 E5 F5
      783.99, 880.00, 987.77, 1046.50, // G5 A5 B5 C6
    ];

    // Melodic arp pattern (index into heavenMelody)
    const arpPattern = [0, 2, 4, 3, 5, 4, 2, 1,  4, 6, 7, 5, 3, 2, 4, 0];

    // Tempo: 60 BPM = 1000ms per beat. Each tick = 1 eighth-note = 500ms
    const tickMs = 500; // 60 BPM eighth-notes
    let chordIndex = 0;

    const playNextTick = () => {
      const engine = (window as any).gameEngine;
      const score = engine ? engine.score : 0;
      const gameMode = engine ? engine.gameMode : 'endless';

      let currentTickMs = tickMs;
      if (gameMode !== 'level' && score >= 100) {
        const speedBoostMultiplier = Math.pow(1.03, Math.floor(score / 100));
        currentTickMs = tickMs / speedBoostMultiplier;
      }

      this.musicInterval = setTimeout(playNextTick, currentTickMs);

      if (this.isMuted || !this.ctx || this.ctx.state === 'suspended') return;

      const t   = this.ctx.currentTime;
      const bar = this.beatStep % 8; // 8 ticks per chord
      const vol = this.musicVolume;
      const dest = this.masterVolumeNode || this.ctx.destination;

      // Advance chord every 8 ticks (= 1 full bar of 4/4 at 60 BPM)
      if (bar === 0 && this.beatStep > 0) {
        chordIndex = (chordIndex + 1) % chordProgressionBass.length;
      }

      const chord = chordProgressionBass[chordIndex];

      // ── LAYER 1: SOFT BASS PULSE (every tick) ────────────────────────────
      {
        const bassFreq = chord[0];
        const osc = this.ctx.createOscillator();
        const g   = this.ctx.createGain();
        osc.type  = 'sine';
        osc.frequency.setValueAtTime(bassFreq, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.18 * vol, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(g); g.connect(dest);
        osc.start(t); osc.stop(t + 0.5);
      }


      // ── LAYER 3: PIANO ARPEGGIO (every 2 ticks — upbeat feel, unlocks after 30s) ────────────
      if (bar % 2 === 1 && this.beatStep >= 60) {
        const pIdx   = arpPattern[Math.floor(this.beatStep / 2) % arpPattern.length];
        const pFreq  = heavenMelody[pIdx % heavenMelody.length];

        const osc  = this.ctx.createOscillator();
        const g    = this.ctx.createGain();
        const filt = this.ctx.createBiquadFilter();
        osc.type   = 'triangle';
        osc.frequency.setValueAtTime(pFreq, t);
        filt.type  = 'lowpass';
        filt.frequency.setValueAtTime(pFreq * 3.5, t);
        filt.frequency.exponentialRampToValueAtTime(pFreq * 0.9, t + 0.55);
        filt.Q.setValueAtTime(0.5, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.28 * vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.connect(filt); filt.connect(g); g.connect(dest);
        osc.start(t); osc.stop(t + 0.6);
      }

      // ── LAYER 4: CELESTIAL SHIMMER (bell overtone — bar beat 4, unlocks after 60s) ──────────
      if (bar === 4 && this.beatStep >= 120) {
        const shimFreqs = [chord[2] * 4, chord[2] * 6]; // High overtones
        shimFreqs.forEach((freq, i) => {
          const osc = this.ctx!.createOscillator();
          const g   = this.ctx!.createGain();
          osc.type  = 'sine';
          osc.frequency.setValueAtTime(freq, t + i * 0.04);
          g.gain.setValueAtTime(0.001, t + i * 0.04);
          g.gain.linearRampToValueAtTime(0.09 * vol, t + i * 0.04 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.7);
          osc.connect(g); g.connect(dest);
          osc.start(t + i * 0.04); osc.stop(t + i * 0.04 + 0.75);
        });
      }

      // ── LAYER 5 (TIME-BASED): AMBIENT DRONE PAD (unlocks after 90 sec) ──
      if (this.beatStep >= 180 && bar === 0) {
        const drones = [chord[0] * 0.5, chord[1] * 0.5];
        drones.forEach(freq => {
          const osc  = this.ctx!.createOscillator();
          const g    = this.ctx!.createGain();
          const filt = this.ctx!.createBiquadFilter();
          osc.type   = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          filt.type  = 'lowpass';
          filt.frequency.setValueAtTime(300, t);
          filt.Q.setValueAtTime(0.3, t);
          g.gain.setValueAtTime(0.001, t);
          g.gain.linearRampToValueAtTime(0.12 * vol, t + 0.4);
          g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
          osc.connect(filt); filt.connect(g); g.connect(dest);
          osc.start(t); osc.stop(t + 4.8);
        });
      }

      // ── LAYER 6 (TIME-BASED): SOFT GENTLE NOTE PAD (after ~48 sec) ──────
      // Removed as per user request
      /*
      if (this.beatStep >= 96 && bar === 0) {
        const softPattern = [0, 3, 5, 4, 6, 5, 7, 4];
        const sIdx  = softPattern[Math.floor(this.beatStep / 8) % softPattern.length];
        const sFreq = heavenMelody[sIdx % heavenMelody.length]; // Same register as melody (no octave boost)

        // Pure soft sine note — slow attack, long sustain, smooth release
        const osc  = this.ctx.createOscillator();
        const g    = this.ctx.createGain();
        const filt = this.ctx.createBiquadFilter();
        osc.type   = 'sine';
        osc.frequency.setValueAtTime(sFreq, t);

        // Gentle lowpass to keep it very soft and warm
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(sFreq * 2.5, t);
        filt.frequency.exponentialRampToValueAtTime(sFreq * 1.0, t + 4.0);
        filt.Q.setValueAtTime(0.4, t);

        // Slow breath-like attack, long sustain, gentle fade
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.10 * vol, t + 0.5);  // very slow attack
        g.gain.setValueAtTime(0.10 * vol, t + 3.2);            // sustain
        g.gain.exponentialRampToValueAtTime(0.001, t + 4.2);   // gentle release

        osc.connect(filt); filt.connect(g); g.connect(dest);
        osc.start(t); osc.stop(t + 4.3);
      }
      */

      this.beatStep++;
    };
    this.musicInterval = setTimeout(playNextTick, tickMs);
  }

  public stopMusic() {
    if (this.customAudioElement) {
      this.customAudioElement.pause();
      this.customAudioElement.currentTime = 0;
      this.customAudioElement = null;
    }
    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
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

  private playPianoNote(freq: number, isMusic = true) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 3, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(freq * 0.5, this.ctx.currentTime + 0.6);

    const volMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35 * volMultiplier, this.ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.0);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolumeNode || this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.1);
  }

  private playFluteNote(freq: number, duration: number, isMusic = true) {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    // Simple LFO for vibrato
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.5, this.ctx.currentTime); // 5.5 Hz vibrato
    lfoGain.gain.setValueAtTime(freq * 0.012, this.ctx.currentTime); // vibrato depth
    
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const volMultiplier = isMusic ? this.musicVolume : this.sfxVolume;
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2 * volMultiplier, this.ctx.currentTime + 0.15); // Soft breath attack
    gain.gain.setValueAtTime(0.2 * volMultiplier, Math.max(this.ctx.currentTime + 0.15, this.ctx.currentTime + duration - 0.15)); // Sustain
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration); // Release

    // Flute reverb/echo
    const delayNode = this.ctx.createDelay(1.0);
    const feedbackGain = this.ctx.createGain();
    delayNode.delayTime.setValueAtTime(0.35, this.ctx.currentTime);
    feedbackGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    
    gain.connect(delayNode);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    osc.connect(gain);
    gain.connect(this.masterVolumeNode || this.ctx.destination);
    delayNode.connect(this.masterVolumeNode || this.ctx.destination);

    lfo.start();
    osc.start();
    lfo.stop(this.ctx.currentTime + duration);
    osc.stop(this.ctx.currentTime + duration);
  }
}
