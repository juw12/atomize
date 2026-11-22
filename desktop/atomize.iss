; Atomize for Windows - per-user installer (no admin rights). build.py compiles it with:
;   iscc /DAppVersion=1.0.0 /DSourceDir=<dist\Atomize> /DOutputDir=<dist> /DIconFile=<build\atomize.ico> atomize.iss
; Installs to %LOCALAPPDATA%\Programs\Atomize, adds Atomize to the Start menu (and optionally the desktop) and lists it
; in Settings > Apps. The window keeps its data (what you saved in it) in %LOCALAPPDATA%\Atomize, which
; uninstalling leaves in place so a reinstall finds it again.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "dist\Atomize"
#endif
#ifndef OutputDir
  #define OutputDir "dist"
#endif
#ifndef IconFile
  #define IconFile "build\atomize.ico"
#endif

[Setup]
AppId={{E81247BA-698B-569E-A6DE-E1E1C366EEFB}
AppName=Atomize
AppVersion={#AppVersion}
AppVerName=Atomize {#AppVersion}
AppPublisher=Juwen Lie
AppPublisherURL=https://juw12.github.io/atomize/
AppSupportURL=https://github.com/juw12/atomize
DefaultDirName={autopf}\Atomize
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=Atomize-Windows-Setup
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\Atomize.exe
UninstallDisplayName=Atomize
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userprograms}\Atomize"; Filename: "{app}\Atomize.exe"; Comment: "Paste one article and get LinkedIn posts, a tweet thread"
Name: "{userdesktop}\Atomize"; Filename: "{app}\Atomize.exe"; Comment: "Paste one article and get LinkedIn posts, a tweet thread"; Tasks: desktopicon

[Run]
Filename: "{app}\Atomize.exe"; Description: "{cm:LaunchProgram,Atomize}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\Atomize.exe"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopAtomize"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Result := '';
  { Updating: close an open Atomize window first so its files can be replaced. }
  if FileExists(ExpandConstant('{app}\Atomize.exe')) then
    Exec(ExpandConstant('{app}\Atomize.exe'), '--stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
