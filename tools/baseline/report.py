"""Measurement report, schemaVersion 1 (P3-01 spec, tool data contract: report identity, samples, run conclusion).

`build_report` assembles the report object from the session's identities and the judged samples and derives its
status. Only a run whose every planned required sample was taken in order and qualified, whose every declared stimulus
was applied in order, whose original-file integrity and process cleanup passed, which finished, was not cancelled and
reported no other failure is `complete`. Zero samples, missing samples or a qualified prefix are never complete.
Writing the report is the session's job.
"""
import json
import math
import re

from qualify import Sample, safe_ref
from reasons import REASON_SET, BaselineError, ordered
from recipe import SCALAR_RANGES

SCHEMA_VERSION = 1
RUN_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")
_LABEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/:+-]{0,127}")


def _plain(value, where, depth=0):
    """A JSON value of strings, finite numbers, booleans, null, lists and string-keyed objects."""
    if depth > 8:
        raise BaselineError("report-invalid", where)
    if value is None or type(value) in (bool, int, str):
        return value
    if type(value) is float:
        if not math.isfinite(value):
            raise BaselineError("report-invalid", where)
        return value
    if type(value) in (list, tuple):
        return [_plain(item, where, depth + 1) for item in value]
    if type(value) is dict and all(type(key) is str for key in value):
        return {key: _plain(item, where, depth + 1) for key, item in value.items()}
    raise BaselineError("report-invalid", where)


def _section(value, where, allow_empty=False):
    if type(value) is not dict or (not value and not allow_empty):
        raise BaselineError("report-invalid", where)
    return _plain(value, where)


PROOF_KEYS = frozenset({"mapping", "stop", "identity", "readability", "repeat"})


def _check_sample(recipe, sample):
    """A judged sample of this recipe: field metadata, reason codes, typed value and safe proof references."""
    field = recipe.fields.get(sample.field) if isinstance(sample, Sample) else None
    if (field is None or (sample.type, sample.unit, sample.required) != (field.type, field.unit, field.required)
            or type(sample.reasons) is not tuple or sample.reasons != ordered(set(sample.reasons) & REASON_SET)
            or type(sample.proof) is not dict or set(sample.proof) != PROOF_KEYS):
        raise BaselineError("report-invalid", "samples")
    for key, value in sample.proof.items():
        try:
            safe_ref(value, key)
        except BaselineError:
            raise BaselineError("report-invalid", "samples") from None
    value = sample.value
    if sample.reasons:
        valid = value is None
    elif field.type == "f32":
        valid = type(value) is float and math.isfinite(value)
    else:
        low, high = SCALAR_RANGES[field.type]
        valid = type(value) is int and low <= value <= high
    if not valid:
        raise BaselineError("report-invalid", "samples")
    return sample.pause, sample.field


def _passed(value, where):
    section = _section(value, where)
    return section, section.get("passed") is True


def _check_condition(record, only_if):
    """A settled stimulus record agrees with its recipe condition: an unconditional stimulus is never `not-selected`;
    a conditional one carries its `condition` evidence, and the recorded reading decides its status."""
    condition = record.get("condition")
    if only_if is None:
        if record["status"] == "not-selected" or condition is not None:
            raise BaselineError("report-invalid", "stimuli")
        return
    binding, expected = only_if
    if type(condition) is not dict or condition.get("pause") != binding.pause or \
            condition.get("field") != binding.field or condition.get("equals") != f"{expected:x}":
        raise BaselineError("report-invalid", "stimuli")
    try:
        reading = int(condition.get("reading"), 16)
    except (TypeError, ValueError):
        raise BaselineError("report-invalid", "stimuli") from None
    if (reading == expected) != (record["status"] == "applied"):
        raise BaselineError("report-invalid", "stimuli")


def _skipped(recipe, jumps):
    """The pause IDs the recorded jumps passed over. Each record must name a pause with jump rules, one of its rules
    and exactly the pauses that rule passes over; records follow the recipe's pause order without overlapping."""
    if not any(pause.jumps for pause in recipe.pauses):
        if jumps:
            raise BaselineError("report-invalid", "jumps")
        return frozenset()
    if type(jumps) is not list:
        raise BaselineError("report-invalid", "jumps")
    order = {pause.id: index for index, pause in enumerate(recipe.pauses)}
    skipped, last = set(), -1
    for record in jumps:
        if type(record) is not dict or record.get("pause") not in order:
            raise BaselineError("report-invalid", "jumps")
        pause = recipe.pauses[order[record["pause"]]]
        slot = record.get("rule")
        if type(slot) is not int or not 0 <= slot < len(pause.jumps) or order[pause.id] <= last:
            raise BaselineError("report-invalid", "jumps")
        rule = pause.jumps[slot]
        passed = recipe.jump_skips(pause.id, rule)
        if rule.sites and record.get("hitOffset") not in [f"{site.offset:x}" for site in rule.sites]:
            raise BaselineError("report-invalid", "jumps")
        if rule.outcome is not None and record.get("outcome") != rule.outcome:
            raise BaselineError("report-invalid", "jumps")
        if rule.test is not None:
            evidence = record.get("if")
            if type(evidence) is not dict or evidence.get("result") is not True or \
                    type(evidence.get("readings")) is not dict or type(evidence.get("references")) is not dict:
                raise BaselineError("report-invalid", "jumps")
            current = {name: value for name, value in evidence["readings"].items() if value is not None}
            earlier = {tuple(key.split("/", 1)): value for key, value in evidence["references"].items()}
            if rule.test.evaluate(current, earlier) is not True:
                raise BaselineError("report-invalid", "jumps")
        target = {"to": rule.to} if rule.to is not None else {"end": True}
        if any(record.get(key) != value for key, value in target.items()) or ("to" in record) != ("to" in target) or \
                ("end" in record) != ("end" in target) or record.get("skipped") != list(passed) or pause.id in skipped:
            raise BaselineError("report-invalid", "jumps")
        skipped.update(passed)
        last = order[pause.id] + len(passed)
    return frozenset(skipped)


def build_report(*, recipe, run_id, tool, source, environment, game_config, run_start, run_end, samples, integrity,
                 cleanup, cancelled=False, failures=(), stimuli=None, skipped_hits=None, probes=None, jumps=None):
    """The report dict. `run_end` None marks an unfinished run (the state a report is first written in). `stimuli`,
    the records of the stimuli applied or attempted, is reported only for a recipe that declares stimuli;
    `skipped_hits`, the breakpoint hits stop conditions or reading tests rejected, only for a recipe with either;
    `probes`, the hits whose readings `until` stops tested, only for a recipe with an `until` stop. A stimulus whose
    `if` was false in this run (`condition-false`) counts as done in its place: the recipe declared that branch.
    `jumps`, the jumps taken (P3-11/20), only for a recipe with a `jump` rule: the pauses they passed over plan no
    sample and no stimulus."""
    if type(run_id) is not str or not RUN_ID.fullmatch(run_id):
        raise BaselineError("report-invalid", "runId")
    tool = _section(tool, "tool")
    if set(tool) != {"version", "source"} or not all(type(v) is str and _LABEL.fullmatch(v) for v in tool.values()):
        raise BaselineError("report-invalid", "tool")
    samples = tuple(samples)
    failures = tuple(failures)
    if type(cancelled) is not bool or any(code not in REASON_SET for code in failures):
        raise BaselineError("report-invalid", "run")
    reasons = set(failures)

    source = _section(source, "source")
    if source != {"baselineVersion": recipe.baseline_version, "exeSha256": recipe.exe_sha256}:
        reasons.add("source-mismatch")

    skipped = _skipped(recipe, jumps)
    planned = recipe.planned(skipped)
    plan = set(planned)
    keys = [_check_sample(recipe, sample) for sample in samples]
    if not keys:
        reasons.add("samples-empty")
    if any(key not in plan for key in keys):
        reasons.add("samples-unplanned")
    elif tuple(keys) != planned[:len(keys)]:
        reasons.add("samples-order")
    elif len(keys) < len(planned):
        reasons.add("samples-missing")
    required = {(pause.id, name) for pause in recipe.pauses if pause.id not in skipped for name in pause.fields
                if recipe.fields[name].required}
    if any(not sample.qualified and (sample.pause, sample.field) in required for sample in samples):
        reasons.add("samples-unqualified")

    counts = {
        "planned": len(planned),
        "actual": len(keys),
        "qualified": sum(sample.qualified for sample in samples),
        "requiredPlanned": len(required),
        "requiredQualified": sum(sample.qualified and (sample.pause, sample.field) in required for sample in samples),
    }
    extra = {}
    if any(pause.stop.when is not None or pause.stop.until is not None for pause in recipe.pauses):
        if type(skipped_hits) is not int or skipped_hits < 0:
            raise BaselineError("report-invalid", "skippedHits")
        counts["skippedHits"] = skipped_hits
    if any(pause.stop.until is not None for pause in recipe.pauses):
        if type(probes) is not int or probes < 0:
            raise BaselineError("report-invalid", "probes")
        counts["probes"] = probes
    if any(pause.jumps for pause in recipe.pauses):
        extra["jumps"] = _plain(list(jumps), "jumps")
        counts.update(jumps=len(jumps), pausesSkipped=len(skipped))
    if recipe.stimuli:
        records = _plain(list(stimuli or ()), "stimuli")
        if any(type(record) is not dict for record in records):
            raise BaselineError("report-invalid", "stimuli")
        settled = [record for record in records
                   if record.get("status") in ("applied", "not-selected", "condition-false")]
        expected = [stimulus for stimulus in recipe.stimuli if stimulus.pause not in skipped]
        if [(record.get("id"), record.get("pause")) for record in settled] != \
                [(stimulus.id, stimulus.pause) for stimulus in expected]:
            reasons.add("stimuli-missing")
        conditions = {(stimulus.id, stimulus.pause): stimulus.only_if for stimulus in recipe.stimuli}
        declared = {(stimulus.id, stimulus.pause): stimulus.sites for stimulus in recipe.stimuli}
        for record in settled:
            sites = declared.get((record.get("id"), record.get("pause")))
            if sites and record["status"] == "condition-false" and type(record.get("at")) is dict and \
                    record["at"].get("hit") not in [f"{site.offset:x}" for site in sites]:
                continue  # excluded by its `at` sites before any reading condition was decided (P3-11/20)
            _check_condition(record, conditions.get((record.get("id"), record.get("pause"))))
        applied = sum(record["status"] == "applied" for record in settled)
        counts.update(stimuliPlanned=len(expected), stimuliApplied=applied)
        not_selected = sum(record["status"] == "not-selected" for record in settled)
        if not_selected:
            counts["stimuliNotSelected"] = not_selected
        if any(stimulus.test is not None or stimulus.sites for stimulus in recipe.stimuli):
            counts["stimuliConditionFalse"] = sum(record["status"] == "condition-false" for record in settled)
        extra["stimuli"] = records
        injected = [stimulus for stimulus in recipe.stimuli if stimulus.kind == "inject"]
        if injected:  # P3-10 subtask 25: samples after an injection are injected-damage samples
            declared = {stimulus.id for stimulus in injected}

            def wrote(record):  # an inject write whose readback equals the written bytes: the state was changed
                return any(type(entry) is dict and entry.get("channel") == "inject" and entry.get("written")
                           and entry.get("readback") == entry.get("written") for entry in record.get("writes") or ())
            written = [record.get("id") for record in records if record.get("id") in declared and wrote(record)]
            applied = [record.get("id") for record in records
                       if record.get("id") in written and record.get("status") == "applied"]
            extra["injection"] = {"injected": bool(written), "planned": len(injected), "written": written,
                                  "applied": applied}

    integrity, integrity_passed = _passed(integrity, "integrity")
    cleanup, cleanup_passed = _passed(cleanup, "cleanup")
    if not integrity_passed:
        reasons.add("integrity-failed")
    if not cleanup_passed:
        reasons.add("cleanup-failed")
    if run_end is None:
        reasons.add("run-unfinished")
    if cancelled:
        reasons.add("run-cancelled")
    status = "cancelled" if cancelled else "failed" if reasons else "complete"

    return {
        "schemaVersion": SCHEMA_VERSION,
        "runId": run_id,
        "status": status,
        "reasons": list(ordered(reasons)),
        "recipe": {"id": recipe.id, "fingerprint": recipe.fingerprint},
        "tool": tool,
        "source": source,
        "environment": _section(environment, "environment"),
        "gameConfig": _section(game_config, "gameConfig"),
        "run": {"start": _section(run_start, "run.start"),
                "end": None if run_end is None else _section(run_end, "run.end")},
        "samples": [sample.to_json() for sample in samples],
        **extra,
        "counts": counts,
        "integrity": integrity,
        "cleanup": cleanup,
    }


def serialize(report):
    """Report JSON text; non-finite numbers are rejected rather than written as NaN/Infinity."""
    try:
        return json.dumps(report, indent=2, allow_nan=False) + "\n"
    except (TypeError, ValueError):
        raise BaselineError("report-invalid", "$") from None


def summary(report):
    """One terminal line: status, reason codes and counts. No values, identities or paths."""
    counts = report["counts"]
    reasons = ",".join(report["reasons"]) or "-"
    return (f"status={report['status']} reasons={reasons} samples={counts['actual']}/{counts['planned']} "
            f"qualified={counts['qualified']}")
