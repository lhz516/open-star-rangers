import access_guard  # noqa: F401  (installs the no-original-access guard first)

import copy
import json
import unittest

from reasons import REASON_SET, BaselineError
from recipe import CEILINGS, exe_fingerprint, parse_recipe, verify_source
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
        self.assertRejected("recipe-too-large", " " * (64 * 1024 + 1))

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

    def test_empty_recipe_parts(self):
        self.assertRejected("recipe-empty", self.mutated(lambda d: d.update(pauses=[])))
        self.assertRejected("recipe-empty", self.mutated(lambda d: d.update(fields=[])))
        self.assertRejected("recipe-empty", self.mutated(lambda d: d["pauses"][1].update(fields=[])))
        self.assertRejected("recipe-empty", self.mutated(lambda d: d["identity"].update(mission={})))

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

    def test_budgets(self):
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxPauses=1)))
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxFields=7)))
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxChainDepth=1)))
        self.assertRejected("recipe-budget-exceeded", self.mutated(lambda d: d["limits"].update(maxReadBytes=300)))

    def test_source_verification(self):
        recipe = parse_recipe(text(scenario_recipe(SHA)))
        verify_source(recipe, "synthetic-1", SHA)
        for version, sha in (("synthetic-2", SHA), ("synthetic-1", exe_fingerprint(b"other"))):
            with self.assertRaises(BaselineError) as caught:
                verify_source(recipe, version, sha)
            self.assertEqual(caught.exception.code, "source-mismatch")


if __name__ == "__main__":
    unittest.main()
