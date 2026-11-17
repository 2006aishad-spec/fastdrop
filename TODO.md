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
- [ ] Ligar o listener HTTP local na porta FD/01 e o emparelhamento com confirmação visual de seis caracteres.
- [ ] Ligar o envio real do Android ao manifesto, chunks, retomada e confirmação de integridade do cliente Windows.
- [ ] Compilar e testar o executável publicado num PC Windows 10 Home x64 e validar o comportamento numa máquina com 2 GB de RAM.

## Fase 2 — servidor TCP Windows

- [x] Listener TCP assíncrono na porta `45556`.
- [x] Emparelhamento com código temporário, expiração, token de sessão e limite de tentativas.
- [x] Validação de manifesto, nomes, IDs, tamanhos, offsets, chunks e SHA-256.
- [x] Escrita streaming em `.part`, ACK por chunk, retoma e finalização após hash completo.
- [x] Tratamento de cancelamento, timeout, desconexão e erros sem marcar falsos sucessos.
- [x] Criado projeto de testes automatizados sem dependências externas.
- [ ] Executar os testes C# num ambiente com .NET 8 SDK.
- [ ] Implementar cliente Android correspondente antes de declarar transferência real entre dispositivos.
- [ ] Adicionar TLS ou mecanismo equivalente de associação criptográfica antes de declarar o canal protegido.
