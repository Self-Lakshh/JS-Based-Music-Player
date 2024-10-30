/**
 * BeatStream Audio Engine
 * Coordinates Web Audio API connections: Source -> Equalizer -> Panner -> Gain -> Analyser.
 * Contains a complete procedural synth engine to play music without file assets.
 */

export const AudioEngine = {
  ctx: null,
  audioEl: null,
  sourceNode: null,
  eqFilters: [],
  pannerNode: null,
  gainNode: null,
  analyserNode: null,

  // Event handlers
  onTimeUpdateCallback: null,
  onTrackEndedCallback: null,

  // Procedural Synth State
  isSynthPlaying: false,
  synthTrackId: null,
  synthTimerId: null,
  synthStartTime: 0,
  synthVirtualTime: 0,
  synthTempo: 120,
  synthStep: 0,
  nextNoteTime: 0,
  lookahead: 25.0, // ms
  scheduleAheadTime: 0.1, // sec

  // Default Equalizer Frequencies
  eqFrequencies: [60, 230, 910, 4000, 14000],

  /**
   * Initializes the Audio Engine. MUST be triggered by a user action.
   */
  init() {
    if (this.ctx) return;

    // Create AudioContext
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    // Create Audio Element for streaming local files
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = "anonymous";
    this.sourceNode = this.ctx.createMediaElementSource(this.audioEl);

    // Create Equalizer Filters (5-band peaking)
    this.eqFilters = this.eqFrequencies.map((freq) => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1.0;
      filter.gain.value = 0;
      return filter;
    });

    // Create Stereo Panner Node
    this.pannerNode = this.ctx.createStereoPanner();

    // Create Gain Node (Volume)
    this.gainNode = this.ctx.createGain();

    // Create Analyser Node
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 1024;

    // Route: Source -> EQ1 -> EQ2 -> EQ3 -> EQ4 -> EQ5 -> Panner -> Gain -> Analyser -> Destination
    let currentConnector = this.sourceNode;
    this.eqFilters.forEach((filter) => {
      currentConnector.connect(filter);
      currentConnector = filter;
    });

    currentConnector.connect(this.pannerNode);
    this.pannerNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    // Audio Element Event Listeners
    this.audioEl.addEventListener('timeupdate', () => {
      if (!this.isSynthPlaying && this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(this.audioEl.currentTime, this.audioEl.duration);
      }
    });

    this.audioEl.addEventListener('ended', () => {
      if (!this.isSynthPlaying && this.onTrackEndedCallback) {
        this.onTrackEndedCallback();
      }
    });
  },

  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  // --- CONTROLS ---

  playLocalTrack(blob, seekTime = 0) {
    this.init();
    this.resumeContext();
    this.stopSynth();

    const objectUrl = URL.createObjectURL(blob);
    this.audioEl.src = objectUrl;
    this.audioEl.currentTime = seekTime;
    
    const playPromise = this.audioEl.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => console.warn("Audio play interrupted:", err));
    }
  },

  pause() {
    this.resumeContext();
    if (this.isSynthPlaying) {
      this.isSynthPlaying = false;
      clearTimeout(this.synthTimerId);
    } else if (this.audioEl) {
      this.audioEl.pause();
    }
  },

  resume() {
    this.resumeContext();
    if (this.synthTrackId && !this.isSynthPlaying) {
      this.playSynthTrack(this.synthTrackId, this.synthVirtualTime);
    } else if (this.audioEl) {
      this.audioEl.play();
    }
  },

  stop() {
    this.stopSynth();
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
    }
  },

  seek(seconds, duration) {
    this.resumeContext();
    if (this.isSynthPlaying) {
      this.synthVirtualTime = Math.max(0, Math.min(seconds, duration));
      // recalculate step based on tempo and current virtual time
      const beats = (this.synthVirtualTime / 60) * this.synthTempo;
      this.synthStep = Math.floor(beats * 4); // 4 steps per beat
      this.nextNoteTime = this.ctx.currentTime;
      if (this.onTimeUpdateCallback) {
        this.onTimeUpdateCallback(this.synthVirtualTime, duration);
      }
    } else if (this.audioEl) {
      this.audioEl.currentTime = seconds;
    }
  },

  setVolume(volume) {
    this.init();
    // Clamp between 0 and 1
    const vol = Math.max(0, Math.min(volume, 1));
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(vol, this.ctx.currentTime);
    }
    if (this.audioEl) {
      this.audioEl.volume = vol;
    }
  },

  setPlaybackRate(rate) {
    this.init();
    if (this.audioEl) {
      this.audioEl.playbackRate = rate;
    }
    // Update synth tempo multiplier
    if (this.isSynthPlaying) {
      this.synthTempo = this.getSynthBaseTempo() * rate;
    }
  },

  setPan(pan) {
    this.init();
    if (this.pannerNode) {
      this.pannerNode.pan.setValueAtTime(pan, this.ctx.currentTime);
    }
  },

  setEqualizerBand(index, gainValue) {
    this.init();
    if (this.eqFilters[index]) {
      this.eqFilters[index].gain.setValueAtTime(gainValue, this.ctx.currentTime);
    }
  },

  getFrequencyData() {
    if (!this.analyserNode) return new Uint8Array(0);
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  },

  getWaveformData() {
    if (!this.analyserNode) return new Uint8Array(0);
    const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(dataArray);
    return dataArray;
  },

  // --- PROCEDURAL SYNTH ENGINE ---

  getSynthBaseTempo() {
    if (typeof this.synthTrackId === 'string' && this.synthTrackId.startsWith('bolly-')) {
      const num = parseInt(this.synthTrackId.split('-')[1]) || 1;
      const style = num % 3;
      if (style === 0) return 80;  // Romantic
      if (style === 1) return 115; // Dance
      return 125;                  // Upbeat
    }
    if (this.synthTrackId === 'synth-1') return 128; // Chiptune
    if (this.synthTrackId === 'synth-2') return 75;  // Lofi
    if (this.synthTrackId === 'synth-3') return 110; // Synthwave
    return 100;
  },

  getSynthDuration() {
    if (typeof this.synthTrackId === 'string' && this.synthTrackId.startsWith('bolly-')) {
      return this.synthDuration || 180;
    }
    if (this.synthTrackId === 'synth-1') return 90;
    if (this.synthTrackId === 'synth-2') return 120;
    if (this.synthTrackId === 'synth-3') return 100;
    return 90;
  },

  playSynthTrack(id, seekTime = 0, duration = 120) {
    this.init();
    this.resumeContext();
    this.stopSynth();

    this.isSynthPlaying = true;
    this.synthTrackId = id;
    this.synthDuration = duration;
    this.synthVirtualTime = seekTime;
    this.synthTempo = this.getSynthBaseTempo();
    if (this.audioEl) {
      this.synthTempo *= this.audioEl.playbackRate;
    }

    const beats = (this.synthVirtualTime / 60) * this.synthTempo;
    this.synthStep = Math.floor(beats * 4); // 4 steps per beat (16th notes)
    this.nextNoteTime = this.ctx.currentTime;
    this.synthStartTime = this.ctx.currentTime - this.synthVirtualTime;

    this.scheduler();
  },

  stopSynth() {
    this.isSynthPlaying = false;
    this.synthTrackId = null;
    clearTimeout(this.synthTimerId);
  },

  scheduler() {
    if (!this.isSynthPlaying) return;

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.synthStep, this.nextNoteTime);
      this.advanceStep();
    }

    // Update virtual time for progress reporting
    const elapsed = this.ctx.currentTime - this.synthStartTime;
    const dur = this.getSynthDuration();
    if (elapsed >= dur) {
      this.stopSynth();
      if (this.onTrackEndedCallback) {
        this.onTrackEndedCallback();
      }
      return;
    }

    this.synthVirtualTime = elapsed;
    if (this.onTimeUpdateCallback) {
      this.onTimeUpdateCallback(this.synthVirtualTime, dur);
    }

    this.synthTimerId = setTimeout(() => this.scheduler(), this.lookahead);
  },

  advanceStep() {
    const secondsPerBeat = 60.0 / this.synthTempo;
    const secondsPerStep = 0.25 * secondsPerBeat; // 16th note steps
    this.nextNoteTime += secondsPerStep;
    this.synthStep++;
  },

  scheduleNote(step, time) {
    const track = this.synthTrackId;
    if (track === 'synth-1') {
      this.scheduleChiptuneStep(step, time);
    } else if (track === 'synth-2') {
      this.scheduleLofiStep(step, time);
    } else if (track === 'synth-3') {
      this.scheduleSynthwaveStep(step, time);
    } else if (typeof track === 'string' && track.startsWith('bolly-')) {
      this.scheduleBollywoodStep(track, step, time);
    }
  },

  scheduleBollywoodStep(trackId, step, time) {
    const num = parseInt(trackId.split('-')[1]) || 1;
    const style = num % 3;

    if (style === 0) {
      // Soft Lofi / Romantic style
      this.scheduleLofiStep(step, time);
    } else if (style === 1) {
      // Synthwave / Dance style
      this.scheduleSynthwaveStep(step, time);
    } else {
      // Chiptune / Upbeat style
      this.scheduleChiptuneStep(step, time);
    }
  },

  // --- SYNTH 1: CHIPTUNE ODYSSEY (Square / Tri, Upbeat 8-Bit) ---
  scheduleChiptuneStep(step, time) {
    // 16-step cycles
    const localStep = step % 16;
    
    // Notes in A Minor Pentatonic: A3(220), C4(261.63), D4(293.66), E4(329.63), G4(392), A4(440)
    let melodyPattern = [
      440, 0, 392, 329, 293, 329, 0, 440,
      440, 523, 440, 392, 329, 293, 261, 220
    ];

    if (this.synthTrackId === 'bolly-10') { // Kabira
      melodyPattern = [
        293, 329, 293, 261, 293, 329, 293, 261,
        293, 329, 392, 329, 293, 261, 220, 0
      ];
    }

    const bassPattern = [
      110, 110, 130, 110, 146, 146, 165, 110,
      110, 110, 130, 110, 165, 165, 146, 130
    ];

    // Trigger Lead Note
    const freq = melodyPattern[localStep];
    if (freq > 0 && Math.random() > 0.1) {
      this.createSynthVoice(freq, 'square', 0.05, 0.12, 0.08, time);
      // Echo voice
      if (Math.random() > 0.5) {
        this.createSynthVoice(freq, 'sine', 0.02, 0.05, 0.2, time + 0.15);
      }
    }

    // Trigger Bass Note
    const bassFreq = bassPattern[localStep];
    if (step % 2 === 0) {
      this.createSynthVoice(bassFreq, 'triangle', 0.15, 0.01, 0.2, time);
    }

    // Sound FX (Noise Snare / Kick)
    if (localStep === 4 || localStep === 12) {
      // Noise snare
      this.createNoiseSnare(time);
    } else if (localStep === 0 || localStep === 8 || localStep === 10) {
      // Kick drum
      this.createSynthKick(120, time);
    } else if (step % 2 === 1) {
      // Closed Hi-hat
      this.createNoiseHihat(time);
    }
  },

  // --- SYNTH 2: MIDNIGHT BREEZE (Sine, Soft Ambient Lofi Chords) ---
  scheduleLofiStep(step, time) {
    const localStep = step % 32;

    // Soft jazzy chords: Fmaj7 -> Cmaj7 -> G7 -> Am
    // Root frequencies: F2(87.31), C2(65.41), G2(98.00), A2(110.00)
    // Play chords on step 0, 8, 16, 24
    if (localStep === 0) {
      // Fmaj7: F3(174.61), A3(220.00), C4(261.63), E4(329.63)
      this.createPadChord([174.61, 220.00, 261.63, 329.63], time);
    } else if (localStep === 8) {
      // Cmaj7: C3(130.81), E3(164.81), G3(196.00), B3(246.94)
      this.createPadChord([130.81, 164.81, 196.00, 246.94], time);
    } else if (localStep === 16) {
      // G7: G2(98.00), D3(146.83), F3(174.61), B3(246.94)
      this.createPadChord([98.00, 146.83, 174.61, 246.94], time);
    } else if (localStep === 24) {
      // Am7: A2(110.00), E3(164.81), G3(196.00), C4(261.63)
      this.createPadChord([110.00, 164.81, 196.00, 261.63], time);
    }

    // Soft sparse melody notes
    let melodyPattern = [
      0, 0, 440, 0, 392, 0, 0, 329,
      0, 523, 0, 440, 0, 0, 392, 0,
      0, 0, 293, 0, 329, 0, 0, 261,
      0, 329, 0, 392, 0, 0, 440, 0
    ];

    if (this.synthTrackId === 'bolly-1') { // Saiyara
      melodyPattern = [
        329, 0, 329, 0, 392, 0, 329, 0,
        293, 0, 261, 0, 293, 0, 329, 0,
        329, 0, 392, 0, 329, 0, 293, 0,
        261, 0, 220, 0, 220, 0, 0, 0
      ];
    } else if (this.synthTrackId === 'bolly-5') { // Tum Hi Ho
      melodyPattern = [
        220, 0, 261, 0, 293, 0, 329, 0,
        293, 0, 261, 0, 246, 0, 220, 0,
        246, 0, 261, 0, 220, 0, 207, 0,
        220, 0, 0, 0, 0, 0, 0, 0
      ];
    }

    const mFreq = melodyPattern[localStep];
    if (mFreq > 0 && Math.random() > 0.3) {
      // sine voice with slow attack
      this.createSynthVoice(mFreq, 'sine', 0.1, 0.3, 0.4, time);
    }

    // Soft beats: Kick on 0, 12, 16, 28; Snare on 8, 24
    if (localStep === 0 || localStep === 12 || localStep === 16 || localStep === 28) {
      this.createSynthKick(80, time);
    } else if (localStep === 8 || localStep === 24) {
      this.createLofiSnare(time);
    } else if (step % 4 === 2) {
      this.createNoiseHihat(time, 0.015);
    }
  },

  // --- SYNTH 3: NEON HORIZON (Saw, Punchy 80s Synthwave) ---
  scheduleSynthwaveStep(step, time) {
    const localStep = step % 16;

    // Chord progression Am -> F -> C -> G
    // Frequencies: A(440), F(349.23), C(261.63), G(392.00)
    // 8th note bassline pumping: steady octave leaps
    const bassNotes = [
      110, 110, 220, 110, 110, 110, 220, 110, // A
      87.3, 87.3, 174.6, 87.3, 87.3, 87.3, 174.6, 87.3  // F
    ];
    
    // Choose correct bass based on cycle
    const isFirstBar = Math.floor(step / 16) % 4 < 2;
    const rootBass = isFirstBar ? bassNotes[step % 8] : bassNotes[(step % 8) + 8];
    if (step % 2 === 0) {
      // pumping synthwave bass (sawtooth + lowpass filter)
      this.createSynthwaveBass(rootBass, time);
    }

    // Pluck melody notes
    // Arpeggiator pattern
    const arp1 = [440, 523, 659, 784, 880, 784, 659, 523];
    const arp2 = [349.2, 523, 698.5, 880, 698.5, 523, 349.2, 523];
    const activeArp = isFirstBar ? arp1 : arp2;

    if (step % 2 === 1 && Math.random() > 0.1) {
      const melodyFreq = activeArp[step % 8];
      this.createSynthVoice(melodyFreq, 'sawtooth', 0.01, 0.05, 0.15, time, 0.05);
    }

    // Heavy Retro Drums: Kick on 0, 8, 10, 14; Snare on 4, 12
    if (localStep === 0 || localStep === 8 || localStep === 10 || localStep === 14) {
      this.createSynthKick(150, time);
    } else if (localStep === 4 || localStep === 12) {
      this.createRetroSnare(time);
    } else if (step % 2 === 1) {
      this.createNoiseHihat(time, 0.03);
    }
  },

  // --- SYNTH VOICE GENERATORS ---
