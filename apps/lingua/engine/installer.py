"""Per-user install / uninstall for the Windows build (no admin rights needed).

``Lingua.exe --install`` copies the program folder to
``%LOCALAPPDATA%\\Programs\\Lingua``, adds Start-menu and Desktop shortcuts and
an entry under *Settings -> Apps* (HKCU uninstall key). ``--uninstall`` removes
them again. User data in ``%APPDATA%\\lingua`` (settings, history) is kept.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

from engine.version import RELEASE_REPO, __version__

APP_NAME = "Lingua"
EXE_NAME = "Lingua.exe"
UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Lingua"
KEEP_FILES = ("lingua.env",)


def default_install_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser(r"~\AppData\Local")
    return os.path.join(base, "Programs", APP_NAME)


def shortcut_paths() -> list[str]:
    appdata = os.environ.get("APPDATA") or os.path.expanduser(r"~\AppData\Roaming")
    start_menu = os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", APP_NAME + ".lnk")
    desktop = os.path.join(_desktop_dir(), APP_NAME + ".lnk")
    return [start_menu, desktop]


def _desktop_dir() -> str:
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders",
        ) as key:
            value, _ = winreg.QueryValueEx(key, "Desktop")
            return os.path.expandvars(value)
    except OSError:
        return os.path.join(os.path.expanduser("~"), "Desktop")


def is_installed_copy(exe_dir: str | None = None) -> bool:
    exe_dir = exe_dir or os.path.dirname(sys.executable)
    return os.path.normcase(os.path.abspath(exe_dir)) == os.path.normcase(default_install_dir())


def copy_program(src_dir: str, dest_dir: str) -> None:
    """Copy the program folder, keeping an existing ``lingua.env`` in dest."""
    os.makedirs(dest_dir, exist_ok=True)
    for name in os.listdir(src_dir):
        src = os.path.join(src_dir, name)
        dst = os.path.join(dest_dir, name)
        if name in KEEP_FILES and os.path.exists(dst):
            continue
        if os.path.isdir(src):
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)


def create_shortcut(link_path: str, target: str, workdir: str, description: str = "Lingua") -> bool:
    """Create a .lnk via the Windows Script Host (inline PowerShell command)."""
    os.makedirs(os.path.dirname(link_path), exist_ok=True)

    def q(text: str) -> str:
        return "'" + text.replace("'", "''") + "'"

    command = (
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut({link});"
        "$s.TargetPath={target};$s.WorkingDirectory={wd};"
        "$s.IconLocation={icon};$s.Description={desc};$s.Save()"
    ).format(link=q(link_path), target=q(target), wd=q(workdir), icon=q(target + ",0"), desc=q(description))
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
        capture_output=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        timeout=30,
    )
    return result.returncode == 0 and os.path.exists(link_path)


def _folder_size_kb(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total // 1024


def register(install_dir: str, version: str = __version__) -> None:
    """Add/refresh the entry shown in Settings -> Apps (current user only)."""
    import winreg

    exe = os.path.join(install_dir, EXE_NAME)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY) as key:
        values = {
            "DisplayName": APP_NAME,
            "DisplayVersion": version,
            "Publisher": "juw12",
            "InstallLocation": install_dir,
            "DisplayIcon": exe + ",0",
            "UninstallString": '"' + exe + '" --uninstall',
            "URLInfoAbout": "https://github.com/" + RELEASE_REPO,
        }
        for name, value in values.items():
            winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
        winreg.SetValueEx(key, "NoModify", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "NoRepair", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(key, "EstimatedSize", 0, winreg.REG_DWORD, _folder_size_kb(install_dir))


def registered_version() -> str | None:
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY) as key:
            return str(winreg.QueryValueEx(key, "DisplayVersion")[0])
    except OSError:
        return None


def refresh_registration() -> None:
    """After a self-update, keep the Apps entry's version in sync."""
    if is_installed_copy() and registered_version() not in (None, __version__):
        try:
            register(default_install_dir())
        except OSError:
            pass


def install(src_dir: str | None = None, dest_dir: str | None = None, shortcuts: bool = True) -> str:
    """Install (or repair) Lingua for the current user; returns the installed exe path."""
    src_dir = os.path.abspath(src_dir or os.path.dirname(sys.executable))
    dest_dir = os.path.abspath(dest_dir or default_install_dir())
    if not os.path.isfile(os.path.join(src_dir, EXE_NAME)):
        raise FileNotFoundError(EXE_NAME + " not found in " + src_dir)
    if os.path.normcase(src_dir) != os.path.normcase(dest_dir):
        copy_program(src_dir, dest_dir)
    exe = os.path.join(dest_dir, EXE_NAME)
    if shortcuts:
        for link in shortcut_paths():
            create_shortcut(link, exe, dest_dir, "Lingua - read pictures and translate captions")
    register(dest_dir)
    return exe


def uninstall(install_dir: str | None = None, remove_files: bool = True) -> None:
    """Remove shortcuts, the Apps entry and (after exit) the program folder."""
    install_dir = os.path.abspath(install_dir or default_install_dir())
    for link in shortcut_paths():
        try:
            os.remove(link)
        except OSError:
            pass
    try:
        import winreg

        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, UNINSTALL_KEY)
    except OSError:
        pass
    if remove_files and os.path.isdir(install_dir):
        # The running exe lives in this folder, so delete it from a helper after we exit.
        subprocess.Popen(  # noqa: S603
            ["cmd.exe", "/c", 'timeout /t 2 /nobreak >nul & rmdir /s /q "' + install_dir + '"'],
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
            close_fds=True,
            cwd=os.environ.get("TEMP", "C:\\"),
        )
