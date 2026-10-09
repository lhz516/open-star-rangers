"""Measurement recipe, schemaVersion 1: parsing and validation before any session side effect (P3-01 spec, tool data
contract).

A recipe is metadata only: the expected source fingerprint, the selected mission/configuration identity, LE object
locations, scalar types, unit labels and run limits. Every key is known, every value has a fixed JSON type and every
string is a restricted token, so a recipe cannot carry expressions, debugger commands or shell strings.
"""
import hashlib
import json
import math
import re
import struct
from dataclasses import dataclass

from reasons import BaselineError

SCHEMA_VERSION = 1
MAX_RECIPE_BYTES = 64 * 1024
UINT32_END = 1 << 32

SCALAR_SIZES = {"u8": 1, "u16": 2, "u32": 4, "i16": 2, "i32": 4, "f32": 4}
SCALAR_RANGES = {"u8": (0, 0xFF), "u16": (0, 0xFFFF), "u32": (0, 0xFFFFFFFF), "i16": (-0x8000, 0x7FFF),
                 "i32": (-0x80000000, 0x7FFFFFFF)}
POINTER_SIZE = 4
STOP_KINDS = ("breakpoint", "vrt")

# Tool ceilings: research-tool protection, not original values or fidelity tolerances.
CEILINGS = {
    "runSeconds": 24 * 3600,
    "maxPauses": 256,
    "maxFields": 256,
    "maxChainDepth": 8,
    "repeatReads": 16,
    "maxReadBytes": 16 * 1024 * 1024,
    "maxLogBytes": 256 * 1024 * 1024,
}
CODE_WINDOW_SIZES = (64, 512)  # inclusive, multiple of 16 (anchor chunks)
DATA_WINDOW_SIZES = (16, 512)
MAX_OBJECT_NUMBER = 255
MAX_IDENTITY_KEYS = 16

_ID = re.compile(r"[A-Za-z][A-Za-z0-9]*(?:[-_.][A-Za-z0-9]+)*")
_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/:+-]*")
_SHA256 = re.compile(r"[0-9a-f]{64}")
_TOKEN_MAX = 64


@dataclass(frozen=True)
class Location:
    object: int
    offset: int


@dataclass(frozen=True)
class Address:
    object: int
    offset: int
    pointers: tuple  # non-negative offsets added to each dereferenced 32-bit pointer


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
class Stop:
    kind: str
    site: object  # Location for a breakpoint, None for a VRT stop


@dataclass(frozen=True)
class Pause:
    id: str
    stop: Stop
    fields: tuple


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

    def pause(self, pause_id):
        for pause in self.pauses:
            if pause.id == pause_id:
                return pause
        raise BaselineError("recipe-reference-invalid", pause_id)

    def planned(self):
        """(pause ID, field ID) of every planned sample, in pause order then field order."""
        return tuple((pause.id, field) for pause in self.pauses for field in pause.fields)

    def objects(self):
        """LE objects whose runtime base the readings need."""
        return frozenset(field.address.object for field in self.fields.values())


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
                            "limits"))
    version = document["schemaVersion"]
    if type(version) is not int or version != SCHEMA_VERSION:
        raise BaselineError("recipe-version-unsupported", "schemaVersion")
    recipe_id = _identifier(document["recipeId"], "recipeId")

    source = _object(document["source"], "source", ("baselineVersion", "exeSha256"))
    baseline_version = _token(source["baselineVersion"], "source.baselineVersion")
    exe_sha256 = _string(source["exeSha256"], "source.exeSha256", _SHA256)

    limits = _limits(document["limits"])
    fields = _fields(document["fields"], limits)
    pauses = _pauses(document["pauses"], fields, limits)
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
        for pause in pauses for field in pause.fields)
    if worst > limits.max_read_bytes:
        raise BaselineError("recipe-budget-exceeded", "limits.maxReadBytes")

    canonical = json.dumps(document, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False)
    return Recipe(recipe_id, baseline_version, exe_sha256, identity, code_window, data_window, pauses, fields, limits,
                  "sha256:" + hashlib.sha256(canonical.encode("ascii")).hexdigest())


def _limits(value):
    keys = ("runSeconds", "waitSeconds", "maxPauses", "maxFields", "maxChainDepth", "repeatReads", "maxReadBytes",
            "maxLogBytes")
    _object(value, "limits", keys)
    run = _positive_number(value["runSeconds"], "limits.runSeconds", CEILINGS["runSeconds"])
    wait = _positive_number(value["waitSeconds"], "limits.waitSeconds", run)

    def count(key, low=1):
        return _int(value[key], "limits." + key, low, CEILINGS[key], "recipe-limit-invalid")

    return Limits(run, wait, count("maxPauses"), count("maxFields"), count("maxChainDepth"), count("repeatReads", 2),
                  count("maxReadBytes"), count("maxLogBytes"))


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
        address = _object(item["address"], path + ".address", ("object", "offset"), ("pointers",))
        pointers = address.get("pointers", [])
        if type(pointers) is not list:
            raise BaselineError("recipe-type-invalid", path + ".address.pointers")
        if len(pointers) > limits.max_chain_depth:
            raise BaselineError("recipe-budget-exceeded", path + ".address.pointers")
        first = POINTER_SIZE if pointers else SCALAR_SIZES[kind]
        location = Address(
            _int(address["object"], path + ".address.object", 1, MAX_OBJECT_NUMBER, "recipe-address-invalid"),
            _int(address["offset"], path + ".address.offset", 0, UINT32_END - first, "recipe-address-invalid"),
            tuple(_int(pointer, f"{path}.address.pointers[{hop}]", 0, UINT32_END - 1, "recipe-address-invalid")
                  for hop, pointer in enumerate(pointers)))
        fields[field_id] = Field(field_id, location, kind, unit, required)
    return fields


def _pauses(value, fields, limits):
    items = _list(value, "pauses")
    if len(items) > limits.max_pauses:
        raise BaselineError("recipe-budget-exceeded", "pauses")
    pauses = []
    seen = set()
    used = set()
    for index, item in enumerate(items):
        path = f"pauses[{index}]"
        _object(item, path, ("id", "stop", "fields"))
        pause_id = _identifier(item["id"], path + ".id")
        if pause_id in seen:
            raise BaselineError("recipe-id-duplicate", path + ".id")
        seen.add(pause_id)
        stop = _object(item["stop"], path + ".stop", ("kind",), ("object", "offset"))
        kind = stop["kind"]
        if type(kind) is not str:
            raise BaselineError("recipe-type-invalid", path + ".stop.kind")
        if kind not in STOP_KINDS:
            raise BaselineError("recipe-value-invalid", path + ".stop.kind")
        if kind == "breakpoint":
            _object(stop, path + ".stop", ("kind", "object", "offset"))
            site = Location(
                _int(stop["object"], path + ".stop.object", 1, MAX_OBJECT_NUMBER, "recipe-address-invalid"),
                _int(stop["offset"], path + ".stop.offset", 0, UINT32_END - 1, "recipe-address-invalid"))
        else:
            _object(stop, path + ".stop", ("kind",))
            site = None
        names = []
        for slot, name in enumerate(_list(item["fields"], path + ".fields")):
            name = _identifier(name, f"{path}.fields[{slot}]")
            if name not in fields:
                raise BaselineError("recipe-reference-invalid", f"{path}.fields[{slot}]")
            if name in names:
                raise BaselineError("recipe-id-duplicate", f"{path}.fields[{slot}]")
            names.append(name)
        used.update(names)
        pauses.append(Pause(pause_id, Stop(kind, site), tuple(names)))
    for field_id in fields:
        if field_id not in used:
            raise BaselineError("recipe-reference-invalid", field_id)
    return tuple(pauses)


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
        if name not in fields or any(name not in pause.fields for pause in pauses):
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
