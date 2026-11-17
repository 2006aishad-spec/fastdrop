# XTransfer Offline para Windows

Cliente WinForms leve para Windows 10 Home e versões posteriores. Não usa Electron, conta ou servidor externo.

## Fase 2.1 implementada nesta branch

- Listener TCP assíncrono em `45556`.
- Emparelhamento com código de seis caracteres, expiração de cinco minutos, token aleatório efémero e bloqueio temporário após tentativas inválidas.
- Autenticação obrigatória do token antes do manifesto.
- TLS 1.2/1.3 obrigatório no listener, com certificado local persistente e impressão digital anunciada por UDP para pinning do cliente.
- O listener aceita apenas endereços loopback, privados IPv4 ou IPv6 local/link-local.
- Manifesto limitado por quantidade, tamanho de ficheiro, tamanho total, `fileId`, nome e SHA-256.
- Receção por streaming em chunks de no máximo 1 MiB.
- Escrita em `<fileId>.part`, com retoma pelo tamanho existente.
- Validação de offset, tamanho do chunk e SHA-256 do chunk.
- Verificação SHA-256 completa antes de mover o ficheiro para o nome final.
- Proteção contra traversal, nomes inválidos, ficheiros duplicados e falta de espaço.
- Cancelamento, timeout, desconexão e erros são tratados sem marcar uma transferência como concluída.

## Framing FD/01 da primeira implementação

Cada mensagem de controlo é uma linha UTF-8 com o formato `COMANDO JSON`. O leitor FD/01 usa diretamente o mesmo `Stream` TLS para consumir a linha e os bytes seguintes; não mistura `StreamReader` com leituras diretas e não pode antecipar bytes do payload. Os bytes de um chunk seguem imediatamente a linha `CHUNK` e têm exatamente o tamanho declarado.

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

O Android ainda não implementa este framing ou o pinning TLS nesta branch. Portanto, o listener Windows está protegido e testável, mas a transferência entre dispositivos ainda não deve ser anunciada como concluída.

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

O workflow `.github/workflows/windows-client.yml` executa restore, build, testes e publicação win-x64 em `windows-latest`. O ambiente Manus atual não possui .NET SDK; por isso a execução local destes testes continua pendente nesta sessão. A aprovação da Fase 2.1 depende do resultado verde do workflow.
