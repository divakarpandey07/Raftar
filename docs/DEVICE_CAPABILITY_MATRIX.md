# RAFTAR — Device Capability Matrix & Feature Gating

| Data Source / Device Class | Protocol / Platform | Heart Rate | RR / HRV | Sleep | Steps | Power | Cadence | Speed |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **No Device (Phone Only)** | Native Location / IMU | ❌ | ❌ | ❌ | ✅ (Phone) | ❌ | ❌ | ✅ (GPS) |
| **Standard HR Chest Strap** (e.g. Polar H10, Garmin HRM-Pro) | BLE Service `0x180D` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Optical Armband** (e.g. Scosche, Wahoo TICKR FIT) | BLE Service `0x180D` | ✅ | ⚠️ (Optional) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Android Smartwatch** (Galaxy Watch, Pixel Watch) | Android Health Connect | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Apple Watch** | Apple HealthKit | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Cycling Power Meter** | BLE Service `0x1818` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Running Cadence Pod** | BLE Service `0x1814` | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |

### Strict Enforcement:
- If a device connects with `rrInterval: false`, HRV is explicitly locked to `--` with no fake numbers.
- If a device disconnects mid-activity, `heartRate` is flagged as `UNAVAILABLE` while `GPS` and `distance` continue unabated.
