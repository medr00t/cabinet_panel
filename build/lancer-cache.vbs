' Lance le serveur du cabinet sans fenetre, et note ce qu'il affiche dans cabinet_web.log.
' Le code de sortie du serveur est renvoye : si le serveur s'arrete, Windows le relance.
Set fso = CreateObject("Scripting.FileSystemObject")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = dossier
' garde le journal raisonnable (au-dela de 5 Mo il repart a zero)
journal = dossier & "\cabinet_web.log"
If fso.FileExists(journal) Then
  If fso.GetFile(journal).Size > 5242880 Then fso.DeleteFile journal
End If
code = sh.Run("cmd /c cabinet_web.exe >> cabinet_web.log 2>&1", 0, True)
WScript.Quit code
