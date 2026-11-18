# FastDrop

Transferência rápida e privada de ficheiros entre Android e Windows, sem cabo, sem conta e sem depender da internet. O FastDrop foi desenhado para funcionar numa rede local e manter o computador como destino dos ficheiros.

> Estado atual: branch de redesign com anfitrião local Android em implementação. A interface e a camada nativa estão preparadas; a compilação Gradle e o teste físico Android ↔ PC ainda são necessários antes de chamar o modo de produção.

## O que existe neste repositório

- **Android**: aplicação Expo/React Native com modos Enviar/Receber, anfitrião local hotspot-first, sessão por token temporário, fila de ficheiros, histórico local e definições de privacidade.
- **Windows**: cliente C# WinForms leve para Windows 10 Home, com anúncio local FD/01, escolha da pasta de destino e estrutura para receber chunks e validar SHA-256.
- **FD/01**: protocolo modular documentado para emparelhamento, manifesto, transferência por chunks, retomada e integridade.

## Downloads

Os instaladores oficiais serão publicados na área [Releases](../../releases) quando a primeira compilação Android e Windows estiver validada. Até lá, é possível compilar diretamente a partir do código.

### Android / Preview de desenvolvimento

Requisitos: Node.js, pnpm e Expo.

```bash
pnpm install
pnpm dev
```

Para abrir no telemóvel, use Expo Go com o QR disponibilizado pelo ambiente Expo. O modo anfitrião local usa o Android nativo: quando o sistema permitir, cria um `LocalOnlyHotspot`; caso contrário, o utilizador ativa o hotspot manualmente e a app inicia o servidor local.

### Windows 10 Home

Requisitos: .NET 8 SDK num computador Windows.

```powershell
cd windows-client
.\build.ps1 -Runtime win-x64
```

O executável publicado ficará em `windows-client/publish/win-x64/`. Para um Windows x86 antigo, use `-Runtime win-x86`.

## Fluxo hotspot-first

1. Abrir o XTransfer Offline no Android e escolher **Enviar** ou **Receber**.
2. Escolher **Criar hotspot local**; se o Android não permitir, ativar o hotspot manualmente e escolher **Já ativei o hotspot**.
3. No Windows, ligar o Wi-Fi ao hotspot do telefone.
4. Abrir no navegador do PC o endereço e token mostrados pelo telefone.
5. No modo Enviar, descarregar os ficheiros preparados; no modo Receber, escolher ficheiros no navegador e enviá-los para o telefone.

O servidor local usa streaming para não carregar ficheiros inteiros na RAM, valida nomes e tamanhos, usa um token efémero e grava os uploads na pasta privada de Downloads da aplicação. Nesta primeira fatia, o caminho hotspot-first usa HTTP local; TLS/pinning, retoma de uploads e checksum final no servidor local continuam pendentes. O transporte FD/01 com TLS do cliente Windows permanece disponível como caminho experimental separado.

## Privacidade e desempenho

O produto não precisa de conta nem de servidor externo para a transferência. O transporte deve usar streaming e chunks para evitar carregar ficheiros inteiros na memória. O cliente Windows não usa Electron e foi estruturado para máquinas com 2 GB de RAM.

## Estrutura

```text
app/                 Aplicação Android Expo Router
modules/             Módulo nativo Android e servidor local hotspot-first
lib/                 Modelo local e protocolo FD/01
windows-client/      Cliente Windows C# WinForms
assets/images/       Ícones e identidade FastDrop
docs/                Auditorias e pesquisa de transporte local
plan.md              Plano técnico e decisões de design
TODO.md              Estado dos resultados do produto
```

## Desenvolvimento

A branch principal contém o código de trabalho. O projeto Manus continua a ser usado para Preview e checkpoints; este repositório GitHub é o destino público para código, documentação e futuras Releases.
