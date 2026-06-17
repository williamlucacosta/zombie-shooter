# Seconda passata audio: pistola/fucile premium realistici (trim mirato + EQ corpo
# + loudnorm, NIENTE dynaudnorm che colorava il suono), pioggia steady realistica,
# e suoni di passo brevi. Tutto CC0.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ff = "C:\program files\ffmpeg\bin\ffmpeg.exe"
$audio = "C:\Users\willi\Desktop\shooter\public\assets\audio"
$tmp = "$audio\_src2"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Dl($url, $dest) {
    Invoke-WebRequest -Uri $url -OutFile $dest -TimeoutSec 240
    "  {0,8:N0} KB  {1}" -f ((Get-Item $dest).Length/1KB), (Split-Path $dest -Leaf)
}
# arma: trim del primo colpo + highpass + leggero boost di corpo + loudnorm punchy
function Gun($in, $out, $ss, $dur) {
    $fade = [math]::Round($dur - 0.14, 2)
    $af = "highpass=f=32,equalizer=f=95:width_type=o:width=1:g=3,equalizer=f=5500:width_type=q:width=2:g=-2,afade=t=out:st=${fade}:d=0.12,loudnorm=I=-12:TP=-1.2:LRA=9"
    & $ff -y -hide_banner -loglevel error -ss $ss -t $dur -i $in -af $af -ac 1 -ar 48000 -c:a libvorbis -q:a 5 $out
    "  -> {0,6:N0} KB  {1}" -f ((Get-Item $out).Length/1KB), (Split-Path $out -Leaf)
}

$raw = "https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX"
Write-Output "== Download armi premium =="
Dl "$raw/Walther%20PPQ/X_31P.wav" "$tmp/pistol.wav"   # 9mm moderno, secco e punchy
Dl "$raw/Mossberg/N_26P.wav" "$tmp/shotgun.wav"       # pump 12 gauge, il piu' potente

Write-Output "== Download pioggia steady + passi =="
Dl "https://opengameart.org/sites/default/files/Rain%20OGG.zip" "$tmp/rain.zip"
Dl "https://opengameart.org/sites/default/files/%5Bkdd%5DDifferentSteps_0.zip" "$tmp/steps.zip"

Write-Output "== Elaborazione armi =="
Gun "$tmp/pistol.wav"  "$audio/shot_pistol.ogg"  1.08 1.20
Gun "$tmp/shotgun.wav" "$audio/shot_shotgun.ogg" 0.78 1.55

Write-Output "== Pioggia steady (2.ogg, finestra costante) =="
Expand-Archive -Path "$tmp/rain.zip" -DestinationPath "$tmp/rain" -Force
$r = Get-ChildItem -Recurse "$tmp/rain" -Filter '2.ogg' | Where-Object { $_.FullName -notmatch '__MACOSX' } | Select-Object -First 1
& $ff -y -hide_banner -loglevel error -ss 2 -t 22 -i $r.FullName -af "dynaudnorm=p=0.95:m=5" -ac 2 -ar 44100 -c:a libvorbis -q:a 5 "$audio/rain_loop.ogg"
"  -> {0,6:N0} KB  rain_loop.ogg" -f ((Get-Item "$audio/rain_loop.ogg").Length/1KB)

Write-Output "== Passi (TinyWorlds, CC0) =="
Expand-Archive -Path "$tmp/steps.zip" -DestinationPath "$tmp/steps" -Force
$map = @{ 'mud02.ogg' = 'footstep_1.ogg'; 'stone01.ogg' = 'footstep_2.ogg'; 'leaves01.ogg' = 'footstep_3.ogg'; 'gravel.ogg' = 'footstep_4.ogg' }
foreach ($k in $map.Keys) {
    $src = Get-ChildItem -Recurse "$tmp/steps" -Filter $k | Where-Object { $_.FullName -notmatch '__MACOSX' } | Select-Object -First 1
    if ($src) {
        # passo breve e secco, normalizzato basso (verra' riprodotto piano)
        & $ff -y -hide_banner -loglevel error -t 0.45 -i $src.FullName -af "highpass=f=60,loudnorm=I=-20:TP=-3" -ac 1 -ar 44100 -c:a libvorbis -q:a 3 "$audio\$($map[$k])"
        "  -> {0,6:N0} KB  {1}" -f ((Get-Item "$audio\$($map[$k])").Length/1KB), $map[$k]
    } else { "  MANCA $k" }
}

Remove-Item -Recurse -Force $tmp
Write-Output "`n== Totale audio: {0:N2} MB ==" -f ((Get-ChildItem $audio -File | Measure-Object Length -Sum).Sum/1MB)
