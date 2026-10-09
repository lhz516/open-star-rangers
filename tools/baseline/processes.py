"""The owned emulator process: launch on a private PTY, ownership proof and bounded reclaim (P3-01 subtask 02).

The emulator is started in a new session, so its process group ID is its own PID. Only that child (while not yet
reaped, its PID cannot be reused) and its process group (POSIX does not reuse a group ID while the group exists) are
ever signalled; an existing DOSBox-X found before launch is refused, never attached to or terminated. Reclaim sends
SIGTERM to the group, escalates to SIGKILL after a bounded grace period (an emulator at the title screen can ignore
SIGTERM), then waits one bounded total for the child to be reaped and the PID and the group to be gone, and records
how long that took after SIGKILL.
"""
import errno
import fcntl
import os
import pty
import select
import signal
import struct
import subprocess
import termios
import time

from reasons import BaselineError
from screen import COLS, ROWS

TERM_GRACE = 3.0
KILL_WAIT = 30.0
OWNERSHIP_WAIT = 10.0


def _ps(arguments):
    try:
        result = subprocess.run(["ps", *arguments], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode in (0, 1) else None


def process_names():
    """(pid, executable basename) of every process; None when the process table cannot be read."""
    output = _ps(["-A", "-o", "pid=", "-o", "comm="])
    if output is None:
        return None
    result = []
    for line in output.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and parts[0].isdigit():
            result.append((int(parts[0]), os.path.basename(parts[1].strip())))
    return result


def emulators(processes, name, exclude=()):
    """PIDs of running processes that are the emulator or any DOSBox build (case-insensitive executable name)."""
    if processes is None:
        raise BaselineError("emulator-already-running", "process-table")
    return sorted(pid for pid, comm in processes
                  if (comm.lower() == name.lower() or comm.lower().startswith("dosbox")) and pid not in exclude)


def _alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _group_alive(pgid):
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


class PtyTransport:
    """The owned emulator child on a private PTY of ROWS x COLS."""

    def __init__(self, argv, cwd):
        self.master, slave = pty.openpty()
        try:
            fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", ROWS, COLS, 0, 0))
            environment = dict(os.environ, TERM="xterm", LINES=str(ROWS), COLUMNS=str(COLS))
            self.child = subprocess.Popen(argv, cwd=cwd, stdin=slave, stdout=slave, stderr=slave, env=environment,
                                          start_new_session=True, close_fds=True)
        except BaseException:
            os.close(self.master)
            raise
        finally:
            os.close(slave)
        self.pid = self.child.pid
        self.closed = False

    def write(self, data):
        view = memoryview(data)
        while view:
            try:
                written = os.write(self.master, view)
            except OSError:
                raise BaselineError("child-exited", "emulator") from None
            view = view[written:]

    def read(self, timeout):
        if self.closed:
            raise BaselineError("child-exited", "emulator")
        ready, _, _ = select.select([self.master], [], [], timeout)
        if not ready:
            return b""
        try:
            data = os.read(self.master, 65536)
        except OSError as error:
            if error.errno == errno.EIO:
                raise BaselineError("child-exited", "emulator") from None
            raise
        if not data:
            raise BaselineError("child-exited", "emulator")
        return data

    def poll(self):
        return self.child.poll()

    def verify_owner(self, name, clock, sleep, limit=OWNERSHIP_WAIT):
        """Proves that the child is the emulator executable in its own process group (the launcher script execs it).
        Returns the ownership proof; raises emulator-unverified."""
        end = clock() + limit
        while True:
            if self.child.poll() is not None:
                raise BaselineError("child-exited", "emulator")
            output = _ps(["-p", str(self.pid), "-o", "comm="]) or ""
            comm = os.path.basename(output.strip())
            if comm.lower() == name.lower() and os.getpgid(self.pid) == self.pid:
                return {"pid": self.pid, "processGroup": self.pid, "executable": comm, "spawnedByThisRun": True}
            if clock() >= end:
                raise BaselineError("emulator-unverified", "emulator")
            sleep(0.1)

    def reclaim(self, grace=TERM_GRACE, kill_wait=KILL_WAIT):
        """SIGTERM to the owned group, SIGKILL after `grace` seconds, then wait at most `kill_wait` seconds in total for
        the child to be reaped and the PID and group to be gone. `killWait` records that wait when SIGKILL was sent."""
        report = {"pid": self.pid, "signals": [], "exitedBeforeReclaim": self.child.poll() is not None}
        if self.child.poll() is None:
            self._signal_group(signal.SIGTERM, report)
            try:
                self.child.wait(timeout=grace)
            except subprocess.TimeoutExpired:
                pass
        killed = self.child.poll() is None or _group_alive(self.pid)
        if killed:
            self._signal_group(signal.SIGKILL, report)
        started = time.monotonic()
        deadline = started + kill_wait
        state = self._exit_state()
        while not state["passed"] and (remaining := deadline - time.monotonic()) > 0:
            time.sleep(min(0.05, remaining))
            state = self._exit_state()
        waited = time.monotonic() - started
        report.update(state)
        report["killWait"] = None if not killed else {
            "seconds": round(waited, 3), "limit": kill_wait, "limitReached": not state["passed"]}
        if not self.closed:
            os.close(self.master)
            self.closed = True
        return report

    def _exit_state(self):
        """One observation of the reap, the PID and the group; the last one within the bound is the reported result."""
        code = self.child.poll()
        state = {"returnCode": code, "reaped": code is not None}
        state["pidGone"] = state["reaped"] and not _alive(self.pid)
        state["groupGone"] = not _group_alive(self.pid)
        state["passed"] = state["reaped"] and state["pidGone"] and state["groupGone"]
        return state

    def _signal_group(self, number, report):
        try:
            os.killpg(self.pid, number)
            report["signals"].append(signal.Signals(number).name)
        except ProcessLookupError:
            pass
        except PermissionError:  # macOS: the group holds only an unreaped (zombie) member
            report["signals"].append(signal.Signals(number).name + ":zombie-group")
