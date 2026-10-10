"""Bounded runtime CODE/DATA object correlation (docs/original/formats/executable.md, bounded runtime CODE/DATA object
correlation).

One CODE window read at a paused linear address and one DATA window at a recipe location prove where each LE object
lies in this process. Non-relocated bytes must equal the stored image exactly; relocation positions are skipped in
the byte comparison and their runtime values instead derive the target object's base. Each object's base is derived
on its own: no common shift between objects is assumed. Nothing here touches the emulator or files.
"""
import hashlib
import struct
from dataclasses import dataclass

from le_image import FIXUP_WIDTHS
from reasons import BaselineError

UINT32_END = 1 << 32
ANCHOR_BYTES = 16
MAX_CHUNK_HITS = 4096
MAX_CANDIDATES = 4096
MIN_DERIVATIONS = 2


@dataclass(frozen=True)
class AddressSpace:
    """Pointer values are offsets in this space: linear = base + value, valid while value + size - 1 <= limit."""
    base: int
    limit: int

    def __post_init__(self):
        for value in (self.base, self.limit):
            if type(value) is not int or not 0 <= value < UINT32_END:
                raise BaselineError("base-invalid", "address-space")

    def linear(self, offset, size):
        """Linear address of `size` bytes at a segment offset (e.g. a register value plus a displacement), or None
        when they do not lie inside the segment."""
        if offset < 0 or offset + size - 1 > self.limit or self.base + offset + size > UINT32_END:
            return None
        return self.base + offset


@dataclass(frozen=True)
class WindowRead:
    linear: int
    data: tuple  # one int 0-255 per byte read, None for a fault marker; fewer items than requested is a short read


@dataclass(frozen=True)
class WindowPlan:
    offset: int
    source: bytes
    masked: frozenset  # window-relative positions patched by any fixup
    pointers: tuple  # 32-bit internal pointer fixups wholly inside the window


@dataclass(frozen=True)
class CodeMatch:
    object: int
    offset: int
    bases: dict  # established object bases: the CODE object's own and those with enough pointer derivations
    derivations: tuple  # (target object, derived base) per pointer
    proof: dict


@dataclass(frozen=True)
class Mapping:
    owner: str  # opaque identity of the process/address space this mapping was proven for
    space: AddressSpace
    bases: dict
    extents: dict  # object number -> virtual size
    proof: dict

    def linear(self, number, offset, size):
        """Linear address of `size` bytes at an object offset; the range must lie inside the mapped object."""
        base = self.bases.get(number)
        if base is None:
            raise BaselineError("object-unmapped", f"object-{number}")
        if offset < 0 or offset + size > self.extents[number]:
            raise BaselineError("location-outside-object", f"object-{number}")
        return base + offset


def plan_window(image, number, offset, size):
    """The stored bytes of a window, the positions any fixup patches and the pointers that can derive bases."""
    source = image.read(number, offset, size)
    masked = set()
    pointers = []
    for fixup in image.fixups(number, offset, size):
        start = max(fixup.location, offset)
        masked.update(range(start - offset, min(fixup.location + fixup.width, offset + size) - offset))
        if fixup.pointer and offset <= fixup.location and fixup.location + FIXUP_WIDTHS[0x7] <= offset + size:
            pointers.append(fixup)
    return WindowPlan(offset, source, frozenset(masked), tuple(pointers))


def data_error(data, size):
    """read-invalid, read-fault or read-short for incomplete bytes of a `size`-byte read; None when complete."""
    if (not isinstance(data, (tuple, list)) or len(data) > size
            or any(value is not None and (type(value) is not int or not 0 <= value <= 0xFF) for value in data)):
        return "read-invalid"
    if any(value is None for value in data):
        return "read-fault"
    if len(data) < size:
        return "read-short"
    return None


def window_bytes(read, size, where):
    """The complete bytes of a window read, or read-invalid/read-fault/read-short."""
    error = data_error(read.data, size)
    if type(read.linear) is not int or not 0 <= read.linear <= UINT32_END - size:
        error = "read-invalid"
    if error:
        raise BaselineError(error, where)
    return bytes(read.data)


def _diverse(chunk):
    return len(chunk) == ANCHOR_BYTES and len(set(chunk)) >= 4 and sum(value != 0 for value in chunk) >= 8


def _find_all(haystack, needle, limit):
    hits = []
    position = haystack.find(needle)
    while position >= 0:
        if len(hits) == limit:
            return None
        hits.append(position)
        position = haystack.find(needle, position + 1)
    return hits


def _check_base(image, number, base, space):
    """The whole object must lie inside the address space: base - space.base + size - 1 <= limit."""
    relative = base - space.base
    size = image.object(number).virtual_size
    if base <= 0 or relative < 0 or relative + size - 1 > space.limit or base + size > UINT32_END:
        raise BaselineError("base-invalid", f"object-{number}")
    return base


def _derive(image, plan, live, space):
    derivations = []
    for fixup in plan.pointers:
        value = struct.unpack_from("<I", live, fixup.location - plan.offset)[0]
        base = _check_base(image, fixup.target_object, space.base + value - fixup.target_offset, space)
        derivations.append((fixup.target_object, base))
    return derivations


def _established(known, derivations):
    """Known bases plus every target with at least two derivations; any disagreement is a contradiction."""
    values = {}
    for target, base in derivations:
        values.setdefault(target, []).append(base)
    bases = dict(known)
    for target, found in values.items():
        if len(set(found)) > 1 or (target in known and found[0] != known[target]):
            raise BaselineError("mapping-contradiction", f"object-{target}")
        if len(found) >= MIN_DERIVATIONS:
            bases[target] = found[0]
    return bases


def _counts(derivations):
    counts = {}
    for target, _ in derivations:
        counts[str(target)] = counts.get(str(target), 0) + 1
    return counts


def _sha256(data):
    return hashlib.sha256(data).hexdigest()


def _code_candidate(image, window, start, live, linear, space):
    plan = plan_window(image, window.object, start, window.size)
    if any(live[i] != plan.source[i] for i in range(window.size) if i not in plan.masked):
        raise BaselineError("code-unmatched", "code")
    anchors = [at for at in range(0, window.size, ANCHOR_BYTES)
               if plan.masked.isdisjoint(range(at, at + ANCHOR_BYTES)) and _diverse(live[at:at + ANCHOR_BYTES])]
    if len(anchors) < 2 or 2 * (window.size - len(plan.masked)) < window.size:
        raise BaselineError("window-weak", "code")
    own = _check_base(image, window.object, linear - start, space)
    derivations = _derive(image, plan, live, space)
    bases = _established({window.object: own}, derivations)
    proof = {
        "object": window.object, "objectOffset": hex(start), "runtimeStart": hex(linear), "bytesCompared": window.size,
        "maskedBytes": len(plan.masked), "anchorChunks": len(anchors), "pointerDerivations": _counts(derivations),
    }
    return CodeMatch(window.object, start, bases, tuple(derivations), proof)


def correlate_code(image, window, read, space):
    """Locates a CODE window read at a paused linear address in its LE object and derives the bases it proves.

    With `window.offset` set (a breakpoint site) the match must be at that offset. In every case the match must be
    the only one: each distinctive 16-byte chunk of the runtime window is searched in the whole stored object, and
    every candidate is checked in full under its own relocation mask.
    """
    obj = image.object(window.object)
    if not obj.executable:
        raise BaselineError("object-not-executable", f"object-{window.object}")
    live = window_bytes(read, window.size, "code")
    stored = image.stored_size(window.object)
    if stored < window.size or (window.offset is not None and window.offset + window.size > stored):
        raise BaselineError("window-outside-image", "code")
    code = image.read(window.object, 0, stored)
    candidates = set() if window.offset is None else {window.offset}
    distinctive = []
    searched = []
    for at in range(0, window.size, ANCHOR_BYTES):
        chunk = live[at:at + ANCHOR_BYTES]
        if not _diverse(chunk):
            continue
        distinctive.append(at)
        hits = _find_all(code, chunk, MAX_CHUNK_HITS)
        if hits is None:
            continue
        searched.append(at)
        candidates.update(hit - at for hit in hits if 0 <= hit - at <= stored - window.size)
    if len(distinctive) < 2:
        raise BaselineError("window-weak", "code")
    if len(candidates) > MAX_CANDIDATES:
        raise BaselineError("code-ambiguous", "code")
    matches = []
    failures = set()
    for start in sorted(candidates):
        try:
            matches.append(_code_candidate(image, window, start, live, read.linear, space))
        except BaselineError as error:
            failures.add(error.code)
    if not matches:
        for code in ("mapping-contradiction", "base-invalid", "window-weak"):
            if code in failures:
                raise BaselineError(code, "code")
        raise BaselineError("code-unmatched", "code")
    if len(matches) > 1 or len(searched) < len(distinctive):
        raise BaselineError("code-ambiguous", "code")
    match = matches[0]
    if window.offset is not None and match.offset != window.offset:
        raise BaselineError("code-unmatched", "code")
    match.proof.update(candidatesChecked=len(candidates), sourceSha256=_sha256(code[match.offset:match.offset + window.size]),
                       runtimeSha256=_sha256(live))
    return match


def data_address(match, window):
    """Linear address at which the DATA window must be read in the process the CODE match came from."""
    base = match.bases.get(window.object)
    if base is None:
        raise BaselineError("object-unmapped", f"object-{window.object}")
    return base + window.offset


def prove_mapping(image, window, match, read, space, owner):
    """Checks the DATA window against the stored image and the CODE-derived bases; returns the process Mapping."""
    if type(owner) is not str or not owner:
        raise BaselineError("proof-ref-invalid", "owner")
    if read.linear != data_address(match, window):
        raise BaselineError("read-invalid", "data")
    live = window_bytes(read, window.size, "data")
    plan = plan_window(image, window.object, window.offset, window.size)
    if any(live[i] != plan.source[i] for i in range(window.size) if i not in plan.masked):
        raise BaselineError("data-mismatch", "data")
    derivations = _derive(image, plan, live, space)
    if sum(target in match.bases for target, _ in derivations) < MIN_DERIVATIONS:
        raise BaselineError("window-weak", "data")
    bases = _established({match.object: match.bases[match.object]}, list(match.derivations) + derivations)
    deltas = {str(number): base - image.object(number).preferred_base for number, base in bases.items()}
    proof = {
        "code": match.proof,
        "data": {
            "object": window.object, "objectOffset": hex(window.offset), "runtimeStart": hex(read.linear),
            "bytesCompared": window.size, "maskedBytes": len(plan.masked), "pointerDerivations": _counts(derivations),
            "sourceSha256": _sha256(plan.source), "runtimeSha256": _sha256(live),
        },
        "bases": {str(number): hex(base) for number, base in sorted(bases.items())},
        "preferredBaseDeltas": {number: hex(delta) for number, delta in sorted(deltas.items())},
        "singleCommonShift": len(set(deltas.values())) == 1,
        "addressSpace": {"base": hex(space.base), "limit": hex(space.limit)},
    }
    return Mapping(owner, space, bases, {number: image.object(number).virtual_size for number in bases}, proof)


def check_recipe_image(recipe, image):
    """Recipe locations against the verified LE image, before any session side effect."""
    for field in recipe.fields.values():
        if field.address.object is None:  # register-relative: located at the stop; `low`: bounded when parsed
            continue
        obj = image.object(field.address.object)
        first = 4 if field.address.pointers else field.size
        if field.address.offset + first > obj.virtual_size:
            raise BaselineError("location-outside-object", field.id)
    for device in recipe.devices.values():
        if device.object is not None and device.offset + device.size > image.object(device.object).virtual_size:
            raise BaselineError("location-outside-object", device.id)
    for pause in recipe.pauses:
        if pause.stop.site is not None:
            obj = image.object(pause.stop.site.object)
            if not obj.executable:
                raise BaselineError("object-not-executable", pause.id)
            if pause.stop.site.offset >= obj.virtual_size:
                raise BaselineError("location-outside-object", pause.id)
    code = recipe.code_window
    if not image.object(code.object).executable:
        raise BaselineError("object-not-executable", "code")
    stored = image.stored_size(code.object)
    if stored < code.size or (code.offset is not None and code.offset + code.size > stored):
        raise BaselineError("window-outside-image", "code")
    data = recipe.data_window
    if len(plan_window(image, data.object, data.offset, data.size).pointers) < MIN_DERIVATIONS:
        raise BaselineError("window-weak", "data")
