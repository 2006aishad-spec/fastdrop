# FD/01 — protocolo local XTransfer Offline

O FD/01 liga a aplicação Android ao cliente Windows na rede local. Não requer conta, internet, nuvem ou servidor externo.

## Descoberta

O Windows anuncia periodicamente um objeto JSON por UDP multicast em `239.255.42.42:45555`. Campos obrigatórios: `deviceId`, `deviceName`, `platform=Windows`, `protocolVersion=FD/01`, `transferPort=45556` e `certificateSha256` (SHA-256 hexadecimal do certificado DER).

O Android só apresenta anúncios compatíveis e endereços locais privados. A identidade do PC é fixada durante o handshake TLS: a fingerprint do certificado apresentado tem de corresponder exatamente à fingerprint anunciada.

## TLS e emparelhamento

O Android abre TCP na porta `45556` e negocia TLS 1.2 ou TLS 1.3. O certificado apresentado pelo Windows tem de corresponder exatamente à fingerprint SHA-256 do anúncio escolhido. Uma diferença bloqueia a ligação antes de qualquer mensagem de emparelhamento.

Sobre o stream TLS, as mensagens de controlo são linhas UTF-8 no formato `COMANDO JSON\n`:

1. Android → Windows: `PAIR {deviceId, code, nonce}`.
2. Windows → Android: `PAIR_ACCEPTED {accepted, sessionId, code, message, token}`, ou `PAIR_REJECTED`.
3. Android → Windows: `AUTH {sessionId, token}`.
4. Android → Windows: `MANIFEST {sessionId, deviceId, transferId, files}`.
5. Windows → Android: `MANIFEST_ACCEPTED`.

O código de seis caracteres tem expiração e utilização única. O token é aleatório, temporário e consumido pelo servidor. O `sessionId` identifica apenas o emparelhamento atual.

## Manifesto e transferência

Cada entrada de `files` contém `fileId`, `name`, `size`, `kind` e `sha256`. O `transferId` é estável durante uma transferência e mantém a pasta de retoma no Windows mesmo quando um novo emparelhamento cria outro `sessionId`.

Para cada ficheiro:

1. Android → Windows: `FILE_BEGIN {fileId}`.
2. Windows → Android: `RESUME {fileId, offset}`.
3. Para cada bloco: Android envia `CHUNK {fileId, offset, length, sha256}\n`, seguido imediatamente pelos bytes crus do bloco.
4. Windows → Android: `ACK {fileId, offset}`, com o próximo offset confirmado.
5. Android → Windows: `FILE_END {fileId, sha256}`.
6. Windows → Android: `FILE_COMPLETE {fileId, name}`, apenas depois de validar o tamanho e o SHA-256 total.

Tamanho máximo de chunk: 1 MiB. O Android calcula o SHA-256 do ficheiro em streaming; não carrega o ficheiro inteiro na memória. O Windows grava em `.part`, confirma cada chunk e só move o conteúdo para o nome final depois de confirmar o checksum completo.

## Pausa, retoma e cancelamento

- **Pausa:** fecha a ligação após um chunk confirmado. Os blocos parciais permanecem no Windows.
- **Retoma:** emparelhar novamente, enviar o mesmo `transferId` e os mesmos `fileId`; o Windows devolve o offset atual em `RESUME`.
- **Cancelamento:** envia `CANCEL\n` entre chunks confirmados. O Windows tenta apagar os ficheiros `.part` dessa transferência.
- **Desconexão abrupta:** dados não confirmados não são marcados como concluídos; blocos já confirmados permanecem disponíveis para retoma.

## Limites e segurança

O servidor valida IDs, nomes sem traversal, tamanhos, número de ficheiros, espaço livre, offsets, tamanhos de chunk e SHA-256. As ligações recebidas são limitadas a endereços locais/privados e o servidor limita ligações simultâneas.

A fingerprint anunciada por UDP, isoladamente, não autentica o PC. O pinning impede que o certificado apresentado seja substituído sem divergência, enquanto o utilizador também tem de confirmar o nome do PC e introduzir o código temporário mostrado no Windows.

## Validação

Os testes automatizados e builds CI validam o código compilado, mas não substituem os testes físicos de rede, firewall, hotspot, pausa, retoma, cancelamento e transferência de ficheiros grandes no Samsung Galaxy A16 e ASUS VivoBook E410KA.
