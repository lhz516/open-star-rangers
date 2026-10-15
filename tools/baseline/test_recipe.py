import access_guard  # noqa: F401  (installs the no-original-access guard first)

import copy
import hashlib
import json
import unittest

from reasons import REASON_SET, BaselineError
from recipe import CEILINGS, MAX_RECIPE_BYTES, exe_fingerprint, parse_recipe, verify_source
from synthetic import FIELD_LAYOUT, scenario_recipe

SHA = exe_fingerprint(b"synthetic image")


def text(document):
    return json.dumps(document)


class RecipeTests(unittest.TestCase):
    def assertRejected(self, code, document):
        payload = document if isinstance(document, (str, bytes)) else text(document)
        with self.assertRaises(BaselineError) as caught:
            parse_recipe(payload)
        self.assertEqual(caught.exception.code, code)
        self.assertIn(code, REASON_SET)
        return caught.exception

    def mutated(self, change):
        document = copy.deepcopy(scenario_recipe(SHA))
        change(document)
        return document

    def test_valid_recipe(self):
        recipe = parse_recipe(text(scenario_recipe(SHA)))
        self.assertEqual(recipe.id, "synthetic-timebase")
        self.assertEqual(recipe.exe_sha256, SHA)
        self.assertEqual(list(recipe.fields), [name for name, *_ in FIELD_LAYOUT])
        self.assertEqual(recipe.fields["chained"].address.pointers, (0x10, 0x8))
        self.assertEqual(recipe.fields["delta"].size, 2)
        self.assertTrue(recipe.fields["ticks"].required)
        self.assertEqual(recipe.pause("start").stop.site.offset, 0x1F90)
        self.assertIsNone(recipe.pause("end").stop.site)
        self.assertIsNone(recipe.code_window.offset)
        self.assertEqual(recipe.limits.repeat_reads, 2)
        self.assertEqual(recipe.identity.checks[0].equals, 4242)
        self.assertEqual(recipe.planned()[-2:], (("end", "scenario"), ("end", "ticks")))
        self.assertEqual(recipe.objects(), frozenset({4}))
        self.assertTrue(recipe.fingerprint.startswith("sha256:"))

    def test_fingerprint_ignores_formatting_but_not_content(self):
        document = scenario_recipe(SHA)
        compact = parse_recipe(json.dumps(document, separators=(",", ":")))
        spaced = parse_recipe(json.dumps(dict(reversed(list(document.items()))), indent=4).encode())
        self.assertEqual(compact.fingerprint, spaced.fingerprint)
        changed = self.mutated(lambda d: d["limits"].update(repeatReads=3))
        self.assertNotEqual(parse_recipe(text(changed)).fingerprint, compact.fingerprint)

    def test_optional_field_and_float_check(self):
        def change(d):
            d["fields"][3]["required"] = False
            d["identity"]["checks"] = [{"field": "ticks", "equals": 0}]
        recipe = parse_recipe(text(self.mutated(change)))
        self.assertFalse(recipe.fields["speed"].required)

    def test_emulator_settings(self):
        self.assertEqual(parse_recipe(text(scenario_recipe(SHA))).emulator, {})
        recipe = parse_recipe(text(self.mutated(lambda d: d.update(emulator={"cycles": 30000}))))
        self.assertEqual(recipe.emulator, {"cycles": 30000})
        self.assertNotEqual(recipe.fingerprint, parse_recipe(text(scenario_recipe(SHA))).fingerprint)
        self.assertRejected("recipe-key-unknown", self.mutated(lambda d: d.update(emulator={"core": "dynamic"})))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: d.update(emulator=[])))
        for cycles, code in ((999, "recipe-value-invalid"), (2_000_001, "recipe-value-invalid"),
                             ("40000", "recipe-type-invalid"), (1.5, "recipe-type-invalid"),
                             (True, "recipe-type-invalid")):
            self.assertRejected(code, self.mutated(lambda d: d.update(emulator={"cycles": cycles})))

    def test_game_settings(self):
        base = parse_recipe(text(scenario_recipe(SHA)))
        self.assertEqual(base.game_settings, {})
        recipe = parse_recipe(text(self.mutated(
            lambda d: d.update(gameSettings={"STARTUP_PRACTICE": False, "CURR_LEVEL": [100, 19]}))))
        self.assertEqual(recipe.game_settings, {"STARTUP_PRACTICE": False, "CURR_LEVEL": (100, 19)})
        self.assertNotEqual(recipe.fingerprint, base.fingerprint)
        other = parse_recipe(text(self.mutated(
            lambda d: d.update(gameSettings={"STARTUP_PRACTICE": False, "CURR_LEVEL": [100, 20]}))))
        self.assertNotEqual(other.fingerprint, recipe.fingerprint)
        for settings, expected in (({"STARTUP_PRACTICE": True}, {"STARTUP_PRACTICE": True}),
                                   ({"CURR_LEVEL": [0, 100]}, {"CURR_LEVEL": (0, 100)}), ({}, {})):
            document = self.mutated(lambda d: d.update(gameSettings=settings))
            self.assertEqual(parse_recipe(text(document)).game_settings, expected)

    def test_game_settings_rejections(self):
        cases = (
            ("recipe-key-unknown", {"DETAIL": True}),
            ("recipe-key-unknown", {"JOYSTICK": "0 0"}),
            ("recipe-key-unknown", {"curr_level": [100, 19]}),
            ("recipe-key-unknown", {"STARTUP_PRACTICE": False, "SOUND_LEVEL": 100}),
            ("recipe-type-invalid", []),
            ("recipe-type-invalid", "STARTUP_PRACTICE=FALSE"),
            ("recipe-type-invalid", {"STARTUP_PRACTICE": "FALSE"}),
            ("recipe-type-invalid", {"STARTUP_PRACTICE": 0}),
            ("recipe-type-invalid", {"STARTUP_PRACTICE": None}),
            ("recipe-type-invalid", {"CURR_LEVEL": "100 19"}),
            ("recipe-type-invalid", {"CURR_LEVEL": {"practice": 100, "campaign": 19}}),
            ("recipe-type-invalid", {"CURR_LEVEL": [100, 19.0]}),
            ("recipe-type-invalid", {"CURR_LEVEL": [True, 19]}),
            ("recipe-type-invalid", {"CURR_LEVEL": ["100", 19]}),
            ("recipe-value-invalid", {"CURR_LEVEL": []}),
            ("recipe-value-invalid", {"CURR_LEVEL": [19]}),
            ("recipe-value-invalid", {"CURR_LEVEL": [100, 19, 0]}),
            ("recipe-value-invalid", {"CURR_LEVEL": [101, 19]}),
            ("recipe-value-invalid", {"CURR_LEVEL": [-1, 19]}),
            ("recipe-value-invalid", {"CURR_LEVEL": [100, 101]}),
        )
        for code, settings in cases:
            with self.subTest(settings=settings):
                self.assertRejected(code, self.mutated(lambda d: d.update(gameSettings=settings)))
        duplicate = text(self.mutated(lambda d: d.update(gameSettings={"CURR_LEVEL": [100, 19]}))).replace(
            '"CURR_LEVEL": [100, 19]', '"CURR_LEVEL": [100, 19], "CURR_LEVEL": [0, 0]')
        self.assertEqual(self.assertRejected("recipe-json-invalid", duplicate).where, "CURR_LEVEL")

    def test_unknown_or_missing_version(self):
        for version in (2, 0, "1", 1.0, True, None):
            self.assertRejected("recipe-version-unsupported", self.mutated(lambda d: d.update(schemaVersion=version)))
        self.assertRejected("recipe-key-missing", self.mutated(lambda d: d.pop("schemaVersion")))

    def test_document_shape(self):
        self.assertRejected("recipe-type-invalid", "[]")
        self.assertRejected("recipe-json-invalid", "{")
        self.assertRejected("recipe-json-invalid", b"\xff\xfe")
        self.assertRejected("recipe-json-invalid", text(scenario_recipe(SHA))[:-1] + ', "recipeId": "again"}')
        self.assertRejected("recipe-json-invalid", text(scenario_recipe(SHA)).replace('"runSeconds": 60',
                                                                                      '"runSeconds": NaN'))
        self.assertRejected("recipe-too-large", " " * (MAX_RECIPE_BYTES + 1))
        padded = text(scenario_recipe(SHA))
        padded = padded[:-1] + " " * (MAX_RECIPE_BYTES - len(padded.encode("utf-8"))) + "}"
        self.assertEqual(len(padded.encode("utf-8")), MAX_RECIPE_BYTES)
        parse_recipe(padded)

    def test_unknown_keys_and_commands_rejected(self):
        self.assertRejected("recipe-key-unknown", self.mutated(lambda d: d.update(command="BPDEL *")))
        self.assertRejected("recipe-key-unknown", self.mutated(lambda d: d["fields"][0].update(expression="a+b")))
        self.assertRejected("recipe-key-unknown",
                            self.mutated(lambda d: d["pauses"][0]["stop"].update(debugger="BP 0:0")))
        self.assertRejected("recipe-key-unknown", self.mutated(lambda d: d["pauses"][1]["stop"].update(object=2)))
        self.assertRejected("recipe-key-unknown", self.mutated(lambda d: d["limits"].update(shell="rm -rf /")))

    def test_shell_strings_and_expressions_rejected(self):
        for unit in ("tick; rm -rf /", "$(id)", "`id`", "a|b", "tick s", "", "x" * 65, "../up"):
            self.assertRejected("recipe-value-invalid",
                                self.mutated(lambda d: d["fields"][0].update(unit=unit)))
        self.assertRejected("recipe-type-invalid",
                            self.mutated(lambda d: d["fields"][0]["address"].update(offset="0x800+4")))
        self.assertRejected("recipe-value-invalid",
                            self.mutated(lambda d: d["identity"]["config"].update(wingman="none && reboot")))
        self.assertRejected("recipe-value-invalid", self.mutated(lambda d: d.update(recipeId="id;ls")))
        self.assertRejected("recipe-value-invalid",
                            self.mutated(lambda d: d["source"].update(baselineVersion="v1 $(x)")))
        self.assertRejected("recipe-value-invalid", self.mutated(lambda d: d["source"].update(exeSha256="ABC")))

    def test_illegal_types(self):
        for kind in ("u64", "f64", "i8", "U32"):
            self.assertRejected("recipe-value-invalid", self.mutated(lambda d: d["fields"][0].update(type=kind)))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: d["fields"][0].update(type=4)))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: d["fields"][0].update(required="yes")))
        self.assertRejected("recipe-type-invalid",
                            self.mutated(lambda d: d["fields"][0]["address"].update(object=True)))
        self.assertRejected("recipe-type-invalid",
                            self.mutated(lambda d: d["fields"][0]["address"].update(offset=8.0)))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: d.update(fields={})))

    def test_illegal_locations(self):
        self.assertRejected("recipe-address-invalid",
                            self.mutated(lambda d: d["fields"][0]["address"].update(offset=-1)))
        self.assertRejected("recipe-address-invalid",
                            self.mutated(lambda d: d["fields"][0]["address"].update(offset=(1 << 32) - 2)))
        self.assertRejected("recipe-address-invalid",
                            self.mutated(lambda d: d["fields"][0]["address"].update(object=0)))
        self.assertRejected("recipe-address-invalid",
                            self.mutated(lambda d: d["fields"][6]["address"].update(pointers=[-4, 8])))
        self.assertRejected("recipe-address-invalid",
                            self.mutated(lambda d: d["pauses"][0]["stop"].update(offset=-16)))
        self.assertRejected("recipe-address-invalid",
                            self.mutated(lambda d: d["correlation"]["data"].update(offset=(1 << 32) - 8)))
        self.assertRejected("recipe-key-missing", self.mutated(lambda d: d["pauses"][0]["stop"].pop("offset")))
        self.assertRejected("recipe-value-invalid",
                            self.mutated(lambda d: d["pauses"][0]["stop"].update(kind="watch")))

    def test_low_page_fields(self):
        def add_low(document, address, kind="f32"):
            document["fields"].append({"id": "vector", "address": address, "type": kind, "unit": "raw"})
            document["pauses"][0]["fields"].append("vector")

        recipe = parse_recipe(text(self.mutated(lambda d: add_low(d, {"low": 0x2C}))))
        self.assertIsNone(recipe.fields["vector"].address.object)
        self.assertEqual(recipe.fields["vector"].address.offset, 0x2C)
        self.assertEqual(recipe.fields["vector"].address.pointers, ())
        self.assertEqual(recipe.objects(), frozenset({4}))
        parse_recipe(text(self.mutated(lambda d: add_low(d, {"low": 0xFFC}))))
        parse_recipe(text(self.mutated(lambda d: add_low(d, {"low": 0xFFF}, "u8"))))
        for address in ({"low": 0xFFD}, {"low": -1}, {"low": 1 << 32}):
            self.assertRejected("recipe-address-invalid", self.mutated(lambda d: add_low(d, address)))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: add_low(d, {"low": "0x2C"})))
        for address in ({"low": 0x2C, "pointers": [0]}, {"low": 0x2C, "object": 4}):
            self.assertRejected("recipe-key-unknown", self.mutated(lambda d: add_low(d, address)))

    def test_empty_recipe_parts(self):
        self.assertRejected("recipe-empty", self.mutated(lambda d: d.update(pauses=[])))
        self.assertRejected("recipe-empty", self.mutated(lambda d: d.update(fields=[])))
        self.assertRejected("recipe-empty", self.mutated(lambda d: d["identity"].update(mission={})))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: d["pauses"][1].update(fields="ticks")))

    def test_pauses_without_readings(self):
        def change(d):
            d["pauses"][1]["fields"] = []
            d["pauses"].insert(0, {"id": "gate", "stop": {"kind": "breakpoint", "object": 2, "offset": 0x1FA0}})
        recipe = parse_recipe(text(self.mutated(change)))
        self.assertEqual((recipe.pause("gate").fields, recipe.pause("end").fields), ((), ()))
        self.assertEqual({pause for pause, _ in recipe.planned()}, {"start"})  # the identity check binds "start"
        self.assertEqual(recipe.identity.checks[0].field, "scenario")

    def test_identifiers_and_references(self):
        self.assertRejected("recipe-id-duplicate", self.mutated(lambda d: d["fields"][1].update(id="ticks")))
        self.assertRejected("recipe-id-duplicate", self.mutated(lambda d: d["pauses"][1].update(id="start")))
        self.assertRejected("recipe-id-duplicate",
                            self.mutated(lambda d: d["pauses"][1].update(fields=["ticks", "ticks"])))
        self.assertRejected("recipe-reference-invalid",
                            self.mutated(lambda d: d["pauses"][1].update(fields=["scenario", "missing"])))
        unused = self.mutated(lambda d: d["fields"].append(
            {"id": "spare", "address": {"object": 4, "offset": 0}, "type": "u8", "unit": "x"}))
        self.assertRejected("recipe-reference-invalid", unused)
        self.assertRejected("recipe-reference-invalid",
                            self.mutated(lambda d: d["identity"].update(checks=[{"field": "speed", "equals": 1.5}])))

    def test_identity_check_values(self):
        self.assertRejected("recipe-value-invalid",
                            self.mutated(lambda d: d["identity"]["checks"][0].update(equals=1 << 40)))
        self.assertRejected("recipe-type-invalid",
                            self.mutated(lambda d: d["identity"]["checks"][0].update(equals=4242.0)))
        self.assertRejected("recipe-type-invalid",
                            self.mutated(lambda d: d["identity"]["checks"][0].update(equals="4242")))

        def float_check(value):
            def change(d):
                d["pauses"][1]["fields"].append("speed")
                d["identity"]["checks"] = [{"field": "speed", "equals": value}]
            return self.mutated(change)
        self.assertEqual(parse_recipe(text(float_check(1.5))).identity.checks[0].equals, 1.5)
        self.assertRejected("recipe-value-invalid", float_check(0.1))
        self.assertRejected("recipe-value-invalid", float_check(1e39))

    def test_limits_must_be_positive_finite_and_bounded(self):
        for key, value in (("runSeconds", 0), ("runSeconds", -1), ("runSeconds", 1e300), ("waitSeconds", 61),
                           ("maxPauses", 0), ("maxFields", -3), ("maxChainDepth", 0), ("repeatReads", 1),
                           ("repeatReads", CEILINGS["repeatReads"] + 1), ("maxReadBytes", 0),
                           ("maxLogBytes", CEILINGS["maxLogBytes"] + 1)):
            self.assertRejected("recipe-limit-invalid", self.mutated(lambda d: d["limits"].update({key: value})))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: d["limits"].update(maxPauses=2.0)))
        self.assertRejected("recipe-type-invalid", self.mutated(lambda d: d["limits"].update(runSeconds="60")))
        self.assertRejected("recipe-key-missing", self.mutated(lambda d: d["limits"].pop("maxLogBytes")))
        self.assertRejected("recipe-limit-invalid",
                            self.mutated(lambda d: d["correlation"]["code"].update(size=100)))
        self.assertRejected("recipe-limit-invalid",
                            self.mutated(lambda d: d["correlation"]["data"].update(size=4096)))

    def test_long_recipe_ceilings(self):
        self.assertEqual((MAX_RECIPE_BYTES, CEILINGS["maxPauses"], CEILINGS["maxLogBytes"]),
                         (256 * 1024, 2048, 4 << 30))

        def many(count):
            def change(d):
                template = d["pauses"][-1]
                for k in range(count - len(d["pauses"])):
                    extra = copy.deepcopy(template)
                    extra["id"] = f"extra-{k}"
                    extra.pop("stimuli", None)
                    d["pauses"].append(extra)
                d["limits"].update(maxPauses=count, maxLogBytes=CEILINGS["maxLogBytes"], runSeconds=24 * 3600,
                                   maxReadBytes=CEILINGS["maxReadBytes"])
            return change
        self.assertEqual(len(parse_recipe(text(self.mutated(many(CEILINGS["maxPauses"])))).pauses), CEILINGS["maxPauses"])
        self.assertRejected("recipe-limit-invalid",
                            self.mutated(lambda d: d["limits"].update(maxPauses=CEILINGS["maxPauses"] + 1)))

    def test_budgets(self):
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxPauses=1)))
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxFields=7)))
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxChainDepth=1)))
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxReadBytes=300)))

    def stimuli(self, devices=None, stimuli=None, change=None):
        def apply(d):
            d["pauses"].insert(0, {"id": "gate", "stop": {"kind": "breakpoint", "object": 2, "offset": 0x1FA0}})
            d["devices"] = devices if devices is not None else [
                {"id": "stick", "address": {"register": "ESI", "offset": 12}, "type": "i32"},
                {"id": "latch", "address": {"object": 4, "offset": 0x840}, "type": "u16"}]
            d["stimuli"] = stimuli if stimuli is not None else [
                {"id": "enter", "pause": "gate", "kind": "key", "ascii": 13, "scan": 28},
                {"id": "ctrl", "pause": "start", "kind": "shift", "flags": {"ctrl": True, "caps": False}},
                {"id": "deflect", "pause": "start", "kind": "device", "device": "stick", "value": -128},
                {"id": "latch", "pause": "end", "kind": "device", "device": "latch", "value": 513}]
            if change:
                change(d)
        return self.mutated(apply)

    def test_stimuli_and_devices(self):
        recipe = parse_recipe(text(self.stimuli()))
        stick, latch = recipe.devices.values()
        self.assertEqual((stick.register, stick.object, stick.offset, stick.size), ("ESI", None, 12, 4))
        self.assertEqual((latch.register, latch.object, latch.offset, latch.type), (None, 4, 0x840, "u16"))
        self.assertEqual([s.id for s in recipe.stimuli], ["enter", "ctrl", "deflect", "latch"])
        enter, ctrl, deflect, last = recipe.stimuli
        self.assertEqual((enter.kind, enter.key), ("key", (13, 28)))
        self.assertEqual((ctrl.kind, ctrl.flags), ("shift", (("ctrl", True), ("caps", False))))
        self.assertEqual((deflect.device, deflect.value), ("stick", -128))
        self.assertEqual([s.id for s in recipe.pause_stimuli("start")], ["ctrl", "deflect"])
        self.assertEqual(recipe.pause_stimuli("missing"), ())
        self.assertEqual(recipe.objects(), frozenset({4}))
        self.assertEqual(recipe.planned(), parse_recipe(text(scenario_recipe(SHA))).planned())
        plain = parse_recipe(text(scenario_recipe(SHA)))
        self.assertEqual((plain.devices, plain.stimuli), ({}, ()))
        self.assertNotEqual(recipe.fingerprint, plain.fingerprint)
        changed = parse_recipe(text(self.stimuli(change=lambda d: d["stimuli"][2].update(value=127))))
        self.assertNotEqual(changed.fingerprint, recipe.fingerprint)
        for boundary in (-0x80000000, 0x7FFFFFFF):
            self.assertEqual(parse_recipe(text(self.stimuli(
                change=lambda d: d["stimuli"][2].update(value=boundary)))).stimuli[2].value, boundary)
        only_keys = parse_recipe(text(self.stimuli(change=lambda d: d.pop("devices"), stimuli=[
            {"id": "enter", "pause": "gate", "kind": "key", "ascii": 13, "scan": 28},
            {"id": "minus", "pause": "start", "kind": "key", "ascii": 45, "scan": 12}])))
        self.assertEqual((only_keys.devices, len(only_keys.stimuli)), ({}, 2))

    def test_conditional_stimuli(self):
        """`if` selects a stimulus by an earlier (or the same pause's) integer reading (P3-08/10)."""
        def branch(d):
            d["stimuli"][3].update({"if": {"pause": "start", "field": "scenario", "equals": 4242}})
            d["stimuli"].append({"id": "latch-b", "pause": "end", "kind": "device", "device": "latch", "value": 7,
                                 "if": {"pause": "end", "field": "scenario", "equals": -1}})
        recipe = parse_recipe(text(self.stimuli(change=branch)))
        latch, other = recipe.stimuli[3:]
        self.assertEqual((latch.only_if[0].pause, latch.only_if[0].field, latch.only_if[1]), ("start", "scenario", 4242))
        self.assertEqual(other.only_if[1], 0xFFFFFFFF)  # compared as unsigned 32-bit values
        self.assertIsNone(recipe.stimuli[0].only_if)
        self.assertNotEqual(recipe.fingerprint, parse_recipe(text(self.stimuli())).fingerprint)
        cases = (
            ("recipe-key-unknown", lambda c: c.update(register="EAX")),
            ("recipe-key-missing", lambda c: c.pop("equals")),
            ("recipe-reference-invalid", lambda c: c.update(pause="missing")),
            ("recipe-reference-invalid", lambda c: c.update(pause="end", field="flag")),  # not read at that pause
            ("recipe-reference-invalid", lambda c: c.update(field="speed")),  # f32
            ("recipe-value-invalid", lambda c: c.update(equals=1 << 31)),  # outside the i32 field range
            ("recipe-type-invalid", lambda c: c.update(equals="4242")),
        )
        for code, change in cases:
            with self.subTest(code=code):
                def broken(d, change=change):
                    branch(d)
                    change(d["stimuli"][3]["if"])
                self.assertRejected(code, self.stimuli(change=broken))
        self.assertRejected("recipe-reference-invalid", self.stimuli(change=lambda d: d["stimuli"][1].update(
            {"if": {"pause": "end", "field": "scenario", "equals": 1}})))  # a later pause's reading

    def test_stimulus_rejections(self):
        cases = (
            ("recipe-key-unknown", lambda d: d["stimuli"][0].update(command="SM 0:0 0")),
            ("recipe-key-unknown", lambda d: d["stimuli"][0].update(value=1)),
            ("recipe-key-unknown", lambda d: d["stimuli"][1]["flags"].update(numlock=True)),
            ("recipe-key-unknown", lambda d: d["devices"][0]["address"].update(pointers=[4])),
            ("recipe-key-missing", lambda d: d["stimuli"][0].pop("scan")),
            ("recipe-key-missing", lambda d: d["stimuli"][3].pop("value")),
            ("recipe-type-invalid", lambda d: d["stimuli"][0].update(kind=1)),
            ("recipe-type-invalid", lambda d: d["stimuli"][0].update(ascii="13")),
            ("recipe-type-invalid", lambda d: d["stimuli"][1].update(flags=["ctrl"])),
            ("recipe-type-invalid", lambda d: d["stimuli"][1]["flags"].update(ctrl=1)),
            ("recipe-type-invalid", lambda d: d["stimuli"][2].update(value=1.0)),
            ("recipe-type-invalid", lambda d: d["devices"][0]["address"].update(register=1)),
            ("recipe-type-invalid", lambda d: d.update(stimuli={})),
            ("recipe-empty", lambda d: d["stimuli"][1].update(flags={})),
            ("recipe-empty", lambda d: d.update(stimuli=[])),
            ("recipe-value-invalid", lambda d: d["stimuli"][0].update(kind="mouse")),
            ("recipe-value-invalid", lambda d: d["stimuli"][0].update(ascii=256)),
            ("recipe-value-invalid", lambda d: d["stimuli"][0].update(scan=-1)),
            ("recipe-value-invalid", lambda d: d["stimuli"][2].update(value=1 << 31)),
            ("recipe-value-invalid", lambda d: d["stimuli"][3].update(value=-1)),
            ("recipe-value-invalid", lambda d: d["devices"][0].update(type="f32")),
            ("recipe-value-invalid", lambda d: d["devices"][0]["address"].update(register="EIP")),
            ("recipe-value-invalid", lambda d: d["stimuli"].append(
                {"id": "again", "pause": "gate", "kind": "key", "ascii": 27, "scan": 1})),
            ("recipe-value-invalid", lambda d: d["stimuli"][0].update(id="a;b")),
            ("recipe-value-invalid", lambda d: d["stimuli"].reverse()),  # declaration order is application order
            ("recipe-id-duplicate", lambda d: d["stimuli"][1].update(id="enter")),
            ("recipe-id-duplicate", lambda d: d["devices"][1].update(id="stick")),
            ("recipe-reference-invalid", lambda d: d["stimuli"][0].update(pause="missing")),
            ("recipe-reference-invalid", lambda d: d["stimuli"][2].update(device="missing")),
            ("recipe-reference-invalid", lambda d: d["stimuli"][2].update(pause="end")),  # register at a VRT stop
            ("recipe-reference-invalid", lambda d: d["stimuli"].pop(3)),  # a declared device nothing writes
            ("recipe-reference-invalid", lambda d: d.pop("devices")),
            ("recipe-address-invalid", lambda d: d["devices"][0]["address"].update(object=4)),
            ("recipe-address-invalid", lambda d: d["devices"][1]["address"].pop("object")),
            ("recipe-address-invalid", lambda d: d["devices"][0]["address"].update(offset=0x10000)),
            ("recipe-address-invalid", lambda d: d["devices"][0]["address"].update(offset=-0x10001)),
            ("recipe-address-invalid", lambda d: d["devices"][1]["address"].update(offset=(1 << 32) - 1)),
            ("recipe-address-invalid", lambda d: d["devices"][1]["address"].update(object=0)),
            ("recipe-budget-exceeded", lambda d: d["limits"].update(maxReadBytes=306)),
        )
        self.assertEqual(parse_recipe(text(self.stimuli(change=lambda d: d["limits"].update(
            maxReadBytes=306 + 20 + 4 + 12 + 6)))).id, "synthetic-timebase")
        for code, change in cases:
            with self.subTest(code=code):
                self.assertRejected(code, self.stimuli(change=change))

    def register_field(self, change=None, pause="start"):
        def apply(d):
            d["fields"].append({"id": "subject", "address": {"register": "ESI", "offset": 0x10, "pointers": [8]},
                                "type": "u32", "unit": "count"})
            for item in d["pauses"]:
                if item["id"] == pause:
                    item["fields"].append("subject")
            if change:
                change(d)
        return self.mutated(apply)

    def test_register_relative_fields(self):
        recipe = parse_recipe(text(self.register_field()))
        subject = recipe.fields["subject"].address
        self.assertEqual((subject.register, subject.object, subject.offset, subject.pointers), ("ESI", None, 0x10, (8,)))
        self.assertIsNone(recipe.fields["ticks"].address.register)
        self.assertEqual(recipe.objects(), frozenset({4}))
        self.assertIn(("start", "subject"), recipe.planned())
        self.assertNotEqual(recipe.fingerprint, parse_recipe(text(scenario_recipe(SHA))).fingerprint)
        for offset in (-0x10000, 0xFFFF):
            self.assertEqual(parse_recipe(text(self.register_field(
                lambda d: d["fields"][-1]["address"].update(offset=offset)))).fields["subject"].address.offset, offset)
        cases = (
            ("recipe-address-invalid", lambda d: d["fields"][-1]["address"].update(object=4)),
            ("recipe-address-invalid", lambda d: d["fields"][-1]["address"].pop("register")),
            ("recipe-address-invalid", lambda d: d["fields"][-1]["address"].update(offset=0x10000)),
            ("recipe-address-invalid", lambda d: d["fields"][-1]["address"].update(offset=-0x10001)),
            ("recipe-address-invalid", lambda d: d["fields"][-1]["address"].update(pointers=[-1])),
            ("recipe-type-invalid", lambda d: d["fields"][-1]["address"].update(register=1)),
            ("recipe-value-invalid", lambda d: d["fields"][-1]["address"].update(register="EIP")),
            ("recipe-key-missing", lambda d: d["fields"][-1]["address"].pop("offset")),
            ("recipe-budget-exceeded", lambda d: d["fields"][-1]["address"].update(pointers=[0, 0, 0])),
        )
        for code, change in cases:
            with self.subTest(code=code):
                self.assertRejected(code, self.register_field(change))
        self.assertRejected("recipe-reference-invalid", self.register_field(pause="end"))  # a VRT stop has none

    def test_low_and_register_fields_together(self):
        def add_low(pause, address=None):
            def change(d):
                d["fields"].append({"id": "vector", "address": address or {"low": 0x2C}, "type": "f32", "unit": "raw"})
                next(item for item in d["pauses"] if item["id"] == pause)["fields"].append("vector")
            return change

        recipe = parse_recipe(text(self.register_field(add_low("start"))))
        self.assertEqual({name: recipe.fields[name].address.low for name in ("ticks", "subject", "vector")},
                         {"ticks": False, "subject": False, "vector": True})
        self.assertEqual(recipe.objects(), frozenset({4}))
        recipe = parse_recipe(text(self.register_field(add_low("end"))))  # a `low` field needs no register
        self.assertIn(("end", "vector"), recipe.planned())
        for address in ({"low": 0x2C, "register": "ESI"}, {"low": 0x2C, "register": "ESI", "offset": 0x10}):
            with self.subTest(address=address):
                self.assertRejected("recipe-key-unknown", self.register_field(add_low("start", address)))

    def selection(self, change=None):
        """The scenario plus a conditional pause at alternative sites and a field bound to a `start` reading."""
        def build(d):
            when = {"register": "EBX", "in": [{"pause": "start", "field": "count"}, 7]}
            d["pauses"].insert(1, {"id": "pick", "stop": {"kind": "breakpoint", "object": 2,
                                                          "offsets": [0x1F90, 0x1FA0], "when": when}})
            d["fields"].append({"id": "node", "address": {"bound": {"pause": "start", "field": "ticks"}, "offset": -4,
                                                          "pointers": [8]}, "type": "u16", "unit": "count"})
            d["pauses"][2]["fields"].append("node")
            if change is not None:
                change(d)
        return self.mutated(build)

    def test_old_recipe_fingerprint_is_unchanged(self):
        recipe = parse_recipe(text(scenario_recipe(SHA)))
        canonical = json.dumps(scenario_recipe(SHA), sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        self.assertEqual(recipe.fingerprint, "sha256:" + hashlib.sha256(canonical.encode("ascii")).hexdigest())
        self.assertTrue(recipe.fingerprint.startswith("sha256:1797bd67b3d26a6e"))  # the value before this feature
        self.assertEqual(recipe.pause("start").stop.sites, (recipe.pause("start").stop.site,))
        self.assertEqual((recipe.pause("start").stop.alternatives, recipe.pause("start").stop.when), ((), None))
        self.assertEqual(recipe.pause("end").stop.sites, ())
        self.assertEqual(recipe.limits.max_skipped_hits, 100_000)
        limited = parse_recipe(text(self.mutated(lambda d: d["limits"].update(maxSkippedHits=0))))
        self.assertEqual(limited.limits.max_skipped_hits, 0)
        self.assertNotEqual(limited.fingerprint, recipe.fingerprint)
        for value in (CEILINGS["maxSkippedHits"] + 1, -1):
            self.assertRejected("recipe-limit-invalid",
                                self.mutated(lambda d: d["limits"].update(maxSkippedHits=value)))

    def test_alternative_sites_condition_and_bound_field(self):
        recipe = parse_recipe(text(self.selection()))
        stop = recipe.pause("pick").stop
        self.assertEqual([(site.object, site.offset) for site in stop.sites], [(2, 0x1F90), (2, 0x1FA0)])
        self.assertEqual(stop.site, stop.sites[0])
        self.assertEqual((stop.when.register, stop.when.include), ("EBX", True))
        self.assertEqual(stop.when.values[1], 7)
        self.assertEqual((stop.when.values[0].pause, stop.when.values[0].field), ("start", "count"))
        node = recipe.fields["node"].address
        self.assertEqual((node.object, node.register, node.low, node.offset, node.pointers),
                         (None, None, False, -4, (8,)))
        self.assertEqual((node.bound.pause, node.bound.field), ("start", "ticks"))
        self.assertEqual(stop.when.to_json([0xFFFF, 7]), {"register": "EBX", "in": ["ffff", "7"]})
        self.assertNotIn(None, recipe.objects())

        def chain(d):  # a bound field may name a bound field's reading at an earlier pause
            d["fields"].append({"id": "next", "address": {"bound": {"pause": "pick", "field": "node"}, "offset": 0},
                                "type": "u32", "unit": "raw"})
            d["pauses"][1]["fields"] = ["scenario", "node"]  # identity check fields are read at every pause
            d["pauses"][2]["fields"].append("next")
        self.assertEqual(parse_recipe(text(self.selection(chain))).fields["next"].address.bound.field, "node")

        def single(d):  # a condition at a single site, excluding values, at a pause without fields
            d["pauses"][1]["stop"] = {"kind": "breakpoint", "object": 2, "offset": 0x1F90,
                                      "when": {"register": "EAX", "notIn": [0, 0xFFFFFFFF]}}
        stop = parse_recipe(text(self.selection(single))).pause("pick").stop
        self.assertEqual((stop.alternatives, stop.when.include, stop.when.values), ((), False, (0, 0xFFFFFFFF)))

        def limited(d):  # a condition limited to one of the alternative sites
            d["pauses"][1]["stop"]["when"]["at"] = [0x1FA0]
        recipe = parse_recipe(text(self.selection(limited)))
        stop = recipe.pause("pick").stop
        self.assertEqual(stop.when.sites, (stop.sites[1],))
        self.assertEqual((stop.when.applies(stop.sites[0]), stop.when.applies(stop.sites[1])), (False, True))
        self.assertEqual(stop.when.to_json([7]), {"register": "EBX", "in": ["7"], "at": ["1fa0"]})
        self.assertNotEqual(recipe.fingerprint, parse_recipe(text(self.selection())).fingerprint)
        self.assertTrue(parse_recipe(text(self.selection())).pause("pick").stop.when.applies(stop.sites[0]))

    def test_alternative_sites_and_condition_rejections(self):
        def stop(**changes):
            def change(d):
                d["pauses"][1]["stop"].update(changes)
                for key in [key for key, value in changes.items() if value is None]:
                    del d["pauses"][1]["stop"][key]
            return change

        def when(value):
            return stop(when=value)

        ref = {"pause": "start", "field": "count"}
        cases = [
            ("recipe-key-missing", stop(offsets=None)),
            ("recipe-address-invalid", stop(offset=0x1F90)),
            ("recipe-type-invalid", stop(offsets=0x1F90)),
            ("recipe-value-invalid", stop(offsets=[0x1F90])),
            ("recipe-value-invalid", stop(offsets=[1, 2, 3, 4, 5])),
            ("recipe-value-invalid", stop(offsets=[0x1F90, 0x1F90])),
            ("recipe-value-invalid", stop(offsets=[])),
            ("recipe-type-invalid", stop(offsets=[0x1F90, "0x1FA0"])),
            ("recipe-address-invalid", stop(offsets=[0x1F90, -1])),
            ("recipe-key-unknown", lambda d: d["pauses"][2]["stop"].update(when={"register": "EBX", "in": [1]})),
            ("recipe-key-unknown", lambda d: d["pauses"][2]["stop"].update(offsets=[1, 2])),
            ("recipe-key-unknown", when({"register": "EBX", "in": [1], "other": 1})),
            ("recipe-key-missing", when({"in": [1]})),
            ("recipe-key-missing", when({"register": "EBX"})),
            ("recipe-value-invalid", when({"register": "EBX", "in": [1], "notIn": [2]})),
            ("recipe-type-invalid", when({"register": 3, "in": [1]})),
            ("recipe-value-invalid", when({"register": "EIP", "in": [1]})),
            ("recipe-type-invalid", when({"register": "EBX", "in": 1})),
            ("recipe-empty", when({"register": "EBX", "notIn": []})),
            ("recipe-budget-exceeded", when({"register": "EBX", "in": list(range(17))})),
            ("recipe-value-invalid", when({"register": "EBX", "in": [-1]})),
            ("recipe-value-invalid", when({"register": "EBX", "in": [1 << 32]})),
            ("recipe-type-invalid", when({"register": "EBX", "in": ["1"]})),
            ("recipe-type-invalid", when({"register": "EBX", "in": [True]})),
            ("recipe-value-invalid", when({"register": "EBX", "in": [1], "at": [0x1F90, 0x1FA0]})),
            ("recipe-value-invalid", when({"register": "EBX", "in": [1], "at": [0x1F80]})),
            ("recipe-value-invalid", when({"register": "EBX", "in": [1], "at": []})),
            ("recipe-type-invalid", when({"register": "EBX", "in": [1], "at": 0x1F90})),
            ("recipe-type-invalid", when({"register": "EBX", "in": [1], "at": ["1f90"]})),
            ("recipe-key-unknown", lambda d: d["pauses"][1].update(stop={
                "kind": "breakpoint", "object": 2, "offset": 0x1F90,
                "when": {"register": "EBX", "in": [1], "at": [0x1F90]}})),  # `at` needs alternative sites
            ("recipe-key-unknown", when({"register": "EBX", "in": [{**ref, "offset": 0}]})),
            ("recipe-key-missing", when({"register": "EBX", "in": [{"pause": "start"}]})),
            ("recipe-reference-invalid", when({"register": "EBX", "in": [{"pause": "end", "field": "ticks"}]})),
            ("recipe-reference-invalid", when({"register": "EBX", "in": [{"pause": "pick", "field": "node"}]})),
            ("recipe-reference-invalid", when({"register": "EBX", "in": [{"pause": "missing", "field": "ticks"}]})),
            ("recipe-reference-invalid", when({"register": "EBX", "in": [{"pause": "start", "field": "node"}]})),
            ("recipe-reference-invalid", when({"register": "EBX", "in": [{"pause": "start", "field": "speed"}]})),
        ]
        for code, change in cases:
            with self.subTest(code=code):
                self.assertRejected(code, self.selection(change))

    def test_bound_field_rejections(self):
        def address(**changes):
            def change(d):
                d["fields"][-1]["address"].update(changes)
                for key in [key for key, value in changes.items() if value is None]:
                    del d["fields"][-1]["address"][key]
            return change

        def listed_at(index):
            def change(d):
                d["pauses"][2]["fields"].remove("node")
                d["pauses"][index]["fields"] = d["pauses"][index].get("fields", ["scenario"]) + ["node"]
            return change

        cases = [
            ("recipe-key-missing", address(offset=None)),
            ("recipe-key-unknown", address(object=4)),
            ("recipe-key-unknown", address(register="ESI")),
            ("recipe-type-invalid", address(offset="0")),
            ("recipe-address-invalid", address(offset=0x10000)),
            ("recipe-address-invalid", address(offset=-0x10001)),
            ("recipe-key-unknown", address(bound={"pause": "start", "field": "ticks", "offset": 0})),
            ("recipe-key-missing", address(bound={"field": "ticks"})),
            ("recipe-type-invalid", address(bound="start")),
            ("recipe-reference-invalid", address(bound={"pause": "missing", "field": "ticks"})),
            ("recipe-reference-invalid", address(bound={"pause": "start", "field": "speed"})),  # f32
            ("recipe-reference-invalid", address(bound={"pause": "end", "field": "ticks"})),  # its own pause
            ("recipe-reference-invalid", address(bound={"pause": "pick", "field": "ticks"})),  # not listed there
            ("recipe-reference-invalid", listed_at(0)),  # read at the referenced pause itself
            ("recipe-reference-invalid", lambda d: d["pauses"][2]["fields"].remove("node")),  # a field no pause lists
        ]
        for code, change in cases:
            with self.subTest(code=code):
                self.assertRejected(code, self.selection(change))
        parse_recipe(text(self.selection(listed_at(1))))  # a breakpoint pause after the referenced one

    def test_register_references(self):
        def refer(when_ref, bound_ref):
            def change(d):
                d["pauses"][1]["stop"]["when"] = {"register": "EBX", "notIn": [when_ref]}
                d["fields"][-1]["address"]["bound"] = bound_ref
            return change

        recipe = parse_recipe(text(self.selection(refer({"pause": "start", "register": "ESI"},
                                                        {"pause": "pick", "register": "EDI"}))))
        value = recipe.pause("pick").stop.when.values[0]
        self.assertEqual((value.pause, value.field, value.register), ("start", None, "ESI"))
        bound = recipe.fields["node"].address.bound
        self.assertEqual((bound.pause, bound.field, bound.register), ("pick", None, "EDI"))  # a fieldless pause

        good = {"pause": "start", "register": "ESI"}
        cases = [
            ("recipe-reference-invalid", {"pause": "end", "register": "ESI"}, good),  # a VRT pause
            ("recipe-reference-invalid", {"pause": "pick", "register": "ESI"}, good),  # its own pause
            ("recipe-reference-invalid", {"pause": "missing", "register": "ESI"}, good),
            ("recipe-reference-invalid", good, {"pause": "end", "register": "ESI"}),  # its own VRT pause
            ("recipe-value-invalid", {"pause": "start", "field": "count", "register": "ESI"}, good),
            ("recipe-value-invalid", good, {"pause": "start", "field": "ticks", "register": "ESI"}),
            ("recipe-key-missing", {"pause": "start"}, good),
            ("recipe-value-invalid", {"pause": "start", "register": "EIP"}, good),
            ("recipe-value-invalid", good, {"pause": "start", "register": "esi"}),
            ("recipe-type-invalid", {"pause": "start", "register": 6}, good),
            ("recipe-key-unknown", {"pause": "start", "register": "ESI", "offset": 0}, good),
            ("recipe-key-unknown", good, {"pause": "start", "register": "ESI", "offset": 0}),
        ]
        for code, when_ref, bound_ref in cases:
            with self.subTest(code=code, when=when_ref, bound=bound_ref):
                self.assertRejected(code, self.selection(refer(when_ref, bound_ref)))

    # -- reading tests (P3-10 subtask 09) ---------------------------------------------------------------------------
    UNTIL = {"every": 3, "any": [{"field": "speed", "gt": {"pause": "start", "field": "speed", "offset": 0.5}},
                                 {"field": "count", "ne": 65535}, {"field": "neg", "le": {"field": "delta"}}]}

    def waiting(self, until=None, change=None):
        """The scenario plus a breakpoint pause "wait" (no fields) between `start` and `end` with an `until` test."""
        def apply(d):
            d["pauses"].insert(1, {"id": "wait", "stop": {"kind": "breakpoint", "object": 2, "offset": 0x1F90,
                                                          "until": copy.deepcopy(until or self.UNTIL)}})
            if change is not None:
                change(d)
        return self.mutated(apply)

    def test_until_stop(self):
        recipe = parse_recipe(text(self.waiting()))
        until = recipe.pause("wait").stop.until
        self.assertEqual((until.every, until.test.any_of), (3, True))
        self.assertEqual(until.test.fields(), ("speed", "count", "neg", "delta"))
        self.assertEqual(until.test.references(), (("start", "speed"),))
        self.assertEqual(until.to_json(), self.UNTIL)
        self.assertIsNone(recipe.pause("wait").stop.when)
        self.assertEqual(recipe.pause("wait").fields, ())
        self.assertEqual(recipe.planned(), parse_recipe(text(scenario_recipe(SHA))).planned())
        self.assertEqual(parse_recipe(text(self.waiting({"all": [{"field": "flag", "eq": 1}]}))).pause(
            "wait").stop.until.every, 1)
        self.assertNotEqual(recipe.fingerprint, parse_recipe(text(self.waiting({**self.UNTIL, "every": 4}))).fingerprint)

        def own_field(d):  # a test field need not be listed by any pause: the probe reads it
            d["fields"].append({"id": "probe-only", "address": {"object": 4, "offset": 0x850}, "type": "f32",
                                "unit": "raw"})
            d["pauses"][1]["stop"]["until"] = {"all": [{"field": "probe-only", "lt": -2.5e3}]}
        self.assertEqual(parse_recipe(text(self.waiting(change=own_field))).pause("wait").stop.until.test.fields(),
                         ("probe-only",))

        def bare(d):  # without the test the probe-only field would be unused
            d["fields"].append({"id": "probe-only", "address": {"object": 4, "offset": 0x850}, "type": "f32",
                                "unit": "raw"})
        self.assertRejected("recipe-reference-invalid", self.mutated(bare))

    def test_reading_test_logic(self):
        test = parse_recipe(text(self.waiting())).pause("wait").stop.until.test
        earlier = {("start", "speed"): 1.5}
        self.assertTrue(test.evaluate({"speed": 2.5, "count": 65535, "neg": 0, "delta": -5}, earlier))
        self.assertFalse(test.evaluate({"speed": 2.0, "count": 65535, "neg": 0, "delta": -5}, earlier))
        self.assertTrue(test.evaluate({"count": 1}, earlier))  # one true comparison decides `any`
        self.assertIsNone(test.evaluate({"count": 65535, "neg": 0, "delta": -5}, earlier))  # speed unknown
        self.assertIsNone(test.evaluate({"speed": 9.0, "count": 65535}, {}))  # the earlier reading is missing
        every = parse_recipe(text(self.waiting({"all": [{"field": "count", "ge": 2}, {"field": "neg", "lt": 0}]})))
        test = every.pause("wait").stop.until.test
        self.assertFalse(test.evaluate({"count": 1}, {}))  # one false comparison decides `all`
        self.assertIsNone(test.evaluate({"count": 2}, {}))
        self.assertTrue(test.evaluate({"count": 2, "neg": -1}, {}))
        self.assertEqual(test.to_json(), {"all": [{"field": "count", "ge": 2}, {"field": "neg", "lt": 0}]})

    def test_until_rejections(self):
        def until(**changes):
            return self.waiting({**self.UNTIL, **changes})

        def clause(item):
            return self.waiting({"all": [item]})

        cases = [
            ("recipe-key-unknown", self.mutated(lambda d: d["pauses"][1]["stop"].update(until=self.UNTIL))),  # VRT
            ("recipe-value-invalid", until(every=0)),
            ("recipe-value-invalid", until(every=10_001)),
            ("recipe-type-invalid", until(every="2")),
            ("recipe-value-invalid", until(all=[{"field": "flag", "eq": 0}])),
            ("recipe-key-missing", self.waiting({"every": 2})),
            ("recipe-key-unknown", until(expression="speed > 2")),
            ("recipe-empty", self.waiting({"all": []})),
            ("recipe-type-invalid", self.waiting({"all": {"field": "flag", "eq": 0}})),
            ("recipe-budget-exceeded", self.waiting({"all": [{"field": "flag", "eq": 0}] * 17})),
            ("recipe-key-missing", clause({"field": "flag"})),
            ("recipe-value-invalid", clause({"field": "flag", "eq": 0, "ne": 1})),
            ("recipe-key-unknown", clause({"field": "flag", "between": [0, 1]})),
            ("recipe-key-missing", clause({"eq": 0})),
            ("recipe-reference-invalid", clause({"field": "missing", "eq": 0})),
            ("recipe-value-invalid", clause({"field": "flag ", "eq": 0})),
            ("recipe-type-invalid", clause({"field": "flag", "eq": True})),
            ("recipe-type-invalid", clause({"field": "flag", "eq": "0"})),
            ("recipe-type-invalid", clause({"field": "flag", "eq": None})),
            ("recipe-value-invalid", clause({"field": "flag", "eq": (1 << 53) + 1})),
            ("recipe-reference-invalid", clause({"field": "flag", "eq": {"field": "missing"}})),
            ("recipe-reference-invalid", clause({"field": "flag", "eq": {"pause": "end", "field": "ticks"}})),
            ("recipe-reference-invalid", clause({"field": "flag", "eq": {"pause": "wait", "field": "flag"}})),
            ("recipe-reference-invalid", clause({"field": "flag", "eq": {"pause": "start", "field": "missing"}})),
            ("recipe-key-missing", clause({"field": "flag", "eq": {"pause": "start"}})),
            ("recipe-key-unknown", clause({"field": "flag", "eq": {"field": "count", "scale": 2}})),
            ("recipe-type-invalid", clause({"field": "flag", "eq": {"field": "count", "offset": "1"}})),
            ("recipe-value-invalid", clause({"field": "flag", "eq": {"field": "count", "offset": -(1 << 54)}})),
        ]
        for code, document in cases:
            with self.subTest(code=code, document=document["pauses"]):
                self.assertRejected(code, document)

        def short_end(d):  # `end` no longer lists `ticks`
            d["pauses"][2]["fields"] = ["scenario"]
            d["pauses"][1]["stop"]["until"] = {"all": [{"field": "flag", "eq": {"pause": "end", "field": "ticks"}}]}
        self.assertRejected("recipe-reference-invalid", self.waiting(change=short_end))

        def late_bound(d):  # a probed bound field must name an earlier pause's reading
            d["fields"].append({"id": "node", "address": {"bound": {"pause": "end", "field": "ticks"}, "offset": 0},
                                "type": "u32", "unit": "raw"})
            d["pauses"][1]["stop"]["until"] = {"all": [{"field": "node", "eq": 1}]}
        self.assertRejected("recipe-reference-invalid", self.waiting(change=late_bound))

    def test_until_probe_counts_against_the_budget(self):
        def limit(document, value):
            document = copy.deepcopy(document)
            document["limits"]["maxReadBytes"] = value
            return document

        plain = scenario_recipe(SHA)
        low = next(value for value in range(64, 4096) if self.accepts(limit(plain, value)))
        self.assertRejected("recipe-budget-exceeded", limit(self.waiting(), low))
        windows = parse_recipe(text(plain))
        probe = windows.code_window.size + windows.data_window.size + 2 * (4 + 2 + 4 + 2)  # speed, count, neg, delta
        self.assertFalse(self.accepts(limit(self.waiting(), low + probe - 1)))
        self.assertTrue(self.accepts(limit(self.waiting(), low + probe)))

    def accepts(self, document):
        try:
            parse_recipe(text(document))
        except BaselineError as error:
            self.assertEqual(error.code, "recipe-budget-exceeded")
            return False
        return True

    def test_stimulus_tests(self):
        def tests(d):
            d["stimuli"][1]["if"] = {"all": [{"field": "neg", "lt": -1000}]}  # `start` reads neg
            d["stimuli"][2]["if"] = {"any": [{"field": "ticks", "ge": {"field": "count", "offset": -3}},
                                             {"field": "speed", "eq": 1.5}]}
            d["stimuli"][3]["if"] = {"all": [{"field": "ticks", "gt": {"pause": "start", "field": "ticks"}}]}
            d["stimuli"][0]["if"] = {"all": [{"field": "scenario", "eq": 1}]}
            d["pauses"][0]["fields"] = ["scenario"]  # the key's gate reads the identity check field
        recipe = parse_recipe(text(self.stimuli(change=tests)))
        enter, ctrl, deflect, latch = recipe.stimuli
        self.assertEqual((enter.kind, enter.test.fields()), ("key", ("scenario",)))
        self.assertEqual(ctrl.test.to_json(), {"all": [{"field": "neg", "lt": -1000}]})
        self.assertEqual(deflect.test.fields(), ("ticks", "count", "speed"))
        self.assertEqual(latch.test.references(), (("start", "ticks"),))
        plain = parse_recipe(text(self.stimuli()))
        self.assertIsNone(plain.stimuli[0].test)
        self.assertNotEqual(recipe.fingerprint, plain.fingerprint)

        def stimulus_test(index, value):
            return lambda d: d["stimuli"][index].update({"if": value})

        cases = [
            # the gate reads no field, and nothing precedes it
            ("recipe-reference-invalid", stimulus_test(0, {"all": [{"field": "ticks", "eq": 1}]})),
            ("recipe-reference-invalid", stimulus_test(1, {"all": [{"field": "flag", "eq": {"pause": "start",
                                                                                           "field": "flag"}}]})),
            ("recipe-reference-invalid", stimulus_test(3, {"all": [{"field": "flag", "eq": 1}]})),  # `end` lacks flag
            ("recipe-reference-invalid", stimulus_test(1, {"all": [{"field": "flag", "eq": {"field": "missing"}}]})),
            ("recipe-key-missing", stimulus_test(1, {})),
            ("recipe-type-invalid", stimulus_test(1, [{"field": "flag", "eq": 1}])),
            ("recipe-key-unknown", stimulus_test(1, {"all": [{"field": "flag", "eq": 1}], "every": 2})),
        ]
        for code, change in cases:
            with self.subTest(code=code):
                self.assertRejected(code, self.stimuli(change=change))

    def test_source_verification(self):
        recipe = parse_recipe(text(scenario_recipe(SHA)))
        verify_source(recipe, "synthetic-1", SHA)
        for version, sha in (("synthetic-2", SHA), ("synthetic-1", exe_fingerprint(b"other"))):
            with self.assertRaises(BaselineError) as caught:
                verify_source(recipe, version, sha)
            self.assertEqual(caught.exception.code, "source-mismatch")


if __name__ == "__main__":
    unittest.main()
