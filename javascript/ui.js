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

    // Initial UI Render
    this.renderHome();
    this.renderSongsTable();
    this.renderPlaylists();
    this.setupEventListeners();
    this.initQueue();

    // Start keyboard shortcuts
    KeyboardShortcuts.init(this);

    // Load last playing track without auto-playing
    const lastTrackId = Database.getCurrentTrackId();
    const lastTime = Database.getPlaybackTime();
    await this.loadTrack(lastTrackId, false, lastTime);
  },

  async refreshTracks() {
    const dbTracks = await Database.getAllTracksFromDB();
    const synthTracks = [
      {
        id: 'synth-1',
        title: 'Chiptune Odyssey',
        artist: 'Procedural Synth Engine',
        album: 'Synthesized Dreams',
        duration: 90,
        genre: '8-Bit Retro',
        isProcedural: true,
        coverGradient: 'linear-gradient(135deg, #fbc2eb 0%, #a18cd1 100%)'
      },
      {
        id: 'synth-2',
        title: 'Midnight Breeze',
        artist: 'Procedural Synth Engine',
        album: 'Ambient Waves',
        duration: 120,
        genre: 'Ambient Lofi',
        isProcedural: true,
        coverGradient: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)'
      },
      {
        id: 'synth-3',
        title: 'Neon Horizon',
        artist: 'Procedural Synth Engine',
        album: 'Retro Future',
        duration: 100,
        genre: 'Synthwave',
        isProcedural: true,
        coverGradient: 'linear-gradient(135deg, #f97316 0%, #ff5e62 100%)'
      }
    ];

    this.tracks = [...synthTracks, ...BOLLYWOOD_SEEDS, ...dbTracks];
  },

  // --- PLAYBACK LOADING & TRIGGERS ---

  async playTrack(id, seekTime = 0) {
    this.isPlaying = true;
    Database.saveCurrentTrackId(id);
    await this.loadTrack(id, true, seekTime);
    this.updatePlayStateUI();
  },

  async loadTrack(id, shouldPlay = true, seekTime = 0) {
    const track = this.tracks.find(t => String(t.id) === String(id));
    if (!track) return;

    this.currentTrack = track;

    // Add to history
    if (shouldPlay) {
      Database.addHistory(id);
      this.renderHome(); // Refresh recently played
    }

    // Load track metadata to player bar
    const titleEl = document.getElementById('player-track-title');
    const artistEl = document.getElementById('player-track-artist');
    const coverEl = document.getElementById('player-cover-img');
    const coverGradientEl = document.getElementById('player-cover-gradient');

    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = track.artist;

    if (track.isProcedural) {
      if (coverEl) coverEl.classList.add('d-none');
      if (coverGradientEl) {
        coverGradientEl.classList.remove('d-none');
        coverGradientEl.style.background = track.coverGradient || 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)';
      }
    } else {
      if (coverGradientEl) coverGradientEl.classList.add('d-none');
      if (coverEl) {
        coverEl.classList.remove('d-none');
        if (track.coverBlob) {
          coverEl.src = URL.createObjectURL(track.coverBlob);
        } else {
          coverEl.src = 'assets/orange_logo.png'; // Fallback icon
        }
      }
    }

    // Set Favorite Heart state
    const favHeart = document.getElementById('player-favorite-btn');
    if (favHeart) {
      if (Database.isFavorite(id)) {
        favHeart.classList.add('active');
        favHeart.innerHTML = '♥'; // Full heart
      } else {
        favHeart.classList.remove('active');
