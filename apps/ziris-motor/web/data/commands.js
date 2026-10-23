/*
 * Ziris Motor Test Console — command library
 * Source: "FW: Ziris- 測試指令" (Outlook store "0921", 2026-09-23)
 *         attachment: Ziris_commands_list_0626.xlsx  →  sheet "Command List"
 *         Firmware version documented: 0.0.0.9
 *
 * Schema:
 *   params: [{ key, label, type:'int'|'text'|'float'|'enum', default, min, max,
 *              step, options:[], hint }]
 *   cmd:    command template; {key} placeholders are filled from params
 *   expect: sub-string the device prints when the command succeeds (optional)
 *
 * Anything in `note` is copied faithfully from the source sheet, or is a clearly
 * worded clarification. Notes the source left ambiguous are marked.
 */
window.ZIRIS_COMMANDS = {
  meta: {
    title: "Ziris diagnostic command list",
    fwVersion: "0.0.0.9",
    source: "Ziris_commands_list_0626.xlsx",
    sourceMail: "FW: Ziris- 測試指令 (2026-09-23)",
    sheets: ["Ver", "Block DIagram", "Command List"],
    compiled: "2026-06-12 (v1.2)",
    authors: ["Jason Fan"]
  },

  groups: [
    /* ------------------------------------------------------------------ */
    {
      id: "fw", item: "FW Info", category: "System", icon: "cpu",
      desc: "Read the running firmware version.",
      commands: [
        { id: "fw-ver", label: "Read FW version", cmd: "diag ver sw",
          expect: "#INFO#", note: "Returns #INFO#<version>#END#" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "imsensor", item: "IMG Sensor — Omni OS08F10", category: "Camera", icon: "camera",
      desc: "Switch the USB gadget mode. The device reboots automatically.",
      commands: [
        { id: "usb-uvc", label: "USB mode → UVC (camera)", cmd: "diag usbmode set uvc",
          destructive: true,
          note: "System auto-reboots. The camera then shows up as a PC camera device." },
        { id: "usb-cdc", label: "USB mode → CDC (serial)", cmd: "diag usbmode set cdc",
          destructive: true,
          note: "System auto-reboots. Restores the diagnostic serial console." }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "wifi", item: "WiFi Connection — NXP IW612", category: "Wireless", icon: "wifi",
      desc: "Join an access point on mlan0.",
      commands: [
        { id: "wifi-connect", label: "Connect to AP", cmd: "diag wifi connect {ssid} {password} mlan0",
          params: [
            { key: "ssid", label: "SSID", type: "text", default: "", hint: "Access-point name" },
            { key: "password", label: "Password", type: "text", default: "", hint: "WPA passphrase" }
          ],
          note: "Run `ifconfig` afterwards to check the status (mlan0 should show an inet addr)." }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "bt", item: "BT UART — NXP IW612", category: "Wireless", icon: "bluetooth",
      desc: "Bring up the Bluetooth controller.",
      commands: [
        { id: "ble-on", label: "Bluetooth on", cmd: "diag ble on",
          expect: "pegaDiag_BleOn",
          note: "Prints the BlueZ controller/adapter dump, then #INFO#0#END#." }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "thread", item: "Thread — NXP IW612", category: "Wireless", icon: "thread",
      desc: "Bring up the OpenThread stack.",
      commands: [
        { id: "thread-on", label: "Thread on", cmd: "diag thread on",
          expect: "pegaDiag_ThreadOn",
          note: "Prints the OT dataset (PAN ID, Network Name, channel …)." }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "amp", item: "AMP — TAS2781 (I2C)", category: "Audio", icon: "speaker",
      desc: "Initialise the audio amplifier.",
      commands: [
        { id: "audio-init", label: "Audio init", cmd: "diag audio init", expect: "Done" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "audio-play", item: "Audio Path — I2S (Play)", category: "Audio", icon: "play",
      desc: "Set playback volume and play a WAV file.",
      commands: [
        { id: "audio-vol", label: "Set volume", cmd: "diag audio volume {level}",
          params: [ { key: "level", label: "Volume", type: "int", default: 10, min: 0, max: 100, hint: "0 – 100" } ],
          expect: "Done" },
        { id: "audio-play", label: "Play test WAV", cmd: "diag audio play /audio/16K_16bit_Stereo_Loud.wav",
          expect: "Done" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "dmic", item: "DMIC (Record)", category: "Audio", icon: "mic",
      desc: "Record from the digital microphone.",
      commands: [
        { id: "audio-rec", label: "Record", cmd: "diag audio record -p -t {seconds} -v {level}",
          params: [
            { key: "seconds", label: "Duration (s)", type: "int", default: 10, min: 1, max: 600 },
            { key: "level", label: "Gain", type: "int", default: 100, min: 0, max: 100 }
          ],
          note: "Source sheet note for this row reads \"Configure OT PAN Channel to 16\" — appears misaligned in the source; verify on hardware." }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "spotled", item: "Spot Light LED", category: "LED", icon: "flashlight",
      desc: "White spotlight (duty in %).",
      commands: [
        { id: "spot-on", label: "Spot on", cmd: "diag spotled on", expect: "Done" },
        { id: "spot-off", label: "Spot off", cmd: "diag spotled off", expect: "Done" },
        { id: "spot-duty", label: "Set spot duty", cmd: "diag spotled duty {duty}",
          params: [ { key: "duty", label: "Duty", type: "int", default: 10, min: 0, max: 100, hint: "0 – 100 (%)" } ] }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "irled", item: "IR LED", category: "LED", icon: "infrared",
      desc: "Infrared illuminator (duty in %).",
      commands: [
        { id: "ir-on", label: "IR on", cmd: "diag irled on", expect: "Done" },
        { id: "ir-off", label: "IR off", cmd: "diag irled off", expect: "Done" },
        { id: "ir-duty", label: "Set IR duty", cmd: "diag irled duty {duty}",
          params: [ { key: "duty", label: "Duty", type: "int", default: 10, min: 0, max: 100, hint: "0 – 100 (%)" } ] }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "statusled", item: "Status RGB LED", category: "LED", icon: "led",
      desc: "Discrete status LED channels.",
      commands: [
        { id: "led-on", label: "All on", cmd: "diag led on" },
        { id: "led-off", label: "All off", cmd: "diag led off" },
        { id: "led-r-on", label: "Red on", cmd: "diag led_r on" },
        { id: "led-r-off", label: "Red off", cmd: "diag led_r off" },
        { id: "led-g-on", label: "Green on", cmd: "diag led_g on" },
        { id: "led-g-off", label: "Green off", cmd: "diag led_g off" },
        { id: "led-b-on", label: "Blue on", cmd: "diag led_b on" },
        { id: "led-b-off", label: "Blue off", cmd: "diag led_b off" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "icr", item: "ICR — DRV8212", category: "Mechanism", icon: "switch",
      desc: "IR-cut filter day/night.",
      commands: [
        { id: "icr-day", label: "Day", cmd: "diag ircut day" },
        { id: "icr-night", label: "Night", cmd: "diag ircut night" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "als", item: "ALS — OPT300", category: "Sensor", icon: "sun",
      desc: "Ambient light sensor.",
      commands: [
        { id: "als-id", label: "Read ID", cmd: "diag als id" },
        { id: "als-value", label: "Read value", cmd: "diag als value" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "nfc", item: "NFC — ST25R3918", category: "Sensor", icon: "nfc",
      desc: "NFC controller.",
      commands: [
        { id: "nfc-id", label: "Read ID", cmd: "diag nfc id" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "acc", item: "ACC — ST LIS2DW12TR", category: "Sensor", icon: "accelerometer",
      desc: "Accelerometer.",
      commands: [
        { id: "acc-id", label: "Read ID", cmd: "diag acc id" },
        { id: "acc-attr", label: "Read attributes", cmd: "diag acc attr" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "rled", item: "RGB Ring LED — KTD2064 (I2C3)", category: "LED", icon: "ring",
      desc: "Ring-LED driver: palette, patterns and effects.",
      commands: [
        { id: "rled-id", label: "Read ID", cmd: "diag rled id" },
        { id: "rled-report", label: "Report status", cmd: "diag rled report" },
        { id: "rled-on", label: "On", cmd: "diag rled on {bNight} {fade_rate}",
          params: [
            { key: "bNight", label: "Night", type: "enum", options: ["0", "1"], default: "1" },
            { key: "fade_rate", label: "Fade rate", type: "int", default: 3, min: 0, max: 7, hint: "0 – 7" }
          ],
          note: "Example: diag rled on 1 3" },
        { id: "rled-palette", label: "Set palette", cmd: "diag rled palette {r} {g} {b} {bNight} {bBriExtend}",
          params: [
            { key: "r", label: "R", type: "int", default: 120, min: 0, max: 255 },
            { key: "g", label: "G", type: "int", default: 120, min: 0, max: 255 },
            { key: "b", label: "B", type: "int", default: 120, min: 0, max: 255 },
            { key: "bNight", label: "Night", type: "enum", options: ["0", "1"], default: "1" },
            { key: "bBriExtend", label: "Bri extend", type: "enum", options: ["0", "1"], default: "0" }
          ],
          note: "Example: diag rled palette 120 120 120 1 0" },
        { id: "rled-off", label: "Off", cmd: "diag rled off" },
        { id: "rled-start", label: "Start pattern", cmd: "diag rled start" },
        { id: "rled-stop", label: "Stop pattern", cmd: "diag rled stop" },
        { id: "rled-pattern-off", label: "Pattern off", cmd: "diag rled pattern_off" },
        { id: "rled-breathing", label: "Breathing", cmd: "diag rled breathing {fSpeed} {fMinLevel} {fMaxLevel} {fade_rate} {eColor} {night_mode}",
          params: [
            { key: "fSpeed", label: "Speed", type: "int", default: 5, min: 0, max: 255 },
            { key: "fMinLevel", label: "Min level", type: "float", default: 0.01, min: 0, max: 1 },
            { key: "fMaxLevel", label: "Max level", type: "float", default: 0.8, min: 0, max: 1 },
            { key: "fade_rate", label: "Fade rate", type: "int", default: 0, min: 0, max: 7 },
            { key: "eColor", label: "Color", type: "enum", options: ["0", "1", "2"], default: "1" },
            { key: "night_mode", label: "Night", type: "enum", options: ["0", "1"], default: "1" }
          ],
          note: "Example: diag rled breathing 5 0.01 0.8 0 1 1" },
        { id: "rled-chasing", label: "Chasing", cmd: "diag rled chasing {speed_ms} {color_r} {color_g} {color_b} {night_mode} {reversal}",
          params: [
            { key: "speed_ms", label: "Speed (ms)", type: "int", default: 50, min: 1, max: 2000 },
            { key: "color_r", label: "R", type: "int", default: 120, min: 0, max: 255 },
            { key: "color_g", label: "G", type: "int", default: 120, min: 0, max: 255 },
            { key: "color_b", label: "B", type: "int", default: 120, min: 0, max: 255 },
            { key: "night_mode", label: "Night", type: "enum", options: ["0", "1"], default: "1" },
            { key: "reversal", label: "Reversal", type: "enum", options: ["0", "1"], default: "1" }
          ],
          note: "Example: diag rled chasing 50 120 120 120 1 1" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "zwave", item: "Z-wave — Silabs EFR32ZG23", category: "Wireless", icon: "zwave",
      desc: "Z-Wave radio: check, version, reset, recovery and OTW firmware update.",
      commands: [
        { id: "zg-check", label: "Check", cmd: "diag zg23 check", expect: "Done" },
        { id: "zg-fwver", label: "Get FW version", cmd: "diag zg23 get fw_ver" },
        { id: "zg-reset", label: "Reset", cmd: "diag zg23 reset" },
        { id: "zg-recovery", label: "FW recovery mode", cmd: "diag zg23 fw_recovery_mode",
          expect: "#INFO#",
          note: "Returns \"#INFO#0:ZG23 FW RECOVERY MODE PASS recovery=1 reset=1#END#\" then enters bootloader." },
        { id: "zg-otw", label: "OTW firmware update", cmd: "diag zg23 otw {image}",
          params: [ { key: "image", label: "Image path", type: "text", default: "/mnt/usb/u1_1.gbl",
                      hint: "Path to the .gbl image on the device" } ],
          note: "Prints #ZG23 OTW transfer 0..100%# then \"#INFO#0:ZG23 OTW PASS …#END#\"." },
        { id: "zg-pc-start", label: "PC-controller start", cmd: "diag zg23 pc-controller start",
          note: "While started, other `diag zg23` commands are blocked until stopped." },
        { id: "zg-pc-stop", label: "PC-controller stop", cmd: "diag zg23 pc-controller stop" }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "motor-pan", item: "Motor Driver (Pan) — AWD8833", category: "Motor", icon: "motor",
      desc: "Pan motor. X = speed/strength (1–17, smaller = slower & stronger), Y = steps (1–99999).",
      commands: [
        { id: "pan-fwd", label: "Pan forward", cmd: "diag motor pan forward {x} {y}",
          params: [
            { key: "x", label: "X (speed)", type: "int", default: 2, min: 1, max: 17, hint: "1 – 17 (smaller = slower & more powerful)" },
            { key: "y", label: "Y (steps)", type: "int", default: 2, min: 1, max: 99999 }
          ] },
        { id: "pan-rev", label: "Pan reverse", cmd: "diag motor pan reverse {x} {y}",
          params: [
            { key: "x", label: "X (speed)", type: "int", default: 2, min: 1, max: 17, hint: "1 – 17 (smaller = slower & more powerful)" },
            { key: "y", label: "Y (steps)", type: "int", default: 2, min: 1, max: 99999 }
          ] }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "motor-rising", item: "Motor Driver (Rising) — AWD8833", category: "Motor", icon: "motor",
      desc: "Rising (tilt) motor. X = speed/strength (1–30, smaller = slower & stronger), Y = steps (1–99999).",
      commands: [
        { id: "rising-fwd", label: "Rising forward (up)", cmd: "diag motor rising forward {x} {y}",
          params: [
            { key: "x", label: "X (speed)", type: "int", default: 3, min: 1, max: 30, hint: "1 – 30 (smaller = slower & more powerful)" },
            { key: "y", label: "Y (steps)", type: "int", default: 950, min: 1, max: 99999 }
          ] },
        { id: "rising-rev", label: "Rising reverse (down)", cmd: "diag motor rising reverse {x} {y}",
          params: [
            { key: "x", label: "X (speed)", type: "int", default: 3, min: 1, max: 30, hint: "1 – 30 (smaller = slower & more powerful)" },
            { key: "y", label: "Y (steps)", type: "int", default: 950, min: 1, max: 99999 }
          ] }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "button", item: "Button", category: "IO", icon: "button",
      desc: "Read button state.",
      commands: [
        { id: "btn-rising", label: "Rising detect", cmd: "diag button get rising-det", expect: "#INFO#" },
        { id: "btn-sync", label: "Sync button", cmd: "diag button get  sync-btn", expect: "#INFO#",
          note: "Note the double space in the source command — kept verbatim." }
      ]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "rftest", item: "RF test", category: "RF", icon: "rf",
      desc: "Download the WiFi-IC manufacturing image and run RF tests.",
      commands: [
        { id: "rf-on", label: "RF test on", cmd: "diag rftest on", destructive: true,
          note: "Turns OFF the WiFi-IC product-image download at boot, then reboots." },
        { id: "rf-wifi1", label: "WiFi function test", cmd: "diag rftest wifi1",
          note: "Downloads the WiFi MFG image and enables WiFi functional test." },
        { id: "rf-wifi2", label: "BLE / Thread test", cmd: "diag rftest wifi2",
          note: "Downloads the WiFi MFG image and enables BLE/Thread functional test." },
        { id: "rf-off", label: "RF test off", cmd: "diag rftest off", destructive: true,
          note: "Turns the WiFi-IC product-image download back on at boot." }
      ]
    }
  ]
};
