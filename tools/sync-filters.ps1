# Rewrites the Source entries of the VS filter file from the folders on disk, so the
# solution explorer keeps matching Source/ after files move between layers.
param(
    [string]$FiltersFile = (Join-Path $PSScriptRoot '..\Builds\VisualStudio2026\NewProject_App.vcxproj.filters')
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$sourceRoot = Join-Path $root 'Source'
$filters = Resolve-Path $FiltersFile
$text = Get-Content -Raw $filters

# Every Source folder becomes a filter node with a stable GUID derived from its name.
$folders = @('') + (Get-ChildItem $sourceRoot -Directory | ForEach-Object { $_.Name })

$filterNodes = foreach ($folder in $folders) {
    $name = if ($folder -eq '') { 'NewProject\Source' } else { "NewProject\Source\$folder" }
    $md5 = [System.Security.Cryptography.MD5]::Create()
    $hash = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($name))
    $guid = ([guid]$hash).ToString().ToUpper()
    "    <Filter Include=`"$name`">`r`n      <UniqueIdentifier>{$guid}</UniqueIdentifier>`r`n    </Filter>"
}

$compileNodes = @()
$includeNodes = @()

foreach ($folder in $folders) {
    $dir = if ($folder -eq '') { $sourceRoot } else { Join-Path $sourceRoot $folder }
    $filterName = if ($folder -eq '') { 'NewProject\Source' } else { "NewProject\Source\$folder" }
    $prefix = if ($folder -eq '') { '..\..\Source' } else { "..\..\Source\$folder" }

    foreach ($file in Get-ChildItem $dir -File | Sort-Object Name) {
        $entry = "$prefix\$($file.Name)"

        if ($file.Extension -eq '.cpp') {
            $compileNodes += "    <ClCompile Include=`"$entry`">`r`n      <Filter>$filterName</Filter>`r`n    </ClCompile>"
        }
        elseif ($file.Extension -eq '.h') {
            $includeNodes += "    <ClInclude Include=`"$entry`">`r`n      <Filter>$filterName</Filter>`r`n    </ClInclude>"
        }
    }
}

# Replace the existing Source filter declarations and the Source file entries in place.
$text = [regex]::Replace($text,
    '(?s)    <Filter Include="NewProject\\Source[^"]*">.*?</Filter>\r?\n(?=    <Filter Include="JUCE Library Code">)',
    (($filterNodes -join "`r`n") + "`r`n"))

$text = [regex]::Replace($text,
    '(?s)    <ClCompile Include="\.\.\\\.\.\\Source\\.*?</ClCompile>\r?\n(?!    <ClCompile Include="\.\.\\\.\.\\Source\\)',
    (($compileNodes -join "`r`n") + "`r`n"))

$text = [regex]::Replace($text,
    '(?s)    <ClInclude Include="\.\.\\\.\.\\Source\\.*?</ClInclude>\r?\n(?!    <ClInclude Include="\.\.\\\.\.\\Source\\)',
    (($includeNodes -join "`r`n") + "`r`n"))

Set-Content -Path $filters -Value $text -NoNewline
Write-Host "Updated $($compileNodes.Count) sources and $($includeNodes.Count) headers in $(Split-Path -Leaf $filters)"
