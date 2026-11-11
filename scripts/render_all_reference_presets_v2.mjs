import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  generateAssPodcastProV2,
  generateAssViralCreatorV2,
  generateAssDocumentaryV2,
  generateAssMinimalCreatorV2,
  generateAssHighEnergyV2,
  generateAssMotivationalV2,
  generateAssEducationalV2,
  LOCAL_OUTPUT_DIR,
  DOWNLOADS_OUTPUT_DIR
} from '../scratch/render_engine_v2.mjs';

function readTranscript(filename) {
  const jsonPath = path.join('scratch', filename);
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

function verifyVideo(outputPath) {
  if (!fs.existsSync(outputPath)) throw new Error(`Output file not created: ${outputPath}`);
  const stats = fs.statSync(outputPath);
  if (stats.size < 500000) throw new Error(`Output file too small (${stats.size} bytes): ${outputPath}`);
  
  const probe = JSON.parse(execSync(`ffprobe -v error -show_entries format=duration,size:stream=codec_type,width,height -of json "${outputPath}"`, { encoding: 'utf8' }));
  const videoStream = probe.streams.find(s => s.codec_type === 'video');
  const audioStream = probe.streams.find(s => s.codec_type === 'audio');
  
  if (!videoStream || !audioStream) throw new Error(`Missing audio or video stream in ${outputPath}`);
  console.log(`[VERIFIED V2] ${path.basename(outputPath)}: ${(stats.size / 1024 / 1024).toFixed(2)} MB, ${probe.format.duration}s, ${videoStream.width}x${videoStream.height}`);
}

async function renderPreset1() {
  console.log('\n======================================================');
  console.log('RENDERING PRESET 1: PODCAST PRO (Caption Studio V2)');
  console.log('======================================================');
  
  const transcript = readTranscript('1_podcast_pro.json');
  const assContent = generateAssPodcastProV2(transcript.words);
  const assPath = 'scratch/subtitles_v2_1.ass';
  fs.writeFileSync(assPath, assContent, 'utf8');

  const outLocal = path.join(LOCAL_OUTPUT_DIR, '1_Podcast_Pro_Reference.mp4');
  const outDownloads = path.join(DOWNLOADS_OUTPUT_DIR, '1_Podcast_Pro_Reference.mp4');

  const filterComplex = [
    // Dynamic Punch-in and Zoom-out sequence
    `[0:v]zoompan=z='if(between(it,1.8,4.5),1.22,if(between(it,4.5,6.5),1.28,if(between(it,9.5,13.0),1.25,1.0)))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=24[v0]`,
    // B-roll
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuva420p,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=2.2:d=0.3:alpha=1,setpts=PTS-STARTPTS+6.5/TB[broll]`,
    `[v0][broll]overlay=enable='between(t,6.5,9.0)'[v1]`,
    `[v1]ass=${assPath}[vout]`,
    // Audio SFX
    `[2:a]volume=0.18,adelay=1800|1800[sfx1]`,
    `[3:a]volume=0.20,adelay=9500|9500[sfx2]`,
    `[0:a][sfx1][sfx2]amix=inputs=3:duration=first[aout]`
  ].join(';');

  const cmd = `ffmpeg -i "scratch/input/1_podcast_pro.mp4" -i "scratch/broll/broll_1_podcast.mp4" -i "public/sfx/soft-whoosh.wav" -i "public/sfx/soft-click.wav" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -t 15.04 -y "${outLocal}"`;
  
  console.log('Rendering...');
  execSync(cmd, { stdio: 'inherit' });
  verifyVideo(outLocal);
  fs.copyFileSync(outLocal, outDownloads);
  console.log(`Updated copy in Downloads: ${outDownloads}`);
}

async function renderPreset2() {
  console.log('\n======================================================');
  console.log('RENDERING PRESET 2: VIRAL CREATOR (Caption Studio V2)');
  console.log('======================================================');
  
  const transcript = readTranscript('2_viral_creator.json');
  const assContent = generateAssViralCreatorV2(transcript.words);
  const assPath = 'scratch/subtitles_v2_2.ass';
  fs.writeFileSync(assPath, assContent, 'utf8');

  const outLocal = path.join(LOCAL_OUTPUT_DIR, '2_Viral_Creator_Reference.mp4');
  const outDownloads = path.join(DOWNLOADS_OUTPUT_DIR, '2_Viral_Creator_Reference.mp4');

  const filterComplex = [
    // Dynamic rapid punch-ins and pull-outs
    `[0:v]zoompan=z='if(between(it,1.6,3.0),1.30,if(between(it,3.0,4.5),1.35,if(between(it,4.5,6.0),1.0,if(between(it,8.8,11.5),1.24,if(between(it,12.5,15.04),1.32,1.0)))))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=24[v0]`,
    // B-roll
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuva420p,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.55:d=0.25:alpha=1,setpts=PTS-STARTPTS+6.0/TB[broll]`,
    `[v0][broll]overlay=enable='between(t,6.0,8.8)'[v1]`,
    `[v1]ass=${assPath}[vout]`,
    // Sound FX
    `[2:a]volume=0.24,adelay=1600|1600[sfx1]`,
    `[3:a]volume=0.24,adelay=3000|3000[sfx2]`,
    `[4:a]volume=0.22,adelay=12500|12500[sfx3]`,
    `[0:a][sfx1][sfx2][sfx3]amix=inputs=4:duration=first[aout]`
  ].join(';');

  const cmd = `ffmpeg -i "scratch/input/2_viral_creator.mp4" -i "scratch/broll/broll_2_viral.mp4" -i "public/sfx/fast-swish.wav" -i "public/sfx/digital-pop.wav" -i "public/sfx/success-chime.wav" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -t 15.04 -y "${outLocal}"`;
  
  console.log('Rendering...');
  execSync(cmd, { stdio: 'inherit' });
  verifyVideo(outLocal);
  fs.copyFileSync(outLocal, outDownloads);
  console.log(`Updated copy in Downloads: ${outDownloads}`);
}

async function renderPreset3() {
  console.log('\n======================================================');
  console.log('RENDERING PRESET 3: DOCUMENTARY (Caption Studio V2)');
  console.log('======================================================');
  
  const transcript = readTranscript('3_documentary.json');
  const assContent = generateAssDocumentaryV2(transcript.words);
  const assPath = 'scratch/subtitles_v2_3.ass';
  fs.writeFileSync(assPath, assContent, 'utf8');

  const outLocal = path.join(LOCAL_OUTPUT_DIR, '3_Documentary_Reference.mp4');
  const outDownloads = path.join(DOWNLOADS_OUTPUT_DIR, '3_Documentary_Reference.mp4');

  const filterComplex = [
    // Smooth cinematic push-in -> zoom out -> push in
    `[0:v]zoompan=z='if(between(it,0.0,5.5),1.0+0.18*it/5.5,if(between(it,12.0,15.04),1.0+0.16*(it-12.0)/3.04,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=24,eq=contrast=1.08:brightness=0.01:saturation=1.12[v0]`,
    // Cinematic B-roll
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,eq=contrast=1.08:brightness=0.01:saturation=1.12,format=yuva420p,fade=t=in:st=0:d=0.6:alpha=1,fade=t=out:st=4.4:d=0.6:alpha=1,setpts=PTS-STARTPTS+5.5/TB[broll]`,
    `[v0][broll]overlay=enable='between(t,5.5,10.5)'[v1]`,
    `[v1]ass=${assPath}[vout]`,
    `[2:a]volume=0.14,adelay=300|300[sfx1]`,
    `[0:a][sfx1]amix=inputs=2:duration=first[aout]`
  ].join(';');

  const cmd = `ffmpeg -i "scratch/input/3_documentary.mp4" -i "scratch/broll/broll_3_doc.mp4" -i "public/sfx/cinematic-rise.wav" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -t 15.04 -y "${outLocal}"`;
  
  console.log('Rendering...');
  execSync(cmd, { stdio: 'inherit' });
  verifyVideo(outLocal);
  fs.copyFileSync(outLocal, outDownloads);
  console.log(`Updated copy in Downloads: ${outDownloads}`);
}

async function renderPreset4() {
  console.log('\n======================================================');
  console.log('RENDERING PRESET 4: MINIMAL CREATOR (Caption Studio V2)');
  console.log('======================================================');
  
  const transcript = readTranscript('4_minimal_creator.json');
  const assContent = generateAssMinimalCreatorV2(transcript.words);
  const assPath = 'scratch/subtitles_v2_4.ass';
  fs.writeFileSync(assPath, assContent, 'utf8');

  const outLocal = path.join(LOCAL_OUTPUT_DIR, '4_Minimal_Creator_Reference.mp4');
  const outDownloads = path.join(DOWNLOADS_OUTPUT_DIR, '4_Minimal_Creator_Reference.mp4');

  const filterComplex = [
    // Clean punch-in -> pull-out -> punch-in
    `[0:v]zoompan=z='if(between(it,2.5,6.2),1.24,if(between(it,11.2,15.04),1.22,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=24[v0]`,
    // Minimalist B-roll
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuva420p,fade=t=in:st=0:d=0.25:alpha=1,fade=t=out:st=2.45:d=0.25:alpha=1,setpts=PTS-STARTPTS+6.2/TB[broll]`,
    `[v0][broll]overlay=enable='between(t,6.2,8.9)'[v1]`,
    `[v1]ass=${assPath}[vout]`,
    `[2:a]volume=0.18,adelay=2500|2500[sfx1]`,
    `[0:a][sfx1]amix=inputs=2:duration=first[aout]`
  ].join(';');

  const cmd = `ffmpeg -i "scratch/input/4_minimal_creator.mp4" -i "scratch/broll/broll_4_minimal.mp4" -i "public/sfx/soft-click.wav" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -t 15.04 -y "${outLocal}"`;
  
  console.log('Rendering...');
  execSync(cmd, { stdio: 'inherit' });
  verifyVideo(outLocal);
  fs.copyFileSync(outLocal, outDownloads);
  console.log(`Updated copy in Downloads: ${outDownloads}`);
}

async function renderPreset5() {
  console.log('\n======================================================');
  console.log('RENDERING PRESET 5: HIGH ENERGY (Caption Studio V2)');
  console.log('======================================================');
  
  const transcript = readTranscript('5_high_energy.json');
  const assContent = generateAssHighEnergyV2(transcript.words);
  const assPath = 'scratch/subtitles_v2_5.ass';
  fs.writeFileSync(assPath, assContent, 'utf8');

  const outLocal = path.join(LOCAL_OUTPUT_DIR, '5_High_Energy_Reference.mp4');
  const outDownloads = path.join(DOWNLOADS_OUTPUT_DIR, '5_High_Energy_Reference.mp4');

  const filterComplex = [
    // Sports rapid snap zoom sequence
    `[0:v]zoompan=z='if(between(it,0.0,2.2),1.30,if(between(it,2.2,4.5),1.0,if(between(it,4.5,7.5),1.34,if(between(it,10.5,12.0),1.02,if(between(it,12.0,15.04),1.32,1.0)))))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=24,eq=contrast=1.06:saturation=1.12[v0]`,
    // Sports dunk B-roll
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuva420p,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=2.8:d=0.2:alpha=1,setpts=PTS-STARTPTS+7.5/TB[broll]`,
    `[v0][broll]overlay=enable='between(t,7.5,10.5)'[v1]`,
    `[v1]ass=${assPath}[vout]`,
    // Audio impacts & swishes
    `[2:a]volume=0.24,adelay=100|100[sfx1]`,
    `[3:a]volume=0.22,adelay=4500|4500[sfx2]`,
    `[4:a]volume=0.26,adelay=7500|7500[sfx3]`,
    `[0:a][sfx1][sfx2][sfx3]amix=inputs=4:duration=first[aout]`
  ].join(';');

  const cmd = `ffmpeg -i "scratch/input/5_high_energy.mp4" -i "scratch/broll/broll_5_sports.mp4" -i "public/sfx/low-impact.wav" -i "public/sfx/fast-swish.wav" -i "public/sfx/sub-drop.wav" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -t 15.04 -y "${outLocal}"`;
  
  console.log('Rendering...');
  execSync(cmd, { stdio: 'inherit' });
  verifyVideo(outLocal);
  fs.copyFileSync(outLocal, outDownloads);
  console.log(`Updated copy in Downloads: ${outDownloads}`);
}

async function renderPreset6() {
  console.log('\n======================================================');
  console.log('RENDERING PRESET 6: MOTIVATIONAL (Caption Studio V2)');
  console.log('======================================================');
  
  const transcript = readTranscript('6_motivational.json');
  const assContent = generateAssMotivationalV2(transcript.words);
  const assPath = 'scratch/subtitles_v2_6.ass';
  fs.writeFileSync(assPath, assContent, 'utf8');

  const outLocal = path.join(LOCAL_OUTPUT_DIR, '6_Motivational_Reference.mp4');
  const outDownloads = path.join(DOWNLOADS_OUTPUT_DIR, '6_Motivational_Reference.mp4');

  const filterComplex = [
    // Motivational punch -> zoom out -> emotional crescendo punch
    `[0:v]zoompan=z='if(between(it,0.0,3.2),1.28,if(between(it,3.2,5.5),1.02,if(between(it,11.5,15.04),1.30,1.0)))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=24,eq=contrast=1.06:saturation=1.10[v0]`,
    // Motivational track B-roll
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuva420p,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=3.6:d=0.4:alpha=1,setpts=PTS-STARTPTS+5.5/TB[broll]`,
    `[v0][broll]overlay=enable='between(t,5.5,9.5)'[v1]`,
    `[v1]ass=${assPath}[vout]`,
    // Sub-drop and swell
    `[2:a]volume=0.24,adelay=100|100[sfx1]`,
    `[3:a]volume=0.20,adelay=5500|5500[sfx2]`,
    `[0:a][sfx1][sfx2]amix=inputs=3:duration=first[aout]`
  ].join(';');

  const cmd = `ffmpeg -i "scratch/input/6_motivational.mp4" -i "scratch/broll/broll_6_motivational.mp4" -i "public/sfx/sub-drop.wav" -i "public/sfx/cinematic-rise.wav" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -t 15.04 -y "${outLocal}"`;
  
  console.log('Rendering...');
  execSync(cmd, { stdio: 'inherit' });
  verifyVideo(outLocal);
  fs.copyFileSync(outLocal, outDownloads);
  console.log(`Updated copy in Downloads: ${outDownloads}`);
}

async function renderPreset7() {
  console.log('\n======================================================');
  console.log('RENDERING PRESET 7: EDUCATIONAL EXPLAINER (Caption Studio V2)');
  console.log('======================================================');
  
  const transcript = readTranscript('7_educational_explainer.json');
  const assContent = generateAssEducationalV2(transcript.words);
  const assPath = 'scratch/subtitles_v2_7.ass';
  fs.writeFileSync(assPath, assContent, 'utf8');

  const outLocal = path.join(LOCAL_OUTPUT_DIR, '7_Educational_Explainer_Reference.mp4');
  const outDownloads = path.join(DOWNLOADS_OUTPUT_DIR, '7_Educational_Explainer_Reference.mp4');

  const filterComplex = [
    // Dynamic punch-in -> pull-out -> punch-in
    `[0:v]zoompan=z='if(between(it,2.5,4.2),1.25,if(between(it,11.2,15.04),1.26,1.02))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=720x1280:fps=24[v0]`,
    // Solar cells B-roll
    `[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,format=yuva420p,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=4.3:d=0.3:alpha=1,setpts=PTS-STARTPTS+4.2/TB[broll]`,
    `[v0][broll]overlay=enable='between(t,4.2,8.8)'[v1]`,
    `[v1]ass=${assPath}[vout]`,
    // Sound design
    `[2:a]volume=0.18,adelay=100|100[sfx1]`,
    `[3:a]volume=0.20,adelay=4200|4200[sfx2]`,
    `[4:a]volume=0.18,adelay=9000|9000[sfx3]`,
    `[0:a][sfx1][sfx2][sfx3]amix=inputs=4:duration=first[aout]`
  ].join(';');

  const cmd = `ffmpeg -i "scratch/input/7_educational_explainer.mp4" -i "scratch/broll/broll_7_solar.mp4" -i "public/sfx/notification.wav" -i "public/sfx/sparkle.wav" -i "public/sfx/soft-click.wav" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf 19 -c:a aac -b:a 192k -t 15.04 -y "${outLocal}"`;
  
  console.log('Rendering...');
  execSync(cmd, { stdio: 'inherit' });
  verifyVideo(outLocal);
  fs.copyFileSync(outLocal, outDownloads);
  console.log(`Updated copy in Downloads: ${outDownloads}`);
}

async function main() {
  try {
    await renderPreset1();
    await renderPreset2();
    await renderPreset3();
    await renderPreset4();
    await renderPreset5();
    await renderPreset6();
    await renderPreset7();
    console.log('\n======================================================');
    console.log('ALL 7 UPGRADED V2 PRESETS RENDERED & VERIFIED!');
    console.log('======================================================');
  } catch (err) {
    console.error('Render failed:', err);
    process.exit(1);
  }
}

main();
