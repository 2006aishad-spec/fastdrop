# XTransfer Offline — módulo de transporte Android

Módulo Expo local, exclusivo para Android. Fornece transporte FD/01 nativo nos dois sentidos, sem browser, HTTP, nuvem, conta ou servidor externo.

## Hotspot e descoberta

- O Android pode criar uma rede local através de `WifiManager.LocalOnlyHotspot`, com alternativa para ativação manual nas Definições.
- O Windows liga-se ao hotspot do telefone.
- A descoberta usa multicast UDP `239.255.42.42:45555`.
- Android anuncia o seu dispositivo enquanto a receção está ativa; Windows também anuncia o seu listener.
- O anúncio inclui plataforma, porta, identificador e fingerprint SHA-256 do certificado local.

## Android → Windows

1. Android descobre o Windows pela rede local.
2. Android valida por pinning a fingerprint SHA-256 do certificado Windows.
3. O utilizador introduz o código temporário apresentado no Windows.
4. O Android envia manifesto e ficheiros por TLS 1.2/1.3.
5. Chunks de até 1 MiB são confirmados por ACK e offset.
6. Windows valida SHA-256 dos chunks e do ficheiro completo antes de finalizar.

O seletor de ficheiros Android usa Storage Access Framework (SAF), com leitura em streaming.

## Windows → Android

1. O utilizador ativa a receção na aplicação Android.
2. Android cria um listener TLS nativo na porta TCP `45557`.
3. O certificado/chave do Android é mantido no Android Keystore; a fingerprint SHA-256 é anunciada por multicast.
4. Windows descobre o telefone, valida a fingerprint anunciada e liga por TLS 1.2/1.3.
5. O utilizador introduz no Windows o código de seis caracteres apresentado pelo Android.
6. Android valida código temporário, sessão e token antes de aceitar o manifesto.
7. Os dados são recebidos por streaming em ficheiros parciais privados. Após tamanho e SHA-256 completos, são publicados em `Transferências/XTransfer Offline` através de MediaStore no Android 10 ou superior.

O código temporário é de utilização única, tem expiração e é renovado após cada tentativa de ligação. As tentativas inválidas são limitadas temporariamente.

## Pausa, retoma e cancelamento

- O remetente verifica a ação de pausa/cancelamento entre chunks confirmados.
- Pausa fecha a ligação num limite seguro; o recetor mantém os blocos parciais e os offsets.
- Retoma reutiliza os identificadores estáveis da seleção e solicita o offset atual ao recetor, usando um novo emparelhamento.
- Cancelamento envia `CANCEL`; o recetor confirma antes de eliminar os blocos parciais.
- Um ficheiro só é declarado concluído depois de validação SHA-256 total.

## Limitações e validação pendente

- A aplicação Android exige APK nativo; Expo Go não inclui este módulo.
- Build/CI não substitui teste de hotspot, multicast, TLS e transferência física.
- Necessário validar no Samsung Galaxy A16 ↔ ASUS VivoBook E410KA, incluindo ficheiros grandes, pausa, retoma, cancelamento e integridade.
- Em Android anterior à versão 10, o destino usa a pasta de Downloads específica da aplicação; no Android 10 ou superior, usa a pasta pública Transferências.
