import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  TextInput,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import {
  addTransferProgressListener,
  cancelTransfer,
  pauseTransfer,
  pickTransferFiles,
  scanForWindowsDevices,
  sendTransferFiles,
  type DiscoveredWindowsDevice,
  type PickedTransferFile,
  type TransferProgressEvent,
} from "@/modules/xtransfer-transport/src";

const palette = {
  ink: "#182018",
  muted: "#6F756B",
  faint: "#F2F4EC",
  line: "#E0E6D7",
  lime: "#D8F36A",
  limeDark: "#819C27",
  white: "#FFFFFF",
  blue: "#CFE8FF",
  amber: "#F7D99A",
};

function SectionLabel({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action ? <Text style={styles.sectionAction}>{action}</Text> : null}
    </View>
  );
}

const PENDING_TRANSFER_KEY = "xtransfer-offline.pending-transfer.v1";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function HomeScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredWindowsDevice[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<PickedTransferFile[]>([]);
  const [transferId, setTransferId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [progress, setProgress] = useState<TransferProgressEvent | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [transferMode, setTransferMode] = useState<"send" | "receive">("send");
  const device = devices[0] ?? null;
  const selectedBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const percent = progress && progress.totalBytes > 0
    ? Math.min(100, Math.round((progress.sentBytes / progress.totalBytes) * 100))
    : 0;

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(PENDING_TRANSFER_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const saved = JSON.parse(raw) as { transferId?: string; files?: PickedTransferFile[] };
        if (saved.transferId && Array.isArray(saved.files) && saved.files.length > 0) {
          setTransferId(saved.transferId);
          setSelectedFiles(saved.files);
          setProgress({
            status: "paused",
            transferId: saved.transferId,
            sentBytes: 0,
            totalBytes: saved.files.reduce((sum, file) => sum + file.size, 0),
            currentFile: "",
            message: "Transferência guardada neste telemóvel. Emparelha novamente para retomar."
          });
        }
      } catch {
        void AsyncStorage.removeItem(PENDING_TRANSFER_KEY);
      }
    }).catch(() => undefined);
    const subscription = addTransferProgressListener(setProgress);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const scanForDevices = useCallback(async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      setDevices(await scanForWindowsDevices(5000));
    } catch (error) {
      setDevices([]);
      setScanError(error instanceof Error ? error.message : "Não foi possível procurar PCs.");
    } finally {
      setIsScanning(false);
    }
  }, []);

  const chooseFiles = useCallback(async () => {
    setOperationError(null);
    try {
      const picked = await pickTransferFiles();
      if (picked.length === 0) return;
      const nextFiles = picked.map((file, index) => ({
        ...file,
        fileId: createLocalId(`file${index}`),
      }));
      const nextTransferId = createLocalId("job");
      setSelectedFiles(nextFiles);
      setTransferId(nextTransferId);
      setProgress(null);
      await AsyncStorage.setItem(PENDING_TRANSFER_KEY, JSON.stringify({
        transferId: nextTransferId,
        files: nextFiles
      }));
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Não foi possível selecionar ficheiros.");
    }
  }, []);

  const beginTransfer = useCallback(async () => {
    if (!device || !transferId || selectedFiles.length === 0) return;
    if (!/^[A-Za-z0-9]{6}$/.test(pairingCode.trim())) {
      setOperationError("Introduz os seis caracteres apresentados no Windows.");
      return;
    }
    setOperationError(null);
    setIsTransferring(true);
    try {
      const result = await sendTransferFiles(device, pairingCode, selectedFiles, transferId);
      if (result.status === "completed") {
        await AsyncStorage.removeItem(PENDING_TRANSFER_KEY);
        setSelectedFiles([]);
        setTransferId("");
        setPairingCode("");
        setProgress({
          status: "completed",
          transferId,
          sentBytes: selectedBytes,
          totalBytes: selectedBytes,
          currentFile: "",
          message: "Transferência concluída. O Windows confirmou o SHA-256 de todos os ficheiros."
        });
      } else if (result.status === "paused") {
        setProgress((current) => current ?? {
          status: "paused", transferId, sentBytes: 0, totalBytes: selectedBytes,
          currentFile: "", message: "Transferência pausada. Podes emparelhar novamente para retomar."
        });
      } else {
        await AsyncStorage.removeItem(PENDING_TRANSFER_KEY);
        setSelectedFiles([]);
        setTransferId("");
        setProgress({
          status: "cancelled", transferId, sentBytes: 0, totalBytes: selectedBytes,
          currentFile: "", message: "Transferência cancelada. Os blocos temporários desta sessão foram eliminados no Windows."
        });
      }
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "A transferência falhou.");
    } finally {
      setIsTransferring(false);
    }
  }, [device, pairingCode, selectedFiles, selectedBytes, transferId]);

  const requestPause = useCallback(async () => {
    const accepted = await pauseTransfer();
    if (!accepted) setOperationError("Não há transferência ativa para pausar.");
  }, []);

  const requestCancel = useCallback(async () => {
    const accepted = await cancelTransfer();
    if (!accepted) setOperationError("Não há transferência ativa para cancelar.");
  }, []);

  return (
    <ScreenContainer containerClassName="bg-[#F9FAF5]" safeAreaClassName="bg-[#F9FAF5]" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <View style={styles.brandArrowOne} />
              <View style={styles.brandArrowTwo} />
            </View>
            <Text style={styles.brandName}>XTransfer Offline</Text>
          </View>
          <View style={styles.localPill}>
            <View style={styles.liveDot} />
            <Text style={styles.localPillText}>LOCAL / OFFLINE</Text>
          </View>
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>TRANSFERÊNCIA RÁPIDA</Text>
            <Text style={styles.heroTitle}>O caminho mais curto{"\n"}para os teus ficheiros.</Text>
            <Text style={styles.heroSub}>Sem cabo. Sem nuvem. Só os teus dispositivos.</Text>
          </View>
          <View style={styles.heroOrb}>
            <MaterialIcons name="sync-alt" size={29} color={palette.ink} />
            <Text style={styles.orbText}>P2P</Text>
          </View>
        </View>

        <View style={styles.directionSection}>
          <Text style={styles.directionLabel}>O QUE QUERES FAZER?</Text>
          <View style={styles.directionBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: transferMode === "send", disabled: isTransferring }}
              disabled={isTransferring}
              onPress={() => setTransferMode("send")}
              style={[styles.directionButton, transferMode === "send" && styles.directionButtonActive, isTransferring && styles.directionButtonDisabled]}
            >
              <MaterialIcons name="upload" size={19} color={transferMode === "send" ? palette.ink : palette.muted} />
              <View style={styles.directionButtonCopy}>
                <Text style={[styles.directionButtonText, transferMode === "send" && styles.directionButtonTextActive]}>Enviar</Text>
                <Text style={styles.directionCaption}>Telefone → PC</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: transferMode === "receive", disabled: isTransferring }}
              disabled={isTransferring}
              onPress={() => setTransferMode("receive")}
              style={[styles.directionButton, transferMode === "receive" && styles.directionButtonActive, isTransferring && styles.directionButtonDisabled]}
            >
              <MaterialIcons name="download" size={19} color={transferMode === "receive" ? palette.ink : palette.muted} />
              <View style={styles.directionButtonCopy}>
                <Text style={[styles.directionButtonText, transferMode === "receive" && styles.directionButtonTextActive]}>Receber</Text>
                <Text style={styles.directionCaption}>PC → telefone</Text>
              </View>
            </Pressable>
          </View>
        </View>

        {transferMode === "send" ? (
          <>
        <View style={styles.sectionGap}>
          <SectionLabel eyebrow="01 / DESTINO" title="Escolhe um computador" action="REDE LOCAL" />
          <View style={styles.deviceCard}>
            <View style={styles.deviceVisual}>
              <MaterialIcons name="desktop-windows" size={28} color={palette.ink} />
              <View style={styles.deviceSignal}><View style={styles.signalLine} /><View style={styles.signalLineShort} /></View>
            </View>
            <View style={styles.deviceCopy}>
              <Text style={styles.deviceName}>{device?.name ?? (isScanning ? "A procurar computadores…" : "Nenhum PC encontrado")}</Text>
              <Text style={styles.deviceMeta}>{device ? "Windows · FD/01 · TLS obrigatório" : "Liga o PC à mesma rede Wi-Fi ou hotspot."}</Text>
              <Text style={styles.deviceCode}>{device ? `${device.ipAddress}:${device.transferPort}` : (scanError ?? "A descoberta usa apenas a rede local.")}</Text>
            </View>
            {device ? <View style={styles.deviceCheck}><MaterialIcons name="verified-user" size={19} color={palette.limeDark} /></View> : null}
          </View>
          <View style={styles.deviceFooter}>
            <View style={styles.connectedRow}>
              <View style={[styles.connectedDot, !device && { backgroundColor: palette.amber }]} />
              <Text style={styles.connectedText}>{device ? "PC encontrado na rede local" : (isScanning ? "A procurar na rede local" : "À espera de um PC compatível")}</Text>
            </View>
            <Pressable onPress={() => { void scanForDevices(); }} disabled={isScanning}>
              <Text style={styles.scanButton}>{isScanning ? "A procurar…" : "Procurar de novo"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionGap}>
          <SectionLabel eyebrow="02 / SELEÇÃO" title="Preparar ficheiros" action={selectedFiles.length ? `${selectedFiles.length} SELECIONADO(S)` : "MÚLTIPLA SELEÇÃO"} />
          <View style={styles.fileCard}>
            {selectedFiles.length === 0 ? (
              <View style={{ paddingVertical: 18, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <MaterialIcons name="folder-open" size={22} color={palette.limeDark} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.moreFilesText}>Escolhe fotos, vídeos ou documentos</Text>
                  <Text style={styles.fileMeta}>O seletor Android permite selecionar vários tipos de ficheiro.</Text>
                </View>
              </View>
            ) : (
              <View style={{ paddingTop: 6 }}>
                {selectedFiles.map((file) => (
                  <View key={file.fileId} style={styles.selectedItem}>
                    <MaterialIcons name="insert-drive-file" size={19} color={palette.limeDark} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                      <Text style={styles.fileMeta}>{formatBytes(file.size)} · {file.mimeType}</Text>
                    </View>
                  </View>
                ))}
                <Text style={[styles.fileMeta, { paddingVertical: 10 }]}>Total selecionado: {formatBytes(selectedBytes)}</Text>
              </View>
            )}
            <Pressable onPress={() => { void chooseFiles(); }} disabled={isTransferring} style={styles.chooseFilesButton}>
              <MaterialIcons name="add" size={19} color={palette.ink} />
              <Text style={styles.chooseFilesText}>{selectedFiles.length ? "Escolher outros ficheiros" : "Escolher ficheiros"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionGap}>
          <SectionLabel eyebrow="03 / EMPARELHAMENTO E ENVIO" title="Ligar ao Windows" action="CÓDIGO DE 6 CARACTERES" />
          <View style={styles.transferCard}>
            <Text style={styles.transferTarget}>{device ? `Enviar para ${device.name}` : "À espera de um PC Windows"}</Text>
            <Text style={[styles.transferStats, { marginTop: 6, lineHeight: 18 }]}>
              Abre o XTransfer Offline no ASUS e introduz o código temporário que aparece na janela do Windows.
            </Text>
            <TextInput
              value={pairingCode}
              onChangeText={(value) => setPairingCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="CÓDIGO"
              placeholderTextColor="#7E8B78"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              editable={!isTransferring}
              style={styles.codeInput}
            />
            <Pressable
              onPress={() => { void beginTransfer(); }}
              disabled={!device || selectedFiles.length === 0 || isTransferring}
              style={[styles.sendButton, (!device || selectedFiles.length === 0 || isTransferring) && styles.actionButtonDisabled]}
            >
              <MaterialIcons name="lock" size={18} color={palette.ink} />
              <Text style={styles.sendButtonText}>{isTransferring ? "A transferir…" : "Emparelhar e enviar"}</Text>
            </Pressable>
            {isTransferring ? (
              <View style={styles.transferControls}>
                <Pressable onPress={() => { void requestPause(); }} style={styles.secondaryAction}>
                  <MaterialIcons name="pause" size={18} color={palette.white} />
                  <Text style={styles.secondaryActionText}>Pausar</Text>
                </Pressable>
                <Pressable onPress={() => { void requestCancel(); }} style={styles.secondaryAction}>
                  <MaterialIcons name="close" size={18} color={palette.white} />
                  <Text style={styles.secondaryActionText}>Cancelar</Text>
                </Pressable>
              </View>
            ) : null}
            {progress ? (
              <View style={{ marginTop: 17 }}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${percent}%` }]} />
                </View>
                <Text style={styles.transferStats}>{progress.status === "hashing" ? "A calcular integridade…" : progress.status === "sending" || progress.status === "file-complete" ? `${percent}% · ${formatBytes(progress.sentBytes)} de ${formatBytes(progress.totalBytes)}` : progress.status.toUpperCase()}</Text>
                <Text style={styles.progressMessage}>{progress.message}</Text>
                {progress.currentFile ? <Text style={styles.progressMessage}>Ficheiro: {progress.currentFile}</Text> : null}
              </View>
            ) : null}
            {operationError ? <Text style={styles.errorText}>{operationError}</Text> : null}
            <View style={styles.integrityRow}>
              <MaterialIcons name="verified-user" size={14} color={palette.lime} />
              <Text style={styles.integrityText}>TLS com fingerprint fixa · SHA-256 por ficheiro · ACK por bloco.</Text>
            </View>
          </View>
        </View>
          </>
        ) : (
          <View style={styles.receiveCard}>
            <View style={styles.receiveBadge}>
              <MaterialIcons name="info-outline" size={19} color={palette.limeDark} />
            </View>
            <Text style={styles.receiveTitle}>Receber no telefone</Text>
            <Text style={styles.receiveText}>
              Esta direção ainda não está disponível. Nesta versão, podes enviar ficheiros do telefone para o Windows; para receber no telefone, o envio a partir do PC ainda precisa de ser implementado.
            </Text>
            <Pressable onPress={() => setTransferMode("send")} style={styles.receiveAction}>
              <Text style={styles.receiveActionText}>Voltar a Enviar</Text>
              <MaterialIcons name="arrow-forward" size={18} color={palette.ink} />
            </Pressable>
          </View>
        )}

        <View style={styles.bottomNote}>
          <MaterialIcons name="lock-outline" size={16} color={palette.muted} />
          <Text style={styles.bottomNoteText}>Os teus ficheiros ficam na rede local.</Text>
          <Text style={styles.protocol}>PROTOCOLO FD/01</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36 },
  directionSection: { marginTop: 24 },
  directionLabel: { fontSize: 10, letterSpacing: 1.1, color: palette.muted, fontWeight: "800", marginBottom: 9 },
  directionBar: { flexDirection: "row", gap: 9, padding: 5, borderRadius: 16, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line },
  directionButton: { flex: 1, minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 7, borderRadius: 12 },
  directionButtonActive: { backgroundColor: palette.lime },
  directionButtonDisabled: { opacity: 0.55 },
  directionButtonCopy: { alignItems: "flex-start" },
  directionButtonText: { fontSize: 13, fontWeight: "800", color: palette.muted },
  directionButtonTextActive: { color: palette.ink },
  directionCaption: { fontSize: 9, color: palette.muted, marginTop: 2 },
  receiveCard: { marginTop: 24, padding: 20, borderRadius: 18, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line },
  receiveBadge: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.faint, alignItems: "center", justifyContent: "center", marginBottom: 13 },
  receiveTitle: { fontSize: 19, fontWeight: "800", color: palette.ink },
  receiveText: { fontSize: 13, lineHeight: 19, color: palette.muted, marginTop: 8 },
  receiveAction: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 17, borderRadius: 12, backgroundColor: palette.lime },
  receiveActionText: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 29, height: 29, borderRadius: 15, backgroundColor: palette.ink, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-13deg" }] },
  brandArrowOne: { width: 11, height: 4, borderRadius: 3, backgroundColor: palette.lime, position: "absolute", top: 10, left: 8, transform: [{ rotate: "25deg" }] },
  brandArrowTwo: { width: 11, height: 4, borderRadius: 3, backgroundColor: palette.lime, position: "absolute", bottom: 10, right: 8, transform: [{ rotate: "25deg" }] },
  brandName: { fontSize: 19, fontWeight: "800", letterSpacing: -0.7, color: palette.ink },
  localPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.limeDark },
  localPillText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.9, color: palette.muted },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 31 },
  heroCopy: { flex: 1, paddingRight: 15 },
  kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 1.4, color: palette.limeDark, marginBottom: 9 },
  heroTitle: { fontSize: 30, lineHeight: 32, letterSpacing: -1.1, fontWeight: "800", color: palette.ink },
  heroSub: { marginTop: 12, fontSize: 13, lineHeight: 18, color: palette.muted },
  heroOrb: { width: 70, height: 70, borderRadius: 35, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center", transform: [{ rotate: "8deg" }] },
  orbText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4, color: palette.ink, marginTop: 2 },
  sectionGap: { marginTop: 31 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 11 },
  eyebrow: { fontSize: 9, letterSpacing: 1.2, color: palette.muted, fontWeight: "800", marginBottom: 4 },
  sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.6, color: palette.ink },
  sectionAction: { fontSize: 9, letterSpacing: 0.9, fontWeight: "800", color: palette.limeDark, paddingBottom: 2 },
  deviceCard: { flexDirection: "row", alignItems: "center", padding: 15, borderRadius: 18, backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line },
  deviceVisual: { width: 54, height: 54, borderRadius: 15, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center", marginRight: 13 },
  deviceSignal: { position: "absolute", bottom: 8, right: 8, gap: 2 },
  signalLine: { width: 8, height: 2, borderRadius: 2, backgroundColor: palette.ink },
  signalLineShort: { width: 5, height: 2, borderRadius: 2, backgroundColor: palette.ink },
  deviceCopy: { flex: 1 },
  deviceName: { fontSize: 15, fontWeight: "800", color: palette.ink },
  deviceMeta: { fontSize: 12, color: palette.muted, marginTop: 3 },
  deviceCode: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: palette.limeDark, marginTop: 7 },
  deviceCheck: { alignSelf: "flex-start", width: 28, height: 28, borderRadius: 14, backgroundColor: palette.faint, alignItems: "center", justifyContent: "center" },
  deviceFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginTop: 10 },
  connectedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.limeDark },
  connectedText: { fontSize: 11, color: palette.muted },
  scanButton: { fontSize: 11, fontWeight: "800", color: palette.ink },
  fileCard: { backgroundColor: palette.white, borderWidth: 1, borderColor: palette.line, borderRadius: 18, paddingHorizontal: 14 },
  fileRow: { minHeight: 67, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: palette.faint },
  pressed: { opacity: 0.65 },
  fileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 11 },
  fileCopy: { flex: 1, paddingRight: 8 },
  fileName: { fontSize: 13, fontWeight: "800", color: palette.ink },
  fileMeta: { fontSize: 11, color: palette.muted, marginTop: 3 },
  fileRight: { alignItems: "flex-end", justifyContent: "center", minWidth: 34 },
  filePercent: { fontSize: 11, fontWeight: "800", color: palette.limeDark },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: palette.line, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: palette.lime, borderColor: palette.limeDark },
  moreFiles: { minHeight: 53, flexDirection: "row", alignItems: "center", gap: 7 },
  moreFilesText: { fontSize: 12, fontWeight: "800", color: palette.ink },
  moreFilesHint: { fontSize: 10, color: palette.muted, marginLeft: "auto" },
  transferCard: { backgroundColor: palette.ink, borderRadius: 19, padding: 17 },
  transferTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  transferHeadline: { flex: 1, paddingRight: 10 },
  transferTarget: { color: palette.white, fontSize: 14, fontWeight: "800" },
  transferStats: { color: "#AAB4A4", fontSize: 11, marginTop: 5 },
  transferSpeed: { fontSize: 12, fontWeight: "800", color: palette.lime, letterSpacing: 0.2 },
  progressTrack: { height: 9, borderRadius: 5, backgroundColor: "#344031", overflow: "hidden", marginTop: 18 },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: palette.lime },
  transferBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  transferPercent: { fontSize: 28, fontWeight: "800", letterSpacing: -1, color: palette.white },
  timeLeft: { fontSize: 11, color: "#AAB4A4", marginTop: 2 },
  transferActions: { flexDirection: "row", gap: 8 },
  circleAction: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.lime, alignItems: "center", justifyContent: "center" },
  cancelAction: { backgroundColor: "#465142" },
  integrityRow: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: 1, borderTopColor: "#344031", paddingTop: 12, marginTop: 15 },
  integrityText: { flex: 1, fontSize: 10, color: "#AAB4A4" },
  bottomNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 25, paddingHorizontal: 2 },
  bottomNoteText: { fontSize: 11, color: palette.muted },
  protocol: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: palette.muted, marginLeft: "auto" },
  selectedItem: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: palette.faint },
  chooseFilesButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10, marginTop: 4, backgroundColor: palette.lime, borderRadius: 12 },
  chooseFilesText: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  codeInput: { height: 50, marginTop: 15, backgroundColor: "#273227", borderColor: "#4A5A45", borderWidth: 1, borderRadius: 12, color: palette.white, textAlign: "center", fontSize: 20, fontWeight: "800", letterSpacing: 5 },
  sendButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12, backgroundColor: palette.lime, borderRadius: 12 },
  sendButtonText: { color: palette.ink, fontSize: 13, fontWeight: "900" },
  actionButtonDisabled: { opacity: 0.45 },
  transferControls: { flexDirection: "row", gap: 10, marginTop: 10 },
  secondaryAction: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#344031", borderRadius: 11 },
  secondaryActionText: { color: palette.white, fontSize: 12, fontWeight: "700" },
  progressMessage: { color: "#AAB4A4", fontSize: 10, marginTop: 6, lineHeight: 15 },
  errorText: { color: "#FFD0C7", fontSize: 11, marginTop: 12, lineHeight: 16 },

});
