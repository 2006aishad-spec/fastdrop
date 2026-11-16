# Plano do FastDrop

## Produto e primeira entrega

FastDrop é uma aplicação Android offline-first para enviar ficheiros grandes do telemóvel para um computador através de rede local ou ligação direta, sem cabo, sem internet e sem servidor externo. Esta primeira entrega é um protótipo móvel navegável: apresenta descoberta de computadores, emparelhamento visual, seleção de ficheiros, uma transferência em andamento e histórico local simulado. O código deve deixar claro onde o transporte real, a seleção nativa de ficheiros e o cliente Windows serão ligados numa fase seguinte.

## Arquitetura

- **Expo Router / React Native / TypeScript**: manter o starter móvel fixo e a navegação por tabs.
- **Camada de domínio local**: `lib/transfer-model.ts` define tipos de dispositivo, ficheiro, transferência e estados de integridade, sem depender de UI.
- **Estado de demonstração**: o ecrã principal usa dados locais e interações determinísticas para tornar o protótipo avaliável sem rede, conta ou backend.
- **Futura camada de transporte**: reservar uma interface `TransferTransport` para descoberta LAN/Wi-Fi Direct, handshake com código/QR, chunks retomáveis, checksum e confirmação final. A implementação real deverá usar streaming e armazenamento temporário, sem carregar ficheiros inteiros em memória.
- **Preparação Windows**: documentar um protocolo versionado e simples, com cliente leve e sem dependência de internet, adequado a Windows 10 Home e PCs com 2 GB de RAM.

## Organização de pastas

- `app/(tabs)/index.tsx`: dashboard do fluxo principal e estado demonstrativo.
- `app/(tabs)/history.tsx`: histórico local de transferências.
- `app/(tabs)/settings.tsx`: preferências e princípios de privacidade/ligação.
- `components/`: elementos reutilizáveis de cartões, barras de progresso e ícones.
- `lib/transfer-model.ts`: contratos de domínio e dados de exemplo.
- `assets/images/`: identidade visual e ícones nativos FastDrop.
- `plan.md` e `TODO.md`: decisões e critérios vivos do produto.

## Design

### Estilos considerados

- **Quiet utility / editorial técnico** — probabilidade 0,07: ferramenta calma com bastante espaço, números fortes e acentos de estado.
- **Neon network / cyber minimal** — probabilidade 0,05: rede local expressa por linhas e brilho tecnológico.
- **Warm hardware / oficina digital** — probabilidade 0,08: tons terrosos, textura de ferramenta e linguagem mais física.

### Escolha: Quiet utility / editorial técnico

- **Movimento de design**: utilitários digitais editoriais, com influência de painéis de instrumentos e publicações técnicas contemporâneas.
- **Princípios**: clareza antes de decoração; estado sempre visível; ações grandes para uso com uma mão; confiança através de confirmações explícitas.
- **Filosofia de cor**: fundo marfim muito claro para reduzir fadiga, carvão para hierarquia e verde elétrico-lima como cor própria do FastDrop, comunicando ligação ativa e velocidade. Azul e âmbar aparecem apenas para estados secundários.
- **Paradigma de layout**: cabeçalho assimétrico com índice de versão/estado, cartões empilhados e uma faixa de ação fixa no fundo; evitar dashboard de grelha rígida.
- **Elementos de assinatura**: marca circular com seta dupla; etiqueta monoespaçada `OFFLINE / LOCAL`; barras de progresso grossas com cantos suaves.
- **Interação**: cada gesto deve responder com mudança de estado textual. O CTA principal é único e contextual; cancelar e recomeçar ficam visíveis sem competir com o envio.
- **Animação**: pulsação discreta no ponto de rede, barra com movimento lento durante envio e transições curtas de 180–240 ms; sem efeitos que pareçam atividade de rede quando a app está parada.
- **Tipografia**: sistema sans para títulos e corpo; monoespaçada para velocidades, tamanhos, estados e IDs de emparelhamento.
- **Essência da marca**: “O caminho mais curto entre o teu telemóvel e os teus ficheiros.” Personalidade: direta, confiável, ligeiramente técnica.
- **Voz**: frases curtas e concretas. Exemplos: “PC encontrado. Pronto para receber.” e “A ligação é local. Os teus ficheiros não saem da rede.”
- **Marca**: um círculo aberto atravessado por duas setas que se aproximam, sugerindo dois dispositivos sem representar uma nuvem.
- **Cor proprietária**: lima elétrica `#D8F36A`, usada com moderação em ações, estados ligados e progresso.

## Implementação prevista

1. Reescrever o dashboard principal com dados locais e estados de interação.
2. Acrescentar tabs de Histórico e Definições para refletir o produto completo.
3. Criar tipos de domínio e uma camada de dados de exemplo separada da UI.
4. Atualizar o tema para a paleta FastDrop e atualizar o branding nativo.
5. Validar com TypeScript, lint e Preview Expo Web; corrigir erros de integração.
6. Guardar a versão como checkpoint no repositório canónico Manus.

## Limites conscientes desta primeira entrega

A descoberta real de dispositivos, picker nativo de ficheiros, streaming P2P, checksum e cliente Windows ainda não são executados pelo protótipo visual. O desenho já expõe esses estados e a arquitetura deve receber essas implementações sem alterar o fluxo principal.

## Fase Windows — cliente de receção leve

O cliente Windows fica em `windows-client/` e usa C# WinForms com bibliotecas nativas .NET, sem Electron e sem dependências de terceiros. A escolha privilegia baixo consumo de memória, arranque rápido e compatibilidade com Windows 10 Home. O projeto é publicado como executável autónomo x64 ou x86.

A primeira fatia funcional do cliente é a janela de espera: identidade FastDrop, anúncio UDP multicast FD/01, estado de PC pronto e escolha da pasta de destino. As classes de protocolo, sessão, chunks por offset e SHA-256 já estão separadas para receber o listener HTTP local e o handshake visual na próxima iteração. O ambiente atual é Linux e não possui .NET SDK; por isso a compilação final deve ser executada num PC Windows com o script `windows-client/build.ps1`.
