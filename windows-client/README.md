# XTransfer Offline para Windows

Cliente WinForms leve para Windows 10 Home e versões posteriores. Não usa Electron, conta ou servidor externo.

## Fase 2 implementada nesta branch

- Listener TCP assíncrono em `45556`.
- Emparelhamento com código de seis caracteres, expiração de cinco minutos, token aleatório efémero e bloqueio temporário após tentativas inválidas.
- Autenticação obrigatória do token antes do manifesto.
- Manifesto limitado por quantidade, tamanho de ficheiro, tamanho total, `fileId`, nome e SHA-256.
- Receção por streaming em chunks de no máximo 1 MiB.
- Escrita em `<fileId>.part`, com retoma pelo tamanho existente.
- Validação de offset, tamanho do chunk e SHA-256 do chunk.
- Verificação SHA-256 completa antes de mover o ficheiro para o nome final.
- Proteção contra traversal, nomes inválidos, ficheiros duplicados e falta de espaço.
- Cancelamento, timeout, desconexão e erros são tratados sem marcar uma transferência como concluída.

## Framing FD/01 da primeira implementação

Cada mensagem de controlo é uma linha UTF-8 com o formato `COMANDO JSON`. Os bytes de um chunk seguem imediatamente a linha `CHUNK` e têm exatamente o tamanho declarado.

```text
PAIR {"deviceId":"...","code":"ABC234","nonce":"..."}
PAIR_ACCEPTED {"accepted":true,"sessionId":"...","token":"..."}
AUTH {"sessionId":"...","token":"..."}
MANIFEST {"sessionId":"...","deviceId":"...","files":[...]}
FILE_BEGIN {"fileId":"..."}
RESUME {"fileId":"...","offset":0}
CHUNK {"fileId":"...","offset":0,"length":123,"sha256":"..."}\n<123 bytes>
ACK {"fileId":"...","offset":123}
FILE_END {"fileId":"...","sha256":"..."}
FILE_COMPLETE {"fileId":"...","name":"..."}
```

O Android ainda não implementa este framing nesta branch. Portanto, o listener Windows está pronto para integração, mas a transferência entre dispositivos ainda não deve ser anunciada como concluída.

## Compilar o cliente

Num computador Windows com .NET 8 SDK:

```powershell
dotnet restore .\FastDrop.Windows.csproj
dotnet build .\FastDrop.Windows.csproj -c Release
.\build.ps1 -Runtime win-x64
```

O executável autónomo ficará em `publish\win-x64\`. Para Windows x86, utilize `-Runtime win-x86`. A compatibilidade real com cada máquina Windows deve ser validada através de teste físico.

## Testes automatizados

O projeto separado em `tests\FastDrop.Protocol.Tests.csproj` valida rejeição de traversal, gravação e SHA-256, além de retoma a partir de `.part`:

```powershell
dotnet run --project .\tests\FastDrop.Protocol.Tests.csproj
```

O ambiente Manus atual não possui .NET SDK; por isso a execução destes testes deve ser feita num Windows ou numa máquina com .NET 8 instalado. O código não é apresentado como compilado nesta sessão.
