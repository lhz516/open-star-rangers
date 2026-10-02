// Decompiles every function to one file.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;

public class DecompileAll extends GhidraScript {
  public void run() throws Exception {
    int n = 0, fail = 0;
    try (PrintWriter out = new PrintWriter(new FileWriter(getScriptArgs()[0]))) {
      DecompInterface di = new DecompInterface();
      try {
        di.toggleSyntaxTree(false);
        di.openProgram(currentProgram);
        for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
          DecompileResults r = di.decompileFunction(f, 60, monitor);
          out.println("\n// ===== " + f.getName() + " @ " + f.getEntryPoint());
          if (r.decompileCompleted()) out.println(r.getDecompiledFunction().getC()); else { out.println("// failed"); fail++; }
          n++;
        }
      } finally {
        di.dispose();
      }
    }
    println("decompiled " + n + " failed " + fail);
  }
}
