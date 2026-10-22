Virtual Bots Office - quick guide
=================================

OPEN THE APP
------------
- Click the desktop shortcut "Virtual Bots Office".
  It starts the bridge if needed, then opens the dashboard as a
  chromeless app window (Edge/Chrome --app), or your default browser.

WHAT RUNS IN THE BACKGROUND
---------------------------
- A small Python "bridge" (server.py --port 8790) serves the dashboard at
  http://127.0.0.1:8790/ and connects it to the local OpenCode server.
- It is launched hidden (no window) by start-hidden.vbs, using pythonw.exe.
- The "Virtual Bots Office (bridge)" shortcut in your Startup folder runs it
  automatically every time you log in, so it is always ready.

HOW TO STOP IT
--------------
- Open Task Manager (Ctrl+Shift+Esc), find "pythonw.exe" (or "Python"), and
  End task. Because it runs hidden there is no console window and therefore
  no Ctrl+C; Task Manager (or the command below) is the way to stop it.
- Command line equivalent:
    Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" |
      Where-Object { $_.CommandLine -like '*server.py*' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

LIVE vs SIM MODE
----------------
- The dashboard shows LIVE data only while the OpenCode desktop app (opencode
  serve) is running.
- If OpenCode is not running, the bridge stays up and the dashboard shows SIM
  (simulated) data so it remains usable. Start the OpenCode desktop app to get
  Live mode.

NOTES
-----
- Port: 8790 (the bridge); OpenCode upstream: 4096.
- No installs required; everything uses what is already on the machine.
- Files live in: agents-dashboard\
    open-app.bat        - desktop launcher
    start-hidden.vbs    - silent background bridge launcher
    assets\app.ico      - shortcut icon
