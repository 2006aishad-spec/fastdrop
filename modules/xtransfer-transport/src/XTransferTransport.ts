import { requireNativeModule } from "expo";
import { Platform } from "react-native";

export type DiscoveredWindowsDevice = {
  id: string;
  name: string;
  platform: "Windows";
  protocolVersion: "FD/01";
  ipAddress: string;
  transferPort: 45556;
  certificateSha256: string;
};

type NativeXTransferTransport = {
  scanDevices(durationMs: number): Promise<DiscoveredWindowsDevice[]>;
};

let nativeModule: NativeXTransferTransport | null = null;

function getNativeModule(): NativeXTransferTransport {
  if (Platform.OS !== "android") {
    throw new Error("A descoberta de PCs está disponível apenas na aplicação Android nativa.");
  }
  nativeModule ??= requireNativeModule("XTransferTransport") as NativeXTransferTransport;
  return nativeModule;
}

export async function scanForWindowsDevices(
  durationMs = 5000,
): Promise<DiscoveredWindowsDevice[]> {
  const duration = Math.max(1000, Math.min(15000, Math.round(durationMs)));
  return getNativeModule().scanDevices(duration);
}
