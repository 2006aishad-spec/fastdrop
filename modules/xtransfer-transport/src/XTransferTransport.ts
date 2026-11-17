import { NativeModule, requireNativeModule } from "expo";
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

export type PickedTransferFile = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  fileId: string;
};

export type TransferProgressEvent = {
  status: "hashing" | "connecting" | "pairing" | "sending" | "file-complete" | "completed" | "paused" | "cancelled" | "failed";
  transferId: string;
  sentBytes: number;
  totalBytes: number;
  currentFile: string;
  message: string;
};

export type TransferResult = {
  status: "completed" | "paused" | "cancelled";
  transferId: string;
  fileCount?: number;
  totalBytes?: number;
};

type XTransferTransportEvents = {
  onTransferProgress(event: TransferProgressEvent): void;
};

declare class NativeXTransferTransport extends NativeModule<XTransferTransportEvents> {
  scanDevices(durationMs: number): Promise<DiscoveredWindowsDevice[]>;
  pickFiles(): Promise<Array<Omit<PickedTransferFile, "fileId">>>;
  sendFiles(
    device: DiscoveredWindowsDevice,
    code: string,
    files: PickedTransferFile[],
    transferId: string,
  ): Promise<TransferResult>;
  pauseTransfer(): Promise<boolean>;
  cancelTransfer(): Promise<boolean>;
}

let nativeModule: NativeXTransferTransport | null = null;

function getNativeModule(): NativeXTransferTransport {
  if (Platform.OS !== "android") {
    throw new Error("A transferência local está disponível apenas na aplicação Android nativa.");
  }
  nativeModule ??= requireNativeModule<NativeXTransferTransport>("XTransferTransport");
  return nativeModule;
}

export async function scanForWindowsDevices(durationMs = 5000): Promise<DiscoveredWindowsDevice[]> {
  const duration = Math.max(1000, Math.min(15000, Math.round(durationMs)));
  return getNativeModule().scanDevices(duration);
}

export async function pickTransferFiles(): Promise<Array<Omit<PickedTransferFile, "fileId">>> {
  return getNativeModule().pickFiles();
}

export async function sendTransferFiles(
  device: DiscoveredWindowsDevice,
  code: string,
  files: PickedTransferFile[],
  transferId: string,
): Promise<TransferResult> {
  return getNativeModule().sendFiles(device, code, files, transferId);
}

export async function pauseTransfer(): Promise<boolean> {
  return getNativeModule().pauseTransfer();
}

export async function cancelTransfer(): Promise<boolean> {
  return getNativeModule().cancelTransfer();
}

export function addTransferProgressListener(
  listener: (event: TransferProgressEvent) => void,
): { remove: () => void } {
  return getNativeModule().addListener("onTransferProgress", listener);
}
