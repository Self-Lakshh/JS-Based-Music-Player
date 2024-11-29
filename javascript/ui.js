/**
 * BeatStream User Interface Controller
 * Connects the Database, Audio Engine, Lyrics Engine, and Visualizers to the DOM.
 * Coordinates layouts, drag-and-drop local uploads, EQ sliders, and playlists.
 */

import { Database, BOLLYWOOD_SEEDS } from './database.js';
import { AudioEngine } from './audio.js';
import { LyricsEngine } from './lyrics.js';
import { Visualizer } from './visualizer.js';
import { KeyboardShortcuts } from './shortcuts.js';

export const PlayerUI = {
  tracks: [], // Cached merged tracks list (Procedural + Local DB)
  currentQueue: [], // List of track IDs
  queueIndex: -1,
  currentTrack: null,
  isPlaying: false,
  isMuted: false,
  previousVolume: 0.8,
  activeTab: 'home',
  selectedPlaylistId: null,

  async init() {
    await Database.init();
    await this.refreshTracks();

    // Setup volume
    const settings = Database.getSettings();
    this.isMuted = false;
    this.previousVolume = settings.volume || 0.8;
    AudioEngine.setVolume(this.isMuted ? 0 : this.previousVolume);

    // Setup EQ
    if (settings.equalizer) {
      settings.equalizer.forEach((gain, index) => {
        AudioEngine.setEqualizerBand(index, gain);
      });
    }

    // Set theme
    this.applyTheme(settings.theme || 'midnight-blue');

    // Setup visualizer canvas
    const canvas = document.getElementById('visualizer-canvas');
    if (canvas) {
      Visualizer.init(canvas, AudioEngine);
      Visualizer.setMode('bars');
    }

    // Connect audio callbacks
    AudioEngine.onTimeUpdateCallback = (current, duration) => this.updatePlaybackProgress(current, duration);
    AudioEngine.onTrackEndedCallback = () => this.handleTrackEnded();

