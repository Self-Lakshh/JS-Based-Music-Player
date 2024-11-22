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
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = rect.height * (window.devicePixelRatio || 1);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    if (this.ctx) {
      this.ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }
  },

  setMode(newMode) {
    this.mode = newMode;
  },

  start() {
    if (this.animationId) return;
    const renderLoop = () => {
      this.draw();
      this.animationId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
  },

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  },

  clear() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    this.ctx.clearRect(0, 0, w, h);
  },

  draw() {
    if (!this.ctx || !this.canvas || !this.audioEngine) return;

    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    // Get current frequency and time-domain data
    const freqData = this.audioEngine.getFrequencyData();
    const waveData = this.audioEngine.getWaveformData();

    // Check if music is actually playing (all zeros)
    let isSilent = true;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > 0) {
        isSilent = false;
        break;
      }
    }

    // Trigger beat reactions in UI
    this.processBeatReactivity(freqData, isSilent);

    this.ctx.clearRect(0, 0, w, h);

    if (this.mode === 'bars') {
      this.drawBars(freqData, w, h, isSilent);
    } else if (this.mode === 'wave') {
      this.drawWave(waveData, w, h, isSilent);
    } else if (this.mode === 'circle') {
      this.drawCircle(freqData, w, h, isSilent);
    }
  },

  drawBars(data, w, h, isSilent) {
    const ctx = this.ctx;
