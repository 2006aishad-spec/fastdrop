# XTransfer Offline — desenho da transferência bidirecional nativa

## Objetivo

Permitir transferência real de ficheiros nos dois sentidos entre a aplicação Android e a aplicação Windows, mantendo o produto 100% nativo e offline. Não adicionar páginas web, browser, HTTP, nuvem, contas ou servidores externos.

## Estado confirmado antes desta fase

- Android já descobre o anúncio Windows FD/01, valida a fingerprint TLS, emparelha e envia ficheiros ao listener Windows.
- Windows já recebe ficheiros Android através do protocolo FD/01, com chunks, ACK, retoma e verificação SHA-256.
- Android ainda não disponibiliza um listener TLS de receção.
- Windows ainda não descobre Android nem possui um cliente de envio para Android.
- A compilação CI anterior passou nos dois sistemas, mas não valida comunicação física.

## Topologia pretendida

1. O telefone cria ou ativa o hotspot local.
2. O Windows liga-se ao hotspot do telefone.
3. Ambas as aplicações anunciam a sua presença por multicast FD/01 na rede local.
4. A aplicação que envia inicia a ligação TLS à aplicação que recebe.
5. O dispositivo recetor apresenta/valida um código de emparelhamento temporário.
6. O envio usa manifesto, chunks limitados, ACK por offset e SHA-256 final.
7. O recetor só confirma um ficheiro depois de validar o tamanho e o hash completos.

O Windows mantém o listener atual para Android → Windows e ganha um cliente nativo para Windows → Android. O Android mantém o cliente atual e ganha um listener nativo para Windows → Android.

## Segurança

- Certificado local persistente no Android Keystore; fingerprint SHA-256 incluída no anúncio Android.
- O cliente Windows valida a fingerprint anunciada antes de enviar credenciais.
- O código temporário deve ser de utilização única, expirar e ter limite de tentativas.
- O token de sessão deve ser aleatório, efémero e validado antes de aceitar o manifesto.
- Validar todos os campos do manifesto, IDs, nomes, tamanhos, offsets e checksums.
- Não aceitar caminhos fornecidos pelo remetente; gravar através de APIs SAF e nomes validados.
- Limitar o tamanho de cada chunk e fazer streaming para não carregar ficheiros completos na RAM.
- Não confirmar ficheiros antes de validar SHA-256.

## Persistência e destino Android

A receção deve usar Android Storage Access Framework. O utilizador escolhe a pasta de destino com ACTION_OPEN_DOCUMENT_TREE; a aplicação guarda a permissão persistente quando concedida. Os dados parciais e metadados de retoma ficam numa área privada da aplicação. A finalização deve escrever/renomear através de DocumentFile ou ContentResolver, sem assumir acesso direto a caminhos físicos.

## Protocolo e compatibilidade

Reutilizar FD/01 sempre que possível. Antes de alterar mensagens existentes, adicionar testes de compatibilidade. O cliente Windows deve reutilizar as estruturas de framing e manifesto, mas implementar explicitamente o papel de remetente. O recetor Android deve validar mensagens de forma equivalente ao TransferSession do Windows.

## Critérios de aceitação

- Descoberta recíproca em Wi-Fi local e no hotspot do Galaxy A16.
- Windows → Android e Android → Windows com ficheiros vazios e ficheiros grandes.
- Código errado, expirado ou reutilizado é rejeitado.
- Fingerprint TLS divergente bloqueia a ligação.
- Interrupção, retoma, pausa e cancelamento não produzem falsos sucessos.
- SHA-256 de origem e destino coincide.
- APK Android e EXE Windows compilam em CI.
- Teste físico no Galaxy A16 e ASUS VivoBook E410KA antes de declarar a versão pronta.

## Limitações de validação

A CI consegue validar compilação e testes automatizados, mas não consegue provar o comportamento do hotspot, multicast, permissões do Android, firewall do Windows ou interoperabilidade física. Esses testes exigem os dois dispositivos reais.
