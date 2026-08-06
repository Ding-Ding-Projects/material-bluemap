[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('windows-package')]
    [string]$Profile,

    [switch]$DryRun,

    [string]$FakeMissing = ''
)

$ErrorActionPreference = 'Stop'
$fake = @($FakeMissing.Split(',', [System.StringSplitOptions]::RemoveEmptyEntries))

function Test-DependencyMissing {
    param([Parameter(Mandatory = $true)][string]$Name)
    if ($fake -contains $Name) { return $true }
    return $null -eq (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-JobPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $env:Path = "$Path;$env:Path"
    if ($env:GITHUB_PATH) {
        $Path | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
    }
}

if (Test-DependencyMissing -Name 'git') {
    $version = '2.55.0.3'
    $archiveName = "MinGit-$version-64-bit.zip"
    $url = "https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/$archiveName"
    $expectedSha256 = 'f48e2d2dc74a24454adc6d8fd0ac25bf9c2386f19cfb06202b9465aaad4f9f05'
    if ($DryRun) {
        Write-Host "bootstrap[$Profile]: DRY-RUN install git $version from $url"
    }
    else {
        $temporaryRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
        $toolRoot = Join-Path $temporaryRoot 'material-bluemap-tools'
        $archive = Join-Path $toolRoot $archiveName
        $destination = Join-Path $toolRoot "mingit-$version"
        New-Item -ItemType Directory -Force -Path $toolRoot | Out-Null
        Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $destination -Recurse -Force -ErrorAction SilentlyContinue
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive
        $actualSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualSha256 -ne $expectedSha256) {
            throw "dependency 'git' archive checksum mismatch: expected $expectedSha256, got $actualSha256"
        }
        Expand-Archive -LiteralPath $archive -DestinationPath $destination
        Add-JobPath -Path (Join-Path $destination 'cmd')
        if (Test-DependencyMissing -Name 'git') {
            throw "dependency 'git' is still unavailable after installing MinGit $version"
        }
        Write-Host "bootstrap[$Profile]: installed Git for Windows $version in $destination"
    }
}
else {
    Write-Host "bootstrap[$Profile]: $(git --version) already present"
}

Write-Host "bootstrap[$Profile]: complete"
