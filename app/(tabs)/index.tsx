import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { pickTransferFiles, setHostFiles, startLocalHost, stopLocalHost, type LocalHostSession, type PickedTransferFile } from "@/modules/xtransfer-transport/src";

const colors = { ink: "#182018", muted: "#6F756B", faint: "#F2F4EC", line: "#E0E6D7", lime: "#D8F36A", limeDark: "#819C27", white: "#FFFFFF", red: "#B94B3D" };
const HOST_FILES_KEY = "xtransfer-offline.host-files.v2";

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"]; let amount = value / 1024; let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(amount >= 10 ? 0 : 1)} ${units[index]}`;
}
function fileId() { return `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <View style={styles.step}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepText}>{text}</Text></View></View>;
}

export default function HomeScreen() {
  const [mode, setMode] = useState<"send" | "receive">("send");
  const [files, setFiles] = useState<PickedTransferFile[]>([]);
  const [host, setHost] = useState<LocalHostSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(HOST_FILES_KEY).then((raw) => {
      if (!raw) return;
      try { const saved = JSON.parse(raw) as PickedTransferFile[]; if (Array.isArray(saved)) setFiles(saved); }
      catch { void AsyncStorage.removeItem(HOST_FILES_KEY); }
    });
  }, []);

  const chooseFiles = useCallback(async () => {
    setError(null); setNotice(null);
    try {
      const picked = await pickTransferFiles();
      const next = picked.map((file) => ({ ...file, fileId: fileId() }));
      if (next.length === 0) return;
      setFiles(next);
      await AsyncStorage.setItem(HOST_FILES_KEY, JSON.stringify(next));
      if (host) await setHostFiles(next);
      setNotice(`${next.length} ficheiro(s) preparado(s) para a sessão local.`);
    } catch (value) { setError(value instanceof Error ? value.message : "Não foi possível escolher ficheiros."); }
  }, [host]);

  const openHost = useCallback(async (managedHotspot: boolean) => {
    setBusy(true); setError(null); setNotice(null);
    try {
      if (files.length > 0) await setHostFiles(files);
      const session = await startLocalHost(managedHotspot);
      setHost(session);
      setNotice(session.managedHotspot ? "Hotspot local criado pelo Android." : "Servidor local ativo. Liga o PC ao hotspot do telefone.");
    } catch (value) { setError(value instanceof Error ? value.message : "Não foi possível abrir o anfitrião local."); }
    finally { setBusy(false); }
  }, [files]);

  const closeHost = useCallback(async () => {
    setBusy(true); setError(null);
    try { await stopLocalHost(); setHost(null); setNotice("Sessão local encerrada."); }
    catch (value) { setError(value instanceof Error ? value.message : "Não foi possível encerrar a sessão."); }
    finally { setBusy(false); }
  }, []);

  const total = files.reduce((sum, file) => sum + file.size, 0);

  return (
    <ScreenContainer containerClassName="bg-[#F9FAF5]" safeAreaClassName="bg-[#F9FAF5]" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}><View style={styles.brandRow}><View style={styles.brandMark}><View style={styles.brandLineOne} /><View style={styles.brandLineTwo} /></View><Text style={styles.brand}>XTransfer Offline</Text></View><View style={styles.localPill}><View style={[styles.dot, host && styles.dotActive]} /><Text style={styles.localText}>{host ? "ANFITRIÃO ATIVO" : "SEM NUVEM"}</Text></View></View>

        <View style={styles.hero}><Text style={styles.kicker}>MODO MAIS SIMPLES</Text><Text style={styles.title}>O telefone cria a rede.</Text><Text style={styles.subtitle}>Liga o PC ao hotspot do teu telefone e transfere pelo endereço local. Sem descoberta frágil, sem contas e sem internet.</Text></View>

        <View style={styles.modeBar}><Pressable onPress={() => setMode("send")} style={[styles.modeButton, mode === "send" && styles.modeActive]}><MaterialIcons name="upload" size={19} color={mode === "send" ? colors.ink : colors.muted} /><Text style={[styles.modeText, mode === "send" && styles.modeTextActive]}>Enviar</Text><Text style={styles.modeHint}>telefone → PC</Text></Pressable><Pressable onPress={() => setMode("receive")} style={[styles.modeButton, mode === "receive" && styles.modeActive]}><MaterialIcons name="download" size={19} color={mode === "receive" ? colors.ink : colors.muted} /><Text style={[styles.modeText, mode === "receive" && styles.modeTextActive]}>Receber</Text><Text style={styles.modeHint}>PC → telefone</Text></Pressable></View>

        <View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>01 / REDE</Text><Text style={styles.sectionTitle}>Anfitrião no telefone</Text></View><Text style={styles.sectionAction}>{host ? "ATIVO" : "PRONTO"}</Text></View>
        <View style={[styles.hostCard, host && styles.hostCardActive]}>
          <View style={styles.hostIcon}><MaterialIcons name={host ? "wifi-tethering" : "wifi"} size={28} color={colors.ink} /></View>
          <View style={styles.hostCopy}><Text style={styles.hostTitle}>{host ? "Servidor local ativo" : "Abrir uma sessão local"}</Text><Text style={styles.hostText}>{host ? "O PC pode usar o endereço abaixo." : "O Android tenta criar uma rede local. Se o fabricante bloquear, ativa o hotspot manualmente."}</Text></View>
          <View style={[styles.hostStatus, host && styles.hostStatusActive]}><Text style={styles.hostStatusText}>{host ? "ON" : "OFF"}</Text></View>
          {host ? <View style={styles.hostInfo}><Text style={styles.addressLabel}>ENDEREÇO PARA O PC</Text><Text selectable style={styles.address}>{host.url}</Text>{host.ssid ? <Text style={styles.networkMeta}>Wi‑Fi: {host.ssid}{host.password ? ` · Palavra-passe: ${host.password}` : ""}</Text> : <Text style={styles.networkMeta}>Liga primeiro o PC ao hotspot do telefone.</Text>}<Pressable onPress={() => { void closeHost(); }} disabled={busy} style={styles.stopButton}><Text style={styles.stopText}>Encerrar sessão</Text></Pressable></View> : <View style={styles.hostActions}><Pressable onPress={() => { void openHost(true); }} disabled={busy} style={styles.primaryButton}><MaterialIcons name="wifi-tethering" size={18} color={colors.ink} /><Text style={styles.primaryText}>{busy ? "A abrir…" : "Criar hotspot local"}</Text></Pressable><Pressable onPress={() => { void openHost(false); }} disabled={busy} style={styles.secondaryButton}><Text style={styles.secondaryText}>Já ativei o hotspot</Text></Pressable></View>}
        </View>

        {mode === "send" ? <>
          <View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>02 / ORIGEM</Text><Text style={styles.sectionTitle}>Ficheiros do telefone</Text></View><Text style={styles.sectionAction}>{files.length ? `${files.length} ITEM(S)` : "VAZIO"}</Text></View>
          <View style={styles.fileCard}>{files.length === 0 ? <View style={styles.emptyFile}><MaterialIcons name="folder-open" size={25} color={colors.limeDark} /><View style={styles.fileCopy}><Text style={styles.fileTitle}>Ainda não escolheste ficheiros</Text><Text style={styles.fileMeta}>Escolhe fotos, vídeos, documentos, ZIP ou APK.</Text></View></View> : <View>{files.map((file) => <View key={file.fileId} style={styles.fileRow}><MaterialIcons name="insert-drive-file" size={20} color={colors.limeDark} /><View style={styles.fileCopy}><Text numberOfLines={1} style={styles.fileTitle}>{file.name}</Text><Text style={styles.fileMeta}>{bytes(file.size)} · {file.mimeType}</Text></View></View>)}<Text style={styles.total}>Total: {bytes(total)}</Text></View>}<Pressable onPress={() => { void chooseFiles(); }} disabled={busy} style={styles.chooseButton}><MaterialIcons name="add" size={19} color={colors.ink} /><Text style={styles.primaryText}>{files.length ? "Trocar ficheiros" : "Escolher ficheiros"}</Text></Pressable></View>
        </> : <View style={styles.receivePanel}><View style={styles.receiveIcon}><MaterialIcons name="file-download" size={26} color={colors.ink} /></View><Text style={styles.receiveTitle}>O PC envia para este telefone</Text><Text style={styles.receiveText}>Abre o endereço local no PC, escolhe os ficheiros e toca em Enviar. Os dados ficam na pasta privada de Downloads do XTransfer Offline.</Text>{!host ? <Pressable onPress={() => { void openHost(true); }} disabled={busy} style={styles.primaryButton}><Text style={styles.primaryText}>{busy ? "A abrir…" : "Abrir receção"}</Text></Pressable> : <Text style={styles.readyText}>Sessão pronta. Usa o endereço no PC para enviar.</Text>}</View>}

        <View style={styles.sectionHeader}><View><Text style={styles.eyebrow}>03 / INSTRUÇÕES</Text><Text style={styles.sectionTitle}>Como ligar o PC</Text></View></View>
        <View style={styles.steps}><Step number="1" title="Liga a rede" text="No ASUS, escolhe o hotspot criado pelo telefone e introduz a palavra-passe mostrada." /><Step number="2" title="Abre o endereço" text="No PC, abre o endereço local indicado acima num navegador. Não precisas de instalar o cliente Windows para este modo." /><Step number="3" title={mode === "send" ? "Descarrega" : "Envia"} text={mode === "send" ? "Escolhe Descarregar ao lado de cada ficheiro do telefone." : "Escolhe os ficheiros no navegador e confirma o envio."} /></View>

        {notice ? <View style={styles.notice}><MaterialIcons name="check-circle" size={17} color={colors.limeDark} /><Text style={styles.noticeText}>{notice}</Text></View> : null}
        {error ? <View style={styles.error}><MaterialIcons name="error-outline" size={17} color={colors.red} /><Text style={styles.errorText}>{error}</Text></View> : null}
        <View style={styles.bottomNote}><MaterialIcons name="lock-outline" size={16} color={colors.muted} /><Text style={styles.bottomText}>A sessão usa um código temporário e fica limitada à rede local.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 42 },
  topLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 }, brandMark: { width: 29, height: 29, borderRadius: 15, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }, brandLineOne: { width: 12, height: 4, borderRadius: 2, backgroundColor: colors.lime, transform: [{ rotate: "20deg" }] }, brandLineTwo: { position: "absolute", width: 12, height: 4, borderRadius: 2, backgroundColor: colors.lime, transform: [{ rotate: "-20deg" }] }, brand: { fontSize: 18, fontWeight: "800", color: colors.ink }, localPill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 18, paddingHorizontal: 9, paddingVertical: 7 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted }, dotActive: { backgroundColor: colors.limeDark }, localText: { fontSize: 8, letterSpacing: 0.7, fontWeight: "800", color: colors.muted },
  hero: { marginTop: 31 }, kicker: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3, color: colors.limeDark, marginBottom: 9 }, title: { fontSize: 31, lineHeight: 34, letterSpacing: -1.2, fontWeight: "800", color: colors.ink }, subtitle: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 12 },
  modeBar: { flexDirection: "row", gap: 8, marginTop: 24, padding: 5, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, modeButton: { flex: 1, minHeight: 61, alignItems: "center", justifyContent: "center", borderRadius: 12 }, modeActive: { backgroundColor: colors.lime }, modeText: { marginTop: 3, fontSize: 13, fontWeight: "800", color: colors.muted }, modeTextActive: { color: colors.ink }, modeHint: { marginTop: 2, fontSize: 9, color: colors.muted },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 30, marginBottom: 10 }, eyebrow: { fontSize: 9, letterSpacing: 1.2, color: colors.muted, fontWeight: "800", marginBottom: 4 }, sectionTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.6, color: colors.ink }, sectionAction: { fontSize: 9, letterSpacing: 0.9, fontWeight: "800", color: colors.limeDark },
  hostCard: { borderRadius: 19, backgroundColor: colors.ink, padding: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" }, hostCardActive: { borderWidth: 2, borderColor: colors.lime }, hostIcon: { width: 51, height: 51, borderRadius: 15, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center", marginRight: 12 }, hostCopy: { flex: 1, paddingRight: 5 }, hostTitle: { fontSize: 15, fontWeight: "800", color: colors.white }, hostText: { fontSize: 11, lineHeight: 16, color: "#AAB4A4", marginTop: 4 }, hostStatus: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: "#344031" }, hostStatusActive: { backgroundColor: colors.lime }, hostStatusText: { fontSize: 9, fontWeight: "900", color: colors.ink }, hostActions: { width: "100%", marginTop: 16 }, primaryButton: { minHeight: 47, borderRadius: 12, backgroundColor: colors.lime, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14 }, primaryText: { fontSize: 13, fontWeight: "900", color: colors.ink }, secondaryButton: { minHeight: 42, marginTop: 9, borderRadius: 11, borderWidth: 1, borderColor: "#596953", alignItems: "center", justifyContent: "center" }, secondaryText: { fontSize: 12, fontWeight: "800", color: colors.white }, hostInfo: { width: "100%", borderTopWidth: 1, borderTopColor: "#344031", marginTop: 16, paddingTop: 14 }, addressLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "#AAB4A4" }, address: { fontSize: 14, lineHeight: 20, fontWeight: "800", color: colors.lime, marginTop: 6 }, networkMeta: { fontSize: 11, lineHeight: 16, color: "#AAB4A4", marginTop: 7 }, stopButton: { alignSelf: "flex-start", marginTop: 12 }, stopText: { fontSize: 11, fontWeight: "800", color: colors.white },
  fileCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 14 }, emptyFile: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8 }, fileCopy: { flex: 1 }, fileTitle: { fontSize: 13, fontWeight: "800", color: colors.ink }, fileMeta: { fontSize: 11, color: colors.muted, marginTop: 4 }, fileRow: { minHeight: 57, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.faint }, total: { fontSize: 11, fontWeight: "800", color: colors.limeDark, paddingVertical: 11 }, chooseButton: { minHeight: 46, borderRadius: 12, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, marginTop: 8 },
  receivePanel: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 18 }, receiveIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center" }, receiveTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, marginTop: 13 }, receiveText: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 7, marginBottom: 15 }, readyText: { fontSize: 12, fontWeight: "800", color: colors.limeDark },
  steps: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 }, step: { flexDirection: "row", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.faint }, stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center", marginRight: 10 }, stepNumberText: { color: colors.lime, fontSize: 12, fontWeight: "900" }, stepCopy: { flex: 1 }, stepTitle: { fontSize: 13, fontWeight: "800", color: colors.ink }, stepText: { fontSize: 11, lineHeight: 16, color: colors.muted, marginTop: 3 }, notice: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 17, padding: 12, borderRadius: 12, backgroundColor: colors.faint }, noticeText: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.limeDark }, error: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 17, padding: 12, borderRadius: 12, backgroundColor: "#FFF0ED" }, errorText: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.red }, bottomNote: { flexDirection: "row", gap: 7, alignItems: "center", marginTop: 24 }, bottomText: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.muted },
});
