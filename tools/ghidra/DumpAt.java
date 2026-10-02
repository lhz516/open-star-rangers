// Ensures functions exist around given addresses,
// then decompiles them plus callees to the given depth.
// Args: <output file> <depth> <addr> [addr ...]
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import java.io.*;
import java.util.*;

public class DumpAt extends GhidraScript {
  Function ensure(Address p) throws Exception {
    Listing l = currentProgram.getListing();
    Instruction ins = l.getInstructionContaining(p);
    if (ins == null) {
      for (int back = 1; back <= 8 && ins == null; back++) {
        Address s = p.subtract(back);
        new DisassembleCommand(s, null, true).applyTo(currentProgram, monitor);
        Instruction t = l.getInstructionContaining(p);
        if (t != null && t.getAddress().equals(s)) ins = t;
      }
    }
    if (ins == null) return null;
    Function f = getFunctionContaining(ins.getAddress());
    if (f != null) return f;
    Instruction start = ins;
    while (true) {
      Instruction prev = l.getInstructionBefore(start.getAddress());
      if (prev == null || !prev.getMaxAddress().next().equals(start.getAddress())) break;
      String m = prev.getMnemonicString();
      if (m.startsWith("RET") || (m.equals("JMP") && prev.getFlowType().isUnConditional())) break;
      if (getFunctionAt(prev.getAddress()) != null) { start = prev; break; }
      start = prev;
    }
    new CreateFunctionCmd(start.getAddress()).applyTo(currentProgram, monitor);
    return getFunctionContaining(ins.getAddress());
  }
  public void run() throws Exception {
    String[] a = getScriptArgs();
    PrintWriter out = new PrintWriter(new FileWriter(a[0]));
    int depth = Integer.parseInt(a[1]);
    Set<Function> roots = new LinkedHashSet<>();
    for (int i = 2; i < a.length; i++) {
      Function f = ensure(toAddr(a[i]));
      out.println("// " + a[i] + " -> " + (f == null ? "none" : f.getName() + " @ " + f.getEntryPoint() + " size " + f.getBody().getNumAddresses()));
      if (f != null) roots.add(f);
    }
    Set<Function> all = new LinkedHashSet<>(roots), frontier = new LinkedHashSet<>(roots);
    for (int d = 0; d < depth; d++) {
      Set<Function> next = new LinkedHashSet<>();
      for (Function f : frontier) for (Function c : f.getCalledFunctions(monitor)) if (all.add(c)) next.add(c);
      frontier = next;
    }
    DecompInterface di = new DecompInterface();
    di.openProgram(currentProgram);
    for (Function f : all) {
      DecompileResults r = di.decompileFunction(f, 120, monitor);
      out.println("\n// ===== " + f.getName() + " @ " + f.getEntryPoint() + (roots.contains(f) ? " [root]" : ""));
      out.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// decompile failed: " + r.getErrorMessage());
    }
    out.close();
    println("wrote " + all.size() + " functions");
  }
}
