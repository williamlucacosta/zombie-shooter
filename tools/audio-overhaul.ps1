# Sostituisce i gunshot con registrazioni reali premium (CC0), aggiunge pioggia,
# tuoni e una musica leggera, e converte TUTTO in OGG mono (~128kbps) per
# abbattere il peso del caricamento (da ~25 MB a ~2-3 MB).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ff = "C:\program files\ffmpeg\bin\ffmpeg.exe"
$audio = "C:\Users\willi\Desktop\shooter\public\assets\audio"
$tmp = "$audio\_src"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Dl($url, $dest) {
    Invoke-WebRequest -Uri $url -OutFile $dest -TimeoutSec 180
    "  scaricato {0,8:N0} KB  {1}" -f ((Get-Item $dest).Length/1KB), (Split-Path $dest -Leaf)
}
# ffmpeg: trim + fade + converti in OGG mono normalizzato
function Enc($in, $out, $ss, $dur, $fadeOut) {
    $args = @('-y','-hide_banner','-loglevel','error')
    if ($ss)  { $args += @('-ss', $ss) }
    if ($dur) { $args += @('-t', $dur) }
    $args += @('-i', $in)
    $af = 'dynaudnorm=p=0.9:m=10'
    if ($fadeOut) { $af = "afade=t=out:st=$($fadeOut[0]):d=$($fadeOut[1])," + $af }
    $args += @('-af', $af, '-ac','1','-ar','44100','-c:a','libvorbis','-q:a','4', $out)
    & $ff @args
    "  -> {0,7:N0} KB  {1}" -f ((Get-Item $out).Length/1KB), (Split-Path $out -Leaf)
}

$raw = "https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX"
Write-Output "== Download gunshot premium CC0 =="
Dl "$raw/1911/A_42P.wav" "$tmp/pistol.wav"
Dl "$raw/Mossberg/N_30P.wav" "$tmp/shotgun.wav"
Dl "$raw/AR-15/D_24P.wav" "$tmp/smg.wav"
Dl "$raw/Smith%20%26%20Wesson%20642/V_22P.wav" "$tmp/magnum.wav"

Write-Output "== Download pioggia / tuoni / musica =="
Dl "https://opengameart.org/sites/default/files/Rain%20OGG.zip" "$tmp/rain.zip"
Dl "https://opengameart.org/sites/default/files/thunderclap_0.ogg" "$tmp/thunder.ogg"
Dl "https://opengameart.org/sites/default/files/The%20Surreal%20Truth.mp3" "$tmp/music.mp3"

Write-Output "== Elaborazione gunshot (trim+fade+ogg) =="
# onset dei colpi individuati dall'agente; tail tagliata, fade morbido
Enc "$tmp/pistol.wav"  "$audio/shot_pistol.ogg"  0.90 1.30 @(0.9,0.4)
Enc "$tmp/shotgun.wav" "$audio/shot_shotgun.ogg" 0.30 1.60 @(1.1,0.5)
Enc "$tmp/smg.wav"     "$audio/shot_smg.ogg"     0.50 0.30 @(0.18,0.10)
Enc "$tmp/magnum.wav"  "$audio/shot_magnum.ogg"  0.42 1.50 @(1.0,0.5)

Write-Output "== Pioggia (loop) e tuoni =="
Expand-Archive -Path "$tmp/rain.zip" -DestinationPath "$tmp/rain" -Force
$rainFile = Get-ChildItem -Recurse "$tmp/rain" -Filter *.ogg | Where-Object { $_.FullName -notmatch '__MACOSX' } | Sort-Object Length -Descending | Select-Object -First 1
"  loop pioggia scelto: $($rainFile.Name)"
Enc $rainFile.FullName "$audio/rain_loop.ogg" $null $null $null
# tuono vicino + una variante distante (lowpass + rallentata) ricavata via ffmpeg
Enc "$tmp/thunder.ogg" "$audio/thunder_1.ogg" $null $null $null
& $ff -y -hide_banner -loglevel error -i "$tmp/thunder.ogg" -af "atempo=0.8,lowpass=f=900,dynaudnorm=p=0.9:m=10" -ac 1 -ar 44100 -c:a libvorbis -q:a 4 "$audio/thunder_2.ogg"
"  -> {0,7:N0} KB  thunder_2.ogg" -f ((Get-Item "$audio/thunder_2.ogg").Length/1KB)

Write-Output "== Musica leggera (sostituisce i 14 MB) =="
Enc "$tmp/music.mp3" "$audio/music_ambient.ogg" $null $null $null

Write-Output "== Conversione in OGG di tutti gli altri SFX (zombie, ricariche, ecc.) =="
$keep = @('shot_pistol','shot_shotgun','shot_smg','shot_magnum','rain_loop','thunder_1','thunder_2','music_ambient')
Get-ChildItem $audio -File | Where-Object { $_.Extension -in '.wav','.mp3' } | ForEach-Object {
    $base = $_.BaseName
    if ($keep -contains $base) { return }
    $out = "$audio\$base.ogg"
    & $ff -y -hide_banner -loglevel error -i $_.FullName -af 'dynaudnorm=p=0.9:m=10' -ac 1 -ar 44100 -c:a libvorbis -q:a 4 $out
    Remove-Item $_.FullName -Force
}
# rimuovi eventuali wav/mp3 sorgente sostituiti dai gunshot premium
Get-ChildItem $audio -File | Where-Object { $_.Extension -in '.wav','.mp3' } | Remove-Item -Force
Remove-Item -Recurse -Force $tmp

Write-Output "`n== RISULTATO =="
"Peso audio totale: {0:N2} MB" -f ((Get-ChildItem $audio -File | Measure-Object Length -Sum).Sum/1MB)
Get-ChildItem $audio -File | Sort-Object Name | Select-Object Name, @{n='KB';e={[int]($_.Length/1KB)}} | Format-Table -AutoSize
