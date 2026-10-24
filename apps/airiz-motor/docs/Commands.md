# Airiz diagnostic command reference

Auto-generated from `web/data/commands.js` by `tools/gen_docs.py`. Do not edit by hand.

- Firmware documented: **0.0.0.9**  
- Source: the device command list (sheet *Command List*)  
- Compiled 2026-06-12 (v1.2)

> The device shell prompt is `~ #`. Commands are sent as a line terminated by CRLF.

## Groups

- **System** — FW Info
- **Camera** — IMG Sensor — Omni OS08F10
- **Wireless** — WiFi Connection — NXP IW612, BT UART — NXP IW612, Thread — NXP IW612, Z-wave — Silabs EFR32ZG23
- **Audio** — AMP — TAS2781 (I2C), Audio Path — I2S (Play), DMIC (Record)
- **LED** — Spot Light LED, IR LED, Status RGB LED, RGB Ring LED — KTD2064 (I2C3)
- **Mechanism** — ICR — DRV8212
- **Sensor** — ALS — OPT300, NFC — ST25R3918, ACC — ST LIS2DW12TR
- **Motor** — Motor Driver (Pan) — AWD8833, Motor Driver (Rising) — AWD8833
- **IO** — Button
- **RF** — RF test

## System

### FW Info

Read the running firmware version.

**`diag ver sw`** — Read FW version

> Returns #INFO#<version>#END#

## Camera

### IMG Sensor — Omni OS08F10

Switch the USB gadget mode. The device reboots automatically.

**`diag usbmode set uvc`** — USB mode → UVC (camera)

> System auto-reboots. The camera then shows up as a PC camera device.

> ⚠ Destructive — the device reboots.

**`diag usbmode set cdc`** — USB mode → CDC (serial)

> System auto-reboots. Restores the diagnostic serial console.

> ⚠ Destructive — the device reboots.

## Wireless

### WiFi Connection — NXP IW612

Join an access point on mlan0.

**`diag wifi connect {ssid} {password} mlan0`** — Connect to AP

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `ssid` | text | text | `` | Access-point name |
| `password` | text | text | `` | WPA passphrase |

> Run `ifconfig` afterwards to check the status (mlan0 should show an inet addr).

### BT UART — NXP IW612

Bring up the Bluetooth controller.

**`diag ble on`** — Bluetooth on

> Prints the BlueZ controller/adapter dump, then #INFO#0#END#.

### Thread — NXP IW612

Bring up the OpenThread stack.

**`diag thread on`** — Thread on

> Prints the OT dataset (PAN ID, Network Name, channel …).

### Z-wave — Silabs EFR32ZG23

Z-Wave radio: check, version, reset, recovery and OTW firmware update.

**`diag zg23 check`** — Check

**`diag zg23 get fw_ver`** — Get FW version

**`diag zg23 reset`** — Reset

**`diag zg23 fw_recovery_mode`** — FW recovery mode

> Returns "#INFO#0:ZG23 FW RECOVERY MODE PASS recovery=1 reset=1#END#" then enters bootloader.

**`diag zg23 otw {image}`** — OTW firmware update

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `image` | text | text | `/mnt/usb/u1_1.gbl` | Path to the .gbl image on the device |

> Prints #ZG23 OTW transfer 0..100%# then "#INFO#0:ZG23 OTW PASS …#END#".

## Audio

### AMP — TAS2781 (I2C)

Initialise the audio amplifier.

**`diag audio init`** — Audio init

### Audio Path — I2S (Play)

Set playback volume and play a WAV file.

**`diag audio volume {level}`** — Set volume

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `level` | int | 0 – 100 | `10` | 0 – 100 |

**`diag audio play /audio/16K_16bit_Stereo_Loud.wav`** — Play test WAV

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `sound` | sfx | built-in sound effect | `` |  |

> Picks a built-in sound effect and previews it in this browser (no serial command is sent). Full board in the Sound FX tab.

### DMIC (Record)

Record from the digital microphone.

**`diag audio record -p -t {seconds} -v {level}`** — Record

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `seconds` | int | 1 – 600 | `10` |  |
| `level` | int | 0 – 100 | `100` |  |

> Source sheet note for this row reads "Configure OT PAN Channel to 16" — appears misaligned in the source; verify on hardware.

## LED

### Spot Light LED

White spotlight (duty in %).

**`diag spotled on`** — Spot on

**`diag spotled off`** — Spot off

**`diag spotled duty {duty}`** — Set spot duty

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `duty` | int | 0 – 100 | `10` | 0 – 100 (%) |

### IR LED

Infrared illuminator (duty in %).

**`diag irled on`** — IR on

**`diag irled off`** — IR off

**`diag irled duty {duty}`** — Set IR duty

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `duty` | int | 0 – 100 | `10` | 0 – 100 (%) |

### Status RGB LED

Discrete status LED channels.

**`diag led on`** — All on

**`diag led off`** — All off

**`diag led_r on`** — Red on

**`diag led_r off`** — Red off

**`diag led_g on`** — Green on

**`diag led_g off`** — Green off

**`diag led_b on`** — Blue on

**`diag led_b off`** — Blue off

### RGB Ring LED — KTD2064 (I2C3)

Ring-LED driver: palette, patterns and effects.

**`diag rled id`** — Read ID

**`diag rled report`** — Report status

**`diag rled palette {r} {g} {b} {bNight} {bBriExtend}`** — Set palette

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `r` | int | 0 – 255 | `120` |  |
| `g` | int | 0 – 255 | `120` |  |
| `b` | int | 0 – 255 | `120` |  |
| `bNight` | enum | 0 · 1 | `1` |  |
| `bBriExtend` | enum | 0 · 1 | `0` |  |

> Example: diag rled palette 120 120 120 1 0

**`diag rled off`** — Off

**`diag rled pattern_off`** — Pattern off

**`diag rled breathing {fSpeed} {fMinLevel} {fMaxLevel} {fade_rate} {eColor} {night_mode}`** — Breathing

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `fSpeed` | int | 0 – 255 | `5` |  |
| `fMinLevel` | float | 0 – 1 | `0.01` |  |
| `fMaxLevel` | float | 0 – 1 | `0.8` |  |
| `fade_rate` | int | 0 – 7 | `0` |  |
| `eColor` | enum | 0 · 1 · 2 | `1` |  |
| `night_mode` | enum | 0 · 1 | `1` |  |

> Example: diag rled breathing 5 0.01 0.8 0 1 1

**`diag rled chasing {speed_ms} {color_r} {color_g} {color_b} {night_mode} {reversal}`** — Chasing

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `speed_ms` | int | 1 – 2000 | `50` |  |
| `color_r` | int | 0 – 255 | `120` |  |
| `color_g` | int | 0 – 255 | `120` |  |
| `color_b` | int | 0 – 255 | `120` |  |
| `night_mode` | enum | 0 · 1 | `1` |  |
| `reversal` | enum | 0 · 1 | `1` |  |

> Example: diag rled chasing 50 120 120 120 1 1

## Mechanism

### ICR — DRV8212

IR-cut filter day/night.

**`diag ircut day`** — Day

**`diag ircut night`** — Night

## Sensor

### ALS — OPT300

Ambient light sensor.

**`diag als id`** — Read ID

**`diag als value`** — Read value

### NFC — ST25R3918

NFC controller.

**`diag nfc id`** — Read ID

### ACC — ST LIS2DW12TR

Accelerometer.

**`diag acc id`** — Read ID

**`diag acc attr`** — Read attributes

## Motor

### Motor Driver (Pan) — AWD8833

Pan motor. X = speed/strength (1–17, smaller = slower & stronger), Y = steps (1–99999).

**`diag motor pan forward {x} {y}`** — Pan forward

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `x` | int | 1 – 17 | `2` | 1 – 17 (smaller = slower & more powerful) |
| `y` | int | 1 – 99999 | `2` |  |

**`diag motor pan reverse {x} {y}`** — Pan reverse

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `x` | int | 1 – 17 | `2` | 1 – 17 (smaller = slower & more powerful) |
| `y` | int | 1 – 99999 | `2` |  |

### Motor Driver (Rising) — AWD8833

Rising (tilt) motor. X = speed/strength (1–30, smaller = slower & stronger), Y = steps (1–99999).

**`diag motor rising forward {x} {y}`** — Rising forward (up)

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `x` | int | 1 – 30 | `3` | 1 – 30 (smaller = slower & more powerful) |
| `y` | int | 1 – 99999 | `950` |  |

**`diag motor rising reverse {x} {y}`** — Rising reverse (down)

| Param | Type | Range / options | Default | Hint |
| --- | --- | --- | --- | --- |
| `x` | int | 1 – 30 | `3` | 1 – 30 (smaller = slower & more powerful) |
| `y` | int | 1 – 99999 | `950` |  |

## IO

### Button

Read button state.

**`diag button get rising-det`** — Rising detect

**`diag button get  sync-btn`** — Sync button

> Note the double space in the source command — kept verbatim.

## RF

### RF test

Download the WiFi-IC manufacturing image and run RF tests.

**`diag rftest on`** — RF test on

> Turns OFF the WiFi-IC product-image download at boot, then reboots.

> ⚠ Destructive — the device reboots.

**`diag rftest wifi1`** — WiFi function test

> Downloads the WiFi MFG image and enables WiFi functional test.

**`diag rftest wifi2`** — BLE / Thread test

> Downloads the WiFi MFG image and enables BLE/Thread functional test.

**`diag rftest off`** — RF test off

> Turns the WiFi-IC product-image download back on at boot.

> ⚠ Destructive — the device reboots.

## Macros

Prompt pattern: `~ #`

### Motor cycling — with LED chasing

Runs the ring LED 'chasing' effect, then cycles the rising motor up/down. (from test_motor.ttl)

- id: `mode-with-light`  
- source: `test_motor.ttl`  
- default repeat: 2  
- params: `x`=3, `y`=950, `pause`=5

Steps:

- `command` — diag rled chasing 50 120 120 120 1 1
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor rising forward {x} {y}
- `pause` — 5 s
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor rising reverse {x} {y}
- `pause` — 5 s

### Motor cycling — no light

Same up/down cycle with no LED effect. (from test_motor2 (no light).ttl)

- id: `mode-no-light`  
- source: `test_motor2 (no light).ttl`  
- default repeat: 2  
- params: `x`=3, `y`=950, `pause`=5

Steps:

- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor rising forward {x} {y}
- `pause` — 5 s
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor rising reverse {x} {y}
- `pause` — 5 s

### Motor cycling — 1100 steps

Up/down cycle using 1100 steps per move. (from test_motor3 (1100).ttl)

- id: `mode-1100`  
- source: `test_motor3 (1100).ttl`  
- default repeat: 2  
- params: `x`=3, `y`=1100, `pause`=5

Steps:

- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor rising forward {x} {y}
- `pause` — 5 s
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor rising reverse {x} {y}
- `pause` — 5 s

### Pan sweep

Pan in and out 10 steps @ X=2. (指令.txt)

- id: `preset-pan-sweep`  
- source: `指令.txt`  
- default repeat: 1  
- params: `x`=2, `y`=10, `pause`=5

Steps:

- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor pan forward {x} {y}
- `pause` — 5 s
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor pan reverse {x} {y}
- `pause` — 5 s

### Step sweep 10 → 100%

Rising motor at decreasing step counts (170, 85, 57, 43, 34, 28, 24, 21, 19, 17) @ X=1070. (指令.txt)

- id: `preset-step-sweep`  
- source: `指令.txt`  
- default repeat: 1  
- params: `x`=1070, `pause`=3

Steps:

- `note` — 10%
- `command` — diag motor rising forward {x} 170
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 170
- `pause` — 3 s
- `note` — 20%
- `command` — diag motor rising forward {x} 85
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 85
- `pause` — 3 s
- `note` — 30%
- `command` — diag motor rising forward {x} 57
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 57
- `pause` — 3 s
- `note` — 40%
- `command` — diag motor rising forward {x} 43
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 43
- `pause` — 3 s
- `note` — 50%
- `command` — diag motor rising forward {x} 34
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 34
- `pause` — 3 s
- `note` — 60%
- `command` — diag motor rising forward {x} 28
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 28
- `pause` — 3 s
- `note` — 70%
- `command` — diag motor rising forward {x} 24
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 24
- `pause` — 3 s
- `note` — 80%
- `command` — diag motor rising forward {x} 21
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 21
- `pause` — 3 s
- `note` — 90%
- `command` — diag motor rising forward {x} 19
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 19
- `pause` — 3 s
- `note` — 100%
- `command` — diag motor rising forward {x} 17
- `pause` — 3 s
- `command` — diag motor rising reverse {x} 17
- `pause` — 3 s

### Bring-up smoke test

Version + a quick motor up/down at 1000 steps + pan nudge. (指令.txt tail)

- id: `preset-bringup`  
- source: `指令.txt`  
- default repeat: 1  
- params: `x`=3, `y`=1000, `pause`=3

Steps:

- `command` — diag ver sw
- `pause` — 1 s
- `blank`
- `wait` — for `~ #` (≤ 15000 ms)
- `command` — diag motor rising forward {x} {y}
- `pause` — 3 s
- `command` — diag motor rising reverse {x} {y}
- `pause` — 3 s
- `command` — diag motor pan forward 2 8500
- `pause` — 3 s
- `command` — diag motor pan reverse 2 8500
- `pause` — 3 s

