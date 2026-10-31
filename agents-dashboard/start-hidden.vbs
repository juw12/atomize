' ============================================================
'  Virtual Bots Office - silent bridge launcher
'  Starts the Python bridge (server.py --port 8790) using
'  pythonw.exe so NO console window is shown. Used by the
'  Startup shortcut so the bridge is always-on in background.
' ============================================================
Option Explicit

Dim fso, shell, scriptDir, pyw, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Folder this script lives in (agents-dashboard) = working dir + server.py location
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Prefer the per-user pythonw.exe under %LOCALAPPDATA%; fall back to PATH if missing.
pyw = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe")
If Not fso.FileExists(pyw) Then
    pyw = "pythonw.exe"
End If

' Quote everything so paths with spaces work; run window style 0 (hidden).
cmd = """" & pyw & """ """ & scriptDir & "\server.py"" --port 8790"

On Error Resume Next
shell.CurrentDirectory = scriptDir
shell.Run cmd, 0, False
