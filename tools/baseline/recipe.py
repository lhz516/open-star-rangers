"""Measurement recipe, schemaVersion 1: parsing and validation before any session side effect (P3-01 spec, tool data
contract).

A recipe is metadata only: the expected source fingerprint, the selected mission/configuration identity, field
locations (LE objects, registers at a breakpoint stop, or `low` linear addresses in page 0, the real-mode vectors and
BIOS data area), scalar types, unit labels and run limits, plus the few allowlisted settings of its private copy
(fixed emulator cycles, the game's own STARTUP_PRACTICE and CURR_LEVEL). It may also declare input stimuli (P3-06
subtask 22): at a named pause, one keystroke, BIOS shift-flag bits or a value in a declared input-device field
(`inputs.py`). A breakpoint stop may name alternative sites in one LE object and a condition on a register at the
hit (literal values or readings of earlier pauses); a field may be addressed from an integer reading of an earlier
pause (`bound`). Every key is known, every value has a fixed JSON type and every string is a restricted token, so a
recipe cannot carry expressions, debugger commands or shell strings.
"""
import hashlib
import json
import math
import re
import struct
from dataclasses import dataclass

from inputs import REGISTERS, SHIFT_BITS
from le_image import PAGE_SIZE
from reasons import BaselineError

SCHEMA_VERSION = 1
MAX_RECIPE_BYTES = 256 * 1024
UINT32_END = 1 << 32

SCALAR_SIZES = {"u8": 1, "u16": 2, "u32": 4, "i16": 2, "i32": 4, "f32": 4}
SCALAR_RANGES = {"u8": (0, 0xFF), "u16": (0, 0xFFFF), "u32": (0, 0xFFFFFFFF), "i16": (-0x8000, 0x7FFF),
                 "i32": (-0x80000000, 0x7FFFFFFF)}
POINTER_SIZE = 4
STOP_KINDS = ("breakpoint", "vrt")
STIMULUS_KINDS = ("key", "shift", "device")
REGISTER_OFFSETS = (-0x10000, 0xFFFF)  # a field or device addressed from a register (or a bound reading)
ALTERNATIVE_SITES = (2, 4)  # offsets of a breakpoint stop with alternative sites
CONDITION_VALUES = (1, 16)  # values of a stop condition
DEFAULT_SKIPPED_HITS = 100_000
# Bytes one stimulus reads and writes, for the static budget check: key: buffer pointers and bounds, then the slot
# and the tail each read before, written and read back; shift: the flags, then the same three; device: three times.
KEY_STIMULUS_BYTES = 4 + 4 + 3 * (2 + 2)
SHIFT_STIMULUS_BYTES = 1 + 3

# Tool ceilings: research-tool protection, not original values or fidelity tolerances.
CEILINGS = {
    "runSeconds": 24 * 3600,
    "maxPauses": 2048,
    "maxFields": 256,
    "maxChainDepth": 8,
    "repeatReads": 16,
    "maxReadBytes": 16 * 1024 * 1024,
    "maxLogBytes": 4 * 1024 * 1024 * 1024,
    "devices": 64,
    "stimuli": 256,
    "maxSkippedHits": 1_000_000,
}
CODE_WINDOW_SIZES = (64, 512)  # inclusive, multiple of 16 (anchor chunks)
DATA_WINDOW_SIZES = (16, 512)
MAX_OBJECT_NUMBER = 255
MAX_IDENTITY_KEYS = 16
CYCLES_RANGE = (1000, 2_000_000)  # fixed DOSBox-X cycles a recipe may request for its private configuration
LEVEL_RANGE = (0, 100)  # each raw difficulty of CURR_LEVEL (practice, campaign), the range the game's parser keeps

_ID = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:[-_.][A-Za-z0-9]+)*")
_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/:+-]*")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_TOKEN_MAX = 64


@dataclass(frozen=True)
class Location:
    object: int
    offset: int


@dataclass(frozen=True)
class Binding:
    """The agreed reading of an integer field at an earlier pause of the same run, or (`register`) the 32-bit register
    value recorded at an earlier breakpoint pause; exactly one of `field` and `register` is set."""
    pause: str
    field: object = None
    register: object = None


@dataclass(frozen=True)
class Address:
    object: object  # LE object number, or None for a register, bound or page-0 linear (`low`) address
    offset: int  # object offset, the signed offset from the register value or bound reading, or the linear address
    pointers: tuple  # non-negative offsets added to each dereferenced 32-bit pointer
    register: object = None  # register name at a breakpoint stop (EAX ... ESP), or None
    bound: object = None  # Binding whose reading is the base (as a register value would be), or None

    @property
    def low(self):
        """A `{"low": n}` field address: a linear address in page 0, neither an LE object, a register nor bound."""
        return self.object is None and self.register is None and self.bound is None


@dataclass(frozen=True)
class Field:
    id: str
    address: Address
    type: str
    unit: str
    required: bool

    @property
    def size(self):
        return SCALAR_SIZES[self.type]


@dataclass(frozen=True)
class Condition:
    """A breakpoint hit is the pause only when the register's value is (`include`) or is not in `values`. With
    `sites` (a strict subset of the stop's alternatives, recipe key `at`), the test applies only to hits at those
    sites; a hit at any other alternative is the pause unconditionally."""
    register: str
    include: bool
    values: tuple  # ints 0..0xFFFFFFFF and Bindings, resolved at the stop
    sites: tuple = ()  # Locations the condition is limited to; empty: every site of the stop

    def applies(self, site):
        return not self.sites or site in self.sites

    def to_json(self, resolved):
        out = {"register": self.register, "in" if self.include else "notIn": [f"{value:x}" for value in resolved]}
        if self.sites:
            out["at"] = [f"{site.offset:x}" for site in self.sites]
        return out


@dataclass(frozen=True)
class Stop:
    kind: str
    site: object  # Location for a breakpoint (the first alternative of `offsets`), None for a VRT stop
    alternatives: tuple = ()  # every Location of a breakpoint stop declared with `offsets`; empty for `offset`
    when: object = None  # Condition of a breakpoint stop, or None

    @property
    def sites(self):
        """Every breakpoint site of the stop (empty for a VRT stop)."""
        return self.alternatives or (() if self.site is None else (self.site,))


@dataclass(frozen=True)
class Pause:
    id: str
    stop: Stop
    fields: tuple


@dataclass(frozen=True)
class Device:
    """A declared input-device state field: an LE object location, or an offset from a register at a breakpoint."""
    id: str
    object: object  # LE object number, or None
    register: object  # register name, or None
    offset: int
    type: str

    @property
    def size(self):
        return SCALAR_SIZES[self.type]


@dataclass(frozen=True)
class Stimulus:
    id: str
    pause: str
    kind: str  # key, shift or device
    key: object = None  # (ASCII code, scan code)
    flags: tuple = ()  # (shift-flag name, set) pairs
    device: object = None  # Device ID
    value: object = None  # device value

    def budget(self, devices):
        if self.kind == "key":
            return KEY_STIMULUS_BYTES
        if self.kind == "shift":
            return SHIFT_STIMULUS_BYTES
        return 3 * devices[self.device].size


@dataclass(frozen=True)
class Window:
    object: int
    offset: object  # int, or None for a CODE window located by its runtime fingerprint
    size: int


@dataclass(frozen=True)
class IdentityCheck:
    field: str
    equals: object


@dataclass(frozen=True)
class Identity:
    mission: dict
    config: dict
    checks: tuple


@dataclass(frozen=True)
class Limits:
    run_seconds: float
    wait_seconds: float
    max_pauses: int
    max_fields: int
    max_chain_depth: int
    repeat_reads: int
    max_read_bytes: int
    max_log_bytes: int
    max_skipped_hits: int = DEFAULT_SKIPPED_HITS  # condition-rejected breakpoint hits in the whole run


@dataclass(frozen=True)
class Recipe:
    id: str
    baseline_version: str
    exe_sha256: str
    identity: Identity
    code_window: Window
    data_window: Window
    pauses: tuple
    fields: dict  # field ID -> Field, in declaration order
    limits: Limits
    fingerprint: str
    emulator: dict  # recipe-allowed emulator settings of the private configuration, e.g. {"cycles": 40000}
    game_settings: dict  # recipe-preset game settings of the private copy, e.g. {"CURR_LEVEL": (100, 19)}
    devices: dict  # device ID -> Device, in declaration order
    stimuli: tuple  # in declaration order; applied in this order at their pauses

    def pause(self, pause_id):
        for pause in self.pauses:
            if pause.id == pause_id:
                return pause
        raise BaselineError("recipe-reference-invalid", pause_id)

    def planned(self):
        """(pause ID, field ID) of every planned sample, in pause order then field order."""
        return tuple((pause.id, field) for pause in self.pauses for field in pause.fields)

    def pause_stimuli(self, pause_id):
        return tuple(stimulus for stimulus in self.stimuli if stimulus.pause == pause_id)

    def objects(self):
        """LE objects whose runtime base the readings and device writes need."""
        return frozenset([field.address.object for field in self.fields.values() if field.address.object is not None]
                         + [device.object for device in self.devices.values() if device.object is not None])


def verify_source(recipe, baseline_version, exe_sha256):
    """Rejects a run whose baseline version or EXE fingerprint differs from the recipe's (before any reading)."""
    if baseline_version != recipe.baseline_version or exe_sha256 != recipe.exe_sha256:
        raise BaselineError("source-mismatch", "source")


def exe_fingerprint(data):
    """SHA-256 of the EXE bytes the caller read from the verified private copy."""
    return hashlib.sha256(data).hexdigest()


def parse_recipe(text):
    """Parses and validates recipe JSON text or bytes. Raises BaselineError; returns a Recipe."""
    if isinstance(text, str):
        raw = text.encode("utf-8")
    elif isinstance(text, (bytes, bytearray)):
        raw = bytes(text)
    else:
        raise BaselineError("recipe-json-invalid", "$")
    if len(raw) > MAX_RECIPE_BYTES:
        raise BaselineError("recipe-too-large", "$")
    try:
        document = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_pairs, parse_constant=_reject_constant)
    except (UnicodeDecodeError, ValueError, RecursionError) as error:
        if isinstance(error, _Duplicate):
            raise BaselineError("recipe-json-invalid", error.where) from None
        raise BaselineError("recipe-json-invalid", "$") from None
    return _recipe(document)


class _Duplicate(ValueError):
    def __init__(self, where):
        super().__init__(where)
        self.where = where


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise _Duplicate(key if _ID.fullmatch(key or "") else "$")
        result[key] = value
    return result


def _reject_constant(name):
    raise ValueError("non-finite JSON constant")


def _object(value, path, required, optional=()):
    if type(value) is not dict:
        raise BaselineError("recipe-type-invalid", path)
    unknown = value.keys() - set(required) - set(optional)
    if unknown:
        raise BaselineError("recipe-key-unknown", path)
    for key in required:
        if key not in value:
            raise BaselineError("recipe-key-missing", f"{path}.{key}")
    return value


def _list(value, path, empty_code="recipe-empty"):
    if type(value) is not list:
        raise BaselineError("recipe-type-invalid", path)
    if not value:
        raise BaselineError(empty_code, path)
    return value


def _int(value, path, low, high, code):
    if type(value) is not int:
        raise BaselineError("recipe-type-invalid", path)
    if not low <= value <= high:
        raise BaselineError(code, path)
    return value


def _positive_number(value, path, high):
    if type(value) not in (int, float):
        raise BaselineError("recipe-type-invalid", path)
    if not math.isfinite(value) or not 0 < value <= high:
        raise BaselineError("recipe-limit-invalid", path)
    return float(value)


def _string(value, path, pattern, limit=_TOKEN_MAX):
    if type(value) is not str:
        raise BaselineError("recipe-type-invalid", path)
    if len(value) > limit or not pattern.fullmatch(value):
        raise BaselineError("recipe-value-invalid", path)
    return value


def _identifier(value, path):
    return _string(value, path, _ID)


def _token(value, path):
    return _string(value, path, _TOKEN)


def _recipe(document):
    _object(document, "$", ("schemaVersion", "recipeId", "source", "identity", "correlation", "pauses", "fields",
                            "limits"), ("emulator", "gameSettings", "devices", "stimuli"))
    version = document["schemaVersion"]
    if type(version) is not int or version != SCHEMA_VERSION:
        raise BaselineError("recipe-version-unsupported", "schemaVersion")
    recipe_id = _identifier(document["recipeId"], "recipeId")

    source = _object(document["source"], "source", ("baselineVersion", "exeSha256"))
    baseline_version = _token(source["baselineVersion"], "source.baselineVersion")
    exe_sha256 = _string(source["exeSha256"], "source.exeSha256", _SHA256)

    limits = _limits(document["limits"])
    emulator = _emulator(document.get("emulator", {}))
    game_settings = _game_settings(document.get("gameSettings", {}))
    fields = _fields(document["fields"], limits)
    pauses = _pauses(document["pauses"], fields, limits)
    devices = _devices(document["devices"]) if "devices" in document else {}
    stimuli = _stimuli(document["stimuli"], pauses, devices) if "stimuli" in document else ()
    if devices.keys() - {stimulus.device for stimulus in stimuli}:
        raise BaselineError("recipe-reference-invalid", "devices")
    identity = _identity(document["identity"], fields, pauses)

    correlation = _object(document["correlation"], "correlation", ("code", "data"))
    code = _object(correlation["code"], "correlation.code", ("object", "size"), ("offset",))
    code_size = _int(code["size"], "correlation.code.size", *CODE_WINDOW_SIZES, "recipe-limit-invalid")
    if code_size % 16:
        raise BaselineError("recipe-limit-invalid", "correlation.code.size")
    code_window = Window(
        _int(code["object"], "correlation.code.object", 1, MAX_OBJECT_NUMBER, "recipe-address-invalid"),
        _int(code["offset"], "correlation.code.offset", 0, UINT32_END - code_size, "recipe-address-invalid")
        if "offset" in code else None,
        code_size)
    data = _object(correlation["data"], "correlation.data", ("object", "offset", "size"))
    data_size = _int(data["size"], "correlation.data.size", *DATA_WINDOW_SIZES, "recipe-limit-invalid")
    data_window = Window(
        _int(data["object"], "correlation.data.object", 1, MAX_OBJECT_NUMBER, "recipe-address-invalid"),
        _int(data["offset"], "correlation.data.offset", 0, UINT32_END - data_size, "recipe-address-invalid"),
        data_size)

    worst = code_size + data_size + limits.repeat_reads * sum(
        POINTER_SIZE * len(fields[field].address.pointers) + fields[field].size
        for pause in pauses for field in pause.fields) + sum(stimulus.budget(devices) for stimulus in stimuli)
    if worst > limits.max_read_bytes:
        raise BaselineError("recipe-budget-exceeded", "limits.maxReadBytes")

    canonical = json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return Recipe(recipe_id, baseline_version, exe_sha256, identity, code_window, data_window, pauses, fields, limits,
                  "sha256:" + hashlib.sha256(canonical.encode("ascii")).hexdigest(), emulator, game_settings,
                  devices, stimuli)


def _emulator(value):
    """Settings the private emulator configuration may change from the baseline: only fixed cycles."""
    _object(value, "emulator", (), ("cycles",))
    if "cycles" in value:
        return {"cycles": _int(value["cycles"], "emulator.cycles", *CYCLES_RANGE, "recipe-value-invalid")}
    return {}


def _game_settings(value):
    """The game's own user settings the private copy's settings file may preset: STARTUP_PRACTICE (boolean) and
    CURR_LEVEL (practice and campaign raw difficulty, two integers)."""
    _object(value, "gameSettings", (), ("STARTUP_PRACTICE", "CURR_LEVEL"))
    settings = {}
    if "STARTUP_PRACTICE" in value:
        if type(value["STARTUP_PRACTICE"]) is not bool:
            raise BaselineError("recipe-type-invalid", "gameSettings.STARTUP_PRACTICE")
        settings["STARTUP_PRACTICE"] = value["STARTUP_PRACTICE"]
    if "CURR_LEVEL" in value:
        path = "gameSettings.CURR_LEVEL"
        levels = _list(value["CURR_LEVEL"], path, "recipe-value-invalid")
        if len(levels) != 2:
            raise BaselineError("recipe-value-invalid", path)
        settings["CURR_LEVEL"] = tuple(_int(level, f"{path}[{index}]", *LEVEL_RANGE, "recipe-value-invalid")
                                       for index, level in enumerate(levels))
    return settings


def _limits(value):
    keys = ("runSeconds", "waitSeconds", "maxPauses", "maxFields", "maxChainDepth", "repeatReads", "maxReadBytes",
            "maxLogBytes")
    _object(value, "limits", keys, ("maxSkippedHits",))
    run = _positive_number(value["runSeconds"], "limits.runSeconds", CEILINGS["runSeconds"])
    wait = _positive_number(value["waitSeconds"], "limits.waitSeconds", run)

    def count(key, low=1):
        return _int(value[key], "limits." + key, low, CEILINGS[key], "recipe-limit-invalid")

    return Limits(run, wait, count("maxPauses"), count("maxFields"), count("maxChainDepth"), count("repeatReads", 2),
                  count("maxReadBytes"), count("maxLogBytes"),
                  count("maxSkippedHits", 0) if "maxSkippedHits" in value else DEFAULT_SKIPPED_HITS)


def _fields(value, limits):
    items = _list(value, "fields")
    if len(items) > limits.max_fields:
        raise BaselineError("recipe-budget-exceeded", "fields")
    fields = {}
    for index, item in enumerate(items):
        path = f"fields[{index}]"
        _object(item, path, ("id", "address", "type", "unit"), ("required",))
        field_id = _identifier(item["id"], path + ".id")
        if field_id in fields:
            raise BaselineError("recipe-id-duplicate", path + ".id")
        kind = item["type"]
        if type(kind) is not str:
            raise BaselineError("recipe-type-invalid", path + ".type")
        if kind not in SCALAR_SIZES:
            raise BaselineError("recipe-value-invalid", path + ".type")
        unit = _token(item["unit"], path + ".unit")
        required = item.get("required", True)
        if type(required) is not bool:
            raise BaselineError("recipe-type-invalid", path + ".required")
        where = path + ".address"
        if type(item["address"]) is dict and "low" in item["address"]:  # linear page 0: vectors, BIOS data area
            address = _object(item["address"], where, ("low",))
            location = Address(None, _int(address["low"], where + ".low", 0, PAGE_SIZE - SCALAR_SIZES[kind],
                                          "recipe-address-invalid"), ())
            fields[field_id] = Field(field_id, location, kind, unit, required)
            continue
        if type(item["address"]) is dict and "bound" in item["address"]:  # an earlier pause's reading
            address = _object(item["address"], where, ("bound", "offset"), ("pointers",))
        else:
            address = _object(item["address"], where, ("offset",), ("object", "register", "pointers"))
        pointers = address.get("pointers", [])
        if type(pointers) is not list:
            raise BaselineError("recipe-type-invalid", where + ".pointers")
        if len(pointers) > limits.max_chain_depth:
            raise BaselineError("recipe-budget-exceeded", where + ".pointers")
        hops = tuple(_int(pointer, f"{where}.pointers[{hop}]", 0, UINT32_END - 1, "recipe-address-invalid")
                     for hop, pointer in enumerate(pointers))
        if "bound" in address:
            location = Address(None, _int(address["offset"], where + ".offset", *REGISTER_OFFSETS,
                                          "recipe-address-invalid"), hops,
                               bound=_binding(address["bound"], where + ".bound"))
            fields[field_id] = Field(field_id, location, kind, unit, required)
            continue
        number, register, offset = _base(address, where, POINTER_SIZE if pointers else SCALAR_SIZES[kind])
        location = Address(number, offset, hops, register)
        fields[field_id] = Field(field_id, location, kind, unit, required)
    return fields


def _pauses(value, fields, limits):
    items = _list(value, "pauses")
    if len(items) > limits.max_pauses:
        raise BaselineError("recipe-budget-exceeded", "pauses")
    pauses = []
    listed_at = {}  # pause ID -> (stop kind, field IDs) of the pauses before the current one
    used = set()
    for index, item in enumerate(items):
        path = f"pauses[{index}]"
        _object(item, path, ("id", "stop"), ("fields",))
        pause_id = _identifier(item["id"], path + ".id")
        if pause_id in listed_at:
            raise BaselineError("recipe-id-duplicate", path + ".id")
        stop = _stop(item["stop"], path + ".stop", fields, listed_at)
        names = []
        listed = item.get("fields", [])  # a pause without fields is a stop without readings, e.g. for stimuli
        if type(listed) is not list:
            raise BaselineError("recipe-type-invalid", path + ".fields")
        for slot, name in enumerate(listed):
            name = _identifier(name, f"{path}.fields[{slot}]")
            if name not in fields:
                raise BaselineError("recipe-reference-invalid", f"{path}.fields[{slot}]")
            if name in names:
                raise BaselineError("recipe-id-duplicate", f"{path}.fields[{slot}]")
            address = fields[name].address
            if address.register is not None and stop.kind != "breakpoint":  # VRT stops have no register
                raise BaselineError("recipe-reference-invalid", f"{path}.fields[{slot}]")
            if address.bound is not None:
                _reference(address.bound, fields, listed_at, f"{path}.fields[{slot}]")
            names.append(name)
        used.update(names)
        listed_at[pause_id] = (stop.kind, tuple(names))
        pauses.append(Pause(pause_id, stop, tuple(names)))
    for field_id in fields:
        if field_id not in used:
            raise BaselineError("recipe-reference-invalid", field_id)
    return tuple(pauses)


def _stop(stop, path, fields, listed_at):
    """A VRT stop, or a breakpoint stop at one `offset` or at alternative `offsets` in one LE object, optionally with
    a register condition `when`."""
    _object(stop, path, ("kind",), ("object", "offset", "offsets", "when"))
    kind = stop["kind"]
    if type(kind) is not str:
        raise BaselineError("recipe-type-invalid", path + ".kind")
    if kind not in STOP_KINDS:
        raise BaselineError("recipe-value-invalid", path + ".kind")
    if kind == "vrt":
        _object(stop, path, ("kind",))
        return Stop(kind, None)
    _object(stop, path, ("kind", "object"), ("offset", "offsets", "when"))
    number = _int(stop["object"], path + ".object", 1, MAX_OBJECT_NUMBER, "recipe-address-invalid")
    if "offset" in stop and "offsets" in stop:
        raise BaselineError("recipe-address-invalid", path)
    if "offset" in stop:
        site = Location(number, _int(stop["offset"], path + ".offset", 0, UINT32_END - 1, "recipe-address-invalid"))
        alternatives = ()
    elif "offsets" in stop:
        offsets = _list(stop["offsets"], path + ".offsets", "recipe-value-invalid")
        if not ALTERNATIVE_SITES[0] <= len(offsets) <= ALTERNATIVE_SITES[1]:
            raise BaselineError("recipe-value-invalid", path + ".offsets")
        offsets = [_int(offset, f"{path}.offsets[{slot}]", 0, UINT32_END - 1, "recipe-address-invalid")
                   for slot, offset in enumerate(offsets)]
        if len(set(offsets)) != len(offsets):
            raise BaselineError("recipe-value-invalid", path + ".offsets")
        alternatives = tuple(Location(number, offset) for offset in offsets)
        site = alternatives[0]
    else:
        raise BaselineError("recipe-key-missing", path + ".offset")
    when = _condition(stop["when"], path + ".when", fields, listed_at, alternatives) if "when" in stop else None
    return Stop(kind, site, alternatives, when)


def _condition(value, path, fields, listed_at, alternatives=()):
    """{"register": R, "in": [...]} or {"register": R, "notIn": [...]}: integers or earlier pauses' readings; at a
    stop with alternative sites, optionally `"at": [offset, ...]`, a strict subset of the stop's offsets that the
    condition is limited to."""
    _object(value, path, ("register",), ("in", "notIn", "at"))
    register = value["register"]
    if type(register) is not str:
        raise BaselineError("recipe-type-invalid", path + ".register")
    if register not in REGISTERS:
        raise BaselineError("recipe-value-invalid", path + ".register")
    if ("in" in value) == ("notIn" in value):
        raise BaselineError("recipe-key-missing" if "in" not in value else "recipe-value-invalid", path)
    key = "in" if "in" in value else "notIn"
    items = _list(value[key], f"{path}.{key}")
    if len(items) > CONDITION_VALUES[1]:
        raise BaselineError("recipe-budget-exceeded", f"{path}.{key}")
    values = []
    for slot, item in enumerate(items):
        where = f"{path}.{key}[{slot}]"
        if type(item) is dict:
            values.append(_reference(_binding(item, where), fields, listed_at, where))
        else:
            values.append(_int(item, where, 0, UINT32_END - 1, "recipe-value-invalid"))
    sites = ()
    if "at" in value:
        if not alternatives:
            raise BaselineError("recipe-key-unknown", path + ".at")
        offsets = _list(value["at"], path + ".at", "recipe-value-invalid")
        offsets = [_int(offset, f"{path}.at[{slot}]", 0, UINT32_END - 1, "recipe-address-invalid")
                   for slot, offset in enumerate(offsets)]
        known = {site.offset: site for site in alternatives}
        if len(set(offsets)) != len(offsets) or len(offsets) >= len(alternatives) or \
                any(offset not in known for offset in offsets):
            raise BaselineError("recipe-value-invalid", path + ".at")
        sites = tuple(known[offset] for offset in offsets)
    return Condition(register, key == "in", tuple(values), sites)


def _binding(value, path):
    """{"pause": P, "field": F} or {"pause": P, "register": R}."""
    _object(value, path, ("pause",), ("field", "register"))
    pause = _identifier(value["pause"], path + ".pause")
    if ("field" in value) == ("register" in value):
        raise BaselineError("recipe-key-missing" if "field" not in value else "recipe-value-invalid", path)
    if "field" in value:
        return Binding(pause, field=_identifier(value["field"], path + ".field"))
    register = value["register"]
    if type(register) is not str:
        raise BaselineError("recipe-type-invalid", path + ".register")
    if register not in REGISTERS:
        raise BaselineError("recipe-value-invalid", path + ".register")
    return Binding(pause, register=register)


def _reference(binding, fields, listed_at, path):
    """A binding to an integer field that an earlier pause lists, or to a register at an earlier breakpoint pause. A
    bound field may itself be bound (a chain): the earlier pause's reading is a value however it was addressed, and
    the order of pauses rules out cycles."""
    if binding.pause not in listed_at:
        raise BaselineError("recipe-reference-invalid", path)
    kind, names = listed_at[binding.pause]
    if binding.register is not None:
        if kind != "breakpoint":  # a VRT stop records no register the recipe could name
            raise BaselineError("recipe-reference-invalid", path)
        return binding
    if binding.field not in names:
        raise BaselineError("recipe-reference-invalid", path)
    if fields[binding.field].type not in SCALAR_RANGES:  # f32 is no address or register value
        raise BaselineError("recipe-reference-invalid", path)
    return binding


def _base(address, where, size):
    """(LE object, None, offset) or (None, register, signed offset) of a field or device address: exactly one of an
    LE object location or a register at a breakpoint stop; `size` bytes are read or written first."""
    if ("object" in address) == ("register" in address):
        raise BaselineError("recipe-address-invalid", where)
    if "object" in address:
        return (_int(address["object"], where + ".object", 1, MAX_OBJECT_NUMBER, "recipe-address-invalid"), None,
                _int(address["offset"], where + ".offset", 0, UINT32_END - size, "recipe-address-invalid"))
    register = address["register"]
    if type(register) is not str:
        raise BaselineError("recipe-type-invalid", where + ".register")
    if register not in REGISTERS:
        raise BaselineError("recipe-value-invalid", where + ".register")
    return None, register, _int(address["offset"], where + ".offset", *REGISTER_OFFSETS, "recipe-address-invalid")


def _devices(value):
    items = _list(value, "devices")
    if len(items) > CEILINGS["devices"]:
        raise BaselineError("recipe-budget-exceeded", "devices")
    devices = {}
    for index, item in enumerate(items):
        path = f"devices[{index}]"
        _object(item, path, ("id", "address", "type"))
        device_id = _identifier(item["id"], path + ".id")
        if device_id in devices:
            raise BaselineError("recipe-id-duplicate", path + ".id")
        kind = item["type"]
        if type(kind) is not str:
            raise BaselineError("recipe-type-invalid", path + ".type")
        if kind not in SCALAR_RANGES:  # the integer scalar types
            raise BaselineError("recipe-value-invalid", path + ".type")
        where = path + ".address"
        number, register, offset = _base(_object(item["address"], where, ("offset",), ("object", "register")), where,
                                         SCALAR_SIZES[kind])
        devices[device_id] = Device(device_id, number, register, offset, kind)
    return devices


def _stimuli(value, pauses, devices):
    items = _list(value, "stimuli")
    if len(items) > CEILINGS["stimuli"]:
        raise BaselineError("recipe-budget-exceeded", "stimuli")
    stops = {pause.id: pause.stop.kind for pause in pauses}
    order = {pause.id: index for index, pause in enumerate(pauses)}
    stimuli = []
    seen = set()
    keyed = set()
    for index, item in enumerate(items):
        path = f"stimuli[{index}]"
        _object(item, path, ("id", "pause", "kind"), ("ascii", "scan", "flags", "device", "value"))
        stimulus_id = _identifier(item["id"], path + ".id")
        if stimulus_id in seen:
            raise BaselineError("recipe-id-duplicate", path + ".id")
        seen.add(stimulus_id)
        pause = _identifier(item["pause"], path + ".pause")
        if pause not in stops:
            raise BaselineError("recipe-reference-invalid", path + ".pause")
        if stimuli and order[pause] < order[stimuli[-1].pause]:  # declaration order is application order
            raise BaselineError("recipe-value-invalid", path + ".pause")
        kind = item["kind"]
        if type(kind) is not str:
            raise BaselineError("recipe-type-invalid", path + ".kind")
        if kind not in STIMULUS_KINDS:
            raise BaselineError("recipe-value-invalid", path + ".kind")
        if kind == "key":
            _object(item, path, ("id", "pause", "kind", "ascii", "scan"))
            if pause in keyed:  # the game takes one key per poll and discards the rest
                raise BaselineError("recipe-value-invalid", path + ".pause")
            keyed.add(pause)
            key = tuple(_int(item[name], f"{path}.{name}", 0, 0xFF, "recipe-value-invalid")
                        for name in ("ascii", "scan"))
            stimuli.append(Stimulus(stimulus_id, pause, kind, key=key))
        elif kind == "shift":
            _object(item, path, ("id", "pause", "kind", "flags"))
            flags = item["flags"]
            if type(flags) is not dict:
                raise BaselineError("recipe-type-invalid", path + ".flags")
            if not flags:
                raise BaselineError("recipe-empty", path + ".flags")
            if flags.keys() - SHIFT_BITS.keys():
                raise BaselineError("recipe-key-unknown", path + ".flags")
            if any(type(on) is not bool for on in flags.values()):
                raise BaselineError("recipe-type-invalid", path + ".flags")
            stimuli.append(Stimulus(stimulus_id, pause, kind, flags=tuple(flags.items())))
        else:
            _object(item, path, ("id", "pause", "kind", "device", "value"))
            name = _identifier(item["device"], path + ".device")
            device = devices.get(name)
            if device is None or (device.register is not None and stops[pause] != "breakpoint"):
                raise BaselineError("recipe-reference-invalid", path + ".device")
            value = _int(item["value"], path + ".value", *SCALAR_RANGES[device.type], "recipe-value-invalid")
            stimuli.append(Stimulus(stimulus_id, pause, kind, device=name, value=value))
    return tuple(stimuli)


def _identity(value, fields, pauses):
    _object(value, "identity", ("mission", "config"), ("checks",))
    mission = _identity_map(value["mission"], "identity.mission")
    config = _identity_map(value["config"], "identity.config")
    items = value.get("checks", [])
    if type(items) is not list:
        raise BaselineError("recipe-type-invalid", "identity.checks")
    checks = []
    for index, item in enumerate(items):
        path = f"identity.checks[{index}]"
        _object(item, path, ("field", "equals"))
        name = _identifier(item["field"], path + ".field")
        if name not in fields or any(pause.fields and name not in pause.fields for pause in pauses):
            raise BaselineError("recipe-reference-invalid", path + ".field")
        checks.append(IdentityCheck(name, _expected(item["equals"], fields[name].type, path + ".equals")))
    return Identity(mission, config, tuple(checks))


def _identity_map(value, path):
    if type(value) is not dict:
        raise BaselineError("recipe-type-invalid", path)
    if not value:
        raise BaselineError("recipe-empty", path)
    if len(value) > MAX_IDENTITY_KEYS:
        raise BaselineError("recipe-budget-exceeded", path)
    result = {}
    for key, item in value.items():
        _identifier(key, path)
        where = f"{path}.{key}"
        if type(item) is bool:
            result[key] = item
        elif type(item) is int:
            result[key] = _int(item, where, -(1 << 53), 1 << 53, "recipe-value-invalid")
        else:
            result[key] = _token(item, where)
    return result


def _expected(value, kind, path):
    if kind == "f32":
        if type(value) not in (int, float):
            raise BaselineError("recipe-type-invalid", path)
        try:
            rounded = struct.unpack("<f", struct.pack("<f", float(value)))[0]
        except OverflowError:
            raise BaselineError("recipe-value-invalid", path) from None
        if not math.isfinite(value) or rounded != value:
            raise BaselineError("recipe-value-invalid", path)
        return rounded
    return _int(value, path, *SCALAR_RANGES[kind], "recipe-value-invalid")
