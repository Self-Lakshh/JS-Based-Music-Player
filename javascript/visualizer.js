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
    const barCount = 64;
    const barWidth = (w / barCount) * 0.75;
    const barGap = (w / barCount) * 0.25;
    const dataLen = data.length;

    // Draw gradients
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, 'rgba(79, 172, 254, 0.2)');
    gradient.addColorStop(0.5, 'rgba(0, 242, 254, 0.8)');
    gradient.addColorStop(1, 'rgba(217, 70, 239, 1)');

    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 242, 254, 0.5)';

    for (let i = 0; i < barCount; i++) {
      // Map bars logarithmically
      const percentIdx = i / barCount;
      const dataIdx = Math.floor(Math.pow(percentIdx, 1.5) * (dataLen * 0.6));
      let val = isSilent ? 0 : data[dataIdx] || 0;

      // Scale value to canvas height
      const barHeight = (val / 255) * h * 0.85;

      const x = i * (barWidth + barGap) + barGap / 2;
      const y = h - barHeight - 10;

      // Draw active bars with round corners
      ctx.fillStyle = gradient;
      this.drawRoundedRect(ctx, x, y, barWidth, barHeight + 10, 4);

      // Draw peaks (caps)
      if (this.peakHold[i] === undefined) this.peakHold[i] = 0;

      if (barHeight > this.peakHold[i]) {
        this.peakHold[i] = barHeight;
      } else {
        this.peakHold[i] -= 1.5; // decay
        if (this.peakHold[i] < 0) this.peakHold[i] = 0;
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(x, h - this.peakHold[i] - 15, barWidth, 2);
    }
    ctx.shadowBlur = 0; // reset
  },

  drawWave(data, w, h, isSilent) {
    const ctx = this.ctx;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0, 242, 254, 0.8)';
    
    // Draw 3 offset waves to look like an oscilloscope glow
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      
      if (pass === 0) {
        ctx.strokeStyle = 'rgba(0, 242, 254, 1)';
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = 'rgba(217, 70, 239, 0.5)';
        ctx.lineWidth = 1.5;
      }

      const sliceWidth = w / data.length;
      let x = 0;

      for (let i = 0; i < data.length; i++) {
        // Average value is 128
        let val = isSilent ? 128 : data[i];
        let v = val / 128.0; // 0 to 2
        
        // Add a slight phase shift for the second wave pass
        if (pass === 1 && !isSilent) {
          const shiftIdx = (i + 15) % data.length;
          val = data[shiftIdx];
          v = val / 128.0;
        }

        let y = (v * h) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(w, h / 2);
      ctx.stroke();
    }
    
    ctx.shadowBlur = 0; // reset
  },

  drawCircle(data, w, h, isSilent) {
    const ctx = this.ctx;
    const centerX = w / 2;
    const centerY = h / 2;
    const baseRadius = Math.min(w, h) * 0.22;
    const dataLen = data.length;

    // Detect instant beat
    let energySum = 0;
    const checkCount = 30; // check first 30 bins (bass frequencies)
    for (let i = 0; i < checkCount; i++) {
      energySum += data[i] || 0;
    }
    const avgEnergy = energySum / checkCount;
    const isBeat = avgEnergy > 150 && !isSilent;

    // Pulse radius with beat
    const radiusMultiplier = isBeat ? 1.12 : 1.0;
    const radius = baseRadius * radiusMultiplier;

    // Generate burst particles on beat
    if (isBeat && this.particles.length < 150) {
      const burstCount = Math.floor(Math.random() * 5) + 3;
      for (let i = 0; i < burstCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1.5;
        this.particles.push({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 3.5 + 1.5,
          color: Math.random() > 0.5 ? this.accentColors.cyan : this.accentColors.neonPurple,
          alpha: 1.0,
          decay: Math.random() * 0.02 + 0.01
        });
      }
    }

    // Update and draw particles
    this.particles.forEach((p, idx) => {
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      
      if (p.alpha <= 0) {
        this.particles.splice(idx, 1);
        return;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0; // reset

    // Draw glowing ring
    ctx.shadowBlur = isBeat ? 25 : 12;
    ctx.shadowColor = isBeat ? 'rgba(217, 70, 239, 0.8)' : 'rgba(0, 242, 254, 0.5)';
    ctx.lineWidth = 4;
    
    // Draw frequency nodes on circle
    const numPoints = 80;
    ctx.beginPath();

    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      
      // Mirror the frequencies around the circle
      const dataIdx = Math.floor(Math.abs(Math.sin(angle)) * (dataLen * 0.45));
      const val = isSilent ? 0 : data[dataIdx] || 0;
      
      // Calculate node distance
      const offset = (val / 255) * baseRadius * 0.6;
      const r = radius + offset;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.closePath();
    
    // Gradient outline
    const ringGradient = ctx.createRadialGradient(centerX, centerY, radius * 0.8, centerX, centerY, radius * 1.5);
    ringGradient.addColorStop(0, this.accentColors.cyan);
    ringGradient.addColorStop(1, this.accentColors.neonPurple);
    ctx.strokeStyle = ringGradient;
    ctx.stroke();

    // Draw inner glow circle
    ctx.fillStyle = 'rgba(20, 10, 40, 0.35)';
    ctx.fill();
    ctx.shadowBlur = 0; // reset
  },

  drawRoundedRect(ctx, x, y, width, height, radius) {
    if (height < 2 * radius) radius = height / 2;
    if (width < 2 * radius) radius = width / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    ctx.fill();
  },

  // --- BEAT DETECTION FOR UI REACTIVITY ---
  processBeatReactivity(data, isSilent) {
    if (isSilent) {
      this.applyBeatScale(1.0);
      return;
    }

    // Measure bass range energy (first 25 bins)
    let sum = 0;
    const count = 25;
    for (let i = 0; i < count; i++) {
      sum += data[i] || 0;
    }
    const avg = sum / count;

    // Normalizing multiplier (e.g. 1.0 to 1.08)
    const scale = 1.0 + Math.max(0, (avg - 130) / 125) * 0.08;
    this.applyBeatScale(scale);
  },
