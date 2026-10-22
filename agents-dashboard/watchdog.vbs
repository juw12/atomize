' Virtual Bots Office - watchdog
' Keeps the local bridge running: checks /api/health every ~60s and
' restarts the bridge (hidden) if it is not answering.
' Run this hidden at login instead of start-hidden.vbs so it self-heals.
Option Explicit

Sub Main()
    Dim fso, shell, scriptDir
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set shell = CreateObject("WScript.Shell")
    scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

    Do
        If Not IsBridgeUp() Then
            On Error Resume Next
            shell.CurrentDirectory = scriptDir
            shell.Run "wscript.exe """ & scriptDir & "\start-hidden.vbs""", 0, False
            On Error Goto 0
            WScript.Sleep 15000   ' give it time to boot
        End If
        WScript.Sleep 45000
    Loop
End Sub

Function IsBridgeUp()
    Dim req, ok
    ok = False
    On Error Resume Next
    Set req = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    req.setTimeouts 1500, 1500, 1500, 2500
    req.open "GET", "http://127.0.0.1:8790/api/health", False
    req.send
    If Err.Number = 0 Then
        If req.status = 200 Then ok = True
    End If
    Err.Clear
    On Error Goto 0
    Set req = Nothing
    IsBridgeUp = ok
End Function

Main
