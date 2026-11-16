import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { transferHistory } from "@/lib/transfer-model";

const colors = {
  ink: "#182018",
  muted: "#6F756B",
  line: "#E0E6D7",
  faint: "#F2F4EC",
  lime: "#D8F36A",
  limeDark: "#819C27",
  white: "#FFFFFF",
  red: "#C96F5C",
};

function stateMeta(state: string) {
  if (state === "completed") return { label: "Concluída", icon: "check-circle" as const, color: colors.limeDark };
  if (state === "failed") return { label: "Interrompida", icon: "error-outline" as const, color: colors.red };
  return { label: "Pendente", icon: "schedule" as const, color: colors.muted };
}

export default function HistoryScreen() {
  return (
    <ScreenContainer containerClassName="bg-[#F9FAF5]" safeAreaClassName="bg-[#F9FAF5]">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>REGISTO LOCAL</Text>
            <Text style={styles.title}>Histórico</Text>
          </View>
          <View style={styles.counter}><Text style={styles.counterNumber}>{transferHistory.length}</Text><Text style={styles.counterLabel}>sessões</Text></View>
        </View>
        <Text style={styles.intro}>Uma memória simples das tuas transferências. Nada é enviado para a nuvem.</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}><MaterialIcons name="offline-bolt" size={22} color={colors.ink} /></View>
          <View style={styles.summaryCopy}><Text style={styles.summaryTitle}>Modo local ativo</Text><Text style={styles.summaryText}>O histórico fica apenas neste dispositivo.</Text></View>
          <MaterialIcons name="lock-outline" size={18} color={colors.limeDark} />
        </View>

        <Text style={styles.sectionLabel}>TRANSFERÊNCIAS RECENTES</Text>
        <View style={styles.listCard}>
          {transferHistory.map((item, index) => {
            const meta = stateMeta(item.state);
            return (
              <View key={item.id} style={[styles.historyRow, index !== transferHistory.length - 1 && styles.historyBorder]}>
                <View style={[styles.statusIcon, { backgroundColor: item.state === "completed" ? colors.lime : colors.faint }]}>
                  <MaterialIcons name={meta.icon} size={19} color={meta.color} />
                </View>
                <View style={styles.historyCopy}>
                  <Text style={styles.target}>{item.target}</Text>
                  <Text style={styles.meta}>{item.createdAt} · {item.totalSize}</Text>
                  <View style={styles.stateRow}><MaterialIcons name={meta.icon} size={13} color={meta.color} /><Text style={[styles.stateText, { color: meta.color }]}>{meta.label}</Text><Text style={styles.dot}>·</Text><Text style={styles.meta}>{item.completedFiles}/{item.totalFiles} ficheiros</Text></View>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#B4BCAE" />
              </View>
            );
          })}
        </View>

        <View style={styles.footerNote}><MaterialIcons name="history" size={16} color={colors.muted} /><Text style={styles.footerText}>O histórico é eliminado apenas quando escolheres limpar os dados da aplicação.</Text></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.3, color: colors.limeDark, marginBottom: 8 },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -1.2, color: colors.ink },
  counter: { alignItems: "flex-end", paddingBottom: 3 },
  counterNumber: { fontSize: 24, fontWeight: "800", color: colors.ink },
  counterLabel: { fontSize: 10, color: colors.muted, marginTop: 1 },
  intro: { fontSize: 13, lineHeight: 19, color: colors.muted, maxWidth: 300, marginTop: 12 },
  summaryCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.ink, borderRadius: 18, padding: 15, marginTop: 28 },
  summaryIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.lime, marginRight: 12 },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: colors.white, fontSize: 14, fontWeight: "800" },
  summaryText: { color: "#AAB4A4", fontSize: 11, marginTop: 4 },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, color: colors.muted, marginTop: 34, marginBottom: 10 },
  listCard: { borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 },
  historyRow: { flexDirection: "row", alignItems: "center", minHeight: 88, paddingVertical: 13 },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: colors.faint },
  statusIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", marginRight: 12 },
  historyCopy: { flex: 1, paddingRight: 7 },
  target: { fontSize: 13, fontWeight: "800", color: colors.ink },
  meta: { fontSize: 11, color: colors.muted, marginTop: 4 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 7 },
  stateText: { fontSize: 10, fontWeight: "800" },
  dot: { fontSize: 12, color: colors.muted, marginHorizontal: 2 },
  footerNote: { flexDirection: "row", gap: 7, marginTop: 24, paddingHorizontal: 2 },
  footerText: { flex: 1, fontSize: 11, lineHeight: 16, color: colors.muted },
});
