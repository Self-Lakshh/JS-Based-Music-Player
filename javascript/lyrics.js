/**
 * BeatStream Lyrics Engine
 * Parses standard LRC and word-sync LRCX formats.
 * Synchronizes scroll positions, highlights lines, and handles karaoke word-by-word text fills.
 */

export const LyricsEngine = {
  parsedLyrics: [],
  activeLineIndex: -1,
  containerEl: null,
  karaokeMode: true,

  /**
   * Parses raw LRC text into an array of timed lines.
   */
  parse(lrcText) {
    if (!lrcText) return [];

    const lines = lrcText.split('\n');
    const result = [];
    const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    lines.forEach((line) => {
      // Find all timestamp tags in the line
      const tags = [];
      let match;
      timeRegex.lastIndex = 0; // reset
      
      while ((match = timeRegex.exec(line)) !== null) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const msStr = match[3] || '00';
        // Normalize ms (can be 2 or 3 digits)
        const ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
        const totalTime = mins * 60 + secs + ms / 1000;
        tags.push({ time: totalTime, raw: match[0] });
      }

      if (tags.length === 0) return;

      // Extract the remaining text after removing all timestamp tags
      let text = line;
      tags.forEach((tag) => {
        text = text.replace(tag.raw, '');
      });
      text = text.trim();

      // Check for word-level timestamps, e.g., "<00:12.34> hello <00:12.80> world"
      const words = [];
      const wordRegex = /<(\d{2}):(\d{2})(?:\.(\d{2,3}))?>([^<]*)/g;
      let wordMatch;
      
      while ((wordMatch = wordRegex.exec(text)) !== null) {
        const wMins = parseInt(wordMatch[1], 10);
        const wSecs = parseInt(wordMatch[2], 10);
        const wMsStr = wordMatch[3] || '00';
        const wMs = parseInt(wMsStr.padEnd(3, '0').slice(0, 3), 10);
        const wTime = wMins * 60 + wSecs + wMs / 1000;
        const wText = wordMatch[4].trim();
        if (wText) {
          words.push({ time: wTime, text: wText, duration: 0 });
        }
      }

      // Calculate durations for words
      for (let i = 0; i < words.length; i++) {
        if (i < words.length - 1) {
          words[i].duration = words[i + 1].time - words[i].time;
        } else {
          // Last word gets a default 0.8s duration or remainder
          words[i].duration = 0.8;
        }
      }

      // If word-level tags existed, clean the display text
      let displayText = text;
      if (words.length > 0) {
        displayText = words.map(w => w.text).join(' ');
      }

      // Add a separate entry for each timestamp tag (supports repeated lines)
      tags.forEach((tag) => {
        // Adjust word timestamps relative to the line's starting time
        const adjustedWords = words.map(w => ({
          ...w,
          timeOffset: w.time - tag.time
        }));

        result.push({
          time: tag.time,
          text: displayText,
          words: adjustedWords.length > 0 ? adjustedWords : null
        });
      });
    });

    // Sort lines by timestamp
    result.sort((a, b) => a.time - b.time);
    this.parsedLyrics = result;
    return result;
  },

  /**
   * Renders the parsed lyrics to the DOM.
   */
  render(container) {
    this.containerEl = container;
    this.containerEl.innerHTML = '';
    this.activeLineIndex = -1;

    if (this.parsedLyrics.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.classList.add('lyrics-empty');
      emptyMsg.textContent = 'No lyrics available';
      this.containerEl.appendChild(emptyMsg);
      return;
    }

    this.parsedLyrics.forEach((line, index) => {
      const lineEl = document.createElement('div');
      lineEl.classList.add('lyric-line');
      lineEl.dataset.index = index;
      lineEl.dataset.time = line.time;

      if (line.words) {
        // Karaoke mode formatting (spanned words)
        line.words.forEach((word, wIdx) => {
          const wordSpan = document.createElement('span');
          wordSpan.classList.add('lyric-word');
          wordSpan.textContent = word.text + ' ';
          wordSpan.dataset.offset = word.timeOffset;
          wordSpan.dataset.duration = word.duration;
          lineEl.appendChild(wordSpan);
        });
      } else {
        lineEl.textContent = line.text || '• • •';
      }

      this.containerEl.appendChild(lineEl);
    });
  },

  /**
   * Synchronizes active lyric line and scroll animations.
   */
  sync(currentTime, seekCallback) {
    if (this.parsedLyrics.length === 0 || !this.containerEl) return;

    let activeIndex = -1;
    for (let i = 0; i < this.parsedLyrics.length; i++) {
      if (currentTime >= this.parsedLyrics[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    if (activeIndex !== this.activeLineIndex) {
      const oldActive = this.containerEl.querySelector('.lyric-line.active');
      if (oldActive) oldActive.classList.remove('active', 'passed');

      // Mark previously passed lines
      const allLines = this.containerEl.querySelectorAll('.lyric-line');
      allLines.forEach((line, idx) => {
        if (idx < activeIndex) {
          line.classList.add('passed');
          line.classList.remove('active');
        } else if (idx === activeIndex) {
          line.classList.add('active');
          line.classList.remove('passed');
        } else {
          line.classList.remove('active', 'passed');
        }
      });

      this.activeLineIndex = activeIndex;

      // Scroll active line to center
      if (activeIndex !== -1) {
        const activeEl = allLines[activeIndex];
        const containerHeight = this.containerEl.clientHeight;
        const targetScrollTop = activeEl.offsetTop - containerHeight / 2 + activeEl.clientHeight / 2;
        
        this.containerEl.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }
    }

    // Handle Word Highlights (Karaoke Progress)
    if (this.karaokeMode && activeIndex !== -1) {
      const activeLine = this.parsedLyrics[activeIndex];
      const activeEl = this.containerEl.querySelector(`.lyric-line[data-index="${activeIndex}"]`);
      
      if (activeEl && activeLine.words) {
        const lineTimeOffset = currentTime - activeLine.time;
        const wordSpans = activeEl.querySelectorAll('.lyric-word');

        wordSpans.forEach((span, wIdx) => {
          const word = activeLine.words[wIdx];
          if (!word) return;

          const start = word.timeOffset;
          const duration = word.duration;
          
          if (lineTimeOffset >= start + duration) {
            // Completely sung
            span.style.backgroundSize = '100% 100%';
            span.classList.add('sung');
          } else if (lineTimeOffset < start) {
            // Not yet reached
            span.style.backgroundSize = '0% 100%';
            span.classList.remove('sung');
          } else {
            // Currently singing - calculate exact percentage fill
            const pct = ((lineTimeOffset - start) / duration) * 100;
            span.style.backgroundSize = `${pct}% 100%`;
            span.classList.remove('sung');
          }
        });
      }
    }
  },

  /**
   * Configures click handlers on lyric lines for seek-on-click navigation.
   */
  bindClicks(seekCallback) {
    if (!this.containerEl) return;

    this.containerEl.addEventListener('click', (event) => {
      const lineEl = event.target.closest('.lyric-line');
      if (lineEl && seekCallback) {
        const seekTime = parseFloat(lineEl.dataset.time);
        if (!isNaN(seekTime)) {
          seekCallback(seekTime);
        }
      }
    });
  },

  // --- PROCEDURAL LYRICS GENERATOR ---

  loadProceduralLyrics(trackId, title = '', artist = '', duration = 120) {
    let lrc = '';
    if (trackId === 'synth-1') {
      lrc = `
[00:00.00] <00:00.00> (Instrumental <00:02.00> Intro <00:04.00> - <00:05.00> Retro <00:06.00> Arpeggios)
[00:07.50] <00:07.50> Beep <00:08.50> boop, <00:09.50> enter <00:10.50> the <00:11.50> glowing <00:13.00> grid.
[00:15.00] <00:15.00> Retro <00:16.00> waves <00:17.50> that <00:18.50> you <00:19.50> cannot <00:21.00> resist.
[00:22.50] <00:22.50> 8-bit <00:23.50> code <00:25.00> floating <00:26.50> in <00:27.50> the <00:29.00> air.
[00:30.00] <00:30.00> Synthesized <00:32.00> dreams <00:33.50> dancing <00:35.00> everywhere.
[00:37.50] <00:37.50> (Chiptune <00:40.00> Melodic <00:43.00> Solo <00:48.00> - <00:50.00> Pulse <00:51.00> Width)
[00:52.50] <00:52.50> Pushing <00:53.50> pixels, <00:55.00> shifting <00:56.50> application <00:58.00> state.
[01:00.00] <01:00.00> BeatStream <01:01.50> running, <01:03.00> please <01:04.00> do <01:05.00> not <01:06.00> be <01:07.50> late!
