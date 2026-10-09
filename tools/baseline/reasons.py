"""Closed set of stable reason codes for the runtime measurement tool (P3-01).

Recipe validation, LE location, reading qualification, the report and the session layer's terminal output all use
these codes. A code names a failure class only: it never carries original bytes, readings or private paths.
"""

REASONS = (
    # Recipe document
    "recipe-too-large",
    "recipe-json-invalid",
    "recipe-version-unsupported",
    "recipe-key-unknown",
    "recipe-key-missing",
    "recipe-type-invalid",
    "recipe-value-invalid",
    "recipe-id-duplicate",
    "recipe-reference-invalid",
    "recipe-empty",
    "recipe-limit-invalid",
    "recipe-budget-exceeded",
    "recipe-address-invalid",
    # Source identity
    "source-mismatch",
    # LE image and recipe locations
    "le-invalid",
    "object-missing",
    "object-not-executable",
    "location-outside-object",
    "window-outside-image",
    "window-weak",
    # CODE/DATA correlation
    "code-unmatched",
    "code-ambiguous",
    "data-mismatch",
    "mapping-contradiction",
    "base-invalid",
    "object-unmapped",
    # Readings
    "read-invalid",
    "read-fault",
    "read-short",
    "pointer-null",
    "pointer-cycle",
    "pointer-overflow",
    "pointer-out-of-range",
    "budget-exceeded",
    "repeat-insufficient",
    "repeat-mismatch",
    "mapping-unverified",
    "mapping-changed",
    "owner-changed",
    "stop-unverified",
    "identity-mismatch",
    "value-nonfinite",
    "proof-ref-invalid",
    # Report and run
    "report-invalid",
    "samples-empty",
    "samples-missing",
    "samples-unplanned",
    "samples-order",
    "samples-unqualified",
    "integrity-failed",
    "cleanup-failed",
    "run-unfinished",
    "run-cancelled",
    # Session layer (subtask 02): the rejection classes AC-07 and the session contract enumerate
    "emulator-already-running",
    "session-busy",
    "emulator-unverified",
    "private-copy-invalid",
    "debugger-unparsed",
    "breakpoint-unconfirmed",
    "breakpoint-wrong-hit",
    "wait-timeout",
    "run-timeout",
    "child-exited",
    "output-path-invalid",
    "output-exists",
    "report-write-failed",
    "log-budget-exceeded",
    "original-changed",
    "operator-invalid",
    "tool-error",
)

REASON_SET = frozenset(REASONS)
_ORDER = {code: index for index, code in enumerate(REASONS)}


def ordered(codes):
    """Unique codes in the stable order of REASONS."""
    if not REASON_SET.issuperset(codes):
        raise ValueError("unknown reason code")
    return tuple(sorted(set(codes), key=_ORDER.__getitem__))


class BaselineError(Exception):
    """A rejection with a stable code. `where` is a safe location (recipe path, window or field ID), never data."""

    def __init__(self, code, where=None):
        if code not in REASON_SET:
            raise ValueError("unknown reason code")
        self.code = code
        self.where = where
        super().__init__(code if where is None else f"{code} at {where}")
