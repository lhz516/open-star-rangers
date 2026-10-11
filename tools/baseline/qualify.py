"""Reading and qualification of the recipe fields at one pause (P3-01 spec, runtime measurement: qualification).

`collect_pause` walks each field's pointer chain through an injected memory port, repeating the whole pass as the
recipe requires; `judge_pause` turns the collected reads into samples. A sample is qualified only when every hop is a
complete, fault-free read, the pointer chain is in range, the repeated passes agree, the page mapping and its owner
are unchanged across the reads, the stop is verified and the mission/configuration identity matches. Otherwise its
value is None, never zero. The port performs the debugger I/O; this module performs none.
"""
import math
import re
import struct
from dataclasses import dataclass, field

from le_image import PAGE_SIZE
from locate import UINT32_END, data_error
from reasons import BaselineError, ordered
from recipe import POINTER_SIZE

FORMATS = {"u8": "<B", "u16": "<H", "u32": "<I", "i16": "<h", "i32": "<i", "f32": "<f"}
_REF = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*")
REF_KEYS = ("mapping", "identity", "reads")


@dataclass(frozen=True)
class ReadResult:
    data: tuple  # one int 0-255 per byte, None for a fault marker; fewer items than requested is a short read
    pages: dict = field(default_factory=dict)  # linear page number -> physical page number (None: no lookup)


@dataclass(frozen=True)
class PageState:
    owner: str
    pages: dict  # linear page number -> physical page number (None: no lookup)


@dataclass(frozen=True)
class Hop:
    linear: int
    size: int
    result: ReadResult


@dataclass(frozen=True)
class FieldPass:
    hops: tuple
    error: object  # reason code that ended the walk, or None


@dataclass(frozen=True)
class PauseReads:
    pause: str
    before: PageState
    after: PageState
    passes: tuple  # one dict field ID -> FieldPass per repeated pass


@dataclass(frozen=True)
class StopProof:
    verified: bool
    ref: str


@dataclass(frozen=True)
class PauseEvidence:
    reads: PauseReads
    stop: StopProof
    mission: dict  # observed mission identity
    config: dict  # observed configuration identity
    refs: dict  # proof references in the private run directory: mapping, identity, reads


@dataclass(frozen=True)
class Sample:
    pause: str
    field: str
    type: str
    unit: str
    required: bool
    value: object
    reasons: tuple
    proof: dict

    @property
    def qualified(self):
        return not self.reasons

    def to_json(self):
        return {
            "pause": self.pause, "field": self.field, "status": "qualified" if self.qualified else "unqualified",
            "type": self.type, "unit": self.unit, "required": self.required, "value": self.value,
            "reasons": list(self.reasons), "proof": dict(self.proof),
        }


class ReadBudget:
    """Cumulative read-byte limit of a run; exceeding it stops reading."""

    def __init__(self, limit):
        self.limit = limit
        self.used = 0

    def consume(self, size):
        if self.used + size > self.limit:
            raise BaselineError("budget-exceeded", "reads")
        self.used += size


def page_range(linear, size):
    return range(linear // PAGE_SIZE, (linear + size - 1) // PAGE_SIZE + 1)


def read_error(result, size):
    """read-invalid, read-fault or read-short for an incomplete read; None for a complete one."""
    pages = getattr(result, "pages", None)
    if type(pages) is not dict or any(type(page) is not int or (physical is not None and type(physical) is not int)
                                      for page, physical in pages.items()):
        return "read-invalid"
    return data_error(getattr(result, "data", None), size)


def base_linear(field, mapping, registers):
    """Linear address of a field's first read: an LE object location; for a `low` field its linear address in page 0
    as given (bounded when parsed); or the register value at the stop plus the field's offset, which must lie inside
    the flat data segment (`pointer-out-of-range` otherwise)."""
    size = POINTER_SIZE if field.address.pointers else field.size
    if field.address.low:
        return field.address.offset
    if field.address.register is None:
        return mapping.linear(field.address.object, field.address.offset, size)
    linear = mapping.space.linear(registers[field.address.register] + field.address.offset, size)
    if linear is None:
        raise BaselineError("pointer-out-of-range", field.id)
    return linear


def walk_field(field, mapping, port, budget, registers=None):
    """One read of a field: each pointer hop, then the scalar. Stops at the first unusable hop."""
    pointers = field.address.pointers
    try:
        linear = base_linear(field, mapping, registers)
    except BaselineError as error:
        return FieldPass((), error.code)
    hops = []
    visited = {linear}
    for index, extra in enumerate(pointers):
        budget.consume(POINTER_SIZE)
        result = port.read(linear, POINTER_SIZE)
        hops.append(Hop(linear, POINTER_SIZE, result))
        error = read_error(result, POINTER_SIZE)
        if error:
            return FieldPass(tuple(hops), error)
        value = struct.unpack("<I", bytes(result.data))[0]
        if value == 0:
            return FieldPass(tuple(hops), "pointer-null")
        size = POINTER_SIZE if index + 1 < len(pointers) else field.size
        target = value + extra
        if target + size > UINT32_END or mapping.space.base + target + size > UINT32_END:
            return FieldPass(tuple(hops), "pointer-overflow")
        if target + size - 1 > mapping.space.limit:
            return FieldPass(tuple(hops), "pointer-out-of-range")
        linear = mapping.space.base + target
        if linear in visited:
            return FieldPass(tuple(hops), "pointer-cycle")
        visited.add(linear)
    budget.consume(field.size)
    result = port.read(linear, field.size)
    hops.append(Hop(linear, field.size, result))
    return FieldPass(tuple(hops), read_error(result, field.size))


def collect_pause(recipe, pause_id, mapping, port, budget, registers=None):
    """Reads every field of a pause `repeat_reads` times, with page states before and after the passes.

    The session layer's `port` implements the paused-debugger reads: `read(linear, size)` returns a ReadResult that
    should carry the physical lookup of every page it reads; `state(pages)` returns the current PageState, the
    address-space owner and the lookups of the given pages. `registers` (name -> value at the stop) resolves
    register-relative fields, which the recipe allows only at breakpoint stops.
    """
    pause = recipe.pause(pause_id)
    fields = [recipe.fields[name] for name in pause.fields]
    static = set()
    for item in fields:
        size = POINTER_SIZE if item.address.pointers else item.size
        try:
            static.update(page_range(base_linear(item, mapping, registers), size))
        except BaselineError:
            pass  # walk_field records the reason
    before = port.state(frozenset(static))
    passes = tuple({item.id: walk_field(item, mapping, port, budget, registers) for item in fields}
                   for _ in range(recipe.limits.repeat_reads))
    touched = frozenset(page for reads in passes for walk in reads.values() for hop in walk.hops
                        for page in page_range(hop.linear, hop.size))
    after = port.state(touched)
    return PauseReads(pause.id, before, after, passes)


def safe_ref(value, where):
    if type(value) is not str or len(value) > 200 or not _REF.fullmatch(value) or ".." in value.split("/"):
        raise BaselineError("proof-ref-invalid", where)
    return value


def _same(observed, expected):
    return (type(observed) is dict and observed.keys() == expected.keys()
            and all(type(observed[key]) is type(expected[key]) and observed[key] == expected[key] for key in expected))


def _mapping_reasons(hops, before, after):
    """Every touched page has a lookup after the reads and one before them: from the state taken before the reads
    or, for a page first reached through a pointer, from each read of it. All lookups of a page must be equal."""
    lookups = {}
    reasons = set()
    for hop in hops:
        for page in page_range(hop.linear, hop.size):
            found = lookups.setdefault(page, [])
            if page in hop.result.pages:
                found.append(hop.result.pages[page])
            elif page not in before.pages:
                reasons.add("mapping-unverified")
    for page, found in lookups.items():
        if page in before.pages:
            found.append(before.pages[page])
        if page not in after.pages:
            reasons.add("mapping-unverified")
            continue
        found.append(after.pages[page])
        if any(type(lookup) is not int for lookup in found):
            reasons.add("mapping-unverified")
        elif len(set(found)) > 1:
            reasons.add("mapping-changed")
    return reasons


def _signature(walk):
    return walk.error, tuple((hop.linear, hop.size, tuple(hop.result.data)) for hop in walk.hops)


def _decode(kind, data):
    value = struct.unpack(FORMATS[kind], bytes(data))[0]
    return value, kind != "f32" or math.isfinite(value)


def judge_pause(recipe, mapping, evidence):
    """Samples for one pause, in the pause's field order."""
    reads = evidence.reads
    pause = recipe.pause(reads.pause)
    if type(evidence.refs) is not dict or set(evidence.refs) != set(REF_KEYS):
        raise BaselineError("proof-ref-invalid", pause.id)
    refs = {key: safe_ref(evidence.refs[key], f"{pause.id}.{key}") for key in REF_KEYS}
    proof = {"mapping": refs["mapping"], "stop": safe_ref(evidence.stop.ref, f"{pause.id}.stop"),
             "identity": refs["identity"], "readability": refs["reads"], "repeat": refs["reads"]}

    common = set()
    if evidence.stop.verified is not True:
        common.add("stop-unverified")
    if not reads.before.owner == reads.after.owner == mapping.owner:
        common.add("owner-changed")
    if not (_same(evidence.mission, recipe.identity.mission) and _same(evidence.config, recipe.identity.config)):
        common.add("identity-mismatch")

    judged = []
    for name in pause.fields:
        item = recipe.fields[name]
        walks = [passed[name] for passed in reads.passes if name in passed]
        reasons = set(common)
        if len(walks) < recipe.limits.repeat_reads or len(walks) != len(reads.passes):
            reasons.add("repeat-insufficient")
        hops = [hop for walk in walks for hop in walk.hops]
        for walk in walks:
            if walk.error:
                reasons.add(walk.error)
        for hop in hops:
            error = read_error(hop.result, hop.size)
            if error:
                reasons.add(error)
        if "read-invalid" not in reasons:
            if len({_signature(walk) for walk in walks}) > 1:
                reasons.add("repeat-mismatch")
            reasons.update(_mapping_reasons(hops, reads.before, reads.after))
        value = None
        if not reasons and walks:
            value, finite = _decode(item.type, walks[0].hops[-1].result.data)
            if not finite:
                reasons.add("value-nonfinite")
        judged.append([item, value, reasons])

    values = {item.id: (value, reasons) for item, value, reasons in judged}
    for check in recipe.identity.checks:
        value, reasons = values[check.field]
        if reasons or value != check.equals:
            for _, _, sample_reasons in judged:
                sample_reasons.add("identity-mismatch")
            break

    return tuple(
        Sample(pause.id, item.id, item.type, item.unit, item.required, None if reasons else value, ordered(reasons),
               dict(proof))
        for item, value, reasons in judged)
