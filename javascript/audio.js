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
