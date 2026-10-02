// Finds functions referencing given strings,
// decompiles them and their direct callees, and writes the result to a file.
// Args: <output file> <depth> <string1> [string2 ...]
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.io.*;
import java.util.*;

public class DumpFromStrings extends GhidraScript {
  public void run() throws Exception {
    String[] a = getScriptArgs();
    PrintWriter out = new PrintWriter(new FileWriter(a[0]));
    int depth = Integer.parseInt(a[1]);
    Set<Function> roots = new LinkedHashSet<>();
    for (int i = 2; i < a.length; i++) {
      byte[] pat = a[i].getBytes("US-ASCII");
      Address addr = currentProgram.getMemory().getMinAddress();
      while ((addr = currentProgram.getMemory().findBytes(addr, pat, null, true, monitor)) != null) {
        out.println("// string '" + a[i] + "' at " + addr);
        for (Reference r : getReferencesTo(addr)) {
          Function f = getFunctionContaining(r.getFromAddress());
          out.println("//   referenced from " + r.getFromAddress() + " in " + (f == null ? "?" : f.getName()));
          if (f != null) roots.add(f);
        }
        addr = addr.add(1);
      }
    }
    Set<Function> all = new LinkedHashSet<>(roots);
    Set<Function> frontier = new LinkedHashSet<>(roots);
    for (int d = 0; d < depth; d++) {
      Set<Function> next = new LinkedHashSet<>();
      for (Function f : frontier) for (Function c : f.getCalledFunctions(monitor)) if (all.add(c)) next.add(c);
      frontier = next;
    }
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);
    for (Function f : all) {
      DecompileResults res = di.decompileFunction(f, 60, monitor);
      out.println("\n// ===== " + f.getName() + " @ " + f.getEntryPoint() + (roots.contains(f) ? " [root]" : ""));
      out.println(res.decompileCompleted() ? res.getDecompiledFunction().getC() : "// decompile failed");
    }
    out.close();
    println("wrote " + all.size() + " functions");
  }
}
