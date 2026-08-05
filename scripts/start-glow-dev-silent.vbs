' Silent launcher for Glow Vite (used from Windows Startup)
Option Explicit
Dim sh, fso, root, cmd
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
cmd = "cmd /c """ & root & "\scripts\start-glow-dev.cmd"""
sh.Run cmd, 0, False
