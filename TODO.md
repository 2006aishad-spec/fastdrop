# FastDrop — resultados

> O nome de produto pretendido passou a ser **XTransfer Offline**. FastDrop permanece como nome técnico do projeto até a migração de branding ser validada.

## Fase 1 — auditoria e preparação

- [x] Criada a branch `development/xtransfer-offline` antes de alterações de código.
- [x] Registada a auditoria em `docs/PHASE1-AUDIT.md`.
- [x] Confirmado que o Figma fornecido não ficou inspecionável no navegador sandbox; nenhuma importação foi alegada.
- [x] Separadas as funcionalidades demonstrativas das funcionalidades reais.
- [ ] Disponibilizar export ou acesso funcional do Figma para inspeção dos frames finais.

## Dashboard móvel offline-first

- [x] A primeira versão é uma aplicação móvel Android leve, preparada para transferir ficheiros entre telemóvel e PC Windows 10 Home ou outros computadores compatíveis.
- [x] A interface comunica claramente que a transferência ocorre sem cabo, sem internet e sem servidor externo.
- [x] O ecrã principal apresenta a descoberta de um computador compatível e um estado de emparelhamento visual antes da transferência.

## Seleção e transferência

- [x] O fluxo suporta visualmente seleção múltipla de imagens, vídeos, documentos Excel, ZIP, outros arquivos e aplicações que o Android permita partilhar.
- [x] O painel de transferência mostra progresso por ficheiro e no total, velocidade atual e estimativa de tempo restante.
- [x] O utilizador pode pausar, retomar, cancelar e recomeçar uma transferência interrompida ou falhada.
- [x] A conclusão distingue ficheiros concluídos, falhados e pendentes e comunica verificação de integridade.

## Memória, privacidade e continuidade

- [x] O produto não exige conta de utilizador para o fluxo local e apresenta histórico local das transferências recentes.
- [x] O design e a arquitetura evitam enviar ficheiros para a nuvem e deixam explícito que o transporte futuro deve usar streaming/chunks, não carregar tudo em memória.
- [x] A arquitetura e documentação deixam um protocolo modular preparado para um cliente leve de Windows 10 Home e PCs com 2 GB de RAM.

## Entrega técnica

- [x] Os ecrãs de Dashboard, Histórico e Definições funcionam no Expo Web Preview e mantêm navegação compatível com React Native.
- [x] Os diagnósticos TypeScript e o lint passam sem erros introduzidos pelo FastDrop.
- [x] Os ativos de branding nativo foram atualizados para a identidade FastDrop antes do checkpoint.

## Cliente Windows leve — primeira fatia

- [x] Existe um projeto C# WinForms sem dependências de terceiros, direcionado ao Windows 10 e preparado para publicação autónoma x64/x86.
- [x] O cliente anuncia o PC na rede local com a versão e porta do protocolo FD/01 e apresenta um estado claro de espera.
- [x] O utilizador pode escolher a pasta onde os ficheiros recebidos serão guardados.
- [x] A camada de sessão grava manifestos, escreve chunks por offset e verifica SHA-256 sem carregar o ficheiro inteiro em memória.
- [x] Ligar o listener TCP local na porta FD/01 e o emparelhamento com código temporário de seis caracteres.
- [ ] Ligar o envio real do Android ao manifesto, chunks, retomada e confirmação de integridade do cliente Windows.
- [ ] Compilar e testar o executável publicado num PC Windows 10 Home x64 e validar o comportamento numa máquina com 2 GB de RAM.

## Fase 2 — servidor TCP Windows

- [x] Listener TCP assíncrono na porta `45556`.
- [x] Emparelhamento com código temporário, expiração, token de sessão e limite de tentativas.
- [x] Validação de manifesto, nomes, IDs, tamanhos, offsets, chunks e SHA-256.
- [x] Escrita streaming em `.part`, ACK por chunk, retoma e finalização após hash completo.
- [x] Tratamento de cancelamento, timeout, desconexão e erros sem marcar falsos sucessos.
- [x] Criado projeto de testes automatizados sem dependências externas.
- [x] Executar build e testes C# no GitHub Actions com Windows Server e .NET 8.
- [x] Adicionar TLS 1.2/1.3 no listener Windows, certificado local persistente e fingerprint anunciada para pinning.
- [ ] Implementar cliente Android correspondente antes de declarar transferência real entre dispositivos.
- [ ] Validar pinning TLS no cliente Android e concluir teste real Android ↔ Windows.

## Fase 2.1 — correção e validação

- [x] Corrigida a compilação WinForms: os arcos gráficos do indicador de estado agora recebem a caneta Pen obrigatória.
- [x] Substituído o framing misto por Fd01Reader/Fd01Writer sobre um único stream TLS, sem buffering concorrente.
- [x] Tornado o código de emparelhamento de utilização única, associado ao deviceId do manifesto e renovado após handshake concluído ou abandonado.
- [x] Adicionado bloqueio temporário por dispositivo e limite global de tentativas para impedir contorno por troca de deviceId.
- [x] Adicionado TLS 1.2/1.3 com certificado PFX local persistente e fingerprint SHA-256 para pinning do cliente.
- [x] Limitadas ligações a endereços locais/privados; máximo de duas ligações simultâneas; timeout curto de handshake e drenagem de ligações no encerramento.
- [x] Corrigida a finalização para fechar o stream .part antes de renomear o ficheiro no Windows.
- [x] Reforçada validação de chunks vazios, offsets, ficheiros .part oversized e IDs duplicados sem distinção de maiúsculas/minúsculas.
- [x] Acrescentados testes de framing, emparelhamento reutilizado, limite global, traversal, integridade, retoma e casos inválidos.
- [x] Criado teste de integração TCP/TLS que emparelha um cliente de teste e transfere um ficheiro completo com ACK e SHA-256.
- [x] Workflow Windows/.NET 8 configurado para restore, build, testes e publicação do EXE win-x64.
- [x] Build, testes de protocolo, integração TLS e publicação win-x64 passaram numa execução do GitHub Actions no commit bb246ddef0d7378bc35443804ad4c077dca7cf8a.
- [ ] Revalidar o mesmo pipeline após os últimos reforços de limite global de tentativas e renovação condicional do ticket.
- [ ] Implementar regra de Firewall do Windows com escopo restrito à rede local; requer validação de permissões e comportamento em Windows 10.
- [ ] Implementar cliente Android correspondente, validação do fingerprint TLS e transferência real entre dispositivos.
- [ ] Testar no Samsung Galaxy A16 e ASUS VivoBook E410KA, incluindo hotspot e perda de ligação.
- [ ] Medir consumo e estabilidade numa máquina Windows com 2 GB de RAM.

## Fase 3 — integração Android ↔ Windows

### Fase 3.1 — descoberta real na rede local

- [x] Criado módulo nativo Expo local para Android, sem adicionar dependência de serviço externo.
- [x] Implementado listener UDP multicast no grupo 239.255.42.42:45555.
- [x] Validar anúncios Windows FD/01, porta 45556 e fingerprint SHA-256 anunciada.
- [x] Filtrar anúncios inválidos e endereços fora de redes locais privadas.
- [x] Declaradas permissões Android necessárias para rede Wi-Fi e multicast.
- [x] Substituído o PC fictício da interface por resultados reais da descoberta; removido o progresso demonstrativo.
- [x] Criado workflow Android para TypeScript, lint, Expo prebuild e compilação Gradle.
- [ ] Obter resultado verde do workflow Android no commit atual.
- [ ] Testar descoberta real entre o Samsung Galaxy A16 e o ASUS VivoBook E410KA, na mesma Wi-Fi e via hotspot.

### Fase 3.2 — ligação e emparelhamento seguro

- [ ] Implementar socket TLS Android com pinning obrigatório da fingerprint recebida no anúncio.
- [ ] Implementar PAIR, PAIR_ACCEPTED, AUTH e MANIFEST segundo FD/01.
- [ ] Exibir confirmação do PC e campo para o código temporário apresentado no Windows.
- [ ] Testar rejeição de fingerprint divergente e código expirado/incorreto.

### Fase 3.3 — envio real de ficheiros

- [ ] Integrar seletor Android nativo através do Storage Access Framework.
- [ ] Calcular SHA-256 em streaming sem carregar ficheiros inteiros na memória.
- [ ] Enviar FILE_BEGIN, chunks de até 1 MiB, aguardar ACK e respeitar offset de retoma.
- [ ] Enviar FILE_END e confirmar FILE_COMPLETE após verificação do servidor.
- [ ] Implementar cancelamento, desconexão e retoma.
- [ ] Validar fotos, vídeos, PDFs, documentos, ZIP e ficheiros grandes em teste físico.
