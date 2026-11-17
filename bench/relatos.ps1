param([switch]$SalvarChave, [switch]$Todos)

$ErrorActionPreference = 'Stop'
$credentialPath = Join-Path $env:LOCALAPPDATA 'Vetora\supabase-token.json'

if ($SalvarChave) {
    $secureToken = Read-Host 'Cole o token temporário do Supabase (entrada oculta)' -AsSecureString
    New-Item -ItemType Directory -Force -Path (Split-Path $credentialPath) | Out-Null
    [pscustomobject]@{
        token = ConvertFrom-SecureString $secureToken
        savedAt = [DateTimeOffset]::UtcNow.ToString('o')
        expiresAt = [DateTimeOffset]::UtcNow.AddDays(7).ToString('o')
    } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $credentialPath
}

if (!(Test-Path -LiteralPath $credentialPath)) {
    throw 'Peça uma nova chave ao Nilson e salve com bench/relatos.ps1 -SalvarChave.'
}
$credential = Get-Content -Raw -LiteralPath $credentialPath | ConvertFrom-Json
if ([DateTimeOffset]::UtcNow -ge [DateTimeOffset]$credential.expiresAt) {
    throw 'O prazo de sete dias terminou. Peça uma nova chave ao Nilson e use -SalvarChave.'
}

$secureToken = ConvertTo-SecureString $credential.token
$token = [System.Net.NetworkCredential]::new('', $secureToken).Password
$previousKey = $env:SUPABASE_SERVICE_KEY
try {
    try {
        $keys = Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects/dttuyrpdzqmjckfhlnkd/api-keys?reveal=true' -Headers @{ Authorization = "Bearer $token" }
    } catch {
        throw 'Não foi possível acessar o Supabase. Confira a conexão e, se a chave expirou ou foi revogada, peça outra ao Nilson.'
    }
    $serviceKey = $keys | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1
    if (!$serviceKey.api_key) { throw 'O Supabase não retornou a chave de serviço do projeto.' }
    $env:SUPABASE_SERVICE_KEY = $serviceKey.api_key
    Push-Location (Split-Path $PSScriptRoot)
    try {
        $nodeArgs = @('--experimental-strip-types', 'bench/relatos.ts')
        if ($Todos) { $nodeArgs += '--todos' }
        & node @nodeArgs
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar os relatos. Execute novamente para tentar completar o download.' }
    } finally { Pop-Location }
} finally {
    $env:SUPABASE_SERVICE_KEY = $previousKey
    $token = $null
    $keys = $null
    $serviceKey = $null
}
