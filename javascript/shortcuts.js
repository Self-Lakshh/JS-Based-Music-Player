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
