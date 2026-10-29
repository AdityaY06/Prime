// ─── PRIME · Web Bluetooth HR strap client (R20-b — sensor hub · R22-b — RR) ──
// A minimal, pure-ish GATT client for BLE chest straps (Polar H10, Garmin
// HRM, Magene, Coospo — anything speaking the Heart Rate Service). NO npm
// dependency: the Web Bluetooth surface we consume is hand-typed below as
// ambient declarations, typed exactly to the calls we make and nothing more.
//
// SPECS: Bluetooth SIG GATT Specification Supplement — Heart Rate Service
// 0x180D, Heart Rate Measurement characteristic 0x2A37, Battery Service
// 0x180F / Battery Level 0x2A19, Device Information Service 0x180A.
//
// R22-b: the 0x2A37 payload is parsed in FULL — beyond the BPM, the flags
// bits 3/4 gate an optional energy-expended field and the RR-interval
// section (UINT16 LE, 1/1024 s units) that real chest straps send 1–3 of
// per notification. RR feeds the live RMSSD HRV estimate (lib/sensors/hrv);
// most wrist devices never set the RR flag — absence is honest, not an error.
//
// WEB BLUETOOTH LAW: requestDevice() MUST run inside a user gesture (a tap
// on CONNECT). After a GATT drop, reconnecting to the SAME device via
// device.gatt.connect() needs no chooser — but in Chrome a re-request
// through requestDevice for a previously granted device also requires a
// gesture. The controller therefore exposes reconnect() for transient drops
// (no chooser) and the store falls back to connectStrap() (chooser, must be
// tapped) whenever no controller survived.

// ── Ambient minimal Web Bluetooth typings (lib.dom ships none) ───────────────

interface BluetoothLEScanFilter {
  services: (string | number)[]
}

interface BluetoothRequestDeviceOptions {
  filters: BluetoothLEScanFilter[]
  optionalServices?: (string | number)[]
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value: DataView | null
  readValue(): Promise<DataView>
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string | number): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>
}

interface BluetoothDevice extends EventTarget {
  readonly id: string
  readonly name: string | null
  readonly gatt: BluetoothRemoteGATTServer | null
}

interface Bluetooth {
  requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>
}

declare global {
  interface Navigator {
    readonly bluetooth?: Bluetooth
  }
}

// ── GATT UUIDs (names are the standard aliases; numbers are the spec IDs) ────

const HEART_RATE_SERVICE = 0x180d
const HEART_RATE_MEASUREMENT = 0x2a37
const BATTERY_SERVICE = 0x180f
const BATTERY_LEVEL = 0x2a19
const DEVICE_INFORMATION_SERVICE = 0x180a
const MODEL_NUMBER_STRING = 0x2a28
const MANUFACTURER_NAME_STRING = 0x2a25

// ── Pure parser ───────────────────────────────────────────────────────────────

/** Physiologically plausible RR-interval bounds in ms — 300 ms ≈ 200 BPM floor, 2000 ms ≈ 30 BPM ceiling. */
export const RR_MIN_MS = 300
export const RR_MAX_MS = 2000

/** One fully parsed 0x2A37 Heart Rate Measurement notification. */
export type HrMeasurement = {
  /** Beats per minute from the HR value field (UINT8 or UINT16 LE per flags bit 0). */
  bpm: number
  /** RR-intervals in ms (1/1024 s → ms, kept as float), each gated to RR_MIN_MS…RR_MAX_MS. */
  rrIntervals: number[]
  /** RR values present in the payload but dropped as physiologically implausible. */
  rrDropped: number
}

/**
 * Parse a Heart Rate Measurement (0x2A37) payload — BPM + RR-intervals.
 * Bluetooth SIG GATT Specification Supplement: byte 0 is the flags field
 * (little-endian bit numbering) — bit 0 selects the HR value format (0 →
 * UINT8 at offset 1, 1 → UINT16 little-endian at offset 1), bits 1–2 carry
 * sensor-contact status (not consumed), bit 3 marks an energy-expended
 * UINT16 present (skipped past, never read), bit 4 marks the RR-interval
 * section present, bit 5 carries wraparound energy-counter semantics
 * (irrelevant to us — the energy field is skipped either way). After the
 * HR value: optional energy (2 bytes), then zero or more RR-intervals,
 * each UINT16 little-endian in units of 1/1024 second. A single
 * notification may carry 1–3 RR values (straps notify ~1 Hz but sample
 * every beat). Implausible RR values (outside 300–2000 ms) are dropped
 * silently and COUNTED — never surfaced as data. PURE: no deps, no DOM.
 */
export function parseHrMeasurement(view: DataView): HrMeasurement {
  if (view.byteLength < 2) return { bpm: 0, rrIntervals: [], rrDropped: 0 }
  const flags = view.getUint8(0)
  const uint16Hr = (flags & 0x01) !== 0
  const bpm = uint16Hr && view.byteLength >= 3 ? view.getUint16(1, true) : view.getUint8(1)
  let offset = 1 + (uint16Hr ? 2 : 1)
  // energy expended (UINT16) — skip past when flags bit 3 says it's there;
  // a payload too short to hold it cannot hold RR either
  if ((flags & 0x08) !== 0) {
    if (view.byteLength < offset + 2) return { bpm, rrIntervals: [], rrDropped: 0 }
    offset += 2
  }
  const rrIntervals: number[] = []
  let rrDropped = 0
  if ((flags & 0x10) !== 0) {
    for (; offset + 2 <= view.byteLength; offset += 2) {
      const ms = (view.getUint16(offset, true) / 1024) * 1000
      if (ms >= RR_MIN_MS && ms <= RR_MAX_MS) rrIntervals.push(ms)
      else rrDropped++
    }
  }
  return { bpm, rrIntervals, rrDropped }
}

/**
 * BPM-only view of a 0x2A37 payload — the R20-b call shape, kept for
 * backward compatibility with existing callers.
 */
export function parseHeartRateMeasurement(view: DataView): number {
  return parseHrMeasurement(view).bpm
}

// ── Capability probe ──────────────────────────────────────────────────────────

/** True when this browser exposes navigator.bluetooth (Chrome, Edge, Samsung Internet — not iOS Safari). */
export function isBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && navigator.bluetooth != null
}

// ── Controller ────────────────────────────────────────────────────────────────

/** Callbacks the sensor store wires into the strap link. */
export type HeartRateStrapHandlers = {
  /** A fresh BPM from a 0x2A37 notification (already ≥1/s on most straps). */
  onBpm: (bpm: number) => void
  /**
   * Fresh RR-intervals (ms) from the same 0x2A37 notification — only fired
   * when the strap actually sent some (flags bit 4; chest straps do, most
   * wrist devices don't). Feeds the live RMSSD HRV estimate (R22-b).
   */
  onRr?: (rrIntervals: number[]) => void
  /** Strap battery percent (best-effort — many straps omit the service). */
  onBattery: (percent: number) => void
  /** Best display name (chooser name, enriched by Device Information when present). */
  onDeviceName: (name: string) => void
  /** GATT server dropped (out of range, strap sleep, transient). */
  onDisconnect: () => void
  /** Asynchronous failure after the link was live (notification errors etc.). */
  onError: (message: string) => void
}

/** Imperative handle on one connected strap. */
export type HeartRateStrapController = {
  /** The device (name available for the "LAST LINK" UX). */
  readonly deviceName: string | null
  /** Sever the GATT link (fires onDisconnect through the handler). */
  disconnect: () => void
  /**
   * Re-open the GATT link to the SAME device and resubscribe — for transient
   * drops, no chooser appears (device.gatt.connect() needs no new grant).
   * Rejects if the browser refuses (context lost, device gone) — the store
   * then falls back to a fresh connectStrap(), which requires a user tap.
   */
  reconnect: () => Promise<void>
}

/**
 * Connect a chest strap: chooser (needs the caller's user gesture) →
 * GATT → Heart Rate Service 0x180D → 0x2A37 notifications → parsed BPM.
 * Battery + device-info are best-effort reads wrapped in try/catch — many
 * straps omit them, and absence is honest, not an error.
 */
export async function connectHeartRateStrap(handlers: HeartRateStrapHandlers): Promise<HeartRateStrapController> {
  const bluetooth = navigator.bluetooth
  if (!bluetooth) {
    throw new Error("WEB BLUETOOTH UNAVAILABLE IN THIS BROWSER")
  }
  const device = await bluetooth.requestDevice({
    filters: [{ services: ["heart-rate"] }],
    optionalServices: ["battery-service", "device-information"],
  })

  const subscribe = async (): Promise<string | null> => {
    const server = device.gatt
    if (!server) return "NO GATT SERVER ON DEVICE"
    const connected = await server.connect()
    const service = await connected.getPrimaryService(HEART_RATE_SERVICE)
    const characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT)
    await characteristic.startNotifications()
    // closure capture beats typing the event: the characteristic that fired
    // owns the DataView we parse
    characteristic.addEventListener("characteristicvaluechanged", () => {
      const view = characteristic.value
      if (!view || view.byteLength < 2) return
      const m = parseHrMeasurement(view)
      // RR rides the same notification — one parse feeds both readouts. RR is
      // delivered BEFORE the BPM: the store's throttled write snapshots the
      // HRV tracker, so this notification's intervals must already be in the
      // buffer when the snapshot is read — BPM-first leaves the readout one
      // notification behind forever on the last update (caught live in R22-b
      // browser QA: 5 pushed intervals, display stuck at 3 samples).
      if (m.rrIntervals.length > 0) handlers.onRr?.(m.rrIntervals)
      handlers.onBpm(m.bpm)
    })
    return null
  }

  const readBattery = async (): Promise<number | null> => {
    try {
      const server = device.gatt
      if (!server) return null
      const service = await server.getPrimaryService(BATTERY_SERVICE)
      const level = await service.getCharacteristic(BATTERY_LEVEL)
      const view = await level.readValue()
      return Math.min(100, view.getUint8(0))
    } catch {
      return null // most straps omit the battery service — absence is honest
    }
  }

  const readDeviceModel = async (): Promise<string | null> => {
    try {
      const server = device.gatt
      if (!server) return null
      const service = await server.getPrimaryService(DEVICE_INFORMATION_SERVICE)
      const decoder = new TextDecoder("utf-8")
      for (const uuid of [MODEL_NUMBER_STRING, MANUFACTURER_NAME_STRING]) {
        try {
          const c = await service.getCharacteristic(uuid)
          const text = decoder.decode(await c.readValue()).trim()
          if (text) return text
        } catch {
          // this characteristic is optional — try the next
        }
      }
      return null
    } catch {
      return null // device-information omitted — the chooser name stands
    }
  }

  const failure = await subscribe()
  if (failure) throw new Error(failure)

  // best-effort enrichment — never blocks the live BPM readout
  void readBattery().then((percent) => {
    if (percent !== null) handlers.onBattery(percent)
  })
  const model = await readDeviceModel()
  const deviceName = model ?? device.name ?? "HR STRAP"
  handlers.onDeviceName(deviceName)

  device.addEventListener("gattserverdisconnected", () => {
    handlers.onDisconnect()
  })

  return {
    deviceName,
    disconnect: () => {
      try {
        device.gatt?.disconnect()
      } catch {
        // already gone — the disconnect handler already fired
      }
    },
    reconnect: async () => {
      const err = await subscribe()
      if (err) throw new Error(err)
    },
  }
}
