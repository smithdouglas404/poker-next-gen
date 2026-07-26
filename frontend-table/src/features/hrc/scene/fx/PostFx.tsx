import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

interface PostFxProps {
  quality?: "low" | "medium" | "high" | "cinematic";
}

export function PostFx({ quality = "high" }: PostFxProps) {
  if (quality === "low") return null;

  const bloomIntensity = quality === "cinematic" ? 0.6 : quality === "high" ? 0.45 : 0.3;

  return (
    <EffectComposer multisampling={quality === "cinematic" ? 4 : 2}>
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.15}
        mipmapBlur
      />
      <Vignette offset={0.3} darkness={0.5} />
    </EffectComposer>
  );
}
