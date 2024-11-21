/**
 * BeatStream Audio Visualizer
 * Renders multiple styles of audio visualizations on HTML5 Canvas.
 * Supports Frequency Bars, Waveform Oscilloscope, and Beat-reactive Circular Spectrum with particle bursts.
 */

export const Visualizer = {
  canvas: null,
  ctx: null,
  audioEngine: null,
  animationId: null,
  mode: 'bars', // bars, wave, circle
  peakHold: [], // For frequency peaks
  particles: [], // For circular visualizer explosions
  accentColors: {
    cyan: '#00f2fe',
    purple: '#4facfe',
    neonPurple: '#d946ef',
    orange: '#f97316',
    green: '#10b981'
  },

  init(canvasEl, engine) {
    this.canvas = canvasEl;
    this.ctx = this.canvas.getContext('2d');
    this.audioEngine = engine;
    this.resize();
    
    // Listen for resize
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
