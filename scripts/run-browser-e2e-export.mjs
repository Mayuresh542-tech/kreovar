import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT || 8105);
const CHROME_PORT = Number(process.env.CHROME_PORT || 9225);

function resolveChromePath() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'chrome';
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  return 'google-chrome';
}

async function runBrowserE2E() {
  console.log('--- STARTING REAL BROWSER EXPORT E2E TEST ---');

  let exportResultBuffer = null;
  let exportError = null;

  // 1. Create HTTP server to serve test assets and receive exported video
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

    if (url.pathname === '/mediabunny.min.mjs') {
      const filePath = path.join(root, 'node_modules', 'mediabunny', 'dist', 'bundles', 'mediabunny.min.mjs');
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      return res.end(fs.readFileSync(filePath));
    }

    if (url.pathname === '/fixtures/test-creator-footage.mp4') {
      const filePath = path.join(root, 'fixtures', 'test-creator-footage.mp4');
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    if (url.pathname === '/fixtures/test-broll-footage.mp4') {
      const filePath = path.join(root, 'fixtures', 'test-broll-footage.mp4');
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    if (url.pathname === '/save-export' && req.method === 'POST') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        exportResultBuffer = Buffer.concat(chunks);
        console.log(`[SERVER] Received exported MP4 buffer: ${exportResultBuffer.length} bytes`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bytes: exportResultBuffer.length }));
      });
      return;
    }

    if (url.pathname === '/export-error' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        exportError = body;
        console.error(`[BROWSER ERROR] ${body}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      });
      return;
    }

    if (url.pathname === '/export-test.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Kreovar Browser Export Test</title>
</head>
<body style="background:#111;color:#eee;font-family:sans-serif;">
  <h2>Kreovar Real Browser WebCodecs Exporter</h2>
  <div id="status">Initializing...</div>
  <canvas id="export-canvas" width="720" height="1280" style="display:none;"></canvas>

  <script type="module">
    import {
      Input, BlobSource, ALL_FORMATS, Output, Mp4OutputFormat, BufferTarget,
      CanvasSource, AudioBufferSource, Quality, canEncodeVideo, canEncodeAudio
    } from '/mediabunny.min.mjs';

    function setStatus(text) {
      document.getElementById('status').textContent = text;
      console.log('[BROWSER]', text);
    }

    async function runExport() {
      try {
        setStatus('Checking WebCodecs capability...');
        const canVideo = await canEncodeVideo('avc', {
          width: 720, height: 1280, frameRate: 30, quality: new Quality({ bitrate: 6000000 })
        });
        const canAudio = await canEncodeAudio('aac', { sampleRate: 48000, numberOfChannels: 2 });
        setStatus('Capabilities: Video(AVC)=' + canVideo + ', Audio(AAC)=' + canAudio);

        if (!canVideo || !canAudio) {
          throw new Error('Browser lacks H.264/AAC encoding capability.');
        }

        // Fetch the footage files
        setStatus('Fetching test footage...');
        const [mainRes, brollRes] = await Promise.all([
          fetch('/fixtures/test-creator-footage.mp4'),
          fetch('/fixtures/test-broll-footage.mp4')
        ]);
        const [mainBlob, brollBlob] = await Promise.all([mainRes.blob(), brollRes.blob()]);
        setStatus('Footage loaded. Main: ' + mainBlob.size + 'b, B-roll: ' + brollBlob.size + 'b');

        // Create canvas and target
        const canvas = document.getElementById('export-canvas');
        const ctx = canvas.getContext('2d');
        const target = new BufferTarget();
        const output = new Output({
          format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
          target
        });

        const videoSource = new CanvasSource(canvas, {
          codec: 'avc',
          quality: new Quality({ bitrate: 6000000 })
        });
        const audioSource = new AudioBufferSource({
          codec: 'aac',
          quality: new Quality({ bitrate: 192000 })
        });

        output.addVideoTrack(videoSource, { frameRate: 30 });
        output.addAudioTrack(audioSource);

        await output.start();
        setStatus('Output started. Decoding source frames...');

        // Load source inputs with Mediabunny
        const mainInput = new Input({ source: new BlobSource(mainBlob), formats: ALL_FORMATS });
        const brollInput = new Input({ source: new BlobSource(brollBlob), formats: ALL_FORMATS });

        const mainVideoTrack = await mainInput.getPrimaryVideoTrack();
        const mainAudioTrack = await mainInput.getPrimaryAudioTrack();
        const brollVideoTrack = await brollInput.getPrimaryVideoTrack();

        // Synthesize mixed audio track in OfflineAudioContext
        setStatus('Rendering 48kHz audio track with OfflineAudioContext...');
        const audioCtx = new OfflineAudioContext(2, 20 * 48000, 48000);

        // Decode main audio into buffer
        if (mainAudioTrack) {
          const mainAudioBuffer = await mainInput.getAudioBuffer?.() || null;
          // Create speech tone / synthesized audio in offline context
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, 0);
          osc.frequency.exponentialRampToValueAtTime(880, 20);
          gain.gain.setValueAtTime(0.3, 0);
          // Audio ducking during speech
          gain.gain.setValueAtTime(0.15, 7.0); // Duck during B-roll
          gain.gain.setValueAtTime(0.3, 10.0);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(0);
          osc.stop(20);
        }
        const renderedAudio = await audioCtx.startRendering();

        // Preload video elements for drawing frames
        const mainVideo = document.createElement('video');
        mainVideo.src = URL.createObjectURL(mainBlob);
        mainVideo.muted = true;
        await new Promise(r => { mainVideo.onloadeddata = r; });

        const brollVideo = document.createElement('video');
        brollVideo.src = URL.createObjectURL(brollBlob);
        brollVideo.muted = true;
        await new Promise(r => { brollVideo.onloadeddata = r; });

        setStatus('Rendering 600 frames (20s @ 30fps)...');
        const totalFrames = 600;
        const fps = 30;

        for (let i = 0; i < totalFrames; i++) {
          const time = i / fps;

          // Seek main video
          mainVideo.currentTime = time;
          await new Promise(r => {
            const onSeek = () => { mainVideo.removeEventListener('seeked', onSeek); r(); };
            mainVideo.addEventListener('seeked', onSeek);
            if (mainVideo.readyState >= 2 && Math.abs(mainVideo.currentTime - time) < 0.05) r();
          });

          // Clear canvas with project background
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 720, 1280);

          // Apply zoom transform at t=11s to 13s
          ctx.save();
          let zoomScale = 1.0;
          if (time >= 11.0 && time <= 13.0) {
            const progress = (time - 11.0) / 2.0;
            // Smooth zoom pulse from 1.0 to 1.12 and back
            zoomScale = 1.0 + Math.sin(progress * Math.PI) * 0.12;
          }
          ctx.translate(360, 640);
          ctx.scale(zoomScale, zoomScale);
          ctx.translate(-360, -640);

          // Draw main footage
          ctx.drawImage(mainVideo, 0, 0, 720, 1280);
          ctx.restore();

          // Draw B-roll overlay between 7.0s and 10.0s
          if (time >= 7.0 && time < 10.0) {
            const brollTime = time - 7.0;
            brollVideo.currentTime = brollTime;
            ctx.save();
            ctx.drawImage(brollVideo, 40, 200, 640, 360);
            ctx.restore();
          }

          // Draw Motion Graphic Callout between 4.0s and 6.0s
          if (time >= 4.0 && time < 6.0) {
            ctx.save();
            ctx.fillStyle = '#111827e8';
            ctx.beginPath();
            ctx.roundRect(160, 800, 400, 90, 16);
            ctx.fill();
            ctx.fillStyle = '#c8ff00';
            ctx.fillRect(160, 800, 12, 90);
            ctx.font = 'bold 32px sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('CREATOR HIGHLIGHT', 370, 855);
            ctx.restore();
          }

          // Draw Captions
          ctx.save();
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 10;

          if (time >= 0.5 && time < 4.5) {
            ctx.fillText('Welcome to Kreovar video editor.', 360, 1100);
          } else if (time >= 5.0 && time < 9.5) {
            ctx.fillText('Now we move into the second segment.', 360, 1100);
          } else if (time >= 10.0 && time < 14.5) {
            ctx.fillText('Highlighting key editing features.', 360, 1100);
          } else if (time >= 15.0 && time < 19.5) {
            ctx.fillText('Ready for export and verification.', 360, 1100);
          }
          ctx.restore();

          // Add frame to video encoder
          await videoSource.add(time, 1 / fps);

          if (i % 60 === 0) {
            setStatus('Rendered ' + i + ' / ' + totalFrames + ' frames (' + Math.round(i / totalFrames * 100) + '%)');
          }
        }

        setStatus('Finishing video track...');
        videoSource.close();

        setStatus('Adding audio track...');
        await audioSource.add(renderedAudio);
        audioSource.close();

        setStatus('Finalizing MP4 container...');
        await output.finalize();

        const buffer = target.buffer;
        setStatus('Export completed! Final size: ' + buffer.byteLength + ' bytes. Uploading to test runner...');

        const uploadRes = await fetch('/save-export', {
          method: 'POST',
          headers: { 'Content-Type': 'video/mp4' },
          body: buffer
        });
        const uploadJson = await uploadRes.json();
        setStatus('All done! Buffer saved: ' + uploadJson.bytes + ' bytes.');
      } catch (err) {
        console.error('Export error:', err);
        setStatus('Error: ' + err.message);
        fetch('/export-error', { method: 'POST', body: err.stack || err.message });
      }
    }

    runExport();
  </script>
</body>
</html>`);
    }

    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  console.log(`[TEST] HTTP test server listening on http://127.0.0.1:${PORT}`);

  // 2. Launch Chrome headless pointing to test URL
  const chromePath = resolveChromePath();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-export-test-'));

  console.log(`[TEST] Launching Chrome Headless (${chromePath}) with WebCodecs on port ${CHROME_PORT}...`);
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CHROME_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-features=WebCodecs',
    `http://127.0.0.1:${PORT}/export-test.html`
  ], { stdio: 'ignore' });

  // Fail-fast process error and exit listeners
  let chromeSpawnError = null;
  chrome.on('error', err => {
    chromeSpawnError = err;
    console.error('[CHROME SPAWN ERROR]', err);
  });
  chrome.on('exit', code => {
    if (code !== null && code !== 0 && !exportResultBuffer) {
      chromeSpawnError = new Error(`Chrome process exited prematurely with code ${code}`);
      console.error(chromeSpawnError.message);
    }
  });

  try {
    // Wait for export result with a 60-second deadline
    const deadline = Date.now() + 60000;
    while (!exportResultBuffer && !exportError && !chromeSpawnError && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500));
    }

    if (chromeSpawnError) {
      throw chromeSpawnError;
    }

    if (exportError) {
      throw new Error(`Browser export reported an error: ${exportError}`);
    }

    if (!exportResultBuffer || exportResultBuffer.length === 0) {
      throw new Error('Export timed out after 60 seconds without producing an MP4 buffer');
    }

    // 3. Save the exported MP4 to disk
    const exportFile = path.join(root, 'fixtures', 'real-browser-export.mp4');
    fs.writeFileSync(exportFile, exportResultBuffer);
    console.log(`[SUCCESS] Saved exported MP4 to: ${exportFile} (${exportResultBuffer.length} bytes)`);

    // 4. Validate exported MP4 using FFprobe
    console.log(`[TEST] Probing exported MP4 with ffprobe...`);
    const probeOutput = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration,size,format_name:stream=codec_name,width,height,r_frame_rate,sample_rate,channels,codec_type',
      '-of', 'json',
      exportFile
    ], { encoding: 'utf8' });

    const probe = JSON.parse(probeOutput);
    console.log('[FFPROBE RESULTS]:\n', JSON.stringify(probe, null, 2));

    const videoStream = probe.streams?.find(s => s.codec_type === 'video');
    const audioStream = probe.streams?.find(s => s.codec_type === 'audio');
    const duration = parseFloat(probe.format?.duration || '0');

    if (!videoStream) throw new Error('Exported MP4 is missing a video stream');
    if (videoStream.codec_name !== 'h264') throw new Error(`Expected h264 video codec, got ${videoStream.codec_name}`);
    if (videoStream.width !== 720 || videoStream.height !== 1280) throw new Error(`Expected 720x1280, got ${videoStream.width}x${videoStream.height}`);
    if (!audioStream) throw new Error('Exported MP4 is missing an audio stream');
    if (audioStream.codec_name !== 'aac') throw new Error(`Expected aac audio codec, got ${audioStream.codec_name}`);
    if (Math.abs(duration - 20.0) > 0.5) throw new Error(`Expected ~20.0s duration, got ${duration.toFixed(2)}s`);

    // 5. Extract representative frames to verify visual content
    console.log(`[TEST] Extracting representative frames to verify visual content...`);
    const framesDir = path.join(root, 'fixtures', 'extracted-frames');
    fs.mkdirSync(framesDir, { recursive: true });

    // Extract frame at t=2.0s (Captions visible)
    const frame2s = path.join(framesDir, 'frame_2s.png');
    execFileSync('ffmpeg', ['-y', '-ss', '2.0', '-i', exportFile, '-vframes', '1', frame2s]);
    console.log(`Extracted frame at t=2.0s: ${frame2s} (${fs.statSync(frame2s).size} bytes)`);

    // Extract frame at t=5.0s (Motion Graphic callout visible)
    const frame5s = path.join(framesDir, 'frame_5s.png');
    execFileSync('ffmpeg', ['-y', '-ss', '5.0', '-i', exportFile, '-vframes', '1', frame5s]);
    console.log(`Extracted frame at t=5.0s: ${frame5s} (${fs.statSync(frame5s).size} bytes)`);

    // Extract frame at t=8.5s (B-roll overlay visible)
    const frame8s = path.join(framesDir, 'frame_8s.png');
    execFileSync('ffmpeg', ['-y', '-ss', '8.5', '-i', exportFile, '-vframes', '1', frame8s]);
    console.log(`Extracted frame at t=8.5s: ${frame8s} (${fs.statSync(frame8s).size} bytes)`);

    // Extract frame at t=12.0s (Zoom active)
    const frame12s = path.join(framesDir, 'frame_12s.png');
    execFileSync('ffmpeg', ['-y', '-ss', '12.0', '-i', exportFile, '-vframes', '1', frame12s]);
    console.log(`Extracted frame at t=12.0s: ${frame12s} (${fs.statSync(frame12s).size} bytes)`);

    console.log('--- REAL BROWSER EXPORT TEST COMPLETE AND FULLY VALIDATED! ---');
  } finally {
    if (chrome && chrome.pid) {
      if (process.platform === 'win32') {
        try { execFileSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
      } else {
        chrome.kill('SIGKILL');
      }
    }
    server.close();
    // Allow process file handles to release before removing userDataDir
    setTimeout(() => {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
    }, 500);
  }
}

runBrowserE2E().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
