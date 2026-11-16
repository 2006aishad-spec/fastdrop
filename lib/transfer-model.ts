export type DeviceStatus = "ready" | "searching" | "offline";

export type FileKind = "photo" | "video" | "document" | "archive" | "app";

export type TransferState = "completed" | "transferring" | "paused" | "failed" | "pending";

export type TransferFile = {
  id: string;
  name: string;
  kind: FileKind;
  size: string;
  progress: number;
  state: TransferState;
};

export type NearbyDevice = {
  id: string;
  name: string;
  model: string;
  status: DeviceStatus;
  latency: string;
  address: string;
};

export type TransferSession = {
  id: string;
  createdAt: string;
  target: string;
  state: TransferState;
  totalSize: string;
  completedFiles: number;
  totalFiles: number;
  speed: string;
  integrity: "verified" | "checking" | "attention";
  files: TransferFile[];
};

export const nearbyDevices: NearbyDevice[] = [
  {
    id: "desk-pc",
    name: "PC · Sala de trabalho",
    model: "Windows 10 Home",
    status: "ready",
    latency: "2 ms",
    address: "FASTDROP-7C2A",
  },
  {
    id: "laptop-luis",
    name: "Portátil · Luis",
    model: "Windows 11",
    status: "searching",
    latency: "—",
    address: "A procurar…",
  },
];

export const transferFiles: TransferFile[] = [
  { id: "photo-1", name: "viagem_2026.zip", kind: "archive", size: "1,84 GB", progress: 0.68, state: "transferring" },
  { id: "photo-2", name: "DCIM_0412.mp4", kind: "video", size: "842 MB", progress: 1, state: "completed" },
  { id: "photo-3", name: "orcamento_outubro.xlsx", kind: "document", size: "4,8 MB", progress: 1, state: "completed" },
  { id: "photo-4", name: "instalador-app.apk", kind: "app", size: "126 MB", progress: 0, state: "pending" },
];

export const currentTransfer: TransferSession = {
  id: "transfer-001",
  createdAt: "Hoje, 14:32",
  target: "PC · Sala de trabalho",
  state: "transferring",
  totalSize: "2,81 GB",
  completedFiles: 2,
  totalFiles: 4,
  speed: "38,6 MB/s",
  integrity: "checking",
  files: transferFiles,
};

export const transferHistory: TransferSession[] = [
  {
    id: "history-01",
    createdAt: "Hoje, 11:08",
    target: "PC · Sala de trabalho",
    state: "completed",
    totalSize: "624 MB",
    completedFiles: 18,
    totalFiles: 18,
    speed: "41,2 MB/s",
    integrity: "verified",
    files: [],
  },
  {
    id: "history-02",
    createdAt: "Ontem, 19:44",
    target: "Portátil · Luis",
    state: "failed",
    totalSize: "2,1 GB",
    completedFiles: 3,
    totalFiles: 7,
    speed: "—",
    integrity: "attention",
    files: [],
  },
  {
    id: "history-03",
    createdAt: "12 nov, 09:16",
    target: "PC · Sala de trabalho",
    state: "completed",
    totalSize: "86 MB",
    completedFiles: 6,
    totalFiles: 6,
    speed: "36,8 MB/s",
    integrity: "verified",
    files: [],
  },
];
