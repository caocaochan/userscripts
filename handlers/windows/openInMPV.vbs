Option Explicit

Dim args
Set args = WScript.Arguments

If args.Count = 0 Then
  WScript.Quit 1
End If

Dim rawUrl
rawUrl = args(0)

Dim shell
Set shell = CreateObject("WScript.Shell")

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

Dim scriptDir
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Dim ps1Path
ps1Path = fso.BuildPath(scriptDir, "openInMPV.ps1")

Dim command
command = Chr(34) & "powershell.exe" & Chr(34) & _
  " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & _
  QuoteArg(ps1Path) & " " & QuoteArg(rawUrl)

shell.Run command, 0, False

Function QuoteArg(value)
  QuoteArg = Chr(34) & Replace(value, Chr(34), "") & Chr(34)
End Function
