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
