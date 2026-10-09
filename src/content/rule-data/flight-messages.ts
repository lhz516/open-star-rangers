import { byteStrings, records, type ByteString } from './rule-data-fields.ts';

// Canonical content of `data/flight-messages` (P3-03 spec S-08): the seven EXE strings the loop queues for the message
// line through `0x4e9e8`, named by their confirmed sender and condition (docs/original/formats/executable.md, flight
// message strings). Each is a byte string as stored; nothing formats or interprets them. When and where they show is
// P3-11's and P3-13's; whether the joystick keys are wired is P3-05's.

/** Structural limit: twice the longest string of executable.md (45 bytes), rounded up to a power of two. */
export const FLIGHT_MESSAGES_LIMITS = Object.freeze({ textBytes: 128 });

export interface FlightMessages {
  /** `0x17106c`: the completion message of in-mission state 4. */
  readonly missionComplete: ByteString;
  /** `0x171094`: the beacon message. */
  readonly beacon: ByteString;
  /** `0x170db8`: the speed-assist toggle, when the toggled byte is now non-zero. */
  readonly speedAssistOn: ByteString;
  /** `0x170dc8`: the speed-assist toggle, when the toggled byte is now zero. */
  readonly speedAssistOff: ByteString;
  /** `0x170ddc`: the joystick sensitivity key set level 1. */
  readonly joystickSensitivity1: ByteString;
  /** `0x170df8`: the joystick sensitivity key set level 2. */
  readonly joystickSensitivity2: ByteString;
  /** `0x170e14`: the joystick sensitivity key set level 0. */
  readonly joystickSensitivity0: ByteString;
}

const readText = byteStrings(FLIGHT_MESSAGES_LIMITS.textBytes);

const readMessages = records<FlightMessages>({
  missionComplete: readText,
  beacon: readText,
  speedAssistOn: readText,
  speedAssistOff: readText,
  joystickSensitivity1: readText,
  joystickSensitivity2: readText,
  joystickSensitivity0: readText,
});

/** Strictly reads `data/flight-messages` content into frozen data isolated from `value`. */
export const readFlightMessages = (value: unknown, path = 'flightMessages'): FlightMessages => readMessages(value, path);
