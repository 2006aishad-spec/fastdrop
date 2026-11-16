import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";

const colors = {
  ink: "#182018",
  muted: "#6F756B",
  line: "#E0E6D7",
  faint: "#F2F4EC",
  lime: "#D8F36A",
  limeDark: "#819C27",
  white: "#FFFFFF",
};

function SettingRow({ icon, title, description, value, onValueChange }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; description: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}><MaterialIcons name={icon} size={19} color={colors.ink} /></View>
      <View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingDescription}>{description}</Text></View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: "#D7DED0", true: colors.lime }} thumbColor={value ? colors.ink : "#FFFFFF"} />
    </View>
  );
}

export default function SettingsScreen() {
  const [nearby, setNearby] = useState(true);
  const [autoAccept, setAutoAccept] = useState(false);
  const [keepHistory, setKeepHistory] = useState(true);

  return (
    <ScreenContainer containerClassName="bg-[#F9FAF5]" safeAreaClassName="bg-[#F9FAF5]">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>CONTROLO LOCAL</Text>
        <Text style={styles.title}>Definições</Text>
        <Text style={styles.intro}>Configura como o FastDrop encontra e protege os teus dispositivos.</Text>

        <Text style={styles.sectionLabel}>LIGAÇÃO</Text>
        <View style={styles.card}>
          <SettingRow icon="wifi-tethering" title="Descoberta automática" description="Procurar PCs FastDrop na rede local" value={nearby} onValueChange={setNearby} />
          <View style={styles.divider} />
          <SettingRow icon="done-all" title="Aceitar automaticamente" description="Pedir confirmação antes de cada envio" value={autoAccept} onValueChange={setAutoAccept} />
        </View>

        <Text style={styles.sectionLabel}>PRIVACIDADE E DADOS</Text>
        <View style={styles.card}>
          <SettingRow icon="history" title="Guardar histórico local" description="Manter as últimas sessões neste dispositivo" value={keepHistory} onValueChange={setKeepHistory} />
          <View style={styles.privacyStrip}><MaterialIcons name="shield" size={17} color={colors.limeDark} /><Text style={styles.privacyText}>O FastDrop não usa contas, servidores externos ou internet para transferir.</Text></View>
        </View>

        <Text style={styles.sectionLabel}>SOBRE O PROTOCOLO</Text>
        <View style={styles.protocolCard}>
          <View style={styles.protocolTop}><View><Text style={styles.protocolTitle}>FastDrop / FD-01</Text><Text style={styles.protocolSubtitle}>Arquitetura pronta para Windows</Text></View><View style={styles.versionPill}><Text style={styles.versionText}>v0.1</Text></View></View>
          <View style={styles.protocolLine}><Text style={styles.protocolKey}>TRANSPORTE</Text><Text style={styles.protocolValue}>LAN / Wi-Fi Direct</Text></View>
          <View style={styles.protocolLine}><Text style={styles.protocolKey}>MEMÓRIA</Text><Text style={styles.protocolValue}>Streaming por chunks</Text></View>
          <View style={styles.protocolLine}><Text style={styles.protocolKey}>VERIFICAÇÃO</Text><Text style={styles.protocolValue}>Checksum por ficheiro</Text></View>
        </View>

        <View style={styles.bottomMark}><View style={styles.tinyMark}><View style={styles.tinyLine} /></View><Text style={styles.bottomText}>Feito para mover ficheiros, não para os guardar.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3, color: colors.limeDark, marginBottom: 8 },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -1.2, color: colors.ink },
  intro: { fontSize: 13, lineHeight: 19, color: colors.muted, maxWidth: 310, marginTop: 12 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, color: colors.muted, marginTop: 32, marginBottom: 10 },
  card: { borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 },
  settingRow: { flexDirection: "row", alignItems: "center", minHeight: 78, paddingVertical: 11 },
  settingIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: colors.faint, alignItems: "center", justifyContent: "center", marginRight: 11 },
  settingCopy: { flex: 1, paddingRight: 8 },
  settingTitle: { fontSize: 13, fontWeight: "800", color: colors.ink },
  settingDescription: { fontSize: 11, lineHeight: 15, color: colors.muted, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.faint },
  privacyStrip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.faint, borderRadius: 12, padding: 11, marginBottom: 13 },
  privacyText: { flex: 1, fontSize: 10, lineHeight: 15, color: colors.muted },
  protocolCard: { backgroundColor: colors.ink, borderRadius: 18, padding: 16 },
  protocolTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 15 },
  protocolTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  protocolSubtitle: { color: "#AAB4A4", fontSize: 11, marginTop: 4 },
  versionPill: { backgroundColor: colors.lime, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  versionText: { color: colors.ink, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  protocolLine: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#344031", paddingTop: 11, marginTop: 11 },
  protocolKey: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "#AAB4A4" },
  protocolValue: { fontSize: 11, fontWeight: "700", color: colors.lime },
  bottomMark: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 27 },
  tinyMark: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  tinyLine: { width: 9, height: 3, borderRadius: 2, backgroundColor: colors.lime },
  bottomText: { fontSize: 11, color: colors.muted },
});
