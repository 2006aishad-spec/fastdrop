# XTransfer Offline — módulo de transporte Android

Módulo Expo local, exclusivo para Android, que implementa a ligação direta ao cliente Windows através do protocolo FD/01. Não usa contas, nuvem, API remota nem servidor externo.

## Descoberta local

- Multicast: `239.255.42.42:45555`
- Transporte: TCP/TLS na porta `45556`
- Versão: `FD/01`
- O anúncio Windows inclui o SHA-256 do certificado DER.
- O módulo valida a versão, a porta, o endereço LAN e o formato da fingerprint antes de mostrar o PC.

## Emparelhamento e TLS

1. O Android liga ao endereço LAN anunciado.
2. Antes de enviar qualquer mensagem FD/01, o socket TLS aceita exclusivamente o certificado cujo SHA-256 corresponde à fingerprint anunciada.
3. O Android envia `PAIR` com o código temporário digitado pelo utilizador.
4. O Windows responde `PAIR_ACCEPTED` e entrega o token efémero.
5. O Android envia `AUTH` e, depois, o manifesto.
6. O certificado divergente, expirado ou inválido bloqueia a ligação.

São permitidos TLS 1.2 e TLS 1.3. O certificado local do Windows é autoassinado; a confiança é baseada na comparação exata da fingerprint recebida no anúncio, não numa autoridade certificadora pública.

## Seletor e envio

- Usa `ACTION_OPEN_DOCUMENT` / Storage Access Framework com seleção múltipla.
- Guarda a permissão de leitura persistente quando o fornecedor Android a disponibiliza.
- Rejeita nomes inválidos e fornecedores que não informem o tamanho do ficheiro.
- Calcula SHA-256 em streaming com buffer de 64 KiB.
- Envia chunks de até 1 MiB; cada chunk tem SHA-256 próprio e só avança depois de um `ACK` com o offset esperado.
- Envia `FILE_END` e só apresenta conclusão depois de receber `FILE_COMPLETE` do Windows.
- O servidor Windows valida o SHA-256 total antes de renomear o ficheiro temporário.

## Retoma e cancelamento

O `sessionId` é renovado a cada emparelhamento; o `transferId` permanece estável para identificar a mesma transferência quando a ligação é restabelecida. O Windows guarda os blocos incompletos em ficheiros `.part` e devolve o offset atual em `RESUME`.

- **Pausar:** fecha a ligação após o chunk confirmado; os blocos parciais permanecem no PC.
- **Retomar:** emparelhar novamente e enviar a mesma seleção com o mesmo `transferId` e os mesmos `fileId`.
- **Cancelar:** envia `CANCEL` num limite seguro entre chunks; o Windows apaga os ficheiros `.part` dessa sessão.
- **Desconexão abrupta:** os chunks já confirmados permanecem no `.part` e podem ser retomados.

O Android guarda localmente o identificador da transferência e os URIs selecionados para permitir retoma após reabrir a aplicação, desde que o fornecedor de documentos mantenha a permissão SAF.

## Limitações e validação

- Um fornecedor Android que não disponibilize o tamanho do ficheiro é rejeitado; não é criado um tamanho estimado.
- O módulo exige uma build nativa Android. Expo Go não inclui este módulo local.
- TypeScript, lint, Expo prebuild e Gradle são verificados no workflow Android.
- A compilação CI não substitui o teste físico no Samsung Galaxy A16 e no ASUS VivoBook E410KA. Descoberta, firewall, hotspot, pausa, retoma, cancelamento e ficheiros grandes continuam a exigir validação nos dois dispositivos.
