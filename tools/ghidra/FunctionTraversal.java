import ghidra.program.model.listing.Function;
import ghidra.util.task.TaskMonitor;
import java.util.LinkedHashSet;
import java.util.Set;

public final class FunctionTraversal {
  private FunctionTraversal() {}

  public static Set<Function> collectCallees(Set<Function> roots, int depth, TaskMonitor monitor) {
    Set<Function> all = new LinkedHashSet<>(roots);
    Set<Function> frontier = new LinkedHashSet<>(roots);
    for (int d = 0; d < depth; d++) {
      Set<Function> next = new LinkedHashSet<>();
      for (Function f : frontier) {
        for (Function callee : f.getCalledFunctions(monitor)) {
          if (all.add(callee)) next.add(callee);
        }
      }
      frontier = next;
    }
    return all;
  }
}
