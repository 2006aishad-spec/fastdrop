# XTransfer Offline

**XTransfer Offline é um sistema de transferência de ficheiros com dois aplicativos nativos: Android e Windows.** O utilizador deve instalar e abrir a aplicação no telefone e no computador. A transferência deve acontecer diretamente entre as duas aplicações, através de uma rede local, sem navegador, conta, nuvem ou servidor externo.

O repositório chama-se **FastDrop** por razões técnicas e históricas; o nome do produto é **XTransfer Offline**.

> **Estado do projeto:** a branch contém uma implementação Android experimental de hotspot-first e um cliente Windows nativo anterior baseado no protocolo FD/01. Estes componentes ainda não estão integrados num fluxo app-a-app. A versão hotspot-first atualmente presente no código serve uma página HTTP para navegador; isso é um protótipo técnico e **não corresponde ao produto final pretendido**.

## Requisito principal do produto

- Aplicativo Android instalável (APK).
- Aplicativo Windows instalável/portátil (EXE).
- Os dois aplicativos devem ter interface própria para Enviar e Receber.
- O navegador não deve ser necessário em nenhuma etapa da transferência.
- O telefone pode criar o hotspot e atuar como anfitrião da rede local.
- O aplicativo Windows liga-se ao hotspot do telefone e comunica diretamente com o aplicativo Android.
- Transferência nos dois sentidos: Android → Windows e Windows → Android.
- Funcionamento offline, sem Internet, contas, serviços cloud ou servidores externos.

## Experiência pretendida

1. O utilizador abre o XTransfer Offline nos dois dispositivos.
2. No Android, escolhe **Criar ligação / Anfitrião**. A aplicação tenta iniciar um hotspot local gerido pelo Android; se não for possível, orienta o utilizador a ativar o hotspot manualmente.
3. O Windows liga-se à rede Wi-Fi do telefone.
4. O utilizador abre o XTransfer Offline no Windows e escolhe **Ligar ao telefone** ou seleciona o telefone encontrado na rede.
5. Os dois aplicativos estabelecem uma sessão autenticada e apresentam os modos **Enviar** e **Receber**.
6. O utilizador escolhe os ficheiros no aplicativo de origem e confirma a receção no aplicativo de destino.
7. Ambos mostram progresso real, velocidade, estado, conclusão, pausa/retoma e cancelamento.

O hotspot é apenas o meio de criar a rede local. **Não transforma o navegador na interface do produto.** A interface e as operações de ficheiros devem pertencer aos aplicativos nativos.

## Estado real do código nesta branch

### Android

O projeto utiliza Expo / React Native / TypeScript e um módulo nativo Kotlin em `modules/xtransfer-transport/`.

O código hotspot-first atualmente implementa:
- Tentativa de criar hotspot local através da API Android `LocalOnlyHotspot`.
- Fallback para hotspot ativado manualmente.
- Servidor HTTP local com porta dinâmica e token temporário.
- Página web local com operações de download e upload.
- Streaming com buffer de 64 KB.

**Importante:** esta implementação HTTP/browser é um protótipo atualmente existente no código, não a arquitetura final aprovada para o produto. Deve ser substituída ou reaproveitada apenas como camada de rede, sem depender da página web para a experiência de utilização.

O módulo também contém código Android anterior para descoberta Windows e envio FD/01 por TLS. É uma implementação separada e ainda requer integração e validação com o novo fluxo hotspot-first.

### Windows

Existe um aplicativo nativo C# WinForms em `windows-client/`, compilável com .NET 8. O cliente inclui servidor TCP/TLS, emparelhamento, descoberta UDP, protocolo FD/01, receção por chunks, retoma e validação SHA-256.

Esse cliente Windows foi desenvolvido para a arquitetura anterior, em que o Windows anunciava um servidor e o Android descobria o PC. **Ainda não está integrado com o novo fluxo em que o Android cria o hotspot e o Windows se liga ao telefone como cliente.** É necessário adaptar a aplicação Windows para esse papel, preservando a interface nativa.

### Protocolo FD/01

O repositório contém uma implementação anterior do protocolo FD/01 sobre TCP/TLS:
- Descoberta UDP multicast.
- Código de emparelhamento temporário e autenticação de sessão.
- TLS 1.2/1.3 e pinning de certificado no transporte Android anterior.
- Manifesto de ficheiros.
- Chunks até 1 MiB com SHA-256 e ACK.
- Retoma por offset, pausa e cancelamento.
- Verificação SHA-256 completa antes da finalização no destino.

O protocolo e as respetivas funcionalidades são uma base técnica útil para a arquitetura nativa app-a-app. A sua integração com o hotspot-first ainda precisa de ser feita e testada. Não assumir que o servidor HTTP local implementa essas garantias.

## Arquitetura-alvo

- **Android:** aplicação nativa Expo/React Native com módulo Kotlin para hotspot, gestão da rede e transporte local.
- **Windows:** aplicação desktop nativa C# WinForms (ou evolução compatível da aplicação existente).
- **Rede:** hotspot local do telefone; o PC liga-se a essa rede.
- **Transporte:** canal direto TCP com TLS e autenticação mútua da sessão, utilizando o protocolo de transferência definido pelo projeto.
- **Interface:** seleção de ficheiros, emparelhamento, progresso, histórico, pausa, retoma e cancelamento dentro dos dois aplicativos.
- **Sem browser:** remover do fluxo final a página web e a necessidade de aceder a URLs no computador.

## Segurança

A versão HTTP/browser presente nesta branch não deve ser utilizada para ficheiros confidenciais:
- O servidor hotspot-first atual usa HTTP, não TLS.
- O token temporário não protege criptograficamente o tráfego.
- As funcionalidades de retoma e verificação SHA-256 final do protocolo FD/01 não estão ligadas ao upload HTTP.

A arquitetura final app-a-app deve usar TLS com validação de certificado/fingerprint, emparelhamento temporário, autenticação de sessão, validação de manifesto e nomes, chunks com integridade, confirmação de receção e verificação SHA-256 do ficheiro completo. Não declarar o produto seguro ou pronto para produção até essas medidas estarem integradas e testadas.

## Estrutura do projeto

```text
app/                         Interface Android com Expo Router
components/                  Componentes reutilizáveis da interface
modules/xtransfer-transport/ Módulo nativo Android, hotspot e transporte local
lib/                         Modelos e documentação do protocolo
windows-client/              Aplicativo desktop nativo C# WinForms
docs/                        Auditorias e pesquisa técnica
assets/images/               Ícones e identidade visual
.github/workflows/            Workflows de validação e compilação
TODO.md                      Lista de tarefas e estado de implementação
plan.md                      Plano técnico e decisões do projeto
```

## Desenvolvimento Android

Requisitos: Node.js 22, pnpm e ambiente Android compatível com Expo.

```bash
pnpm install
pnpm check
pnpm lint
pnpm exec expo prebuild --platform android --no-install
```

Compilar o APK a partir da pasta Android:

```bash
cd android
./gradlew :app:assembleDebug
```

No Windows PowerShell:

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

O módulo hotspot é nativo. Expo Go ou um preview web não validam as APIs Android de hotspot nem o transporte nativo; é necessário compilar e instalar o APK.

## Desenvolvimento Windows

Requisitos: .NET 8 SDK num computador Windows.

```powershell
cd windows-client
dotnet restore .\FastDrop.Windows.csproj
dotnet build .\FastDrop.Windows.csproj -c Release
.\build.ps1 -Runtime win-x64
```

O executável é gerado em `windows-client/publish/win-x64/`. O cliente atual é a base nativa existente, mas precisa de integração com o papel do Windows no fluxo hotspot-first.

## Plano de integração e validação

- [ ] Definir o Android como anfitrião da rede e o Windows como cliente nativo.
- [ ] Substituir a dependência da página HTTP/browser por comunicação direta app-a-app.
- [ ] Integrar o hotspot Android com um listener de transferência TCP/TLS no Android.
- [ ] Adaptar o aplicativo Windows para descobrir/ligar ao endereço local do telefone.
- [ ] Integrar emparelhamento, autenticação e pinning TLS nos dois aplicativos.
- [ ] Implementar envio Android → Windows dentro das interfaces nativas.
- [ ] Implementar envio Windows → Android dentro das interfaces nativas.
- [ ] Integrar chunks, ACK, retoma, pausa, cancelamento e SHA-256 de ponta a ponta.
- [ ] Remover do fluxo final as instruções de abrir navegador, URL e página web.
- [ ] Compilar APK e EXE em CI e publicar ambos como artefactos separados.
- [ ] Testar fisicamente Samsung Galaxy A16 ↔ ASUS VivoBook E410KA, incluindo hotspot, ficheiros grandes e interrupções de rede.
- [ ] Validar segurança, estabilidade e consumo de memória antes de declarar uma versão pronta.

**Critério de aceitação:** o utilizador consegue instalar e abrir o XTransfer Offline no Android e no Windows, ligar os dois pela rede hotspot do telefone e enviar/receber ficheiros sem abrir navegador ou utilizar serviços externos.

O estado detalhado do trabalho está em [TODO.md](TODO.md).