# FD/01 — protocolo local FastDrop

O FD/01 é a fronteira entre a experiência móvel e o cliente de PC. A transferência deve acontecer apenas depois de o telemóvel validar o dispositivo escolhido e o PC aceitar o emparelhamento.

## Handshake

1. O PC anuncia `fastdrop._tcp` na rede local com `deviceName`, `platform`, `protocolVersion` e um nonce curto.
2. O telemóvel mostra o dispositivo, o sistema operativo e um código visual de seis caracteres.
3. Ambos confirmam o código e derivam uma sessão efémera; nenhuma conta ou servidor externo participa.
4. A sessão começa com `manifest`, contendo nome, tamanho, tipo e checksum de cada ficheiro.

## Dados e retomada

Os ficheiros são enviados em chunks de tamanho adaptativo. O cliente receptor confirma cada chunk e persiste apenas o offset necessário para retomar. O emissor nunca deve carregar o ficheiro inteiro na memória. A sessão expõe `queued`, `transferring`, `paused`, `completed` e `failed`.

## Integridade

O checksum por ficheiro é comparado no receptor antes do estado `completed`. Um checksum divergente marca o item como `failed`, conserva o original e permite recomeçar apenas esse ficheiro.

## Compatibilidade Windows

O cliente Windows deve ser um processo leve, sem conta e sem internet obrigatória, com armazenamento temporário configurável e destino escolhido pelo utilizador. A implementação deve funcionar em Windows 10 Home e manter baixo consumo para máquinas com 2 GB de RAM. A versão concreta do transporte e o mecanismo de descoberta podem variar por plataforma, mas os estados e mensagens do FD/01 permanecem estáveis.
