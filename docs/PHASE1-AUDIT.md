# XTransfer Offline — auditoria da Fase 1

Data: 2026-11-17  
Branch: `development/xtransfer-offline`  
Base: `6efcae1 Add public FastDrop distribution guide`

## Estado confirmado

O projeto existente foi preservado. A branch de desenvolvimento foi criada antes de qualquer alteração. O repositório contém uma aplicação Expo/React Native para Android, um cliente C# WinForms para Windows e contratos iniciais do protocolo FD/01.

A identidade visual atual já segue a especificação fornecida: fundo `#F9FAF5`, carvão `#182018`, lima `#D8F36A`, verde secundário `#819C27`, cinzento `#6F756B` e cartões brancos.

## Funcionalidades que são apenas demonstração

- `lib/transfer-model.ts` contém dispositivos, ficheiros, velocidades, percentagens, estados e histórico fictícios.
- `app/(tabs)/index.tsx` apresenta uma fila fixa e ações locais de interface. Procurar novamente apenas alterna um temporizador; adicionar ficheiros apenas expande a lista; pausa e cancelamento não controlam uma operação de rede.
- O Android não tem ainda seletor nativo de ficheiros nem leitor URI em streaming.
- Não existe atualmente descoberta UDP implementada no Android.
- Não existe emparelhamento real entre Android e Windows.
- Não existe transporte TCP FD/01 ativo em nenhum dos dois lados.

Por isso, os valores de velocidade, percentagem, tempo restante e dispositivo ligado não podem ser apresentados como dados reais quando a camada de transporte for ativada. A primeira implementação real deve iniciar com estados vazios e só preencher a UI a partir de eventos de rede e disco.

## Windows confirmado

- `LocalDiscoveryService.cs` anuncia um JSON FD/01 por UDP para `239.255.42.42:45555`.
- O anúncio inclui `deviceId`, nome, plataforma, versão, nonce e porta `45556`.
- Não há listener TCP na porta `45556`.
- `TransferSession.WriteChunkAsync` escreve por offset, mas ainda não valida o `fileId`, tamanho declarado, intervalo do offset, checksum do chunk, ficheiro `.part`, duplicados ou estado persistido.
- `TransferStore` cria uma pasta baseada no `sessionId`, mas ainda precisa de validar o destino autorizado, disponibilidade de espaço, nomes, manifesto e histórico.
- O cliente WinForms apresenta uma janela real de espera e permite escolher a pasta de destino, mas não envia nem recebe ficheiros.

## Android e Expo

O projeto usa Expo SDK 57 com `minSdkVersion: 24` e suporta `armeabi-v7a` e `arm64-v8a` na configuração atual. As dependências atuais não incluem um seletor nativo de documentos, uma camada de sistema de ficheiros para streaming ou módulos de rede local específicos.

O Preview Expo Web/Expo Go não é prova de transferência Android real. Para seleção de ficheiros persistente, serviço de transferência prolongada e eventuais módulos Kotlin será necessária uma development build própria; Expo Go deve continuar reservado à validação da interface e dos fluxos que não exigem código nativo personalizado.

## Conectividade escolhida

A primeira rota de produção será TCP local em `45556`, descoberto por UDP multicast em `239.255.42.42:45555`, com ligação manual por IP como fallback. Esta rota cobre a mesma rede Wi-Fi e o hotspot do telemóvel quando os dispositivos recebem endereços na mesma rede.

Wi-Fi Direct fica como modo adicional posterior. A API desktop do Windows exige emparelhamento prévio pelo Windows Pairing experience em certos fluxos da Native Wifi API, e o suporte varia com adaptadores e drivers. Não será anunciado como funcional até existir implementação e teste físico.

## Segurança mínima antes de declarar transferência funcional

A sessão deve validar o manifesto, limitar tentativas, usar um token efémero, exigir confirmação explícita nos dois lados, impedir traversal de caminhos, escrever primeiro em `.part`, verificar SHA-256 e renomear apenas depois da verificação. A porta TCP deve ficar limitada à rede local necessária e o utilizador deve ser informado sobre a regra de Firewall.

TLS ou um mecanismo equivalente de associação de chave deve ser implementado antes de descrever a ligação como protegida. Um código de seis caracteres sozinho não é autenticação suficiente.

## Figma

O URL fornecido abriu no navegador sandbox sem conteúdo, frames ou componentes visíveis. Não foi possível inspecionar ou importar medidas do ficheiro. A implementação seguirá a identidade visual textual e os tokens já presentes no projeto até existir um export PNG/PDF, link público funcional ou acesso ao ficheiro com frames.

## Fases seguintes

1. Implementar no Windows o listener TCP `45556`, contratos de mensagens, validação de manifesto e receção por streaming.
2. Criar testes determinísticos do protocolo, segurança de caminhos, chunks, retoma e SHA-256.
3. Escolher e integrar o módulo Android de ficheiros/streaming numa development build, sem alegar suporte em Expo Go.
4. Implementar descoberta Android, emparelhamento e ligação manual.
5. Ligar a UI a eventos reais e retirar os dados fictícios.
6. Implementar envio Windows → Android, histórico persistente e pausa/cancelamento.
7. Compilar, testar em hardware e só depois publicar APK/EXE como release.

## Testes ainda não realizados

Não há acesso físico ao Samsung Galaxy A16 ou ASUS VivoBook E410KA nesta sessão. Portanto, os testes entre dispositivos, hotspot, perda de ligação, Wi-Fi Direct, APK e EXE ficam pendentes e não são apresentados como concluídos.
