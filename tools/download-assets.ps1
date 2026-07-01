# Scarica tutti gli asset verificati (CC0/OFL) nelle cartelle public/assets.
$ProgressPreference = 'SilentlyContinue'
$root = "C:\Users\willi\Desktop\shooter\public\assets"
$models = "$root\models"; $audio = "$root\audio"; $tex = "$root\textures"; $fonts = "$root\fonts"
$fails = @()

function Get-File($url, $dest) {
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -TimeoutSec 120
        $size = (Get-Item $dest).Length
        Write-Output ("OK   {0,10:N0}  {1}" -f $size, (Split-Path $dest -Leaf))
    } catch {
        $script:fails += $url
        Write-Output "FAIL $url -> $($_.Exception.Message)"
    }
}

# ----- MODELLI (poly.pizza / Quaternius, CC0) -----
$pp = "https://static.poly.pizza"
Get-File "$pp/2d0ad9ee-2e86-4b0c-b20e-cfc8c80c8c78.glb" "$models\player.glb"        # Character Sam
Get-File "$pp/c4002f69-6979-42e8-ad6e-2f4e14fc3a9d.glb" "$models\zombie_a.glb"      # Zombie
Get-File "$pp/cf4368cf-b39e-4c9a-8a83-a9c637740eb8.glb" "$models\zombie_b.glb"      # Zombie 2
Get-File "$pp/02774147-cf49-4915-a70f-81ac5a8d625b.glb" "$models\zombie_c.glb"      # Big Arm (brute/boss)
Get-File "$pp/77876445-e71a-4d5b-89c4-93653225a1d8.glb" "$models\zombie_d.glb"      # Zombie Half (crawler)
Get-File "$pp/f11b6abc-28a4-4d23-bfce-679a8e2b9da1.glb" "$models\dog.glb"           # German Shepherd
# (armi low-poly Quaternius rimosse: ora 4 viewmodel FPS realistici da Sketchfab, vedi README)
Get-File "$pp/1f4a7592-6157-4726-8159-49842c361f11.glb" "$models\barrel.glb"
Get-File "$pp/ef0714ea-b808-423d-af60-e5aba72476b4.glb" "$models\crate.glb"         # Chest

# ----- MODELLI (KayKit, CC0) -----
$kkc = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/main/addons/kaykit_character_pack_skeletons/Characters/gltf"
Get-File "$kkc/Skeleton_Minion.glb"  "$models\skeleton_a.glb"
Get-File "$kkc/Skeleton_Mage.glb"    "$models\skeleton_b.glb"
Get-File "$kkc/Skeleton_Warrior.glb" "$models\skeleton_c.glb"

$kkh = "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0/main/addons/kaykit_halloween_bits/Assets/gltf"
$props = @('gravestone','grave_A','gravemarker_A','crypt','tree_dead_large','tree_dead_medium',
           'fence','fence_broken','post_lantern','lantern_standing','coffin','skull','ribcage',
           'pumpkin_orange_jackolantern','shrine','bone_A')
foreach ($p in $props) {
    Get-File "$kkh/$p.gltf" "$models\$p.gltf"
    Get-File "$kkh/$p.bin"  "$models\$p.bin"
}
Get-File "$kkh/halloweenbits_texture.png" "$models\halloweenbits_texture.png"

# ----- TEXTURE TERRENO (Poly Haven, CC0) -----
Get-File "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg" "$tex\ground.jpg"

# ----- FONT (OFL) -----
Get-File "https://raw.githubusercontent.com/google/fonts/main/ofl/creepster/Creepster-Regular.ttf" "$fonts\horror.ttf"

# ----- AUDIO (OpenGameArt, CC0) -----
$oga = "https://opengameart.org/sites/default/files"
Get-File "$oga/zombies.zip" "$audio\zombies.zip"
Get-File "$oga/01_zombey.mp3" "$audio\zombie_growl_1.mp3"
Get-File "$oga/02_zombey.mp3" "$audio\zombie_growl_2.mp3"
Get-File "$oga/03_zombey.mp3" "$audio\zombie_growl_3.mp3"
Get-File "$oga/04_zombey.mp3" "$audio\zombie_growl_4.mp3"
Get-File "$oga/06_zombey.mp3" "$audio\zombie_growl_5.mp3"
Get-File "$oga/07_zombey.mp3" "$audio\zombie_growl_6.mp3"
Get-File "$oga/22%20Pistol.wav" "$audio\shot_pistol.wav"
Get-File "$oga/22%20Magnum.wav" "$audio\shot_magnum.wav"
Get-File "$oga/Black%20Powder.wav" "$audio\shot_shotgun.wav"
Get-File "$oga/sounds.zip" "$audio\gunsounds.zip"
Get-File "$oga/gunreload1.wav" "$audio\reload_pistol.wav"
Get-File "$oga/assaultriflereload1_0.wav" "$audio\reload_rifle.wav"
Get-File "$oga/shotguncock_0.wav" "$audio\shotgun_pump.wav"
Get-File "$oga/monster_roar.wav" "$audio\boss_roar.wav"
Get-File "$oga/heartbeat_fast_0.wav" "$audio\heartbeat.wav"
Get-File "$oga/Juhani%20Junkala%20-%20Post%20Apocalyptic%20Wastelands%20%5BLoop%20Ready%5D.ogg" "$audio\music_ambient.ogg"

# ----- AUDIO UI (Kenney via mirror Calinou, CC0) -----
$ken = "https://raw.githubusercontent.com/Calinou/kenney-interface-sounds/master/addons/kenney_interface_sounds"
Get-File "$ken/confirmation_002.wav" "$audio\pickup.wav"
Get-File "$ken/click_002.wav" "$audio\click.wav"

# ----- estrazione zip -----
try {
    Expand-Archive -Path "$audio\zombies.zip" -DestinationPath "$audio\zombies_tmp" -Force
    Write-Output "EXTRACT zombies.zip:"
    Get-ChildItem -Recurse "$audio\zombies_tmp" -File | ForEach-Object { Write-Output ("  {0,9:N0}  {1}" -f $_.Length, $_.FullName.Replace("$audio\zombies_tmp\", '')) }
} catch { Write-Output "FAIL extract zombies.zip: $($_.Exception.Message)" }
try {
    Expand-Archive -Path "$audio\gunsounds.zip" -DestinationPath "$audio\guns_tmp" -Force
    Write-Output "EXTRACT gunsounds.zip:"
    Get-ChildItem -Recurse "$audio\guns_tmp" -File | ForEach-Object { Write-Output ("  {0,9:N0}  {1}" -f $_.Length, $_.FullName.Replace("$audio\guns_tmp\", '')) }
} catch { Write-Output "FAIL extract gunsounds.zip: $($_.Exception.Message)" }

Write-Output "`n=== RIEPILOGO ==="
Write-Output "Falliti: $($fails.Count)"
$fails | ForEach-Object { Write-Output "  $_" }
