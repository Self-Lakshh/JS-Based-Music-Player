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
