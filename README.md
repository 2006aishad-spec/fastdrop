# XTransfer Offline

**XTransfer Offline é um sistema de transferência de ficheiros com duas aplicações nativas: Android e Windows.** A transferência acontece diretamente entre as aplicações pela rede local, sem navegador, conta, nuvem ou servidor externo.

O repositório continua a chamar-se **FastDrop** por razões históricas. O nome do produto é **XTransfer Offline**.

## Requisitos do produto

- Aplicação Android instalável (APK) e aplicação Windows nativa (EXE).
- O telefone pode criar o hotspot; o PC liga-se à rede Wi-Fi do telefone.
- Seleção, envio e receção devem acontecer dentro das aplicações nativas.
- Transferência nos dois sentidos: Android → Windows e Windows → Android.
- Sem navegador, internet, contas, cloud ou serviços externos.
- TLS, emparelhamento temporário, progresso real, pausa/retoma, cancelamento e verificação SHA-256.

## Estado atual desta branch

### Android

O ecrã principal foi ligado ao transporte nativo FD/01 e recebeu uma revisão visual inspirada no iOS: fundo agrupado, cartões claros, títulos grandes, botões azuis, estados legíveis e navegação inferior simplificada.

O módulo Kotlin:
- Tenta criar uma rede local através de WifiManager.LocalOnlyHotspot.
- Permite usar um hotspot ativado manualmente nas Definições do Android.
- Descobre o cliente Windows através de UDP multicast FD/01.
- Abre uma ligação TCP/TLS e valida a fingerprint SHA-256 do certificado Windows.
- Emparelha através do código temporário de seis caracteres.
- Envia manifesto e ficheiros em chunks até 1 MiB, com ACK e SHA-256.
- Emite eventos de progresso e suporta cancelamento.

O servidor HTTP experimental e a página web foram removidos do módulo Android. A aplicação não apresenta URLs nem pede para abrir um navegador.

### Windows

Existe uma aplicação desktop nativa C# WinForms em windows-client/. Ela anuncia o PC na rede local, apresenta um código temporário, recebe ligações TLS na porta 45556, recebe ficheiros por chunks, permite retoma e verifica SHA-256 antes de finalizar os ficheiros.

O papel atual do Windows é receber os ficheiros enviados pelo Android. A aplicação Windows ainda não tem o fluxo nativo de envio para Android.

### Limitações ainda abertas

- A compilação Android/Gradle e os testes automatizados têm de passar após estas alterações.
- A descoberta multicast através do hotspot do Galaxy A16 ainda precisa de teste físico.
- A transferência Windows → Android ainda não está implementada.
- O histórico persistente baseado em transferências reais ainda não está implementado; o ecrã apresenta um estado vazio honesto.
- A utilização do hotspot gerido pelo Android pode variar conforme a versão do sistema e o fabricante.

Não considerar a aplicação pronta para produção antes dos testes físicos no Samsung Galaxy A16 e no ASUS VivoBook E410KA.

## Protocolo FD/01

A implementação reutiliza o protocolo FD/01 existente para Android → Windows:
- UDP multicast 239.255.42.42:45555 para descoberta.
- TCP/TLS na porta 45556, com TLS 1.2/1.3.
- Validação no Android da fingerprint SHA-256 do certificado anunciado pelo Windows.
- Código de emparelhamento temporário e token de sessão.
- Manifesto de ficheiros, chunks até 1 MiB e ACK por chunk.
- Retoma por offset, cancelamento e verificação SHA-256 final no Windows.

Estes mecanismos existem no código do protocolo. A operação no hotspot-first e a compatibilidade real entre os dois equipamentos ainda precisam de validação em hardware.

## Estrutura do projeto

- app/: interface Android em Expo Router / React Native.
- modules/xtransfer-transport/: módulo Kotlin de hotspot, descoberta e transporte.
- windows-client/: aplicação Windows nativa C# WinForms.
- lib/fd01-protocol.md: especificação do protocolo.
- docs/: auditorias e pesquisa técnica.
- TODO.md: estado das tarefas.
- plan.md: plano técnico.

## Desenvolvimento Android

Requisitos: Node.js 22, pnpm, Java 17 e Android SDK.

```bash
pnpm install
pnpm check
pnpm lint
pnpm exec expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleDebug --no-daemon
```

## Desenvolvimento Windows

Requisitos: .NET 8 SDK e Windows.

```powershell
dotnet restore windows-client/FastDrop.Windows.csproj
dotnet build windows-client/FastDrop.Windows.csproj --configuration Release
dotnet run --project windows-client/tests/FastDrop.Protocol.Tests.csproj --configuration Release
dotnet publish windows-client/FastDrop.Windows.csproj --configuration Release --runtime win-x64 --self-contained true -p:PublishSingleFile=true --output artifacts/win-x64
```

## Segurança e testes

Não usar uma build não testada para ficheiros confidenciais. A CI valida compilação e testes automatizados; não substitui os testes entre Galaxy A16 e ASUS VivoBook E410KA, incluindo hotspot, descoberta, firewall, emparelhamento, interrupção, retoma, cancelamento e ficheiros grandes.