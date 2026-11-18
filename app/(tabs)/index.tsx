import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import {
  addTransferProgressListener, cancelTransfer, pickTransferFiles, scanForWindowsDevices,
  sendTransferFiles, startLocalHotspot, stopLocalHotspot, type DiscoveredWindowsDevice,
  type HotspotSession, type PickedTransferFile, type TransferProgressEvent,
} from "@/modules/xtransfer-transport/src";

const C = {
  bg: "#F2F2F7", white: "#FFFFFF", ink: "#111318", muted: "#6C6C70", faint: "#8E8E93",
  line: "#E5E5EA", blue: "#007AFF", blueSoft: "#EAF3FF", green: "#34C759",
  greenSoft: "#EAF8EE", orange: "#FF9F0A", orangeSoft: "#FFF5E5", red: "#FF3B30",
  redSoft: "#FFF0EF",
};
function bytes(value: number) {
  if (value < 1024) return value + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let amount = value / 1024, unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
  return amount.toFixed(amount >= 10 ? 0 : 1) + " " + units[unit];
}
function makeId() { return "file-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9); }
function Heading({ title, detail }: { title: string; detail?: string }) {
  return <View style={s.heading}><Text style={s.headingTitle}>{title}</Text>{detail ? <Text style={s.headingDetail}>{detail}</Text> : null}</View>;
}
function Primary({ title, icon, onPress, busy, disabled }: {
  title: string; icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void; busy?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
    style={({ pressed }) => [s.primary, (disabled || busy) && s.disabled, pressed && !disabled && !busy && s.pressed]}>
    {busy ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name={icon} size={19} color="#FFFFFF" />}
    <Text style={s.primaryText}>{busy ? "A processar…" : title}</Text>
  </Pressable>;
}

export default function HomeScreen() {
  const [hotspot, setHotspot] = useState<HotspotSession | null>(null);
  const [hotspotBusy, setHotspotBusy] = useState(false);
  const [devices, setDevices] = useState<DiscoveredWindowsDevice[]>([]);
  const [device, setDevice] = useState<DiscoveredWindowsDevice | null>(null);
  const [scanning, setScanning] = useState(false);
  const [files, setFiles] = useState<PickedTransferFile[]>([]);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<TransferProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const total = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const percent = progress && progress.totalBytes > 0 ? Math.min(100, Math.round(progress.sentBytes / progress.totalBytes * 100)) : 0;

  useEffect(() => {
    const sub = addTransferProgressListener(setProgress);
    return () => sub.remove();
  }, []);

  const activate = useCallback(async (managed: boolean) => {
    setHotspotBusy(true); setError(null); setNotice(null);
    try {
      const result = await startLocalHotspot(managed);
      setHotspot(result);
      setNotice(result.managedHotspot
        ? "Hotspot local preparado. Liga o PC a esta rede."
        : "Ativa o hotspot nas Definições do Android e confirma quando o PC estiver ligado.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível iniciar o hotspot."); }
    finally { setHotspotBusy(false); }
  }, []);

  const closeHotspot = useCallback(async () => {
    setHotspotBusy(true); setError(null);
    try {
      await stopLocalHotspot(); setHotspot(null); setDevices([]); setDevice(null);
      setNotice("Sessão de hotspot encerrada.");
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível encerrar o hotspot."); }
    finally { setHotspotBusy(false); }
  }, []);

  const scan = useCallback(async () => {
    if (!hotspot) { setError("Ativa primeiro o hotspot do telefone."); return; }
    setScanning(true); setError(null); setNotice(null); setDevices([]); setDevice(null);
    try {
      const found = await scanForWindowsDevices(7000);
      setDevices(found);
      setNotice(found.length
        ? found.length + (found.length === 1 ? " PC encontrado." : " PCs encontrados.")
        : "Nenhum PC encontrado. Confirma que a aplicação Windows está aberta e ligada ao hotspot.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao procurar computadores."); }
    finally { setScanning(false); }
  }, [hotspot]);

  const chooseFiles = useCallback(async () => {
    setError(null); setNotice(null);
    try {
      const picked = await pickTransferFiles();
      if (picked.length) setFiles(picked.map(file => ({ ...file, fileId: makeId() })));
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível escolher ficheiros."); }
  }, []);

  const send = useCallback(async () => {
    if (!device) { setError("Escolhe o computador de destino."); return; }
    if (code.trim().length !== 6) { setError("Introduz o código de seis caracteres mostrado no Windows."); return; }
    if (!files.length) { setError("Escolhe pelo menos um ficheiro."); return; }
    const transferId = "transfer-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    setSending(true); setError(null); setNotice(null); setProgress(null);
    try {
      const result = await sendTransferFiles(device, code.trim().toUpperCase(), files, transferId);
      if (result.status === "completed") {
        setNotice((result.fileCount ?? files.length) + " ficheiro(s) enviados e verificados no Windows.");
        setFiles([]); setCode("");
      } else if (result.status === "paused") setNotice("Transferência pausada. Os blocos confirmados estão disponíveis para retoma.");
      else setNotice("Transferência cancelada.");
    } catch (e) { setError(e instanceof Error ? e.message : "A transferência não foi concluída."); }
    finally { setSending(false); }
  }, [code, device, files]);

  return (
    <ScreenContainer containerClassName="bg-[#F2F2F7]" safeAreaClassName="bg-[#F2F2F7]" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.top}>
          <View style={s.brandIcon}><MaterialIcons name="swap-horizontal-circle" size={25} color="#FFFFFF" /></View>
          <View style={s.brandCopy}><Text style={s.brand}>XTransfer</Text><Text style={s.brandSub}>OFFLINE</Text></View>
          <View style={s.localPill}><View style={s.greenDot} /><Text style={s.localText}>LOCAL</Text></View>
        </View>
        <View style={s.hero}>
          <Text style={s.kicker}>TRANSFERÊNCIA PRIVADA</Text>
          <Text style={s.heroTitle}>Os teus ficheiros.{"\n"}Direto para o PC.</Text>
          <Text style={s.heroCopy}>Sem internet, sem nuvem e sem navegador. Liga o computador ao hotspot do telefone e transfere pela aplicação.</Text>
        </View>
        <View style={s.features}>
          <View style={s.feature}><View style={[s.featureIcon, { backgroundColor: C.blueSoft }]}><MaterialIcons name="wifi" color={C.blue} size={18} /></View><Text style={s.featureText}>Rede local</Text></View>
          <View style={s.feature}><View style={[s.featureIcon, { backgroundColor: C.greenSoft }]}><MaterialIcons name="verified-user" color={C.green} size={18} /></View><Text style={s.featureText}>TLS protegido</Text></View>
          <View style={s.feature}><View style={[s.featureIcon, { backgroundColor: C.orangeSoft }]}><MaterialIcons name="cloud-off" color={C.orange} size={18} /></View><Text style={s.featureText}>Sem nuvem</Text></View>
        </View>

        <Heading title="1. Liga os dispositivos" detail="HOTSPOT DO TELEFONE" />
        <View style={s.card}>
          <View style={s.cardTop}>
            <View style={s.roundIcon}><MaterialIcons name="wifi-tethering" size={23} color={C.blue} /></View>
            <View style={s.grow}>
              <Text style={s.cardTitle}>{hotspot ? "Hotspot selecionado" : "Criar rede local"}</Text>
              <Text style={s.cardSub}>{hotspot?.managedHotspot ? "O Android preparou uma rede local." : hotspot ? "Usa o hotspot ativado nas Definições." : "O telefone funciona como ponto de acesso."}</Text>
            </View>
            <View style={[s.pill, hotspot ? s.pillOn : s.pillOff]}><Text style={[s.pillText, hotspot ? s.pillOnText : s.pillOffText]}>{hotspot ? "ATIVO" : "INATIVO"}</Text></View>
          </View>
          {hotspot?.managedHotspot && hotspot.ssid ? <View style={s.networkBox}>
            <Text style={s.metaLabel}>REDE WI-FI</Text><Text selectable style={s.networkValue}>{hotspot.ssid}</Text>
            {hotspot.password ? <><View style={s.separator} /><Text style={s.metaLabel}>PALAVRA-PASSE</Text><Text selectable style={s.networkValue}>{hotspot.password}</Text></> : null}
          </View> : null}
          {!hotspot ? <>
            <Primary title="Criar hotspot local" icon="wifi-tethering" onPress={() => void activate(true)} busy={hotspotBusy} />
            <Pressable onPress={() => void activate(false)} disabled={hotspotBusy} style={s.secondary}><Text style={s.secondaryText}>Já ativei o hotspot nas Definições</Text></Pressable>
          </> : <View style={s.actions}>
            <Pressable onPress={() => void scan()} disabled={scanning || hotspotBusy} style={s.scanButton}>
              {scanning ? <ActivityIndicator color={C.blue} /> : <MaterialIcons name="search" color={C.blue} size={18} />}
              <Text style={s.scanText}>{scanning ? "A procurar…" : "Procurar PC"}</Text>
            </Pressable>
            <Pressable onPress={() => void closeHotspot()} disabled={hotspotBusy} style={s.stopButton}>
              <MaterialIcons name="power-settings-new" size={17} color={C.red} /><Text style={s.stopText}>Desligar</Text>
            </Pressable>
          </View>}
        </View>

        <Heading title="2. Escolhe o computador" detail="APLICAÇÃO WINDOWS ABERTA" />
        <View style={s.card}>
          {devices.length === 0 ? <View style={s.empty}>
            <View style={s.emptyIcon}><MaterialIcons name="laptop-windows" size={25} color={C.faint} /></View>
            <Text style={s.emptyTitle}>À espera do teu PC</Text>
            <Text style={s.emptyCopy}>Liga o Windows ao hotspot e abre o XTransfer Offline no computador. Depois toca em “Procurar PC”.</Text>
          </View> : devices.map(item => {
            const active = device?.id === item.id;
            return <Pressable key={item.id} onPress={() => setDevice(item)} style={[s.deviceRow, active && s.deviceSelected]}>
              <View style={s.deviceIcon}><MaterialIcons name="laptop-windows" size={21} color={C.ink} /></View>
              <View style={s.grow}><Text style={s.deviceName}>{item.name}</Text><Text style={s.deviceMeta}>{item.ipAddress} · {item.protocolVersion}</Text></View>
              <MaterialIcons name={active ? "check-circle" : "radio-button-unchecked"} size={22} color={active ? C.blue : C.faint} />
            </Pressable>;
          })}
          {device ? <View style={s.pairBox}>
            <Text style={s.metaLabel}>CÓDIGO MOSTRADO NO WINDOWS</Text>
            <TextInput accessibilityLabel="Código de emparelhamento" autoCapitalize="characters" autoCorrect={false}
              maxLength={6} value={code} onChangeText={v => setCode(v.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
              placeholder="A B C 1 2 3" placeholderTextColor="#A1A1A8" returnKeyType="done"
              textAlign="center" style={s.codeInput} />
            <Text style={s.pairHint}>O código é temporário e só pode ser usado uma vez.</Text>
          </View> : null}
        </View>

        <Heading title="3. Seleciona os ficheiros" detail={files.length ? files.length + " SELECIONADOS" : "ENVIO PARA WINDOWS"} />
        <View style={s.card}>
          {files.length === 0 ? <View style={s.emptyFiles}>
            <MaterialIcons name="folder-open" size={27} color={C.blue} />
            <View style={s.grow}><Text style={s.cardTitle}>Nenhum ficheiro selecionado</Text><Text style={s.cardSub}>Fotos, vídeos, PDF, documentos, ZIP e outros formatos.</Text></View>
          </View> : <>
            {files.map(file => <View key={file.fileId} style={s.fileRow}>
              <View style={s.fileIcon}><MaterialIcons name="insert-drive-file" size={18} color={C.blue} /></View>
              <View style={s.grow}><Text numberOfLines={1} style={s.fileName}>{file.name}</Text><Text style={s.fileSize}>{bytes(file.size)}</Text></View>
              <MaterialIcons name="check-circle" size={17} color={C.green} />
            </View>)}
            <View style={s.totalRow}><Text style={s.totalLabel}>Tamanho total</Text><Text style={s.totalValue}>{bytes(total)}</Text></View>
          </>}
          <Pressable onPress={() => void chooseFiles()} disabled={sending} style={s.chooseButton}>
            <MaterialIcons name="add" size={19} color={C.blue} /><Text style={s.chooseText}>{files.length ? "Alterar seleção" : "Escolher ficheiros"}</Text>
          </Pressable>
        </View>

        {sending || (progress && ["hashing", "connecting", "pairing", "sending"].includes(progress.status)) ? <View style={s.progressCard}>
          <View style={s.progressTop}><View style={s.grow}>
            <Text style={s.progressTitle}>{progress?.status === "hashing" ? "A preparar ficheiros" : progress?.status === "connecting" ? "A estabelecer ligação segura" : progress?.status === "pairing" ? "A confirmar emparelhamento" : "A transferir"}</Text>
            <Text numberOfLines={1} style={s.progressSub}>{progress?.currentFile || progress?.message || "Aguarda…"}</Text>
          </View><Text style={s.percent}>{percent}%</Text></View>
          <View style={s.track}><View style={[s.fill, { width: percent + "%" }]} /></View>
          <Text style={s.progressMeta}>{progress ? bytes(progress.sentBytes) + " de " + bytes(progress.totalBytes) : "A preparar ligação"}</Text>
          <Pressable onPress={() => void cancelTransfer()} style={s.cancel}><Text style={s.cancelText}>Cancelar transferência</Text></Pressable>
        </View> : null}

        <Primary title={sending ? "A enviar…" : "Enviar para o PC"} icon="arrow-upward" onPress={() => void send()}
          busy={sending} disabled={!hotspot || !device || files.length === 0 || code.length !== 6 || sending} />

        <View style={s.receiveCard}>
          <View style={s.receiveIcon}><MaterialIcons name="south" size={19} color={C.faint} /></View>
          <View style={s.grow}><Text style={s.receiveTitle}>Receber ficheiros do PC</Text><Text style={s.receiveCopy}>A transferência Windows → Android está em integração nativa. Não será feita através do navegador.</Text></View>
          <View style={s.soon}><Text style={s.soonText}>EM BREVE</Text></View>
        </View>
        {notice ? <View style={s.notice}><MaterialIcons name="info-outline" size={18} color={C.blue} /><Text style={s.noticeText}>{notice}</Text></View> : null}
        {error ? <View style={s.error}><MaterialIcons name="error-outline" size={18} color={C.red} /><Text style={s.errorText}>{error}</Text></View> : null}
        <View style={s.security}><MaterialIcons name="lock-outline" size={16} color={C.muted} /><Text style={s.securityText}>O envio Android → Windows usa TLS com validação da fingerprint e SHA-256 dos ficheiros. Os dados permanecem na rede local.</Text></View>
        <Text style={s.version}>XTRANSFER OFFLINE · FD/01</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36 },
  top: { flexDirection: "row", alignItems: "center", marginBottom: 29 },
  brandIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
  brandCopy: { marginLeft: 10, flex: 1 },
  brand: { color: C.ink, fontSize: 17, fontWeight: "800", letterSpacing: -0.4 },
  brandSub: { color: C.faint, fontSize: 9, fontWeight: "800", letterSpacing: 1.7, marginTop: 2 },
  localPill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: C.white, borderRadius: 30, paddingHorizontal: 11, paddingVertical: 8 },
  greenDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: C.green },
  localText: { color: C.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  hero: { marginBottom: 22 },
  kicker: { color: C.blue, fontSize: 10, letterSpacing: 1.2, fontWeight: "800", marginBottom: 9 },
  heroTitle: { color: C.ink, fontSize: 33, lineHeight: 37, letterSpacing: -1.25, fontWeight: "800" },
  heroCopy: { color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 11 },
  features: { flexDirection: "row", gap: 8, marginBottom: 28 },
  feature: { flex: 1, backgroundColor: C.white, borderRadius: 16, minHeight: 70, alignItems: "center", justifyContent: "center", gap: 6 },
  featureIcon: { width: 31, height: 31, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  featureText: { color: C.muted, fontSize: 10, fontWeight: "700" },
  heading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  headingTitle: { color: C.ink, fontSize: 19, fontWeight: "800", letterSpacing: -0.55 },
  headingDetail: { color: C.faint, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  card: { backgroundColor: C.white, borderRadius: 20, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: "#E8E8ED" },
  cardTop: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  roundIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: C.blueSoft, alignItems: "center", justifyContent: "center", marginRight: 12 },
  grow: { flex: 1 },
  cardTitle: { color: C.ink, fontSize: 14, fontWeight: "800" },
  cardSub: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  pill: { borderRadius: 30, paddingHorizontal: 9, paddingVertical: 6 },
  pillOn: { backgroundColor: C.greenSoft }, pillOff: { backgroundColor: "#F1F1F4" },
  pillText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6 },
  pillOnText: { color: C.green }, pillOffText: { color: C.muted },
  primary: { minHeight: 52, borderRadius: 15, backgroundColor: C.blue, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, marginTop: 4 },
  primaryText: { color: C.white, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.42 }, pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  secondary: { minHeight: 43, borderRadius: 13, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginTop: 9 },
  secondaryText: { color: C.blue, fontSize: 12, fontWeight: "700" },
  networkBox: { backgroundColor: "#F7F8FA", borderRadius: 14, padding: 13, marginBottom: 13 },
  metaLabel: { color: C.faint, fontSize: 9, fontWeight: "800", letterSpacing: 0.9 },
  networkValue: { color: C.ink, fontSize: 15, fontWeight: "800", marginTop: 5 },
  separator: { height: 1, backgroundColor: C.line, marginVertical: 10 },
  actions: { flexDirection: "row", gap: 9, marginTop: 3 },
  scanButton: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: "#CFE2FF", backgroundColor: C.blueSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  scanText: { color: C.blue, fontSize: 12, fontWeight: "800" },
  stopButton: { minHeight: 46, borderRadius: 13, backgroundColor: C.redSoft, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  stopText: { color: C.red, fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", paddingVertical: 15, paddingHorizontal: 12 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#F1F1F5", alignItems: "center", justifyContent: "center", marginBottom: 11 },
  emptyTitle: { color: C.ink, fontSize: 14, fontWeight: "800" },
  emptyCopy: { color: C.muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 6, maxWidth: 280 },
  deviceRow: { minHeight: 68, borderRadius: 14, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  deviceSelected: { backgroundColor: C.blueSoft, borderColor: "#9BC7FF" },
  deviceIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 10 },
  deviceName: { color: C.ink, fontSize: 13, fontWeight: "800" }, deviceMeta: { color: C.muted, fontSize: 10, marginTop: 4 },
  pairBox: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 13, paddingTop: 14 },
  codeInput: { minHeight: 54, borderRadius: 13, backgroundColor: C.bg, marginTop: 8, color: C.ink, fontSize: 24, letterSpacing: 8, fontWeight: "800", paddingHorizontal: 12 },
  pairHint: { color: C.faint, textAlign: "center", fontSize: 10, marginTop: 7 },
  emptyFiles: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  fileRow: { minHeight: 57, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#F0F0F4", gap: 10 },
  fileIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.blueSoft, alignItems: "center", justifyContent: "center" },
  fileName: { color: C.ink, fontSize: 12, fontWeight: "700" }, fileSize: { color: C.muted, fontSize: 10, marginTop: 3 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 },
  totalLabel: { color: C.muted, fontSize: 11 }, totalValue: { color: C.ink, fontSize: 12, fontWeight: "800" },
  chooseButton: { minHeight: 45, borderRadius: 13, backgroundColor: C.blueSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 8 },
  chooseText: { color: C.blue, fontSize: 12, fontWeight: "800" },
  progressCard: { backgroundColor: C.white, borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.line },
  progressTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTitle: { color: C.ink, fontSize: 14, fontWeight: "800" }, progressSub: { color: C.muted, fontSize: 10, marginTop: 4 },
  percent: { color: C.blue, fontSize: 17, fontWeight: "900" },
  track: { height: 7, borderRadius: 8, backgroundColor: "#E9E9EE", overflow: "hidden", marginTop: 15 },
  fill: { height: 7, borderRadius: 8, backgroundColor: C.blue },
  progressMeta: { color: C.muted, fontSize: 10, marginTop: 7 },
  cancel: { alignSelf: "flex-start", marginTop: 12, paddingVertical: 5 }, cancelText: { color: C.red, fontSize: 11, fontWeight: "700" },
  receiveCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.white, borderRadius: 17, padding: 13, marginTop: 3, borderWidth: 1, borderColor: C.line },
  receiveIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 10 },
  receiveTitle: { color: C.ink, fontSize: 12, fontWeight: "800" }, receiveCopy: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  soon: { backgroundColor: C.orangeSoft, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6, marginLeft: 6 },
  soonText: { color: "#A96700", fontSize: 8, fontWeight: "900" },
  notice: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderRadius: 13, backgroundColor: C.blueSoft, marginTop: 14 },
  noticeText: { flex: 1, color: "#145CA8", fontSize: 11, lineHeight: 16 },
  error: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderRadius: 13, backgroundColor: C.redSoft, marginTop: 14 },
  errorText: { flex: 1, color: "#A3241C", fontSize: 11, lineHeight: 16 },
  security: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 20, paddingHorizontal: 2 },
  securityText: { flex: 1, color: C.muted, fontSize: 10, lineHeight: 15 },
  version: { color: "#A1A1A8", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, textAlign: "center", marginTop: 23 },
});
