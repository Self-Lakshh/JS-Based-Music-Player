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
        favHeart.innerHTML = '♡'; // Empty heart
      }
    }

    // Load Lyrics
    if (track.isProcedural) {
      LyricsEngine.loadProceduralLyrics(track.id, track.title, track.artist, track.duration);
    } else {
      // Mock lyrics for local files based on title
      const mockLrc = `
[00:00.00] (Playing local file: ${track.title})
[00:05.00] Enjoy the high fidelity local audio!
[00:15.00] Adjust the equalizer in settings for custom tuning.
[00:25.00] Open visualizers tab to view canvas animations.
[00:35.00] Support for local LRC files is coming soon.
[00:45.00] BeatStream Music Player - Desktop grade experience.
      `;
      LyricsEngine.parse(mockLrc.trim());
    }

    const lyricsContainer = document.getElementById('lyrics-container');
    if (lyricsContainer) {
      LyricsEngine.render(lyricsContainer);
      LyricsEngine.bindClicks((t) => AudioEngine.seek(t, track.duration));
    }

    // Set up Media Session API
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: [
          { src: 'assets/orange_logo.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.playNextTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.playPreviousTrack());
    }

    // Start/Stop Audio Playback
    if (shouldPlay) {
      if (track.isProcedural) {
        AudioEngine.playSynthTrack(track.id, seekTime, track.duration);
      } else {
        // Retrieve IndexedDB blob
        const dbRecord = await Database.getTrack(track.id);
        if (dbRecord && dbRecord.audioBlob) {
          AudioEngine.playLocalTrack(dbRecord.audioBlob, seekTime);
        } else {
          console.error("Could not find audio blob for track", track.id);
        }
      }
      this.isPlaying = true;
    } else {
      AudioEngine.stop();
      this.isPlaying = false;
      // Pre-populate time slider
      this.updatePlaybackProgress(seekTime, track.duration);
    }

    // Highlight row in track tables
    document.querySelectorAll('tr[data-track-id]').forEach(row => {
      if (String(row.dataset.trackId) === String(id)) {
        row.classList.add('playing-row');
      } else {
        row.classList.remove('playing-row');
      }
    });

    this.updatePlayStateUI();
    this.updateQueueUI();
  },

  togglePlayPause() {
    if (!this.currentTrack) return;
    this.isPlaying = !this.isPlaying;

    if (this.isPlaying) {
      AudioEngine.resume();
    } else {
      AudioEngine.pause();
    }
    this.updatePlayStateUI();
  },

  seekForward(secs) {
    if (!this.currentTrack) return;
    const dur = this.currentTrack.duration;
    const current = Database.getPlaybackTime();
    AudioEngine.seek(current + secs, dur);
  },

  seekBackward(secs) {
    if (!this.currentTrack) return;
    const dur = this.currentTrack.duration;
    const current = Database.getPlaybackTime();
    AudioEngine.seek(Math.max(0, current - secs), dur);
  },

  adjustVolume(delta) {
    const settings = Database.getSettings();
    let vol = (settings.volume || 0.8) + delta;
    vol = Math.max(0, Math.min(vol, 1));
    Database.saveSettings({ volume: vol });
    
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = Math.round(vol * 100);
    
    AudioEngine.setVolume(this.isMuted ? 0 : vol);
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    const settings = Database.getSettings();
    const currentVol = settings.volume || 0.8;
    AudioEngine.setVolume(this.isMuted ? 0 : currentVol);

    const btn = document.getElementById('player-mute-btn');
    if (btn) {
      btn.innerHTML = this.isMuted ? '🔇' : '🔊';
      if (this.isMuted) btn.classList.add('muted');
      else btn.classList.remove('muted');
    }
  },

  // --- QUEUE SYSTEM ---

  initQueue() {
    this.currentQueue = Database.getQueue();
    const currentId = Database.getCurrentTrackId();
    this.queueIndex = this.currentQueue.indexOf(currentId);
  },

  setQueue(trackIds, startIndex = 0) {
    this.currentQueue = trackIds;
    Database.saveQueue(trackIds);
    this.queueIndex = startIndex;
    if (this.currentQueue[startIndex]) {
      this.playTrack(this.currentQueue[startIndex]);
    }
  },

  addToQueue(trackId) {
    if (!this.currentQueue.includes(trackId)) {
      this.currentQueue.push(trackId);
      Database.saveQueue(this.currentQueue);
      this.updateQueueUI();
    }
  },

  playNextTrack() {
    if (this.currentQueue.length === 0) return;

    const settings = Database.getSettings();
    
    if (settings.shuffle) {
      // Pick random index
      this.queueIndex = Math.floor(Math.random() * this.currentQueue.length);
    } else {
      this.queueIndex++;
      if (this.queueIndex >= this.currentQueue.length) {
        if (settings.repeat === 'all') {
          this.queueIndex = 0;
        } else {
          this.queueIndex = this.currentQueue.length - 1;
          this.isPlaying = false;
          AudioEngine.stop();
          this.updatePlayStateUI();
          return;
        }
      }
    }

    const nextId = this.currentQueue[this.queueIndex];
    if (nextId) this.playTrack(nextId);
  },

  playPreviousTrack() {
    if (this.currentQueue.length === 0) return;

    this.queueIndex--;
    if (this.queueIndex < 0) {
      const settings = Database.getSettings();
      if (settings.repeat === 'all') {
        this.queueIndex = this.currentQueue.length - 1;
      } else {
        this.queueIndex = 0;
      }
    }

    const prevId = this.currentQueue[this.queueIndex];
    if (prevId) this.playTrack(prevId);
  },

  handleTrackEnded() {
    const settings = Database.getSettings();
    if (settings.repeat === 'one') {
      // Replay same song
      if (this.currentTrack) this.playTrack(this.currentTrack.id);
    } else {
      this.playNextTrack();
    }
  },

  toggleShuffle() {
    const settings = Database.getSettings();
    const shuffleVal = !settings.shuffle;
    Database.saveSettings({ shuffle: shuffleVal });

    const btn = document.getElementById('player-shuffle-btn');
    if (btn) {
      if (shuffleVal) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  },
