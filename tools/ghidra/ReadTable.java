// Dumps a table of 16-byte records: u32 words and C strings they point to.
// Args: <start addr> <count addr or count> <stride>
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.mem.*;

public class ReadTable extends GhidraScript {
  String str(long v) {
    try {
      Address a = toAddr(v); StringBuilder sb = new StringBuilder();
      for (int i = 0; i < 16; i++) { byte b = getByte(a.add(i)); if (b == 0) break; if (b < 32 || b > 126) return null; sb.append((char) b); }
      return sb.length() > 0 ? sb.toString() : null;
    } catch (Exception e) { return null; }
  }
  public void run() throws Exception {
    String[] a = getScriptArgs();
    Address start = toAddr(a[0]);
    int count = a[1].startsWith("0x") ? getInt(toAddr(a[1])) : Integer.parseInt(a[1]);
    int stride = Integer.parseInt(a[2]);
    println("count=" + count);
    for (int i = 0; i < count; i++) {
      StringBuilder sb = new StringBuilder("rec " + i + ":");
      for (int w = 0; w < stride / 4; w++) {
        long v = getInt(start.add(i * stride + w * 4)) & 0xffffffffL;
        String s = str(v);
        sb.append(String.format(" %08x", v)).append(s != null ? "('" + s + "')" : "");
      }
      println(sb.toString());
    }
  }
}
