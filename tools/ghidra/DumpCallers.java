// Decompiles all callers of a function.
// Args: <output file> <callee addr>
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import java.io.*;
import java.util.*;

public class DumpCallers extends GhidraScript {
  public void run() throws Exception {
    String[] a = getScriptArgs();
    Set<Function> callers = new LinkedHashSet<>();
    try (PrintWriter out = new PrintWriter(new FileWriter(a[0]))) {
      Function callee = getFunctionAt(toAddr(a[1]));
      for (Reference r : getReferencesTo(callee.getEntryPoint())) {
        Function f = getFunctionContaining(r.getFromAddress());
        out.println("// call from " + r.getFromAddress() + " in " + (f == null ? "?" : f.getName()));
        if (f != null) callers.add(f);
      }
      DecompInterface di = new DecompInterface();
      try {
        di.toggleSyntaxTree(false);
        di.openProgram(currentProgram);
        for (Function f : callers) {
          DecompileResults r = di.decompileFunction(f, 120, monitor);
          out.println("\n// ===== " + f.getName() + " @ " + f.getEntryPoint());
          out.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// failed");
        }
      } finally {
        di.dispose();
      }
    }
    println("callers " + callers.size());
  }
}
