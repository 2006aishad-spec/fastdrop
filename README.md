# XTransfer Offline

**XTransfer Offline é um sistema de transferência de ficheiros com duas aplicações nativas: Android e Windows.** A transferência acontece diretamente entre as aplicações pela rede local, sem navegador, conta, nuvem ou servidor externo.

O repositório continua a chamar-se **FastDrop** por razões históricas. O nome do produto é **XTransfer Offline**.

## Requisitos do produto

- Aplicação Android instalável (APK) e aplicação Windows nativa (EXE).
- O telefone pode criar o hotspot; o PC liga-se à rede Wi-Fi do telefone.
- Seleção, envio e receção acontecem dentro das aplicações nativas.
- Transferência nos dois sentidos: Android → Windows e Windows → Android.
- Sem navegador, internet, contas, cloud ou serviços externos.
- TLS, emparelhamento temporário, progresso real, pausa/retoma, cancelamento e verificação SHA-256.

## Estado atual da branch de trabalho

### Android

O ecrã principal foi ligado ao transporte nativo FD/01 e recebeu uma revisão visual inspirada no iOS.

O módulo Kotlin:
- Tenta criar uma rede local através de `WifiManager.LocalOnlyHotspot` e oferece alternativa para hotspot manual.
- Descobre o Windows por UDP multicast e valida a fingerprint SHA-256 do certificado.
- Envia ficheiros para Windows por TLS, manifesto, chunks até 1 MiB, ACK e SHA-256.
- Oferece um listener TLS nativo para receber ficheiros enviados pelo Windows.
- Mantém a chave/certificado de receção no Android Keystore e anuncia a respetiva fingerprint.
- Mostra um código temporário de seis caracteres, de utilização única, com expiração e rotação após ligação.
- Guarda blocos parciais na área privada da aplicação; após verificação integral, publica os ficheiros em `Transferências/XTransfer Offline` através de MediaStore no Android 10 ou superior.
- Suporta pausa/retoma e cancelamento nos fluxos de envio/receção.

### Windows

Existe uma aplicação desktop nativa C# WinForms em `windows-client/`. Mantém o listener TLS na porta 45556 para receber ficheiros Android e inclui um modo de envio nativo para Android:
- Anuncia o PC e recebe anúncios Android por multicast.
- Descobre o telefone, valida o pin da fingerprint TLS e emparelha pelo código apresentado no Android.
- Permite escolher ficheiros e enviar por streaming em chunks até 1 MiB.
- Valida ACK, offsets e confirmação de conclusão; suporta pausa, retoma e cancelamento.

### Protocolo e rede

- Descoberta: UDP multicast `239.255.42.42:45555`.
- Windows recebe Android na porta TCP/TLS `45556`.
- Android recebe Windows na porta TCP/TLS `45557`.
- Transporte: TLS 1.2/1.3, código temporário, token de sessão, manifesto, chunks, ACK e SHA-256.

## O que ainda impede declarar a versão final

O código bidirecional está integrado nesta branch, mas a integração precisa de validação final. A compilação CI não prova, por si só, que o hotspot, multicast, TLS e firewall funcionem corretamente nos dispositivos reais.

Testes físicos obrigatórios:
- Galaxy A16 cria hotspot e o ASUS VivoBook E410KA liga-se a ele.
- Descoberta nos dois sentidos.
- Envio Android → Windows e Windows → Android.
- Código errado/expirado/reutilizado e fingerprint divergente são rejeitados.
- Ficheiros vazios, fotos, vídeos, PDF, ZIP e ficheiros grandes.
- Pausa, perda de ligação, retoma, cancelamento e comparação SHA-256.
- Verificação de consumo de RAM e comportamento da firewall no Windows 10 Home.

O histórico persistente completo ainda não está implementado. Não considerar esta branch uma versão de produção ou release estável até a CI final passar e os testes físicos serem concluídos.

## Estrutura do projeto

- `app/`: interface Android em Expo Router / React Native.
- `modules/xtransfer-transport/`: módulo Kotlin de hotspot, descoberta e transporte.
- `windows-client/`: aplicação Windows nativa C# WinForms.
- `lib/fd01-protocol.md`: especificação do protocolo.
- `docs/`: auditorias, pesquisa e arquitetura bidirecional.
- `TODO.md`: estado das tarefas.
- `plan.md`: plano técnico.

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
