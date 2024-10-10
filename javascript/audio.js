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
