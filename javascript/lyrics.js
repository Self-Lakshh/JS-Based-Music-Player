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
[01:07.50] <01:07.50> Beep <01:08.50> boop, <01:09.50> we <01:10.50> are <01:11.50> flying <01:12.50> in <01:13.50> the <01:14.50> zone.
[01:15.00] <01:15.00> Music <01:16.00> server <01:17.50> standard <01:19.00> on <01:20.00> its <01:21.50> throne!
[01:22.50] <01:22.50> (Instrumental <01:25.00> Outro <01:28.00> - <01:30.00> Decaying <01:31.00> Delay)
      `;
    } else if (trackId === 'synth-2') {
      lrc = `
[00:00.00] <00:00.00> (Instrumental <00:03.00> Ambient <00:06.00> Lofi <00:09.00> Intro)
[00:12.00] <00:12.00> Midnight <00:14.00> breeze <00:16.00> blows <00:18.00> through <00:20.00> the <00:22.00> screen.
[00:24.00] <00:24.00> The <00:25.00> cleanest <00:27.00> code <00:29.00> you've <00:31.00> ever <00:34.00> seen.
[00:36.00] <00:36.00> Soft <00:38.00> triangles <00:41.00> echo <00:43.00> so <00:45.00> slow.
[00:48.00] <00:48.00> Chill <00:50.00> frequencies <00:53.00> starting <00:55.00> to <00:57.00> glow.
[01:00.00] <01:00.00> (Soft <01:04.00> Vinyl <01:08.00> Crackle <01:12.00> Bridge)
[01:16.00] <01:16.00> Close <01:18.00> your <01:20.00> eyes, <01:22.00> let <01:24.00> the <01:26.00> filter <01:29.00> sweep.
[01:32.00] <01:32.00> Beautiful <01:35.00> memories <01:38.00> we <01:40.00> will <01:42.00> keep.
[01:44.00] <01:44.00> (Outro <01:48.00> Fades <01:52.00> Into <01:56.00> Silence)
      `;
    } else if (trackId === 'synth-3') {
      lrc = `
[00:00.00] <00:00.00> (Neon <00:02.00> Horizon <00:04.00> Synthwave <00:06.00> Drums <00:08.00> Rising)
[00:10.00] <00:10.00> Riding <00:11.50> fast <00:12.50> on <00:13.50> the <00:14.50> laser <00:16.50> lines.
[00:18.00] <00:18.00> Magenta <00:20.00> sun <00:21.50> in <00:22.50> our <00:24.00> designs.
[00:26.00] <00:26.00> Retro <00:27.50> grid <00:29.00> stretching <00:30.50> out <00:31.50> so <00:33.50> wide.
[00:35.00] <00:35.00> We <00:36.50> have <00:37.50> the <00:38.50> rhythm <00:40.00> on <00:41.00> our <00:42.50> side!
[00:44.00] <00:44.00> (Filter <00:48.00> Sweep <00:52.00> - <00:54.00> Heavy <00:56.00> Bassline)
[00:58.00] <00:58.00> Electric <01:00.00> dreams <01:01.50> calling <01:03.00> in <01:04.00> the <01:05.50> night.
[01:07.00] <01:07.00> Cyan <01:08.50> horizons <01:10.50> shining <01:12.50> bright!
[01:15.00] <01:15.00> (Outro <01:20.00> Beat <01:25.00> Echoes <01:30.00> Out)
      `;
    } else if (typeof trackId === 'string' && trackId.startsWith('bolly-')) {
      lrc = this.getBollywoodLyrics(trackId, title, artist, duration);
    }
    
    this.parse(lrc.trim());
  },

  getBollywoodLyrics(trackId, title, artist, duration) {
    if (trackId === 'bolly-1') { // Saiyara
      return `
[00:00.00] <00:00.00> (Instrumental <00:02.00> Intro <00:04.00> - <00:05.00> Saiyara <00:06.00> Flute)
[00:07.00] <00:07.00> Tum <00:07.50> se <00:08.00> hi <00:08.50> din <00:09.00> hota <00:09.50> hai
[00:11.00] <00:11.00> Surmayi <00:11.80> shaam <00:12.50> aati <00:13.20> hai
[00:15.00] <00:15.00> Tum <00:15.50> se <00:16.00> hi <00:16.50> tum <00:17.00> se <00:17.50> hi
[00:19.00] <00:19.00> Saiyara <00:20.00> ve <00:21.00> saiyara <00:22.00> ve
[00:23.50] <00:23.50> Tanha <00:24.50> dil <00:25.50> ke <00:26.50> saaye <00:27.50> mein
[00:28.50] <00:28.50> Dhoondhoon <00:29.50> tujhe <00:30.50> har <00:31.50> jagah <00:32.50> mein
[00:34.00] <00:34.00> (Melody <00:36.00> Transition <00:38.00> - <00:40.00> Violin <00:42.00> Solo)
[00:44.00] <00:44.00> Saiyara <00:45.00> ve <00:46.00> saiyara <00:47.00> ve
[00:48.50] <00:48.50> Hum <00:49.00> toh <00:49.50> yaara <00:50.00> tere <00:50.50> siva
[00:51.50] <00:51.50> Kuch <00:52.00> bhi <00:52.50> chahein <00:53.00> toh <00:53.50> kya <00:54.00> chahein
[00:55.00] <00:55.00> Saiyara <00:56.00> ve <00:57.00> saiyara <00:58.00> ve
[01:00.00] <01:00.00> (Outro <01:05.00> Flute <01:10.00> Echoes)
      `;
    }
    if (trackId === 'bolly-5') { // Tum Hi Ho
      return `
[00:00.00] <00:00.00> (Piano <00:02.00> Intro <00:04.00> - <00:06.00> Aashiqui <00:08.00> 2)
[00:09.00] <00:09.00> Hum <00:09.50> tere <00:10.00> bin <00:10.50> ab <00:11.00> reh <00:11.50> nahi <00:12.00> sakte
[00:13.00] <00:13.00> Tere <00:13.50> bina <00:14.00> kya <00:14.50> wajood <00:15.00> mera
[00:17.00] <00:17.00> Tujhse <00:17.50> juda <00:18.00> agar <00:18.50> ho <00:19.00> jaayenge
[00:21.00] <00:21.00> Toh <00:21.50> khud <00:22.00> se <00:22.50> hi <00:23.00> ho <00:23.50> jaayenge <00:24.00> juda
[00:25.50] <00:25.50> Kyunki <00:26.00> tum <00:26.50> hi <00:27.00> ho, <00:27.50> ab <00:28.00> tum <00:28.50> hi <00:29.00> ho
[00:30.00] <00:30.00> Zindagi <00:31.00> ab <00:32.00> tum <00:33.00> hi <00:34.00> ho
[00:35.50] <00:35.50> Chain <00:36.00> bhi, <00:36.50> mera <00:37.00> dard <00:37.50> bhi
[00:38.50] <00:38.50> Meri <00:39.00> aashiqui <00:40.00> ab <00:41.00> tum <00:42.00> hi <00:43.00> ho
[00:44.50] <00:44.50> (Soft <00:47.00> Piano <00:50.00> Outro)
      `;
    }
    if (trackId === 'bolly-10') { // Kabira
      return `
[00:00.00] <00:00.00> (Acoustic <00:02.00> Guitar <00:04.00> Intro <00:06.00> - <00:08.00> Kabira)
[00:09.00] <00:09.00> Kaisi <00:09.50> teri <00:10.00> khudgarzi <00:11.00> na <00:12.00> dhoop <00:13.00> chune <00:14.00> na <00:15.00> chaav
[00:16.00] <00:16.00> Kaisi <00:16.50> teri <00:17.00> khudgarzi <00:18.00> kisi <00:19.00> thor <00:20.00> tike <00:21.00> na <00:22.00> paav
[00:24.00] <00:24.00> Ban <00:24.50> liya <00:25.00> apna <00:25.50> paigambar <00:26.50> tar liya <00:27.50> tu <00:28.50> saat <00:29.50> samundar
[00:31.00] <00:31.00> Re <00:32.00> kabira <00:33.00> maan <00:34.00> ja <00:35.00> re <00:36.00> kabira <00:37.00> maan <00:38.00> ja
[00:39.50] <00:39.50> Aaja <00:40.00> teri <00:40.50> galiyan <00:41.00> raah <00:41.50> niharein
[00:42.50] <00:42.50> Re <00:43.00> kabira <00:44.00> maan <00:45.00> ja <00:46.00> re <00:47.00> kabira <00:48.00> maan <00:49.00> ja
[00:50.00] <00:50.00> (Outro <00:54.00> Bulbul <00:58.00> Instrumentals)
      `;
    }
