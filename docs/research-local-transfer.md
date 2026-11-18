# Pesquisa — nova arquitetura local

Data: 2026-11-18

## Decisão

O modo principal passa a ser telefone como anfitrião local: o Android cria um hotspot local quando o sistema permite, inicia um servidor local e mostra ao PC um endereço/token. Se o fabricante não permitir a criação programática do hotspot, o utilizador ativa o hotspot manualmente e a app mantém apenas o servidor local. A mesma sessão suporta descarregar ficheiros preparados no telefone e carregar ficheiros do PC.

## Evidência

- A documentação Android diz que `LocalOnlyHotspot` permite que dispositivos ligados ao hotspot comuniquem entre si sem acesso à internet. A aplicação recebe a confirmação através de `LocalOnlyHotspotCallback.onStarted` e precisa de `NEARBY_WIFI_DEVICES` em Android 13+ ou `ACCESS_FINE_LOCATION` em versões anteriores.
- A documentação Android Wi-Fi Direct confirma que P2P pode funcionar sem rede ou hotspot e usa WPA2, mas exige permissões, callbacks, descoberta de peers e estados de conexão. Por isso fica como fallback/segunda etapa, não como único caminho.
- O LocalSend é uma referência consolidada: funciona sem cloud, em Windows, macOS, Linux, Android e iOS; usa comunicação local com REST/HTTPS, certificado local, descoberta na rede e recomenda atenção a firewall e isolamento de clientes no router.
- O Phone Link da Microsoft mostra uma experiência conhecida de envio/receção, mas tem requisitos de versões, compatibilidade de dispositivos e limites próprios; não é a base principal do XTransfer Offline.

## Fontes

- https://developer.android.com/develop/connectivity/wifi/localonlyhotspot
- https://source.android.com/docs/core/connect/wifi-softap
- https://developer.android.com/develop/connectivity/wifi/wifi-direct
- https://localsend.org/
- https://github.com/localsend/localsend
- https://support.microsoft.com/en-us/windows/apps/phonelink/seamlessly-transfer-content-between-your-devices

## Limites

O hotspot programático depende do Android, fabricante e permissões. O servidor local usa um token efémero e limita-se à rede local; TLS/pinning para o novo caminho deve ser acrescentado antes de o modo ser anunciado como protegido para redes não confiáveis. O Bluetooth não será o transporte principal porque é mais lento para vídeos e arquivos grandes; poderá ser considerado apenas para descoberta ou ficheiros pequenos.
