/**
 * BeatStream Keyboard Shortcuts Manager
 * Exposes accessible hotkeys for hands-free player control.
 * Binds keys to actions while ignoring inputs when typing in forms.
 */

export const KeyboardShortcuts = {
  playerUI: null,

  /**
   * Binds global window keydown events.
   * @param {Object} playerUIInstance Reference to the core UI controller containing control functions.
   */
  init(playerUIInstance) {
    this.playerUI = playerUIInstance;

    window.addEventListener('keydown', (event) => {
      // Ignore key events if the user is typing in form elements
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || 
                      activeEl.tagName === 'TEXTAREA' || 
                      activeEl.isContentEditable;
      
      if (isInput) return;

      const key = event.key.toLowerCase();
      const code = event.code;

      switch (code) {
        case 'Space':
          event.preventDefault();
          this.playerUI.togglePlayPause();
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.playerUI.seekForward(5);
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.playerUI.seekBackward(5);
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.playerUI.adjustVolume(0.05);
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.playerUI.adjustVolume(-0.05);
          break;
      }

      switch (key) {
        case 'm':
          this.playerUI.toggleMute();
          break;
        case 'l':
          this.playerUI.toggleLyricsView();
          break;
        case 'v':
          this.playerUI.cycleVisualizerMode();
          break;
        case 's':
          this.playerUI.toggleShuffle();
          break;
        case 'r':
          this.playerUI.cycleRepeatMode();
          break;
