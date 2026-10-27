# PyInstaller spec for the Lingua Windows app (one folder, no console).
# Build with:  powershell -File apps\lingua\scripts\build-windows.ps1
import os

from PyInstaller.utils.hooks import collect_all

# Offline translation engine (CTranslate2 + tokenizers + Traditional-Chinese converter).
_datas, _binaries, _hidden = [], [], []
for _pkg in ("ctranslate2", "sentencepiece", "sacremoses", "subword_nmt", "opencc"):
    _d, _b, _h = collect_all(_pkg)
    _datas += _d
    _binaries += _b
    _hidden += _h

APP_DIR = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(APP_DIR, "app.py")],
    pathex=[APP_DIR],
    datas=[(os.path.join(APP_DIR, "web"), "web")] + _datas,
    binaries=_binaries,
    hiddenimports=["qrcode", "qrcode.image.pil", "PIL.ImageTk"] + _hidden,
    excludes=["pandas", "matplotlib", "scipy", "pytest", "torch"],
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
