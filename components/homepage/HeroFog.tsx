"use client";

import { useEffect, useRef } from "react";
import type { CloudScene, CloudSceneOptions, LightSource } from "@chartara/puff";
import { cursorLight } from "@/components/homepage/RockLight";
import styles from "./HeroSection.module.css";

type Layer = "back" | "front";

const UV = "vec2 uv=vec2(p.x/(uViewScale*(uResolution.x/uResolution.y))+.5,.5-p.y/uViewScale);";

const MASKS: Record<Layer, string> = {
  back: UV + `
    vec2 l=(uv-vec2(.06,.6))/vec2(.2,.22),r=(uv-vec2(.64,.78))/vec2(.19,.13),g=(uv-vec2(.47,.7))/vec2(.11,.09);
    float left=exp(-dot(l,l))*1.2,right=exp(-dot(r,r))*1.35,ridge=exp(-dot(g,g))*.9;
    float clearCopy=1.-.85*smoothstep(.5,.62,uv.x)*(1.-smoothstep(.6,.72,uv.y));
    float mask=clamp(left*1.15+right+ridge,0.,1.)*clearCopy;
    if(mask<1e-4)return 0.;
    float wisps=.35+.65*noise(p*1.5+vec3(uTime*.07,0.,3.));
    return cloudBase(p)*mask*wisps;`,
  front: UV + `
    float floor_=smoothstep(.78,1.,uv.y)*(1.-.35*smoothstep(.55,.9,uv.x));
    vec2 c=(uv-vec2(.04,.9))/vec2(.14,.1);
    float corner=exp(-dot(c,c));
    float mask=clamp(floor_*.9+corner,0.,1.);
    if(mask<1e-4)return 0.;
    float wisps=.25+.75*noise(p*1.9+vec3(uTime*.1,1.,0.));
    return cloudBase(p)*mask*wisps;`,
};

const FPS = 12;

const FOG: CloudSceneOptions = {
  transparent: true, interactive: false, cloudColor: "#b3cbb4",
  ambient: 0.95, erosion: 0.16, shadowStrength: 2.4, lightFalloff: 0.22, viewScale: 3.4,
  windDirection: [0.06, 0.012, 0.01], lightDirection: [-0.3, 0.5, 0.35],
  coverage: 1, exposure: 0.75, softness: 0.6, detail: 0.3, extinction: 2.2, volumeDepth: 3.2,
  quality: "low", raySteps: 15, fps: FPS, resolutionScale: 0.1, adaptiveQuality: 0,
};
const DENSITY: Record<Layer, number> = { back: 1.95, front: 3.2 };
const FAST_PHONE_GPU = /Apple|Adreno \(TM\) (6[4-9]\d|[7-9]\d\d)|Immortalis|Mali-G(6[1-9]\d|7[1-9]\d|7[6-8]\b)|Xclipse/i;
const GLOW: Record<Layer, number> = { back: 0.35, front: 0.735 };

function fogLights(canvas: HTMLCanvasElement, trophy: HTMLElement, pulse: Element, strength: number, cursor: number): LightSource[] {
  const lights: LightSource[] = [];
  const rect = canvas.getBoundingClientRect(), base = trophy.getBoundingClientRect();
  const css = getComputedStyle(pulse), num = (name: string) => parseFloat(css.getPropertyValue(name)) || 0;
  const add = (x: number, y: number, power: number, radius = 0.95) =>
    lights.push({ x: x - rect.left, y: y - rect.top, strength: power, depth: -0.3, radius, color: "#00ff00" });
  const x = base.left + base.width / 2, y = base.top + base.height * 0.96;
  const breath = num("--breath"), ring = num("--ring");
  if (cursor > 0.01) add(cursorLight.x, cursorLight.y, strength * cursor);
  add(x, y, strength * 1.2 * breath);
  if (ring > 0.01) add(x, y, strength * 1.5 * ring, Math.max(0.95, 4.5 * num("--ring-p") * base.height / rect.height));
  return lights;
}

function deviceOptions(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  const phone = matchMedia("(max-width: 900px)").matches, apple = /Apple/.test(gpu);
  return { apple, raySteps: !phone || FAST_PHONE_GPU.test(gpu) ? 15 : 5, resolutionScale: apple ? 0.5 : 0.1 };
}

export default function HeroFog({ layer, drift }: { layer: Layer; drift: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const trophy = canvas.parentElement?.querySelector<HTMLElement>('[data-layer="trophy"]');
    const pulse = canvas.parentElement?.querySelector(`.${styles.crackPulse}`);
    if (!trophy || !pulse) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scene: CloudScene | null = null, visible = true, cancelled = false, raf = 0, last = 0, cursor = 0;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!scene || now - last < 1000 / FPS - 2) return;
      last = now;
      cursor += ((cursorLight.on ? 1 : 0) - cursor) * 0.4;
      scene.setSources(fogLights(canvas, trophy, pulse, GLOW[layer], cursor));
    };
    const run = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!scene) return;
      if (!visible) { scene.stop(); return; }
      scene.start();
      if (!still) raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; run(); });
    observer.observe(canvas);

    import("@chartara/puff").then(({ CloudScene }) => {
      if (cancelled) return;
      scene = new CloudScene(canvas, { ...FOG, density: DENSITY[layer], densityShader: MASKS[layer] });
      const { apple, ...options } = deviceOptions(canvas);
      scene.setOptions(apple ? { ...options, transparent: false, background: "#000000" } : options);
      if (apple) canvas.style.mixBlendMode = "screen";
      run();
    }).catch((error) => console.warn("Hero fog unavailable:", error instanceof Error ? error.message : error));

    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
      scene?.destroy();
    };
  }, [layer]);

  return <canvas ref={ref} aria-hidden="true" data-parallax data-drift={drift} className={layer === "back" ? styles.fogBack : styles.fogFront} />;
}
