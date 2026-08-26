Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredMan {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public int Flags; public int Type; public IntPtr TargetName; public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int Attribute; public IntPtr TargetAlias; public IntPtr UserName;
  }
  [DllImport("advapi32", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credential);
  [DllImport("advapi32")] public static extern void CredFree(IntPtr cred);
  public static string Read(string target) {
    IntPtr ptr;
    if (!CredRead(target, 1, 0, out ptr)) return null;
    var c = (Credential)Marshal.PtrToStructure(ptr, typeof(Credential));
    var bytes = new byte[c.CredentialBlobSize];
    Marshal.Copy(c.CredentialBlob, bytes, 0, c.CredentialBlobSize);
    CredFree(ptr);
    return Encoding.UTF8.GetString(bytes);
  }
}
'@
$t = [CredMan]::Read('Supabase CLI:supabase')
if ($t) { [Console]::Out.Write($t) }
