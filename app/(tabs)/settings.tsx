import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
const C={white:"#FFFFFF",ink:"#111318",muted:"#6C6C70",faint:"#8E8E93",line:"#E5E5EA",blue:"#007AFF",blueSoft:"#EAF3FF",green:"#34C759",greenSoft:"#EAF8EE"};
function InfoRow({icon,title,detail}:{icon:keyof typeof MaterialIcons.glyphMap;title:string;detail:string}) {
 return <View style={s.row}><View style={s.rowIcon}><MaterialIcons name={icon} size={18} color={C.blue}/></View><View style={s.rowCopy}><Text style={s.rowTitle}>{title}</Text><Text style={s.rowDetail}>{detail}</Text></View></View>;
}
export default function SettingsScreen(){
 return <ScreenContainer containerClassName="bg-[#F2F2F7]" safeAreaClassName="bg-[#F2F2F7]">
  <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
   <Text style={s.eyebrow}>PREFERÊNCIAS E PRIVACIDADE</Text><Text style={s.title}>Definições</Text>
   <Text style={s.intro}>Informação sobre a ligação e as proteções usadas pelo XTransfer Offline.</Text>
   <Text style={s.section}>REDE LOCAL</Text><View style={s.card}>
    <InfoRow icon="wifi-tethering" title="Hotspot do telefone" detail="O Android cria a rede local ou permite usar um hotspot ativado manualmente."/>
    <View style={s.divider}/><InfoRow icon="devices" title="Descoberta de computadores" detail="O Android procura anúncios FD/01 na rede local."/>
    <View style={s.divider}/><InfoRow icon="link" title="Ligação direta" detail="TCP/TLS na porta 45556. Não utiliza um servidor externo."/>
   </View>
   <Text style={s.section}>SEGURANÇA DO ENVIO</Text><View style={s.card}>
    <InfoRow icon="verified-user" title="TLS 1.2 / 1.3" detail="A aplicação Android valida a fingerprint do certificado Windows antes de enviar dados."/>
    <View style={s.divider}/><InfoRow icon="password" title="Emparelhamento temporário" detail="Código de seis caracteres, com validade limitada e utilização única."/>
    <View style={s.divider}/><InfoRow icon="fact-check" title="Integridade SHA-256" detail="Os blocos e o ficheiro completo são verificados antes da confirmação final."/>
    <View style={s.divider}/><InfoRow icon="restore" title="Retoma" detail="O Windows conserva blocos confirmados para permitir continuar após uma interrupção."/>
   </View>
   <View style={s.privacy}><View style={s.privacyIcon}><MaterialIcons name="lock" size={19} color={C.green}/></View><View style={s.rowCopy}><Text style={s.privacyTitle}>Privacidade local</Text><Text style={s.privacyText}>Sem conta, nuvem ou armazenamento remoto. Os ficheiros são transferidos diretamente pela rede local.</Text></View></View>
   <Text style={s.section}>SOBRE</Text><View style={s.about}>
    <View style={s.aboutTop}><View style={s.aboutMark}><MaterialIcons name="swap-horizontal-circle" size={25} color="#FFFFFF"/></View><View style={s.rowCopy}><Text style={s.aboutTitle}>XTransfer Offline</Text><Text style={s.aboutSub}>Aplicação Android + Windows</Text></View><View style={s.versionPill}><Text style={s.versionText}>FD/01</Text></View></View>
    <Text style={s.aboutNote}>A versão atual está em validação. A transferência Windows → Android e o histórico persistente ainda estão em desenvolvimento.</Text>
   </View><Text style={s.footer}>FEITO PARA TRANSFERIR. NÃO PARA ARMAZENAR.</Text>
  </ScrollView>
 </ScreenContainer>;
}
const s=StyleSheet.create({
 content:{paddingHorizontal:20,paddingTop:20,paddingBottom:40},eyebrow:{color:C.blue,fontSize:10,fontWeight:"800",letterSpacing:1.3,marginBottom:7},
 title:{color:C.ink,fontSize:34,fontWeight:"800",letterSpacing:-1.1},intro:{color:C.muted,fontSize:13,lineHeight:20,marginTop:12,maxWidth:315},
 section:{color:C.faint,fontSize:9,fontWeight:"900",letterSpacing:1.2,marginTop:29,marginBottom:9},
 card:{backgroundColor:C.white,borderRadius:18,borderWidth:1,borderColor:C.line,paddingHorizontal:14},
 row:{minHeight:73,flexDirection:"row",alignItems:"center",paddingVertical:10},rowIcon:{width:36,height:36,borderRadius:12,backgroundColor:C.blueSoft,alignItems:"center",justifyContent:"center",marginRight:11},
 rowCopy:{flex:1},rowTitle:{color:C.ink,fontSize:12,fontWeight:"800"},rowDetail:{color:C.muted,fontSize:10,lineHeight:15,marginTop:4},divider:{height:1,backgroundColor:C.line,marginLeft:47},
 privacy:{backgroundColor:C.greenSoft,borderRadius:17,padding:14,flexDirection:"row",alignItems:"center",gap:11,marginTop:16},
 privacyIcon:{width:36,height:36,borderRadius:12,backgroundColor:C.white,alignItems:"center",justifyContent:"center"},
 privacyTitle:{color:C.ink,fontSize:12,fontWeight:"800"},privacyText:{color:C.muted,fontSize:10,lineHeight:15,marginTop:4},
 about:{backgroundColor:C.white,borderRadius:18,borderWidth:1,borderColor:C.line,padding:15},aboutTop:{flexDirection:"row",alignItems:"center"},
 aboutMark:{width:42,height:42,borderRadius:14,backgroundColor:C.ink,alignItems:"center",justifyContent:"center",marginRight:11},
 aboutTitle:{color:C.ink,fontSize:14,fontWeight:"800"},aboutSub:{color:C.muted,fontSize:10,marginTop:4},
 versionPill:{borderRadius:20,backgroundColor:C.blueSoft,paddingHorizontal:9,paddingVertical:6},versionText:{color:C.blue,fontSize:9,fontWeight:"900"},
 aboutNote:{borderTopWidth:1,borderTopColor:C.line,marginTop:14,paddingTop:12,color:C.muted,fontSize:10,lineHeight:15},
 footer:{color:C.faint,fontSize:9,fontWeight:"800",letterSpacing:1,textAlign:"center",marginTop:27}
});
