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
- [x] O painel mostra o ficheiro atual, bytes confirmados, total e percentagem real recebida do módulo nativo; velocidade e estimativa de tempo ainda não estão implementadas.
- [x] O utilizador pode pausar, retomar, cancelar e recomeçar uma transferência interrompida ou falhada.
- [x] A conclusão só é indicada após confirmação FILE_COMPLETE e SHA-256 do Windows; a lista detalhada de ficheiros concluídos, falhados e pendentes ainda não está implementada.

## Memória, privacidade e continuidade

- [x] O produto não exige conta de utilizador para o fluxo local; o Android guarda apenas a transferência pendente necessária para retoma. Histórico completo ainda não está implementado.
- [x] O design e a arquitetura evitam enviar ficheiros para a nuvem e deixam explícito que o transporte futuro deve usar streaming/chunks, não carregar tudo em memória.
- [x] A arquitetura e documentação deixam um protocolo modular preparado para um cliente leve de Windows 10 Home e PCs com 2 GB de RAM.

## Entrega técnica

- [ ] Revalidar os ecrãs de Dashboard, Histórico e Definições no Expo Web Preview após a integração nativa do XTransfer Offline.
- [x] Os diagnósticos TypeScript e o lint passam sem erros introduzidos pelo FastDrop.
- [x] Os ativos de branding nativo foram atualizados para a identidade FastDrop antes do checkpoint.

## Cliente Windows leve — primeira fatia

- [x] Existe um projeto C# WinForms sem dependências de terceiros, direcionado ao Windows 10 e preparado para publicação autónoma x64/x86.
- [x] O cliente anuncia o PC na rede local com a versão e porta do protocolo FD/01 e apresenta um estado claro de espera.
- [x] O utilizador pode escolher a pasta onde os ficheiros recebidos serão guardados.
- [x] A camada de sessão grava manifestos, escreve chunks por offset e verifica SHA-256 sem carregar o ficheiro inteiro em memória.
- [x] Ligar o listener TCP local na porta FD/01 e o emparelhamento com código temporário de seis caracteres.
- [x] Ligar o envio real do Android ao manifesto, chunks, retoma e confirmação de integridade do cliente Windows (build/CI e hardware ainda pendentes).
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
- [x] Implementar cliente Android correspondente (validação de build e teste físico ainda pendentes).
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
- [x] Implementar cliente Android com pinning TLS, emparelhamento e envio real por chunks (validação CI e física pendentes).
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

- [x] Implementado socket TLS Android com TLS 1.2/1.3.
- [x] Implementado pinning obrigatório da fingerprint SHA-256 DER recebida no anúncio.
- [x] Implementadas mensagens PAIR, PAIR_ACCEPTED/PAIR_REJECTED, AUTH e MANIFEST segundo FD/01.
- [x] Interface Android permite introduzir o código temporário apresentado no Windows.
- [ ] Obter build Android verde e testar fingerprint divergente, código incorreto/expirado e utilização única em hardware físico.

### Fase 3.3 — envio real de ficheiros

- [x] Integrado seletor Android nativo SAF com seleção múltipla.
- [x] Calculado SHA-256 em streaming sem carregar ficheiros inteiros na memória.
- [x] Enviados chunks até 1 MiB, cada um com checksum SHA-256 e ACK validado por offset.
- [x] Implementados FILE_BEGIN, RESUME, FILE_END e confirmação FILE_COMPLETE.
- [x] Interface usa eventos reais do módulo nativo, sem progresso simulado.
- [ ] Obter build Android verde e validar fotos, vídeos, PDFs, documentos, ZIP, ficheiros vazios e ficheiros grandes em teste físico.

### Fase 3.4 — retoma e integridade

- [x] Separado transferId estável do sessionId efémero de cada emparelhamento.
- [x] Windows usa a pasta de transferência estável para manter os blocos .part entre novas sessões TLS.
- [x] Android guarda localmente transferId, fileIds e URIs selecionados para retoma após reabrir a aplicação, dependendo da persistência SAF do fornecedor.
- [x] Retoma continua a partir do offset confirmado pelo Windows.
- [x] Pausa fecha a ligação sem apagar blocos parciais.
- [x] Cancelamento envia CANCEL entre chunks confirmados e o Windows remove os .part da transferência.
- [x] SHA-256 completo validado no Windows antes de mover o ficheiro para o nome final.
- [x] Adicionado teste Windows de retoma entre dois emparelhamentos com sessionIds diferentes.
- [ ] Executar os testes automatizados após todos os últimos commits e obter pipelines CI verdes.
- [ ] Testar rede interrompida, pausa, retoma e cancelamento no Galaxy A16 ↔ ASUS VivoBook E410KA.

### Teste físico obrigatório — Galaxy A16 e ASUS VivoBook E410KA

- [ ] Descoberta na mesma rede Wi-Fi.
- [ ] Descoberta via hotspot do Galaxy A16.
- [ ] Bloqueio quando a fingerprint TLS diverge.
- [ ] Rejeição de código incorreto ou expirado.
- [ ] Envio de fotos, vídeos, PDF, DOCX/XLSX, ZIP e ficheiro vazio.
- [ ] Interrupção a meio e retoma a partir do offset confirmado.
- [ ] Cancelamento e remoção dos .part dessa transferência.
- [ ] Comparação SHA-256 da origem e do destino.
- [ ] Medição da RAM e teste com ficheiros grandes no ASUS.

## Fase 4 — redesign hotspot-first Android

- [x] Pesquisadas referências Android LocalOnlyHotspot, Wi-Fi Direct, LocalSend e Phone Link.
- [x] Criado o fluxo de UI Enviar/Receber com telefone como anfitrião local.
- [x] Adicionado servidor local Android com token efémero, página web, download por streaming e upload por streaming.
- [x] Adicionado fallback para hotspot ativado manualmente quando o Android não permitir criar o hotspot pela API.
- [x] Acrescentadas permissões Android de Wi-Fi local e `NEARBY_WIFI_DEVICES`.
- [x] Documentadas as limitações atuais: sem TLS no novo servidor local, sem retoma de upload e sem checksum final do upload.
- [ ] Compilar o módulo nativo com Gradle/SDK Android; este ambiente não tem essas ferramentas.
- [ ] Testar hotspot criado pelo Android no Galaxy A16 e ligação do ASUS VivoBook E410KA.
- [ ] Adicionar TLS/pinning ao servidor local antes de o promover a modo seguro de produção.
- [ ] Persistir histórico real de uploads/downloads e adicionar cancelamento/retoma no navegador.
- [ ] Reavaliar Wi-Fi Direct e Bluetooth como fallbacks depois do caminho hotspot-first funcionar.
