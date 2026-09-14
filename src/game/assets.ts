export type GameImages = {
  map: HTMLImageElement;
  keep: HTMLImageElement;
  towers: Record<string, HTMLImageElement>;
  projectiles: Record<string, HTMLImageElement>;
  enemies: Record<string, HTMLImageElement[]>;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function loadOptional(src: string): Promise<HTMLImageElement | null> {
  try {
    return await loadImage(src);
  } catch {
    return null;
  }
}

export async function loadGameImages(): Promise<GameImages> {
  const [map, keep, ballista, mortar, rime, bolt, bomb, ice] = await Promise.all(
    [
      loadImage("/game/map.jpg"),
      loadImage("/game/keep.png"),
      loadImage("/game/towers/ballista.png"),
      loadImage("/game/towers/mortar.png"),
      loadImage("/game/towers/rime.png"),
      loadImage("/game/projectiles/bolt.png"),
      loadImage("/game/projectiles/bomb.png"),
      loadImage("/game/projectiles/ice.png"),
    ],
  );

  const loadFrames = async (id: string) => {
    const frames = await Promise.all(
      [1, 2, 3, 4].map((n) => loadOptional(`/game/enemies/${id}/${n}.png`)),
    );
    return frames.filter((f): f is HTMLImageElement => Boolean(f));
  };

  const [walker, skitter, bulwark, boss] = await Promise.all([
    loadFrames("walker"),
    loadFrames("skitter"),
    loadFrames("bulwark"),
    loadFrames("boss"),
  ]);

  return {
    map,
    keep,
    towers: { ballista, mortar, rime },
    projectiles: { bolt, bomb, ice },
    enemies: { walker, skitter, bulwark, boss },
  };
}
