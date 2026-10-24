/*
 * Airiz Motor Test Console — sound effects library
 *
 * All sounds are synthesised in-browser with the Web Audio API — no audio files, no network, offline-first.
 *
 * Schema:
 *   categories: [{ id, name }] — category definitions
 *   sounds: [{ id, name, category, desc, spec }]
 *
 * spec recipe types:
 *   tone:   { freq, wave, dur, attack, release }
 *   sweep:  { freqFrom, freqTo, wave, dur, attack, release }
 *   chord:  { freqs:[...], wave, dur, attack, release }
 *   arp:    { notes:[{freq,dur},...], wave, release }
 *   noise:  { dur, filterType, freqFrom, freqTo, q }
 *   impact: { dur, boomFreq }
 *   siren:  { freqFrom, freqTo, cycles, dur }
 *   beeps:  { freq, beepDur, gap, count, wave }
 *
 * wave: "sine" | "square" | "sawtooth" | "triangle"
 * filter (optional): { type:"lowpass"|"highpass"|"bandpass", freq, q }
 */
window.AIRIZ_SOUNDS = {
  meta: {
    title: "Airiz sound effects library",
    version: "1.0",
    note: "Synthesised in-browser with the Web Audio API — no audio files, no network, offline-first."
  },

  categories: [
    { id: "ui",     name: "UI & Notifications" },
    { id: "alarm",  name: "Alarms" },
    { id: "motor",  name: "Motor & Mechanical" },
    { id: "nature", name: "Nature" },
    { id: "retro",  name: "Retro & Game" },
    { id: "tones",  name: "Tones & Tests" }
  ],

  sounds: [
    /* ==================== UI & Notifications (6 sounds) ==================== */
    {
      id: "notify-chime",
      name: "Notify Chime",
      category: "ui",
      desc: "Gentle two-tone notification",
      spec: {
        recipe: "beeps",
        freq: 880,
        beepDur: 0.15,
        gap: 0.08,
        count: 2,
        wave: "sine",
        gain: 0.4
      }
    },
    {
      id: "success-ding",
      name: "Success Ding",
      category: "ui",
      desc: "Bright success confirmation",
      spec: {
        recipe: "chord",
        freqs: [523.25, 659.25, 783.99],
        wave: "sine",
        dur: 0.4,
        attack: 0.01,
        release: 0.3,
        gain: 0.35
      }
    },
    {
      id: "error-buzzer",
      name: "Error Buzzer",
      category: "ui",
      desc: "Low error buzz",
      spec: {
        recipe: "tone",
        freq: 150,
        wave: "sawtooth",
        dur: 0.3,
        attack: 0.02,
        release: 0.1,
        gain: 0.5,
        filter: { type: "lowpass", freq: 400, q: 1 }
      }
    },
    {
      id: "soft-click",
      name: "Soft Click",
      category: "ui",
      desc: "Subtle UI click",
      spec: {
        recipe: "tone",
        freq: 1200,
        wave: "triangle",
        dur: 0.05,
        attack: 0.005,
        release: 0.03,
        gain: 0.25
      }
    },
    {
      id: "toggle-on",
      name: "Toggle On",
      category: "ui",
      desc: "Ascending toggle",
      spec: {
        recipe: "sweep",
        freqFrom: 440,
        freqTo: 880,
        wave: "sine",
        dur: 0.15,
        attack: 0.01,
        release: 0.1,
        gain: 0.35
      }
    },
    {
      id: "toggle-off",
      name: "Toggle Off",
      category: "ui",
      desc: "Descending toggle",
      spec: {
        recipe: "sweep",
        freqFrom: 880,
        freqTo: 440,
        wave: "sine",
        dur: 0.15,
        attack: 0.01,
        release: 0.1,
        gain: 0.35
      }
    },
    {
      id: "message-pop",
      name: "Message Pop",
      category: "ui",
      desc: "Bubble pop for messages",
      spec: {
        recipe: "tone",
        freq: 660,
        wave: "sine",
        dur: 0.12,
        attack: 0.01,
        release: 0.08,
        gain: 0.4,
        filter: { type: "highpass", freq: 400, q: 0.5 }
      }
    },
    {
      id: "two-tone-alert",
      name: "Two-Tone Alert",
      category: "ui",
      desc: "Classic two-tone alert",
      spec: {
        recipe: "beeps",
        freq: 600,
        beepDur: 0.12,
        gap: 0.1,
        count: 2,
        wave: "square",
        gain: 0.3,
        filter: { type: "lowpass", freq: 2000, q: 0.5 }
      }
    },

    /* ==================== Alarms (5 sounds) ==================== */
    {
      id: "warning-beep",
      name: "Warning Beep",
      category: "alarm",
      desc: "Single warning beep",
      spec: {
        recipe: "tone",
        freq: 1000,
        wave: "square",
        dur: 0.25,
        attack: 0.01,
        release: 0.15,
        gain: 0.45,
        filter: { type: "lowpass", freq: 3000, q: 0.3 }
      }
    },
    {
      id: "critical-alarm",
      name: "Critical Alarm",
      category: "alarm",
      desc: "Urgent repeating alarm",
      spec: {
        recipe: "beeps",
        freq: 1200,
        beepDur: 0.2,
        gap: 0.1,
        count: 4,
        wave: "sawtooth",
        gain: 0.5,
        filter: { type: "highpass", freq: 800, q: 0.5 }
      }
    },
    {
      id: "siren-sweep",
      name: "Siren Sweep",
      category: "alarm",
      desc: "Rising and falling siren",
      spec: {
        recipe: "siren",
        freqFrom: 600,
        freqTo: 1200,
        cycles: 2,
        dur: 1.2,
        gain: 0.45,
        wave: "sawtooth"
      }
    },
    {
      id: "fog-horn",
      name: "Fog Horn",
      category: "alarm",
      desc: "Deep foghorn blast",
      spec: {
        recipe: "sweep",
        freqFrom: 180,
        freqTo: 120,
        wave: "sawtooth",
        dur: 1.0,
        attack: 0.1,
        release: 0.5,
        gain: 0.5,
        filter: { type: "lowpass", freq: 400, q: 2 }
      }
    },
    {
      id: "radar-ping",
      name: "Radar Ping",
      category: "alarm",
      desc: "Sonar/radar ping",
      spec: {
        recipe: "tone",
        freq: 2000,
        wave: "sine",
        dur: 0.08,
        attack: 0.005,
        release: 0.2,
        gain: 0.4,
        filter: { type: "bandpass", freq: 2000, q: 3 }
      }
    },
    {
      id: "countdown-beep",
      name: "Countdown Beep",
      category: "alarm",
      desc: "Short countdown tick",
      spec: {
        recipe: "tone",
        freq: 800,
        wave: "triangle",
        dur: 0.08,
        attack: 0.005,
        release: 0.05,
        gain: 0.35
      }
    },

    /* ==================== Motor & Mechanical (7 sounds) ==================== */
    {
      id: "motor-start",
      name: "Motor Start",
      category: "motor",
      desc: "Motor spin-up",
      spec: {
        recipe: "sweep",
        freqFrom: 100,
        freqTo: 300,
        wave: "sawtooth",
        dur: 0.5,
        attack: 0.05,
        release: 0.2,
        gain: 0.45,
        filter: { type: "lowpass", freq: 500, q: 1 }
      }
    },
    {
      id: "motor-stop",
      name: "Motor Stop",
      category: "motor",
      desc: "Motor spin-down",
      spec: {
        recipe: "sweep",
        freqFrom: 300,
        freqTo: 80,
        wave: "sawtooth",
        dur: 0.6,
        attack: 0.02,
        release: 0.3,
        gain: 0.4,
        filter: { type: "lowpass", freq: 400, q: 1 }
      }
    },
    {
      id: "gear-tick",
      name: "Gear Tick",
      category: "motor",
      desc: "Mechanical gear click",
      spec: {
        recipe: "tone",
        freq: 2500,
        wave: "triangle",
        dur: 0.03,
        attack: 0.002,
        release: 0.02,
        gain: 0.3,
        filter: { type: "highpass", freq: 1500, q: 1 }
      }
    },
    {
      id: "servo-sweep",
      name: "Servo Sweep",
      category: "motor",
      desc: "Servo motor movement",
      spec: {
        recipe: "noise",
        dur: 0.4,
        filterType: "bandpass",
        freqFrom: 200,
        freqTo: 600,
        q: 2,
        gain: 0.25
      }
    },
    {
      id: "camera-shutter",
      name: "Camera Shutter",
      category: "motor",
      desc: "Mechanical shutter click",
      spec: {
        recipe: "impact",
        dur: 0.1,
        boomFreq: 150,
        gain: 0.35
      }
    },
    {
      id: "relay-thunk",
      name: "Relay Thunk",
      category: "motor",
      desc: "Relay switching sound",
      spec: {
        recipe: "tone",
        freq: 200,
        wave: "square",
        dur: 0.06,
        attack: 0.005,
        release: 0.04,
        gain: 0.4,
        filter: { type: "lowpass", freq: 600, q: 0.5 }
      }
    },
    {
      id: "icr-clack",
      name: "ICR Clack",
      category: "motor",
      desc: "IR-cut filter mechanism",
      spec: {
        recipe: "impact",
        dur: 0.08,
        boomFreq: 180,
        gain: 0.38
      }
    },
    {
      id: "power-up-ramp",
      name: "Power Up",
      category: "motor",
      desc: "Device power-up ramp",
      spec: {
        recipe: "sweep",
        freqFrom: 200,
        freqTo: 800,
        wave: "sine",
        dur: 0.7,
        attack: 0.05,
        release: 0.3,
        gain: 0.4
      }
    },
    {
      id: "power-down-ramp",
      name: "Power Down",
      category: "motor",
      desc: "Device power-down ramp",
      spec: {
        recipe: "sweep",
        freqFrom: 600,
        freqTo: 150,
        wave: "sine",
        dur: 0.8,
        attack: 0.03,
        release: 0.4,
        gain: 0.35
      }
    },

    /* ==================== Nature (5 sounds) ==================== */
    {
      id: "birdsong",
      name: "Birdsong",
      category: "nature",
      desc: "Simple bird chirp",
      spec: {
        recipe: "arp",
        notes: [
          { freq: 1800, dur: 0.08 },
          { freq: 2200, dur: 0.08 },
          { freq: 2600, dur: 0.12 }
        ],
        wave: "sine",
        release: 0.05,
        gain: 0.35
      }
    },
    {
      id: "water-drop",
      name: "Water Drop",
      category: "nature",
      desc: "Dripping water drop",
      spec: {
        recipe: "tone",
        freq: 1600,
        wave: "sine",
        dur: 0.15,
        attack: 0.005,
        release: 0.12,
        gain: 0.3,
        filter: { type: "highpass", freq: 1000, q: 2 }
      }
    },
    {
      id: "wind-gust",
      name: "Wind Gust",
      category: "nature",
      desc: "Brief wind whoosh",
      spec: {
        recipe: "noise",
        dur: 0.8,
        filterType: "lowpass",
        freqFrom: 300,
        freqTo: 800,
        q: 1,
        gain: 0.25
      }
    },
    {
      id: "thunder-rumble",
      name: "Thunder Rumble",
      category: "nature",
      desc: "Distant thunder",
      spec: {
        recipe: "noise",
        dur: 1.2,
        filterType: "lowpass",
        freqFrom: 80,
        freqTo: 200,
        q: 0.5,
        gain: 0.35
      }
    },
    {
      id: "cuckoo",
      name: "Cuckoo",
      category: "nature",
      desc: "Cuckoo bird call",
      spec: {
        recipe: "beeps",
        freq: 800,
        beepDur: 0.15,
        gap: 0.25,
        count: 2,
        wave: "sine",
        gain: 0.35,
        filter: { type: "bandpass", freq: 800, q: 2 }
      }
    },

    /* ==================== Retro & Game (6 sounds) ==================== */
    {
      id: "coin",
      name: "Coin",
      category: "retro",
      desc: "Classic coin pickup",
      spec: {
        recipe: "sweep",
        freqFrom: 900,
        freqTo: 1500,
        wave: "square",
        dur: 0.2,
        attack: 0.01,
        release: 0.15,
        gain: 0.35,
        filter: { type: "lowpass", freq: 3000, q: 0.5 }
      }
    },
    {
      id: "jump",
      name: "Jump",
      category: "retro",
      desc: "Jump sound effect",
      spec: {
        recipe: "sweep",
        freqFrom: 300,
        freqTo: 600,
        wave: "square",
        dur: 0.15,
        attack: 0.01,
        release: 0.1,
        gain: 0.4
      }
    },
    {
      id: "power-up",
      name: "Power-Up",
      category: "retro",
      desc: "Power-up sequence",
      spec: {
        recipe: "arp",
        notes: [
          { freq: 440, dur: 0.1 },
          { freq: 554, dur: 0.1 },
          { freq: 659, dur: 0.1 },
          { freq: 880, dur: 0.2 }
        ],
        wave: "square",
        release: 0.1,
        gain: 0.35
      }
    },
    {
      id: "laser",
      name: "Laser",
      category: "retro",
      desc: "Retro laser shot",
      spec: {
        recipe: "sweep",
        freqFrom: 1000,
        freqTo: 200,
        wave: "sawtooth",
        dur: 0.25,
        attack: 0.01,
        release: 0.15,
        gain: 0.4,
        filter: { type: "lowpass", freq: 2000, q: 1 }
      }
    },
    {
      id: "explosion",
      name: "Explosion",
      category: "retro",
      desc: "Retro explosion",
      spec: {
        recipe: "noise",
        dur: 0.5,
        filterType: "lowpass",
        freqFrom: 100,
        freqTo: 400,
        q: 0.5,
        gain: 0.5
      }
    },
    {
      id: "game-over",
      name: "Game Over",
      category: "retro",
      desc: "Losing sound",
      spec: {
        recipe: "sweep",
        freqFrom: 600,
        freqTo: 200,
        wave: "sawtooth",
        dur: 0.8,
        attack: 0.05,
        release: 0.4,
        gain: 0.4,
        filter: { type: "lowpass", freq: 1000, q: 0.5 }
      }
    },
    {
      id: "menu-select",
      name: "Menu Select",
      category: "retro",
      desc: "Menu navigation blip",
      spec: {
        recipe: "tone",
        freq: 800,
        wave: "square",
        dur: 0.08,
        attack: 0.005,
        release: 0.05,
        gain: 0.3,
        filter: { type: "lowpass", freq: 2500, q: 0.5 }
      }
    },
    {
      id: "extra-life",
      name: "Extra Life",
      category: "retro",
      desc: "1-up bonus sound",
      spec: {
        recipe: "chord",
        freqs: [523.25, 659.25, 783.99, 1046.50],
        wave: "square",
        dur: 0.5,
        attack: 0.02,
        release: 0.3,
        gain: 0.3,
        filter: { type: "lowpass", freq: 3000, q: 0.5 }
      }
    },

    /* ==================== Tones & Tests (4 sounds) ==================== */
    {
      id: "a440-pure",
      name: "A440 Pure",
      category: "tones",
      desc: "Standard A4 tuning tone",
      spec: {
        recipe: "tone",
        freq: 440,
        wave: "sine",
        dur: 1.0,
        attack: 0.02,
        release: 0.3,
        gain: 0.4
      }
    },
    {
      id: "sine-scale",
      name: "Sine Scale",
      category: "tones",
      desc: "C major scale ascending",
      spec: {
        recipe: "arp",
        notes: [
          { freq: 261.63, dur: 0.15 },
          { freq: 293.66, dur: 0.15 },
          { freq: 329.63, dur: 0.15 },
          { freq: 349.23, dur: 0.15 },
          { freq: 392.00, dur: 0.15 },
          { freq: 440.00, dur: 0.15 },
          { freq: 493.88, dur: 0.15 },
          { freq: 523.25, dur: 0.25 }
        ],
        wave: "sine",
        release: 0.05,
        gain: 0.35
      }
    },
    {
      id: "square-arpeggio",
      name: "Square Arpeggio",
      category: "tones",
      desc: "Major arpeggio test",
      spec: {
        recipe: "arp",
        notes: [
          { freq: 261.63, dur: 0.12 },
          { freq: 329.63, dur: 0.12 },
          { freq: 392.00, dur: 0.12 },
          { freq: 523.25, dur: 0.2 }
        ],
        wave: "square",
        release: 0.05,
        gain: 0.3,
        filter: { type: "lowpass", freq: 3000, q: 0.5 }
      }
    },
    {
      id: "test-sweep",
      name: "Test Sweep",
      category: "tones",
      desc: "Full range frequency sweep",
      spec: {
        recipe: "sweep",
        freqFrom: 100,
        freqTo: 4000,
        wave: "sine",
        dur: 2.0,
        attack: 0.05,
        release: 0.3,
        gain: 0.3
      }
    },
    {
      id: "white-noise-burst",
      name: "White Noise Burst",
      category: "tones",
      desc: "Short noise burst for testing",
      spec: {
        recipe: "noise",
        dur: 0.4,
        filterType: "lowpass",
        freqFrom: 200,
        freqTo: 2000,
        q: 0.5,
        gain: 0.35
      }
    }
  ]
};
