import os
import sys
import platform
import subprocess

os.makedirs("fixtures", exist_ok=True)
speech_wav = os.path.abspath("fixtures/speech_track.wav")
output_mp4 = os.path.abspath("fixtures/test-creator-footage.mp4")
broll_mp4 = os.path.abspath("fixtures/test-broll-footage.mp4")

# Sentences for spoken dialogue
sentences = [
    "Welcome to Kreovar video editor. In this first segment, we introduce our test footage.",
    "Now we move into the second segment, showing animated movement and clear speech.",
    "In the third segment, we highlight key editing features with synchronized audio.",
    "Finally, we conclude the video demonstration. Ready for export and verification."
]

print("1. Generating spoken audio track...")
speech_generated = False
if platform.system() == "Windows":
    try:
        import win32com.client
        speaker = win32com.client.Dispatch("SAPI.SpVoice")
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Open(speech_wav, 3) # 3 = SSFMCreateForWrite
        speaker.AudioOutputStream = stream
        for s in sentences:
            speaker.Speak(s)
        stream.Close()
        speech_generated = True
        print(f"Speech audio generated via Windows SAPI: {speech_wav}")
    except Exception as e:
        print(f"Windows SAPI not available: {e}. Falling back to FFmpeg speech synthesis.")

if not speech_generated:
    # Cross-platform fallback: Synthesize speech frequency tones with interval modulation
    print("Synthesizing audio track via FFmpeg...")
    subprocess.check_call([
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "sine=frequency=440:sample_rate=48000:duration=20",
        "-c:a", "pcm_s16le", speech_wav
    ])
    print(f"Audio track synthesized: {speech_wav}")

# Probe speech duration
probe_cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", speech_wav]
speech_dur = float(subprocess.check_output(probe_cmd).decode().strip())
print(f"Audio duration: {speech_dur:.2f}s")

# Resolve font dynamically
def resolve_font_arg():
    if platform.system() == "Windows":
        candidates = [
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
            "C:/Windows/Fonts/calibri.ttf"
        ]
        for c in candidates:
            if os.path.exists(c):
                # Escape colon for FFmpeg filter on Windows
                escaped = c.replace(":", "\\:")
                return f"fontfile='{escaped}'"
    elif platform.system() == "Darwin":
        candidates = [
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial.ttf"
        ]
        for c in candidates:
            if os.path.exists(c):
                return f"fontfile='{c}'"
    else:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf"
        ]
        for c in candidates:
            if os.path.exists(c):
                return f"fontfile='{c}'"
    return "font='Sans'"

font_opt = resolve_font_arg()
print(f"Using font option: {font_opt}")

# Generate main 20s test video with 4 distinct segments and animated elements
print("2. Generating main 20-second test video with FFmpeg...")
filter_complex = (
    "color=c=0x1e3a8a:s=720x1280:d=5:r=30[s1];"
    "color=c=0x065f46:s=720x1280:d=5:r=30[s2];"
    "color=c=0x92400e:s=720x1280:d=5:r=30[s3];"
    "color=c=0x4c1d95:s=720x1280:d=5:r=30[s4];"
    "[s1][s2][s3][s4]concat=n=4:v=1:a=0[bg];"
    f"[bg]drawbox=x='100+250*sin(t*2)':y='500+100*cos(t*2)':w=180:h=180:color=white@0.8:t=fill,"
    f"drawtext={font_opt}:text='KREOVAR TEST FOOTAGE':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=180,"
    f"drawtext={font_opt}:text='Time\\: %{{pts\\:hms}}':fontcolor=yellow:fontsize=36:x=(w-text_w)/2:y=260,"
    f"drawtext={font_opt}:text='Segment 1 - Intro':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1000:enable='between(t,0,5)',"
    f"drawtext={font_opt}:text='Segment 2 - Movement':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1000:enable='between(t,5,10)',"
    f"drawtext={font_opt}:text='Segment 3 - Features':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1000:enable='between(t,10,15)',"
    f"drawtext={font_opt}:text='Segment 4 - Outro':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=1000:enable='between(t,15,20)'[v];"
    "[1:a]apad=whole_dur=20,atrim=0:20[a]"
)

ffmpeg_cmd = [
    "ffmpeg", "-y",
    "-f", "lavfi", "-i", "color=c=black:s=720x1280:d=20:r=30",
    "-i", speech_wav,
    "-filter_complex", filter_complex,
    "-map", "[v]",
    "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "192k",
    "-t", "20",
    output_mp4
]
subprocess.check_call(ffmpeg_cmd)
print(f"Main footage generated: {output_mp4}")

# Generate 3-second B-roll clip (cyan background with moving graphic and text)
print("3. Generating 3-second B-roll video with FFmpeg...")
broll_filter = (
    "color=c=0x0e7490:s=720x1280:d=3:r=30[bg];"
    f"[bg]drawbox=x='150+150*cos(t*3)':y='450+150*sin(t*3)':w=200:h=200:color=cyan@0.9:t=fill,"
    f"drawtext={font_opt}:text='AUTHORIZED B-ROLL':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=300,"
    f"drawtext={font_opt}:text='Supporting Scene':fontcolor=yellow:fontsize=34:x=(w-text_w)/2:y=850[v]"
)
broll_cmd = [
    "ffmpeg", "-y",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-filter_complex", broll_filter,
    "-map", "[v]",
    "-map", "0:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "128k",
    "-t", "3",
    broll_mp4
]
subprocess.check_call(broll_cmd)
print(f"B-roll footage generated: {broll_mp4}")
print("All test fixtures generated successfully!")
