import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import {
  currentTransfer,
  nearbyDevices,
  type FileKind,
  type TransferFile,
} from "@/lib/transfer-model";

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

const kindIcon: Record<FileKind, keyof typeof MaterialIcons.glyphMap> = {
  photo: "image",
  video: "movie",
  document: "description",
  archive: "folder-zip",
  app: "android",
};

const kindLabel: Record<FileKind, string> = {
  photo: "Imagem",
  video: "Vídeo",
  document: "Documento",
  archive: "Arquivo",
  app: "Aplicação",
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function FileRow({ file, selected, onPress }: { file: TransferFile; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fileRow, pressed && styles.pressed]}>
      <View style={[styles.fileIcon, { backgroundColor: file.state === "completed" ? palette.lime : palette.faint }]}>
        <MaterialIcons name={kindIcon[file.kind]} size={19} color={palette.ink} />
      </View>
      <View style={styles.fileCopy}>
        <Text numberOfLines={1} style={styles.fileName}>{file.name}</Text>
        <Text style={styles.fileMeta}>{kindLabel[file.kind]} · {file.size}</Text>
      </View>
      <View style={styles.fileRight}>
        {file.state === "completed" ? (
          <MaterialIcons name="check-circle" size={21} color={palette.limeDark} />
        ) : file.state === "transferring" ? (
          <Text style={styles.filePercent}>{formatPercent(file.progress)}</Text>
        ) : (
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected ? <MaterialIcons name="check" size={14} color={palette.ink} /> : null}
          </View>
        )}
      </View>
    </Pressable>
  );
}

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

export default function HomeScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>(["photo-4"]);
  const [showAllFiles, setShowAllFiles] = useState(false);

  const device = nearbyDevices[0];
  const visibleFiles = showAllFiles ? currentTransfer.files : currentTransfer.files.slice(0, 3);
  const activeProgress = isPaused ? 0.68 : 0.68;

  const toggleFile = (id: string) => {
    setSelectedFiles((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <ScreenContainer containerClassName="bg-[#F9FAF5]" safeAreaClassName="bg-[#F9FAF5]" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <View style={styles.brandArrowOne} />
              <View style={styles.brandArrowTwo} />
            </View>
            <Text style={styles.brandName}>fastdrop</Text>
          </View>
          <View style={styles.localPill}>
            <View style={styles.liveDot} />
            <Text style={styles.localPillText}>LOCAL / OFFLINE</Text>
          </View>
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>TRANSFERÊNCIA RÁPIDA</Text>
            <Text style={styles.heroTitle}>O caminho mais curto{`\n`}para os teus ficheiros.</Text>
            <Text style={styles.heroSub}>Sem cabo. Sem nuvem. Só os teus dispositivos.</Text>
          </View>
          <View style={styles.heroOrb}>
            <MaterialIcons name="sync-alt" size={29} color={palette.ink} />
            <Text style={styles.orbText}>P2P</Text>
          </View>
        </View>

        <View style={styles.sectionGap}>
          <SectionLabel eyebrow="01 / DESTINO" title="Escolhe um computador" action="REDE LOCAL" />
          <View style={styles.deviceCard}>
            <View style={styles.deviceVisual}>
              <MaterialIcons name="desktop-windows" size={28} color={palette.ink} />
              <View style={styles.deviceSignal}><View style={styles.signalLine} /><View style={styles.signalLineShort} /></View>
            </View>
            <View style={styles.deviceCopy}>
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceMeta}>{device.model} · {device.latency}</Text>
              <Text style={styles.deviceCode}>{device.address}</Text>
            </View>
            <View style={styles.deviceCheck}>
              <MaterialIcons name="verified-user" size={19} color={palette.limeDark} />
            </View>
          </View>
          <View style={styles.deviceFooter}>
            <View style={styles.connectedRow}>
              <View style={styles.connectedDot} />
              <Text style={styles.connectedText}>Pronto para receber</Text>
            </View>
            <Pressable onPress={() => { setIsScanning(true); setTimeout(() => setIsScanning(false), 800); }}>
              <Text style={styles.scanButton}>{isScanning ? "A procurar…" : "Procurar de novo"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionGap}>
          <SectionLabel eyebrow="02 / FILA" title="O que vais enviar" action={`${currentTransfer.totalFiles} FICHEIROS`} />
          <View style={styles.fileCard}>
            {visibleFiles.map((file) => (
              <FileRow key={file.id} file={file} selected={selectedFiles.includes(file.id)} onPress={() => toggleFile(file.id)} />
            ))}
            <Pressable onPress={() => setShowAllFiles((current) => !current)} style={styles.moreFiles}>
              <MaterialIcons name={showAllFiles ? "expand-less" : "add-circle-outline"} size={18} color={palette.limeDark} />
              <Text style={styles.moreFilesText}>{showAllFiles ? "Mostrar menos" : "Adicionar ficheiros"}</Text>
              <Text style={styles.moreFilesHint}>Imagens · vídeos · ZIP · Excel</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionGap}>
          <SectionLabel eyebrow="03 / EM CURSO" title="A enviar agora" action={isPaused ? "PAUSADO" : "A ENVIAR"} />
          <View style={styles.transferCard}>
            <View style={styles.transferTop}>
              <View style={styles.transferHeadline}>
                <Text style={styles.transferTarget}>{currentTransfer.target}</Text>
                <Text style={styles.transferStats}>{currentTransfer.completedFiles} de {currentTransfer.totalFiles} ficheiros · {currentTransfer.totalSize}</Text>
              </View>
              <Text style={styles.transferSpeed}>{isPaused ? "—" : currentTransfer.speed}</Text>
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${activeProgress * 100}%` }]} /></View>
            <View style={styles.transferBottom}>
              <View>
                <Text style={styles.transferPercent}>{formatPercent(activeProgress)}</Text>
                <Text style={styles.timeLeft}>{isPaused ? "Pronto para retomar" : "cerca de 48 s restantes"}</Text>
              </View>
              <View style={styles.transferActions}>
                <Pressable onPress={() => setIsPaused((current) => !current)} style={styles.circleAction}>
                  <MaterialIcons name={isPaused ? "play-arrow" : "pause"} size={18} color={palette.ink} />
                </Pressable>
                <Pressable onPress={() => setIsPaused(true)} style={[styles.circleAction, styles.cancelAction]}>
                  <MaterialIcons name="close" size={17} color={palette.ink} />
                </Pressable>
              </View>
            </View>
            <View style={styles.integrityRow}>
              <MaterialIcons name="security" size={14} color={palette.limeDark} />
              <Text style={styles.integrityText}>Verificação de integridade no fim de cada ficheiro</Text>
            </View>
          </View>
        </View>

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
});
