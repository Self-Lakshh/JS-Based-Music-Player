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
