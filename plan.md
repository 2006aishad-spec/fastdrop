# Plano técnico — XTransfer Offline

## Objetivo

Desenvolver duas aplicações nativas — Android e Windows — para transferir ficheiros diretamente pela rede local, sem cabo, internet, conta, nuvem ou navegador.

O telefone pode criar o hotspot; o PC liga-se a essa rede. As interfaces de seleção, envio, receção e progresso pertencem às duas aplicações.

## Estado implementado

### Android → Windows

- Interface Android Expo Router / React Native.
- Módulo Kotlin para hotspot Android LocalOnlyHotspot e fallback manual.
- Descoberta Windows por UDP multicast FD/01.
- Seletor nativo Android SAF com seleção múltipla.
- Ligação TCP/TLS, TLS 1.2/1.3 e validação obrigatória da fingerprint SHA-256 anunciada pelo Windows.
- Emparelhamento temporário de seis caracteres e token de sessão.
- Manifesto, SHA-256 em streaming, chunks até 1 MiB, ACK, retoma e cancelamento.
- Cliente Windows C# WinForms com listener TLS, validação de manifesto, armazenamento .part, retoma por offset e confirmação SHA-256 final.

**Estado:** o fluxo de interface e hotspot-first foi ligado nesta branch. A CI e os testes físicos ainda precisam de validação.

## Arquitetura de rede

1. O Android tenta criar um hotspot local.
2. Se a API do Android não estiver disponível, o utilizador ativa o hotspot nas Definições.
3. O PC liga-se à rede Wi-Fi do telefone.
4. A aplicação Windows anuncia o dispositivo na rede local com FD/01 e a fingerprint do certificado.
5. O Android descobre o anúncio; o utilizador seleciona o PC e introduz o código temporário.
6. O Android inicia TCP/TLS para o PC e transmite o manifesto e os ficheiros.

O Windows continua a ser o listener/recetor de FD/01. O telefone é o anfitrião da rede Wi-Fi, não necessariamente o servidor de transferência. A descoberta multicast através do hotspot precisa de teste no Galaxy A16.

## UX / UI

Direção visual: interface limpa inspirada no iOS, mantendo identidade própria XTransfer:
- Fundo agrupado cinzento claro.
- Cartões brancos e cantos arredondados.
- Tipografia de sistema, títulos grandes e hierarquia clara.
- Azul para ações primárias; verde, âmbar e vermelho para estados com significado.
- Fluxo guiado: hotspot, computador, código, ficheiros e envio.
- Progresso baseado em eventos reais do módulo nativo.
- Nenhuma URL local ou instrução para abrir navegador.
- Estados vazios honestos; não inventar histórico nem operações ainda não implementadas.

## Prioridades pendentes

1. Obter CI Android/TypeScript/lint/Gradle e Windows/.NET verde na branch atual.
2. Testar hotspot gerido e manual no Samsung Galaxy A16.
3. Validar descoberta multicast e emparelhamento no ASUS VivoBook E410KA.
4. Testar ficheiros pequenos e grandes, pausa, retoma, cancelamento e SHA-256.
5. Implementar transporte nativo seguro Windows → Android.
6. Criar histórico persistente local a partir de eventos reais.
7. Rever firewall, memória, reconexão e compatibilidade com Windows 10 Home.

## Segurança

- Não confiar apenas no anúncio UDP.
- Validar a fingerprint do certificado durante TLS.
- Exigir código temporário e token de sessão.
- Validar nomes, IDs, tamanhos e offsets.
- Verificar chunks e hash final do ficheiro.
- Não indicar conclusão antes da confirmação do Windows.
- Não promover builds a produção antes de testes físicos.

## Testes de aceitação

- [ ] Hotspot Android gerido.
- [ ] Hotspot Android manual.
- [ ] Descoberta do Windows através do hotspot.
- [ ] Rejeição de fingerprint divergente.
- [ ] Rejeição de código incorreto e expirado.
- [ ] Envio de fotos, vídeos, PDF, DOCX/XLSX, ZIP e ficheiro vazio.
- [ ] Interrupção e retoma a partir do último offset confirmado.
- [ ] Cancelamento com remoção dos blocos parciais da transferência cancelada.
- [ ] Comparação SHA-256 origem/destino.
- [ ] Receção Windows → Android através de transporte nativo.
- [ ] Histórico persistente com estados reais.
- [ ] Teste de memória e estabilidade no Windows 10 Home.