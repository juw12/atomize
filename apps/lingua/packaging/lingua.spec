# PyInstaller spec for the Lingua Windows app (one folder, no console).
# Build with:  powershell -File apps\lingua\scripts\build-windows.ps1
import os

APP_DIR = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(APP_DIR, "app.py")],
    pathex=[APP_DIR],
    datas=[(os.path.join(APP_DIR, "web"), "web")],
    hiddenimports=["qrcode", "qrcode.image.pil", "PIL.ImageTk"],
    excludes=["numpy", "pandas", "matplotlib", "scipy", "pytest"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Lingua",
    icon=os.path.join(SPECPATH, "lingua.ico"),
    console=False,
    upx=False,
)
coll = COLLECT(exe, a.binaries, a.datas, name="Lingua", upx=False)
