# FD/01 — protocolo local FastDrop

O FD/01 é a fronteira entre a experiência móvel e o cliente de PC. A transferência deve acontecer apenas depois de o telemóvel validar o dispositivo escolhido e o PC aceitar o emparelhamento.

## Handshake

1. O PC anuncia `fastdrop._tcp` na rede local com `deviceName`, `platform`, `protocolVersion` e um nonce curto.
2. O telemóvel mostra o dispositivo, o sistema operativo e um código visual de seis caracteres.
3. Ambos confirmam o código e derivam uma sessão efémera; nenhuma conta ou servidor externo participa.
4. A sessão começa com `manifest`, contendo nome, tamanho, tipo e checksum de cada ficheiro.

## Dados e retomada

Os ficheiros são enviados em chunks de tamanho adaptativo, com limite inicial de 1 MiB. A implementação Windows da Fase 2 usa TCP `45556`, mensagens de controlo UTF-8 no formato `COMANDO JSON` por linha e bytes crus imediatamente depois de cada cabeçalho `CHUNK`. O cliente receptor confirma cada chunk e persiste o offset através do tamanho do ficheiro `.part`. O emissor nunca deve carregar o ficheiro inteiro na memória. A sessão expõe estados de espera, emparelhamento, receção, pausa, conclusão, falha e cancelamento.

## Integridade

O checksum por ficheiro é comparado no receptor antes do estado `completed`. Um checksum divergente marca o item como `failed`, conserva o original e permite recomeçar apenas esse ficheiro.

## Segurança e limites da Fase 2

O Windows gera um código de seis caracteres e um token aleatório por sessão. O pedido tem expiração, limite de tentativas e autenticação obrigatória antes do manifesto. O manifesto valida IDs, nomes sem traversal, tamanhos, quantidade, SHA-256 e espaço livre. Cada chunk valida o `fileId`, offset, tamanho e SHA-256 antes de ser escrito. Os dados começam num `.part` e só são movidos para o nome final depois da verificação completa.

Esta fase ainda não implementa TLS nem associação de certificado, nem a camada Android correspondente. Portanto, não se deve afirmar que o canal está encriptado ou que a transferência bidirecional está concluída.

## Compatibilidade Windows

O cliente Windows deve ser um processo leve, sem conta e sem internet obrigatória, com armazenamento temporário configurável e destino escolhido pelo utilizador. A implementação deve funcionar em Windows 10 Home e manter baixo consumo para máquinas com 2 GB de RAM. A versão concreta do transporte e o mecanismo de descoberta podem variar por plataforma, mas os estados e mensagens do FD/01 permanecem estáveis.
