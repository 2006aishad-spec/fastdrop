# XTransfer Android transport module

This is a local Expo module used by the Android application. It receives Windows FD/01 discovery announcements over the local Wi-Fi multicast group.

## Discovery contract

- Multicast group: `239.255.42.42`
- UDP port: `45555`
- Protocol: `FD/01`
- Expected peer: Windows
- TCP/TLS port advertised by Windows: `45556`
- Required announcement fields: `deviceId`, `deviceName`, `platform`, `protocolVersion`, `transferPort`, and a 64-character hexadecimal `certificateSha256`.

The native Android implementation acquires a Wi-Fi multicast lock only for the duration of a scan, receives announcements for a bounded interval, validates the protocol fields, and returns unique Windows devices with their source IP addresses.

The UI starts discovery only after the user taps the scan action. This module does not yet open a TLS connection, pair with the Windows client, select files, or transfer bytes. The certificate fingerprint is only collected at discovery time; it must be pinned and verified during the TLS handshake before any pairing or file data is sent.

## Development

This module is autolinked as a local Expo module from the `modules` directory. Native changes require a rebuilt Android app; Expo Go cannot load this custom native module.

The Android workflow runs TypeScript checks, lint, Expo prebuild, and a Gradle debug build.
