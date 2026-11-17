# FastDrop

Transferência rápida e privada de ficheiros entre Android e Windows, sem cabo, sem conta e sem depender da internet. O FastDrop foi desenhado para funcionar numa rede local e manter o computador como destino dos ficheiros.

> Estado atual: protótipo funcional de interface Android + primeira base do cliente Windows. O handshake real e o transporte FD/01 estão em implementação.

## O que existe neste repositório

- **Android**: aplicação Expo/React Native com dashboard de transferência, descoberta visual, fila de ficheiros, progresso, histórico local e definições de privacidade.
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

Para abrir no telemóvel, use Expo Go com o QR disponibilizado pelo ambiente Expo. A transferência real entre dispositivos ainda depende da implementação do listener FD/01.

### Windows 10 Home

Requisitos: .NET 8 SDK num computador Windows.

```powershell
cd windows-client
.\build.ps1 -Runtime win-x64
```

O executável publicado ficará em `windows-client/publish/win-x64/`. Para um Windows x86 antigo, use `-Runtime win-x86`.

## Fluxo previsto

1. Abrir o FastDrop no PC e escolher a pasta de destino.
2. Abrir o FastDrop no Android na mesma rede local.
3. Selecionar o PC encontrado e confirmar o código visual.
4. Escolher imagens, vídeos, Excel, ZIP, aplicações ou outros ficheiros partilháveis.
5. Transferir por chunks, com pausa, retoma e verificação SHA-256 por ficheiro.

## Privacidade e desempenho

O produto não precisa de conta nem de servidor externo para a transferência. O transporte deve usar streaming e chunks para evitar carregar ficheiros inteiros na memória. O cliente Windows não usa Electron e foi estruturado para máquinas com 2 GB de RAM.

## Estrutura

```text
app/                 Aplicação Android Expo Router
lib/                 Modelo local e protocolo FD/01
windows-client/      Cliente Windows C# WinForms
assets/images/       Ícones e identidade FastDrop
plan.md              Plano técnico e decisões de design
TODO.md              Estado dos resultados do produto
```

## Desenvolvimento

A branch principal contém o código de trabalho. O projeto Manus continua a ser usado para Preview e checkpoints; este repositório GitHub é o destino público para código, documentação e futuras Releases.
