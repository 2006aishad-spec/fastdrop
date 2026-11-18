# XTransfer Offline

Transferência de ficheiros entre Android e PC através de uma rede local criada pelo próprio telefone. O fluxo atual é **hotspot-first**: o Android funciona como anfitrião, disponibiliza uma página web local e o computador acede-lhe através do navegador.

O repositório chama-se **FastDrop** por razões técnicas e históricas; o nome do produto apresentado na aplicação é **XTransfer Offline**.

> **Estado:** preview de desenvolvimento da arquitetura hotspot-first. A implementação Android existe, mas ainda precisa de compilação nativa validada e de testes físicos no telefone e no PC. Não é ainda uma versão de produção.

## Como funciona a versão atual

O telefone é o anfitrião da sessão. Não é necessário instalar um programa no Windows para utilizar este modo.

1. Abre o XTransfer Offline no Android.
2. Escolhe **Enviar** ou **Receber**.
3. Toca em **Criar hotspot local**. A aplicação tenta criar uma rede local através da API Android `LocalOnlyHotspot`. Se isso não funcionar, ativa o hotspot manualmente e escolhe **Já ativei o hotspot**.
4. Liga o PC à rede Wi-Fi do telefone.
5. Abre no navegador do PC o endereço local e o token apresentados no Android.
6. Segue as opções da página para descarregar ou enviar ficheiros.

### Enviar — telefone para PC

- Escolhe ficheiros no seletor Android.
- A aplicação disponibiliza os ficheiros selecionados na página local.
- No navegador do PC, utiliza **Descarregar** junto ao ficheiro pretendido.

### Receber — PC para telefone

- Abre a página local no navegador do PC.
- Seleciona um ou mais ficheiros e envia-os.
- Os ficheiros são guardados no diretório privado de Downloads da aplicação, dentro do espaço de armazenamento específico do XTransfer Offline.

## Arquitetura implementada

### Android

- Expo / React Native / TypeScript para a interface.
- Módulo nativo Android em Kotlin: `modules/xtransfer-transport/`.
- Seletor de ficheiros Android através do Storage Access Framework (SAF).
- API `LocalOnlyHotspot` para tentar criar uma rede local sem depender de um ponto de acesso externo.
- Fallback para hotspot ativado manualmente pelo utilizador.
- Servidor HTTP local com porta dinâmica.
- Token temporário gerado para cada arranque do servidor.
- Página web local com rotas de estado, download e upload.
- Streaming de download e upload com buffer de 64 KB.
- Validação básica de nomes de ficheiro e criação de nomes alternativos quando já existe um ficheiro com o mesmo nome.

### Página local do PC

O computador utiliza um navegador moderno. A página é servida diretamente pelo Android e disponibiliza:

- Lista dos ficheiros preparados no telefone.
- Download individual dos ficheiros do telefone.
- Seleção e upload de ficheiros do PC para o telefone.
- Mensagens simples de estado da operação.

Não existe necessidade de conta, nuvem ou servidor externo para este fluxo. O navegador e o telefone têm de estar ligados à mesma rede local.

## Segurança e limitações conhecidas

**Esta preview não deve ser tratada como um canal seguro para ficheiros confidenciais.**

- O servidor hotspot-first utiliza atualmente **HTTP**, não HTTPS/TLS. O conteúdo e o token não têm proteção criptográfica durante o transporte.
- O token é temporário, mas é transmitido no endereço da sessão e não substitui TLS.
- O servidor exige um token válido para aceder às rotas locais.
- O upload exige o cabeçalho `Content-Length` e tem um limite máximo declarado de 100 GiB por ficheiro.
- Os nomes de ficheiro são validados para impedir caminhos e nomes inválidos.
- Ainda não existe retoma de uploads interrompidos.
- Ainda não existe verificação SHA-256 final dos uploads recebidos pelo servidor hotspot-first.
- Ainda não existe histórico persistente e completo das transferências reais deste fluxo.
- A disponibilidade do hotspot gerido e a descoberta do endereço IP dependem da versão Android, do fabricante e da interface de rede ativa.

Antes de utilizar esta arquitetura para transferir dados sensíveis, é necessário implementar HTTPS/TLS com validação adequada, reforçar a gestão do token e validar o comportamento de segurança em dispositivos reais.

## O que não deve ser confundido com o modo hotspot-first

O repositório ainda contém uma implementação anterior e separada:

- Cliente Windows em C# WinForms: `windows-client/`.
- Protocolo FD/01 sobre TCP/TLS, com descoberta UDP, emparelhamento, chunks, ACK, retoma e SHA-256.
- Transporte Android FD/01, incluindo descoberta e envio para o cliente Windows.

Esse transporte FD/01 é uma arquitetura distinta do servidor web hotspot-first. **O fluxo atual da interface principal não utiliza o cliente WinForms nem o protocolo FD/01 para as operações Enviar/Receber pelo navegador.** A presença dessas implementações no repositório não significa que estejam integradas no novo fluxo.

## Estrutura do projeto

```text
app/                         Interface Android com Expo Router
components/                  Componentes reutilizáveis da interface
modules/xtransfer-transport/ Módulo nativo Android e servidor local
lib/                         Modelos locais e documentação FD/01
windows-client/              Cliente Windows legado/separado, em C# WinForms
docs/                        Auditorias e pesquisa técnica
assets/images/               Ícones e identidade visual
.github/workflows/            Workflows de validação e compilação
TODO.md                      Lista de tarefas e estado de implementação
plan.md                      Plano técnico e decisões do projeto
```

## Desenvolvimento Android

Requisitos: Node.js 22, pnpm e ambiente Android compatível com Expo.

Instalar dependências:

```bash
pnpm install
```

Executar as verificações:

```bash
pnpm check
pnpm lint
```

Gerar o projeto Android nativo:

```bash
pnpm exec expo prebuild --platform android --no-install
```

Compilar o APK de desenvolvimento a partir da pasta Android:

```bash
cd android
./gradlew :app:assembleDebug
```

No Windows PowerShell, utiliza:

```powershell
cd android
.\gradlew.bat :app:assembleDebug
```

O módulo hotspot-first é nativo. Um preview web ou Expo Go, isoladamente, não valida as APIs Android de hotspot nem o servidor nativo. É necessário compilar e instalar a aplicação Android.

## Cliente Windows separado

O cliente WinForms em `windows-client/` pode ser compilado com o .NET 8 SDK num computador Windows:

```powershell
cd windows-client
.\build.ps1 -Runtime win-x64
```

Este executável pertence ao transporte FD/01 separado e não é necessário para o modo hotspot-first baseado no navegador.

## Testes ainda necessários

Antes de considerar a versão pronta para distribuição:

- [ ] Compilar o módulo Android e instalar o APK no Samsung Galaxy A16.
- [ ] Testar a criação do hotspot gerido pelo Android.
- [ ] Testar o fallback com hotspot ativado manualmente.
- [ ] Ligar o ASUS VivoBook E410KA ao hotspot e abrir o endereço local no navegador.
- [ ] Testar download de fotos, vídeos, PDF, documentos, ZIP e ficheiros grandes.
- [ ] Testar upload do PC para o Android e confirmar a localização dos ficheiros recebidos.
- [ ] Testar nomes duplicados, ficheiros vazios, interrupções e encerramento da sessão.
- [ ] Implementar TLS/pinning e reforçar a proteção do token antes de promover o fluxo para utilização com dados sensíveis.
- [ ] Implementar retoma de upload, verificação de integridade e histórico real.
- [ ] Medir estabilidade, consumo de memória e desempenho no telefone e no PC.

O estado detalhado do trabalho está em [TODO.md](TODO.md).