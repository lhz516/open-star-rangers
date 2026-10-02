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
    int depth = Integer.parseInt(a[1]);
    int count;
    try (PrintWriter out = new PrintWriter(new FileWriter(a[0]))) {
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
      Set<Function> all = FunctionTraversal.collectCallees(roots, depth, monitor);
      count = all.size();
      DecompInterface di = new DecompInterface();
      try {
        di.toggleSyntaxTree(false);
        di.openProgram(currentProgram);
        for (Function f : all) {
          DecompileResults res = di.decompileFunction(f, 60, monitor);
          out.println("\n// ===== " + f.getName() + " @ " + f.getEntryPoint() + (roots.contains(f) ? " [root]" : ""));
          out.println(res.decompileCompleted() ? res.getDecompiledFunction().getC() : "// decompile failed");
        }
      } finally {
        di.dispose();
      }
    }
    println("wrote " + count + " functions");
  }
}
