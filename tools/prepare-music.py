"""Reproducible audio-only exports. Source URLs and CC0 declarations in manifest."""
from pathlib import Path
import subprocess,json,hashlib
import imageio_ffmpeg

dest=Path('frontend/public/assets'); (dest/'music').mkdir(exist_ok=True)
tracks=[
 ('reading','whispers.ogg','Whispers in the Fog','https://opengameart.org/content/whispers-in-the-fog','https://opengameart.org/sites/default/files/whispers_in_the_fog.ogg'),
 ('investigation','ancient.mp3','Ancient Mysteries','https://opengameart.org/content/ancient-mysteries','https://opengameart.org/sites/default/files/ancient_mysteries.mp3'),
 ('vote','mystery.mp3','CC0 - Mystery','https://opengameart.org/content/cc0-mystery','https://opengameart.org/sites/default/files/mystery%20exploration.mp3')]
assets=json.loads((dest/'manifest.images.json').read_text(encoding='utf-8'))
for key,src,title,page,url in tracks:
 out=dest/'music'/f'{key}.mp3'
 # 47 sec -> 45 sec periodic signal: crossfade last 2 sec into first 2 sec.
 filt='[0:a]atrim=0:47,asetpts=PTS-STARTPTS,asplit=3[a][b][c];[a]atrim=2:45,asetpts=PTS-STARTPTS[mid];[b]atrim=45:47,asetpts=PTS-STARTPTS[tail];[c]atrim=0:2,asetpts=PTS-STARTPTS[head];[tail][head]acrossfade=d=2:c1=tri:c2=tri[seam];[mid][seam]concat=n=2:v=0:a=1,loudnorm=I=-23:TP=-3:LRA=7[out]'
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-y','-stream_loop','-1','-i',str(Path('.tools')/src),'-filter_complex',filt,'-map','[out]','-t','45','-c:a','libmp3lame','-b:a','64k','-ar','44100',str(out)],check=True)
 assets.append(dict(id=key,path=f'/assets/music/{key}.mp3',phase={'reading':[0,1,5],'investigation':[2,3],'vote':[4]}[key],title=title,source=page,download=url,license='CC0-1.0',licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/',retrieved='2026-11-26',durationSeconds=45,bytes=out.stat().st_size,sha256=hashlib.sha256(out.read_bytes()).hexdigest(),modifications='45-second seamless crossfade loop; loudness normalization; 64kbps MP3'))
 assert out.stat().st_size<500000
(dest/'manifest.json').write_text(json.dumps(assets,ensure_ascii=False,indent=2),encoding='utf-8')
print('3 CC0 loops exported, each <500KB')
