param(
  [ValidateSet('win-x64', 'win-x86')]
  [string]$Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'FastDrop.Windows.csproj'
$output = Join-Path $PSScriptRoot "publish\$Runtime"

dotnet restore $project
dotnet publish $project -c Release -r $Runtime --self-contained true -p:PublishSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o $output
Write-Host "Publicado em $output"
