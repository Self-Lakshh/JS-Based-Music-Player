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
