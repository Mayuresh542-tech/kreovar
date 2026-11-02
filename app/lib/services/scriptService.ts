import { VeeloxIdea, VeeloxResearch, VeeloxScript, VeeloxScene } from "./types";
import { getAIProvider, MockAIProvider } from "./aiProvider";

export async function generateScript(
  idea: VeeloxIdea,
  research: VeeloxResearch,
  apiKey?: string | null
): Promise<VeeloxScript> {
  const provider = getAIProvider(apiKey);
  const isDevelopmentMode = provider instanceof MockAIProvider;

  if (isDevelopmentMode) {
    const topic = idea.title || research.topic || "AI Video Workflow";
    const scenes: VeeloxScene[] = [
      {
        id: "scene_1",
        order: 1,
        duration: 5,
        voiceoverText: idea.hook || `If you want to master ${topic}, stop doing what everyone else is doing.`,
        visualPrompt: `Cinematic high-contrast shot of modern creator workstation with neon ambient backlight, glowing monitors showing digital video waves, 8k resolution, photorealistic.`,
        assetType: "generated_image",
        assetUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1080&q=80",
        onScreenText: idea.title.toUpperCase(),
        transition: "zoom_in",
        animation: "ken_burns",
      },
      {
        id: "scene_2",
        order: 2,
        duration: 8,
        voiceoverText: `Most creators spend 8 hours editing a single video. But with recent workflow breakthroughs, you can turn a raw idea into a finished video in under 3 minutes.`,
        visualPrompt: `Split-screen visual showing traditional slow timeline editing versus fast automated AI pipeline, sleek dark UI, futuristic digital aesthetics.`,
        assetType: "stock_image",
        assetUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1080&q=80",
        onScreenText: "OLD WAY: 8 HOURS → NEW WAY: 3 MINS",
        transition: "slide_left",
        animation: "pulse",
      },
      {
        id: "scene_3",
        order: 3,
        duration: 10,
        voiceoverText: `First, identify high-velocity trend signals before your competitors catch on. The biggest mistake is jumping on trends after they already peak.`,
        visualPrompt: `Abstract data visualization of trending graph curving upwards with neon green velocity spikes, dark obsidian glass background.`,
        assetType: "generated_image",
        assetUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1080&q=80",
        onScreenText: "CATCH TRENDS BEFORE THE PEAK",
        transition: "fade",
        animation: "ken_burns",
      },
      {
        id: "scene_4",
        order: 4,
        duration: 10,
        voiceoverText: `Second, connect your hook directly to a specific audience pain point. When your opening 3 seconds promise real value, viewer retention stays above 70%.`,
        visualPrompt: `Close-up shot of digital smartphone display showing viewer engagement metrics climbing rapidly, clean typography, hyper-focused lighting.`,
        assetType: "stock_image",
        assetUrl: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1080&q=80",
        onScreenText: "HOOK RETENTION > 70%",
        transition: "slide_left",
        animation: "ken_burns",
      },
      {
        id: "scene_5",
        order: 5,
        duration: 7,
        voiceoverText: `And finally, let Kreovar automate the heavy lifting: script, voice, B-roll, and captions in one seamless timeline.`,
        visualPrompt: `Sleek futuristic creative software interface showing multi-track video timeline snapping together automatically, electric sky and cyan accents.`,
        assetType: "generated_image",
        assetUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1080&q=80",
        onScreenText: "AUTOMATE THE PRODUCTION PIPELINE",
        transition: "zoom_in",
        animation: "pulse",
      },
      {
        id: "scene_6",
        order: 6,
        duration: 5,
        voiceoverText: `Hit save and start creating your first automated video on Kreovar today.`,
        visualPrompt: `Minimalist brand outro card with glowing geometric lightning emblem and crisp typography on deep obsidian carbon, cinematic lighting.`,
        assetType: "text_only",
        assetUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1080&q=80",
        onScreenText: "START CREATING ON KREOVAR",
        transition: "fade",
        animation: "static",
      },
    ];

    const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

    return {
      title: idea.title,
      hook: idea.hook,
      intro: "Why this matters today.",
      bodyPoints: [
        "Old vs New Video Workflow",
        "Catching Trends Early",
        "Retention Architecture",
      ],
      payoff: "Automating full video production.",
      cta: "Start creating on Kreovar.",
      format: idea.format,
      duration: totalDuration,
      scenes,
    };
  }

  try {
    const prompt = `You are the lead director of Kreovar, an automated video production platform.
Create a production-ready scene-by-scene script for this concept:
Title: "${idea.title}"
Hook: "${idea.hook}"
Angle: "${idea.angle}"
Target Duration: ${idea.estimatedDuration} seconds
Format: "${idea.format}"
Research Context: "${research.summary}"

The script must be split into 5 to 7 chronological scenes totaling roughly ${idea.estimatedDuration} seconds.
Return ONLY a valid JSON object with these exact keys:
- title: string
- hook: string
- intro: string
- bodyPoints: array of 3 strings
- payoff: string
- cta: string
- format: string
- duration: number
- scenes: array of scene objects, each containing:
    - id: string (e.g. "scene_1")
    - order: number (1, 2, 3...)
    - duration: number (scene length in seconds, between 4 and 12)
    - voiceoverText: string (spoken script for this specific scene)
    - visualPrompt: string (detailed prompt describing the exact visual asset needed)
    - assetType: "generated_image" | "stock_video" | "stock_image" | "motion_graphic" | "text_only"
    - onScreenText: string (short, impactful text overlay for the screen in 2-5 words)
    - transition: "fade" | "slide_left" | "slide_right" | "zoom_in" | "cut" | "wipe"
    - animation: "ken_burns" | "pulse" | "float" | "static"
`;

    const raw = await provider.complete({
      systemPrompt: "You are an expert video director. Output valid JSON only.",
      userPrompt: prompt,
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    const scenes: VeeloxScene[] = (parsed.scenes ?? []).map((s: any, idx: number) => ({
      id: s.id || `scene_${idx + 1}`,
      order: s.order || idx + 1,
      duration: Number(s.duration) || 6,
      voiceoverText: s.voiceoverText || "",
      visualPrompt: s.visualPrompt || `Cinematic scene showing ${idea.title}`,
      assetType: s.assetType || "generated_image",
      assetUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1080&q=80",
      onScreenText: s.onScreenText || idea.title,
      transition: s.transition || "fade",
      animation: s.animation || "ken_burns",
    }));

    const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

    return {
      title: parsed.title || idea.title,
      hook: parsed.hook || idea.hook,
      intro: parsed.intro || "Introduction",
      bodyPoints: Array.isArray(parsed.bodyPoints) ? parsed.bodyPoints : [],
      payoff: parsed.payoff || "Core payoff",
      cta: parsed.cta || "Call to action",
      format: parsed.format || idea.format,
      duration: totalDuration,
      scenes,
    };
  } catch (err) {
    console.warn("AI Script generation failed, falling back to development script:", err);
    throw err;
  }
}
