import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
const C = { white: "#FFFFFF", ink: "#111318", muted: "#6C6C70", faint: "#8E8E93", line: "#E5E5EA", blue: "#007AFF", blueSoft: "#EAF3FF" };
export default function HistoryScreen() {
  return <ScreenContainer containerClassName="bg-[#F2F2F7]" safeAreaClassName="bg-[#F2F2F7]">
    <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
      <View style={s.header}><View><Text style={s.eyebrow}>ATIVIDADE LOCAL</Text><Text style={s.title}>Histórico</Text></View><View style={s.headerIcon}><MaterialIcons name="history" size={24} color={C.blue} /></View></View>
      <Text style={s.intro}>As transferências concluídas serão apresentadas aqui depois de ativarmos o registo local persistente.</Text>
      <View style={s.infoCard}><View style={s.infoIcon}><MaterialIcons name="lock-outline" size={21} color={C.blue} /></View><View style={s.infoCopy}><Text style={s.infoTitle}>Os teus dados ficam no dispositivo</Text><Text style={s.infoText}>O XTransfer Offline não envia o histórico para a nuvem nem exige uma conta.</Text></View></View>
      <View style={s.emptyCard}><View style={s.emptyIcon}><MaterialIcons name="inbox" size={32} color={C.faint} /></View><Text style={s.emptyTitle}>Ainda sem registos</Text><Text style={s.emptyText}>Quando o histórico real estiver disponível, vais encontrar aqui a data, os dispositivos, o tamanho e o estado de cada transferência.</Text></View>
      <Text style={s.version}>XTRANSFER OFFLINE · REGISTO LOCAL</Text>
    </ScrollView>
  </ScreenContainer>;
}
const s = StyleSheet.create({
  content:{paddingHorizontal:20,paddingTop:20,paddingBottom:40},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  eyebrow:{color:C.blue,fontSize:10,fontWeight:"800",letterSpacing:1.3,marginBottom:7},title:{color:C.ink,fontSize:34,fontWeight:"800",letterSpacing:-1.1},
  headerIcon:{width:46,height:46,borderRadius:15,backgroundColor:C.white,alignItems:"center",justifyContent:"center"},
  intro:{color:C.muted,fontSize:13,lineHeight:20,marginTop:13,maxWidth:310},
  infoCard:{backgroundColor:C.white,borderRadius:18,borderWidth:1,borderColor:C.line,padding:15,flexDirection:"row",alignItems:"center",marginTop:27},
  infoIcon:{width:42,height:42,borderRadius:13,backgroundColor:C.blueSoft,alignItems:"center",justifyContent:"center",marginRight:12},
  infoCopy:{flex:1},infoTitle:{color:C.ink,fontSize:13,fontWeight:"800"},infoText:{color:C.muted,fontSize:11,lineHeight:16,marginTop:4},
  emptyCard:{backgroundColor:C.white,borderRadius:20,borderWidth:1,borderColor:C.line,alignItems:"center",padding:24,marginTop:15},
  emptyIcon:{width:66,height:66,borderRadius:22,backgroundColor:"#F1F1F5",alignItems:"center",justifyContent:"center",marginBottom:14},
  emptyTitle:{color:C.ink,fontSize:16,fontWeight:"800"},emptyText:{color:C.muted,fontSize:12,lineHeight:18,textAlign:"center",marginTop:7},
  version:{color:C.faint,fontSize:9,fontWeight:"800",letterSpacing:1.1,textAlign:"center",marginTop:28}
});
