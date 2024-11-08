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
