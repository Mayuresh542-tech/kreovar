import { AspectRatio, AssetType, VeeloxScene } from "./types";

export interface AssetGenerationResult {
  assetUrl: string;
  assetType: AssetType;
  isDevelopmentMode: boolean;
  providerUsed: string;
}

export interface AssetProvider {
  name: string;
  generateSceneAsset(
    prompt: string,
    assetType: AssetType,
    aspectRatio: AspectRatio
  ): Promise<AssetGenerationResult>;
}

// Curated cinematic visuals matching high-tech creator aesthetics
const CURATED_CINEMATIC_ASSETS: string[] = [
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1080&q=80",
  "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=1080&q=80",
];

export class RealAssetProvider implements AssetProvider {
  name = "Pollinations / AI Asset Engine";

  async generateSceneAsset(
    prompt: string,
    assetType: AssetType,
    aspectRatio: AspectRatio
  ): Promise<AssetGenerationResult> {
    const width = aspectRatio === "9:16" ? 1080 : aspectRatio === "16:9" ? 1920 : 1080;
    const height = aspectRatio === "9:16" ? 1920 : aspectRatio === "16:9" ? 1080 : 1080;

    const encodedPrompt = encodeURIComponent(
      `${prompt}, cinematic dark aesthetic, obsidian black, electric cyan and emerald accents, 8k resolution, photorealistic`
    );
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(
      Math.random() * 100000
    )}`;

    return {
      assetUrl: pollinationsUrl,
      assetType,
      isDevelopmentMode: false,
      providerUsed: "pollinations",
    };
  }
}

export class MockAssetProvider implements AssetProvider {
  name = "Kreovar Development Asset Engine";

  async generateSceneAsset(
    prompt: string,
    assetType: AssetType,
    aspectRatio: AspectRatio
  ): Promise<AssetGenerationResult> {
    // Artificial latency for realistic async state handling
    await new Promise((r) => setTimeout(r, 300));

    // Choose curated high-contrast asset based on hash of prompt
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      hash = (hash << 5) - hash + prompt.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % CURATED_CINEMATIC_ASSETS.length;
    let chosenUrl = CURATED_CINEMATIC_ASSETS[index];

    // Adjust query parameters for aspect ratio
    if (aspectRatio === "9:16") {
      chosenUrl += "&ar=9:16";
    } else if (aspectRatio === "16:9") {
      chosenUrl += "&ar=16:9";
    } else {
      chosenUrl += "&ar=1:1";
    }

    return {
      assetUrl: chosenUrl,
      assetType,
      isDevelopmentMode: true,
      providerUsed: "mock",
    };
  }
}

export function getAssetProvider(useReal = true): AssetProvider {
  if (useReal) {
    return new RealAssetProvider();
  }
  return new MockAssetProvider();
}

/**
 * Resolves visual assets for an entire array of scenes in parallel
 */
export async function resolveSceneAssets(
  scenes: VeeloxScene[],
  aspectRatio: AspectRatio,
  useReal = false
): Promise<VeeloxScene[]> {
  const provider = getAssetProvider(useReal);

  const updatedScenes = await Promise.all(
    scenes.map(async (scene) => {
      if (scene.assetUrl && !scene.isRegenerating) {
        return scene;
      }
      const result = await provider.generateSceneAsset(
        scene.visualPrompt || scene.voiceoverText,
        scene.assetType,
        aspectRatio
      );
      return {
        ...scene,
        assetUrl: result.assetUrl,
        isRegenerating: false,
      };
    })
  );

  return updatedScenes;
}
