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

O projeto separado em `tests\FastDrop.Protocol.Tests.csproj` executa testes de:

- rejeição de traversal e IDs duplicados sem distinção de maiúsculas/minúsculas;
- gravação em chunks, offsets inválidos, checksum SHA-256 e finalização;
- retoma de ficheiros `.part`, incluindo descarte de temporários maiores que o tamanho declarado;
- framing sem perda de bytes entre cabeçalho e payload;
- utilização única do código, associação ao dispositivo e limitação global de tentativas;
- integração TCP/TLS ponta a ponta: emparelhamento, autenticação, manifesto, chunk, ACK, checksum e criação do ficheiro final.

Executa os testes num PC Windows com .NET 8 SDK:

```powershell
dotnet run --project .\tests\FastDrop.Protocol.Tests.csproj -c Release
dotnet build .\FastDrop.Windows.csproj -c Release
```

O workflow `.github/workflows/windows-client.yml` executa restore, build, testes e publicação win-x64 em `windows-latest`. Uma execução completa passou no commit `bb246ddef0d7378bc35443804ad4c077dca7cf8a`: [ver GitHub Actions](https://github.com/2006aishad-spec/fastdrop/actions/runs/44117772091). Os últimos reforços de rate limit e renovação do ticket estão a ser revalidados em execução posterior.

## Limitações antes da transferência real

- O Android ainda não implementa o framing FD/01 nem a validação da fingerprint TLS.
- A regra automática e restrita do Firewall do Windows ainda não foi implementada.
- Ainda não houve teste físico entre Android e Windows nem validação específica no Windows 10 Home, no ASUS VivoBook E410KA ou numa máquina com 2 GB de RAM.
- Esta fase valida o servidor Windows e a transferência de teste em CI; não significa que o produto já transfira ficheiros entre o Samsung e o PC.
