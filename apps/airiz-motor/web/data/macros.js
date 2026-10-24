/*
 * Airiz Motor Test Console — macro library
 *
 * Each macro is a small program the runner executes over the serial link:
 *   { type:'blank' }                        send an empty line (CRLF)
 *   { type:'command', text:'…' }            send a command line (CRLF)
 *   { type:'wait', pattern:'~ #', timeout:15000 }  wait until the device prints `pattern`
 *   { type:'pause', seconds:5 }             wait a fixed time
 *   { type:'note', text:'…' }               print a marker in the log (not sent)
 *
 * `{key}` placeholders in a command are expanded from the macro's params.
 * `repeat` runs the whole step list N times (the runner shows
 * "Current Test Count = n" between iterations, exactly like the .ttl macros).
 *
 * The first three macros are direct translations of the TeraTerm macros.
 * The rest are presets derived from 指令.txt.
 */
window.AIRIZ_MACROS = {
  meta: {
    prompt: "~ #"
  },

  macros: [
    /* -------- direct translations of the .ttl files -------------------- */
    {
      id: "mode-with-light",
      name: "Motor cycling — with LED chasing",
      desc: "Runs the ring LED 'chasing' effect, then cycles the rising motor up/down. (from test_motor.ttl)",
      source: "test_motor.ttl",
      repeat: 2,
      params: [
        { key: "x", label: "X (speed)", type: "int", default: 3 },
        { key: "y", label: "Y (steps)", type: "int", default: 950 },
        { key: "pause", label: "Pause (s)", type: "float", default: 5 }
      ],
      steps: [
        { type: "command", text: "diag rled chasing 50 120 120 120 1 1" },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor rising forward {x} {y}" },
        { type: "pause", seconds: 5 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor rising reverse {x} {y}" },
        { type: "pause", seconds: 5 }
      ]
    },
    {
      id: "mode-no-light",
      name: "Motor cycling — no light",
      desc: "Same up/down cycle with no LED effect. (from test_motor2 (no light).ttl)",
      source: "test_motor2 (no light).ttl",
      repeat: 2,
      params: [
        { key: "x", label: "X (speed)", type: "int", default: 3 },
        { key: "y", label: "Y (steps)", type: "int", default: 950 },
        { key: "pause", label: "Pause (s)", type: "float", default: 5 }
      ],
      steps: [
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor rising forward {x} {y}" },
        { type: "pause", seconds: 5 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor rising reverse {x} {y}" },
        { type: "pause", seconds: 5 }
      ]
    },
    {
      id: "mode-1100",
      name: "Motor cycling — 1100 steps",
      desc: "Up/down cycle using 1100 steps per move. (from test_motor3 (1100).ttl)",
      source: "test_motor3 (1100).ttl",
      repeat: 2,
      params: [
        { key: "x", label: "X (speed)", type: "int", default: 3 },
        { key: "y", label: "Y (steps)", type: "int", default: 1100 },
        { key: "pause", label: "Pause (s)", type: "float", default: 5 }
      ],
      steps: [
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor rising forward {x} {y}" },
        { type: "pause", seconds: 5 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor rising reverse {x} {y}" },
        { type: "pause", seconds: 5 }
      ]
    },

    /* -------- presets derived from 指令.txt ---------------------------- */
    {
      id: "preset-pan-sweep",
      name: "Pan sweep",
      desc: "Pan in and out 10 steps @ X=2. (指令.txt)",
      source: "指令.txt",
      repeat: 1,
      params: [
        { key: "x", label: "X (speed)", type: "int", default: 2 },
        { key: "y", label: "Y (steps)", type: "int", default: 10 },
        { key: "pause", label: "Pause (s)", type: "float", default: 5 }
      ],
      steps: [
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor pan forward {x} {y}" }, { type: "pause", seconds: 5 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor pan reverse {x} {y}" }, { type: "pause", seconds: 5 }
      ]
    },
    {
      id: "preset-step-sweep",
      name: "Step sweep 10 → 100%",
      desc: "Rising motor at decreasing step counts (170, 85, 57, 43, 34, 28, 24, 21, 19, 17) @ X=1070. (指令.txt)",
      source: "指令.txt",
      repeat: 1,
      params: [
        { key: "x", label: "X (speed)", type: "int", default: 1070 },
        { key: "pause", label: "Pause (s)", type: "float", default: 3 }
      ],
      steps: [
        { type: "note", text: "10%" },   { type: "command", text: "diag motor rising forward {x} 170" }, { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 170" }, { type: "pause", seconds: 3 },
        { type: "note", text: "20%" },   { type: "command", text: "diag motor rising forward {x} 85" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 85" },  { type: "pause", seconds: 3 },
        { type: "note", text: "30%" },   { type: "command", text: "diag motor rising forward {x} 57" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 57" },  { type: "pause", seconds: 3 },
        { type: "note", text: "40%" },   { type: "command", text: "diag motor rising forward {x} 43" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 43" },  { type: "pause", seconds: 3 },
        { type: "note", text: "50%" },   { type: "command", text: "diag motor rising forward {x} 34" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 34" },  { type: "pause", seconds: 3 },
        { type: "note", text: "60%" },   { type: "command", text: "diag motor rising forward {x} 28" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 28" },  { type: "pause", seconds: 3 },
        { type: "note", text: "70%" },   { type: "command", text: "diag motor rising forward {x} 24" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 24" },  { type: "pause", seconds: 3 },
        { type: "note", text: "80%" },   { type: "command", text: "diag motor rising forward {x} 21" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 21" },  { type: "pause", seconds: 3 },
        { type: "note", text: "90%" },   { type: "command", text: "diag motor rising forward {x} 19" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 19" },  { type: "pause", seconds: 3 },
        { type: "note", text: "100%" },  { type: "command", text: "diag motor rising forward {x} 17" },  { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} 17" },  { type: "pause", seconds: 3 }
      ]
    },
    {
      id: "preset-bringup",
      name: "Bring-up smoke test",
      desc: "Version + a quick motor up/down at 1000 steps + pan nudge. (指令.txt tail)",
      source: "指令.txt",
      repeat: 1,
      params: [
        { key: "x", label: "Rising X", type: "int", default: 3 },
        { key: "y", label: "Rising Y", type: "int", default: 1000 },
        { key: "pause", label: "Pause (s)", type: "float", default: 3 }
      ],
      steps: [
        { type: "command", text: "diag ver sw" }, { type: "pause", seconds: 1 },
        { type: "blank" }, { type: "wait", pattern: "~ #", timeout: 15000 },
        { type: "command", text: "diag motor rising forward {x} {y}" }, { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor rising reverse {x} {y}" }, { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor pan forward 2 8500" }, { type: "pause", seconds: 3 },
        { type: "command", text: "diag motor pan reverse 2 8500" }, { type: "pause", seconds: 3 }
      ]
    }
  ]
};
