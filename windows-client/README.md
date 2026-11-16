# FastDrop para Windows

Cliente de receção leve para Windows 10 Home e versões posteriores. A primeira versão usa apenas WinForms e bibliotecas nativas .NET; não usa Electron, conta, internet ou servidor externo.

## Objetivo desta fase

Ao abrir, o cliente anuncia o computador na rede local através de UDP multicast, mostra que está pronto para receber e permite escolher a pasta de destino. A camada `Protocol` define o handshake FD/01, o manifesto, os chunks e os estados de transferência. A camada `Transfer` grava chunks por offset e verifica SHA-256 sem carregar o ficheiro inteiro em memória.

## Compilar no Windows

Instalar o .NET 8 SDK no computador de desenvolvimento e executar:

```powershell
dotnet restore .\FastDrop.Windows.csproj
dotnet build .\FastDrop.Windows.csproj -c Release
 dotnet publish .\FastDrop.Windows.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o .\publish\win-x64
```

O executável publicado pode ser copiado para outros PCs Windows 10 x64. Para máquinas antigas x86, publicar com `-r win-x86`.

## Próximo encaixe com o Android

O telemóvel deve descobrir o anúncio FD/01, apresentar o código visual ao utilizador e chamar o endpoint de emparelhamento do cliente Windows. Depois envia um manifesto e chunks com `sessionId`, `fileId`, `offset` e checksum. O cliente só marca o ficheiro como concluído após a verificação SHA-256.

Nesta fase, o processo de rede real ainda está isolado atrás das classes de protocolo e sessão; o próximo passo é ligar o listener HTTP local na porta FD/01 45556 e implementar o handshake com confirmação visual.
