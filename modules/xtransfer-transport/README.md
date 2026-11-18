# XTransfer Offline — módulo de transporte Android

Módulo Expo local, exclusivo para Android, que gere o hotspot local e liga diretamente ao cliente Windows através do protocolo FD/01. Não usa contas, nuvem, HTTP/browser, API remota nem servidor externo.

## Hotspot Android

- Tenta criar uma rede local com WifiManager.LocalOnlyHotspot.
- Permite ao utilizador ativar o hotspot manualmente nas Definições quando a API não estiver disponível.
- A camada hotspot não inicia servidor HTTP nem publica uma página web.
- O PC Windows liga-se ao hotspot do telefone; a aplicação Android continua a iniciar o transporte FD/01 para o PC.

## Descoberta local

- Multicast: 239.255.42.42:45555.
- Transporte: TCP/TLS na porta 45556.
- Versão: FD/01.
- O anúncio Windows inclui o SHA-256 do certificado DER.
- O Android valida a versão, a porta, o endereço LAN e o formato da fingerprint antes de apresentar o PC.

## Emparelhamento e TLS

1. O Android descobre o endereço LAN anunciado pelo Windows.
2. O Android liga ao PC por TLS 1.2 ou TLS 1.3.
3. O certificado apresentado tem de corresponder à fingerprint SHA-256 anunciada.
4. O Android envia PAIR com o código temporário digitado pelo utilizador.
5. O Windows responde PAIR_ACCEPTED com o token efémero.
6. O Android envia AUTH e o manifesto.

A confiança é baseada na comparação exata da fingerprint do certificado, não numa autoridade certificadora pública.

## Seletor e envio

- Usa ACTION_OPEN_DOCUMENT / Storage Access Framework com seleção múltipla.
- Guarda a permissão de leitura persistente quando o fornecedor Android a disponibiliza.
- Rejeita nomes inválidos e fornecedores que não informem o tamanho do ficheiro.
- Calcula SHA-256 em streaming.
- Envia chunks de até 1 MiB; cada chunk é validado e só avança após ACK com o offset esperado.
- Só apresenta conclusão depois de receber FILE_COMPLETE do Windows.
- O Windows valida o SHA-256 total antes de finalizar o ficheiro.

## Retoma e cancelamento

O transferId identifica a transferência entre sessões. O Windows conserva blocos incompletos em ficheiros .part e devolve o offset atual em RESUME.

- Pausa fecha a ligação num limite seguro, depois de um chunk confirmado.
- Retoma exige novo emparelhamento e a mesma seleção com os mesmos identificadores.
- Cancelamento envia CANCEL num limite seguro entre chunks; o Windows remove os blocos parciais da transferência.
- Uma desconexão abrupta não marca os dados não confirmados como concluídos.

## Limitações e validação

- Um fornecedor Android que não informe o tamanho do ficheiro é rejeitado.
- O módulo exige uma build nativa Android; Expo Go não inclui este módulo local.
- A compilação CI não substitui o teste físico no Samsung Galaxy A16 e ASUS VivoBook E410KA.
- Descoberta multicast no hotspot, firewall, pausa, retoma, cancelamento e ficheiros grandes precisam de validação física.
- O sentido Windows → Android ainda não está implementado neste módulo.