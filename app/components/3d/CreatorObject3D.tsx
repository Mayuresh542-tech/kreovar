"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type CreatorObjectVariant =
  | "cinema-lens"
  | "timeline-deck"
  | "director-slate"
  | "studio-mic"
  | "auth-prism";

export interface CreatorObject3DProps {
  variant: CreatorObjectVariant;
  className?: string;
  height?: number | string;
  showHint?: boolean;
  surface?: "light" | "dark";
  ariaLabel?: string;
}

const INTERACTION_HINTS: Record<CreatorObjectVariant, { title: string; action: string }> = {
  "cinema-lens": {
    title: "35mm T1.4 Prime Lens",
    action: "Drag to orbit · Click to actuate aperture iris",
  },
  "timeline-deck": {
    title: "Color & Timeline Console",
    action: "Drag to inspect deck · Click to scrub playhead",
  },
  "director-slate": {
    title: "Production Director Slate",
    action: "Drag to rotate · Click to clap slate",
  },
  "studio-mic": {
    title: "Broadcast Condenser",
    action: "Drag to orbit · Click for vocal pulse",
  },
  "auth-prism": {
    title: "Cinema Optical Core",
    action: "Drag to rotate · Click to rack focus",
  },
};

let cachedEnvTexture: THREE.CanvasTexture | null = null;
function getSharedStudioEnv(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  if (cachedEnvTexture) return cachedEnvTexture;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Base cool architectural studio ambient gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, "#f8fbff");
  bg.addColorStop(0.32, "#dbeafe");
  bg.addColorStop(0.55, "#475569");
  bg.addColorStop(1, "#0f172a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);

  // Soft overhead studio softbox highlights for crisp metallic reflections
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(28, 12, 82, 16);
  ctx.fillRect(146, 10, 74, 14);

  // Sapphire rim panel + sea-glass fill panel
  const blueStrip = ctx.createLinearGradient(0, 38, 0, 74);
  blueStrip.addColorStop(0, "rgba(59,130,246,0.9)");
  blueStrip.addColorStop(1, "rgba(29,79,177,0.3)");
  ctx.fillStyle = blueStrip;
  ctx.fillRect(12, 40, 48, 34);

  ctx.fillStyle = "rgba(45,212,191,0.55)";
  ctx.fillRect(198, 44, 42, 30);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedEnvTexture = tex;
  return tex;
}

function createLensRingTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#162238";
  ctx.fillRect(0, 0, 1024, 128);

  // Precision aperture tick marks
  ctx.fillStyle = "#94a3b8";
  for (let x = 0; x < 1024; x += 16) {
    const h = x % 64 === 0 ? 34 : 18;
    ctx.fillRect(x, 128 - h, 2, h);
  }

  ctx.font = "700 28px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#e2e8f0";
  const labels = ["1.4", "2", "2.8", "4", "5.6", "8", "11", "16", "35MM T1.4", "KREOVAR"];
  labels.forEach((lbl, idx) => {
    ctx.fillStyle = lbl.includes("KREOVAR") ? "#60a5fa" : "#f1f5f9";
    ctx.fillText(lbl, 22 + idx * 102, 56);
  });

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createKnurlBumpTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  for (let x = 0; x < 256; x += 4) {
    ctx.fillStyle = x % 8 === 0 ? "#ffffff" : "#222222";
    ctx.fillRect(x, 0, 4, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

function createSlateFaceTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 340;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#f4f7fc";
  ctx.fillRect(0, 0, 512, 340);

  // Header bar
  ctx.fillStyle = "#13223e";
  ctx.fillRect(0, 0, 512, 62);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 22px Inter, system-ui, sans-serif";
  ctx.fillText("KREOVAR CINE STUDIO", 24, 39);
  ctx.fillStyle = "#60a5fa";
  ctx.font = "700 18px monospace";
  ctx.fillText("24.00 FPS", 390, 39);

  // Slate grid hairlines
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 82, 476, 236);
  ctx.beginPath();
  ctx.moveTo(18, 162);
  ctx.lineTo(494, 162);
  ctx.moveTo(18, 240);
  ctx.lineTo(494, 240);
  ctx.moveTo(256, 82);
  ctx.lineTo(256, 240);
  ctx.stroke();

  ctx.fillStyle = "#64748b";
  ctx.font = "700 14px monospace";
  ctx.fillText("SCENE", 32, 108);
  ctx.fillText("TAKE", 272, 108);
  ctx.fillText("LENS // FILTER", 32, 186);
  ctx.fillText("TIMECODE", 272, 186);
  ctx.fillText("DIRECTOR // COLORSPACE", 32, 264);

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 32px monospace";
  ctx.fillText("01A", 32, 146);
  ctx.fillText("04", 272, 146);
  ctx.font = "700 22px monospace";
  ctx.fillText("35MM T1.4", 32, 222);
  ctx.fillStyle = "#1d4fb1";
  ctx.fillText("00:08:14:12", 272, 222);
  ctx.fillStyle = "#0f172a";
  ctx.font = "700 20px Inter, sans-serif";
  ctx.fillText("FROSTED DAYLIGHT · REC.709", 32, 298);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMonitorScreenTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const bg = ctx.createLinearGradient(0, 0, 512, 288);
  bg.addColorStop(0, "#0b1426");
  bg.addColorStop(0.55, "#152b54");
  bg.addColorStop(1, "#0f172a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 288);

  // Subtle composition viewport center graphic + safe frame markers
  ctx.strokeStyle = "rgba(148,163,184,0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 36, 400, 152);

  // Active metric graphic preview inside monitor screen
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  ctx.roundRect(142, 74, 228, 76, 14);
  ctx.fill();
  ctx.fillStyle = "#1d4fb1";
  ctx.fillRect(158, 92, 6, 40);
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 24px Inter, sans-serif";
  ctx.fillText("+245% REACH", 178, 112);
  ctx.fillStyle = "#64748b";
  ctx.font = "600 13px monospace";
  ctx.fillText("LAYER // GRAPHICS_02", 178, 134);

  // Bottom mini timeline inside screen
  ctx.fillStyle = "#09101f";
  ctx.fillRect(16, 206, 480, 68);
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(28, 218, 180, 18);
  ctx.fillStyle = "#14b8a6";
  ctx.fillRect(216, 218, 140, 18);
  ctx.fillStyle = "#6366f1";
  ctx.fillRect(88, 244, 290, 16);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMicGrilleTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = canvas2d(c);
  if (!ctx) return null;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "#0f172a";
  for (let y = 0; y < 128; y += 8) {
    const offset = (y / 8) % 2 === 0 ? 0 : 4;
    for (let x = offset; x < 128; x += 8) {
      ctx.beginPath();
      ctx.arc(x + 2, y + 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 4);
  return tex;
}

function canvas2d(c: HTMLCanvasElement) {
  return c.getContext("2d");
}

function createRoundedPlateShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) std.map.dispose();
        if (std.bumpMap) std.bumpMap.dispose();
        m.dispose();
      }
    }
  });
}

function buildVariantScene(
  variant: CreatorObjectVariant,
  surface: "light" | "dark"
): {
  root: THREE.Group;
  triggerAction: () => void;
  step: (t: number, dt: number, impulse: number) => boolean;
} {
  const root = new THREE.Group();

  const brushedAluMat = new THREE.MeshStandardMaterial({
    color: surface === "dark" ? 0xeef3fb : 0xf6f8fc,
    metalness: 0.78,
    roughness: 0.24,
    envMapIntensity: 1.35,
  });

  const gunmetalMat = new THREE.MeshStandardMaterial({
    color: 0x162238,
    metalness: 0.82,
    roughness: 0.28,
    envMapIntensity: 1.25,
  });

  const sapphireMat = new THREE.MeshStandardMaterial({
    color: 0x1d4fb1,
    emissive: 0x0f2d6b,
    emissiveIntensity: 0.35,
    metalness: 0.65,
    roughness: 0.18,
    envMapIntensity: 1.4,
  });

  const seaGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x1d4fb1,
    emissiveIntensity: 0.18,
    metalness: 0.1,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.72,
    envMapIntensity: 1.75,
  });

  const emeraldGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x2dd4bf,
    emissive: 0x115e59,
    emissiveIntensity: 0.2,
    metalness: 0.12,
    roughness: 0.1,
    clearcoat: 1,
    transparent: true,
    opacity: 0.65,
    envMapIntensity: 1.6,
  });

  let actionPulse = 0;

  if (variant === "cinema-lens" || variant === "auth-prism") {
    root.scale.setScalar(variant === "auth-prism" ? 0.92 : 1.04);

    // Precision stepped cinema prime barrel via LatheGeometry
    const profile = [
      new THREE.Vector2(0.86, -0.78),
      new THREE.Vector2(1.06, -0.78),
      new THREE.Vector2(1.12, -0.58),
      new THREE.Vector2(1.16, -0.35),
      new THREE.Vector2(1.24, -0.25),
      new THREE.Vector2(1.24, 0.22),
      new THREE.Vector2(1.32, 0.3),
      new THREE.Vector2(1.32, 0.56),
      new THREE.Vector2(1.4, 0.64),
      new THREE.Vector2(1.4, 0.88),
      new THREE.Vector2(1.14, 0.88),
      new THREE.Vector2(1.02, 0.58),
      new THREE.Vector2(0.84, 0.24),
    ];
    const barrelGeo = new THREE.LatheGeometry(profile, 64);
    const barrel = new THREE.Mesh(barrelGeo, brushedAluMat);
    barrel.rotation.x = Math.PI / 2;
    root.add(barrel);

    // Knurled focus collar ring
    const knurlTex = createKnurlBumpTexture();
    const knurlMat = new THREE.MeshStandardMaterial({
      color: 0x1b2b48,
      metalness: 0.75,
      roughness: 0.38,
      bumpMap: knurlTex ?? undefined,
      bumpScale: 0.035,
      envMapIntensity: 1.1,
    });
    const focusRing = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.34, 64, 1, true), knurlMat);
    focusRing.rotation.x = Math.PI / 2;
    focusRing.position.z = 0.42;
    root.add(focusRing);

    // Engraved lens scale ring (35MM T1.4 f/1.4..16)
    const scaleTex = createLensRingTexture();
    const scaleMat = new THREE.MeshStandardMaterial({
      map: scaleTex ?? undefined,
      metalness: 0.45,
      roughness: 0.3,
      envMapIntensity: 1.0,
    });
    const scaleBand = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.26, 0.28, 64, 1, true), scaleMat);
    scaleBand.rotation.x = Math.PI / 2;
    scaleBand.position.z = -0.02;
    root.add(scaleBand);

    // Anodized sapphire optical trim ring & chamfered filter hood
    const sapphireRing = new THREE.Mesh(new THREE.TorusGeometry(1.39, 0.028, 16, 64), sapphireMat);
    sapphireRing.position.z = 0.86;
    root.add(sapphireRing);

    const innerWell = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.78, 0.42, 48), gunmetalMat);
    innerWell.rotation.x = Math.PI / 2;
    innerWell.position.z = 0.46;
    root.add(innerWell);

    // Internal multi-element curved sapphire glass meniscus
    const glassDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.04, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.34),
      seaGlassMat
    );
    glassDome.rotation.x = Math.PI / 2;
    glassDome.position.z = 0.16;
    root.add(glassDome);

    // 11-blade interlocking aperture iris
    const irisGroup = new THREE.Group();
    irisGroup.position.z = 0.44;
    root.add(irisGroup);
    const blades: THREE.Mesh[] = [];
    const bladeGeo = new THREE.BoxGeometry(0.46, 0.095, 0.012);
    for (let i = 0; i < 11; i++) {
      const a = (i * Math.PI * 2) / 11;
      const blade = new THREE.Mesh(bladeGeo, gunmetalMat);
      blade.position.set(Math.cos(a) * 0.48, Math.sin(a) * 0.48, (i % 2) * 0.008);
      blade.rotation.z = a + 0.56;
      irisGroup.add(blade);
      blades.push(blade);
    }

    // Precision floating rear mount ring
    const rearRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 16, 48), gunmetalMat);
    rearRing.position.z = -0.78;
    root.add(rearRing);

    let stoppedDown = false;

    return {
      root,
      triggerAction: () => {
        actionPulse = 1;
        stoppedDown = !stoppedDown;
      },
      step: (t, dt) => {
        const active = actionPulse > 0.001;
        actionPulse = Math.max(0, actionPulse - dt * 1.35);
        const stopWave = Math.sin(actionPulse * Math.PI);
        const targetClose = stoppedDown ? 0.14 : 0;
        const detentAngle = stoppedDown ? 0.42 : 0;
        irisGroup.rotation.z += ((t * 0.14 + detentAngle + stopWave * 0.9) - irisGroup.rotation.z) * 0.22;
        blades.forEach((b, i) => {
          const a = (i * Math.PI * 2) / 11;
          const r = 0.48 - targetClose - stopWave * 0.14;
          b.position.set(Math.cos(a) * r, Math.sin(a) * r, (i % 2) * 0.008);
          b.rotation.z = a + 0.56 + targetClose * 1.4 + stopWave * 0.35;
        });
        focusRing.position.z += ((0.42 + (stoppedDown ? 0.06 : 0) + stopWave * 0.08) - focusRing.position.z) * 0.22;
        focusRing.rotation.y += ((detentAngle + stopWave * 0.45) - focusRing.rotation.y) * 0.22;
        return active;
      },
    };
  }

  if (variant === "director-slate") {
    // Chamfered extruded slate frame
    const bodyShape = createRoundedPlateShape(2.35, 1.56, 0.1);
    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 0.09,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 3,
    });
    bodyGeo.center();
    const body = new THREE.Mesh(bodyGeo, gunmetalMat);
    body.position.y = -0.15;
    root.add(body);

    const slateFaceTex = createSlateFaceTexture();
    const faceMat = new THREE.MeshStandardMaterial({
      map: slateFaceTex ?? undefined,
      roughness: 0.25,
      metalness: 0.05,
      envMapIntensity: 0.7,
    });
    const facePlate = new THREE.Mesh(new THREE.PlaneGeometry(2.14, 1.38), faceMat);
    facePlate.position.set(0, -0.15, 0.072);
    root.add(facePlate);

    // Metallic machined hinge plate + bolts
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.16), brushedAluMat);
    hinge.position.set(-0.98, 0.58, 0.01);
    root.add(hinge);

    // Hinged top clapper arm with alternating chevrons
    const armPivot = new THREE.Group();
    armPivot.position.set(-1.14, 0.72, 0);
    root.add(armPivot);

    const armShape = createRoundedPlateShape(2.34, 0.26, 0.04);
    const armGeo = new THREE.ExtrudeGeometry(armShape, {
      depth: 0.09,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.018,
      bevelSegments: 2,
    });
    armGeo.center();
    const arm = new THREE.Mesh(armGeo, gunmetalMat);
    arm.position.set(1.14, 0.13, 0);
    armPivot.add(arm);

    for (let i = 0; i < 6; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.265, 0.132),
        i % 2 === 0 ? brushedAluMat : sapphireMat
      );
      stripe.position.set(0.24 + i * 0.37, 0.13, 0);
      stripe.rotation.z = -0.34;
      armPivot.add(stripe);
    }

    let clapped = false;

    return {
      root,
      triggerAction: () => {
        actionPulse = 1;
        clapped = !clapped;
      },
      step: (t, dt) => {
        const active = actionPulse > 0.001;
        actionPulse = Math.max(0, actionPulse - dt * 1.9);
        const snap =
          actionPulse > 0.55
            ? Math.sin(((actionPulse - 0.55) / 0.45) * (Math.PI / 2)) * 0.42
            : Math.sin((actionPulse / 0.55) * Math.PI) * 0.07;
        const baseAngle = clapped ? 0.025 : 0.27 + Math.sin(t * 1.1) * 0.035;
        const targetRot = Math.max(0.01, baseAngle - snap * 0.45);
        armPivot.rotation.z += (targetRot - armPivot.rotation.z) * 0.28;
        return active;
      },
    };
  }

  if (variant === "timeline-deck") {
    // Beveled brushed aluminum grading & NLE control deck
    const deckShape = createRoundedPlateShape(2.7, 1.65, 0.12);
    const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    deckGeo.center();
    const deck = new THREE.Mesh(deckGeo, gunmetalMat);
    deck.rotation.x = -0.32;
    root.add(deck);

    const bezelTrim = new THREE.Mesh(
      new THREE.BoxGeometry(2.74, 1.68, 0.04),
      brushedAluMat
    );
    bezelTrim.rotation.x = -0.32;
    bezelTrim.position.set(0, 0.01, -0.05);
    root.add(bezelTrim);

    const consoleGroup = new THREE.Group();
    consoleGroup.rotation.x = -0.32;
    root.add(consoleGroup);

    // Embedded active monitor screen inside upper deck
    const screenTex = createMonitorScreenTexture();
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTex ?? undefined,
      roughness: 0.14,
      metalness: 0.08,
      emissive: 0x0b1730,
      emissiveIntensity: 0.25,
      envMapIntensity: 1.1,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 0.98), screenMat);
    screen.position.set(-0.32, 0.2, 0.1);
    consoleGroup.add(screen);

    // Weighted CNC Jog/Shuttle rotary wheel on the right
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.12, 48), brushedAluMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0.92, 0.18, 0.14);
    consoleGroup.add(wheel);

    const wheelDimple = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 24), sapphireMat);
    wheelDimple.rotation.x = Math.PI / 2;
    wheelDimple.position.set(0.92 + 0.2, 0.18 + 0.12, 0.2);
    consoleGroup.add(wheelDimple);

    // Floating layered glass timeline strips across lower half of console
    const clipA = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 0.05), seaGlassMat);
    clipA.position.set(-0.48, -0.46, 0.16);
    consoleGroup.add(clipA);

    const clipB = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.05), emeraldGlassMat);
    clipB.position.set(0.58, -0.46, 0.16);
    consoleGroup.add(clipB);

    const clipC = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.14, 0.045), sapphireMat);
    clipC.position.set(0.02, -0.68, 0.14);
    consoleGroup.add(clipC);

    // Glowing vertical playhead blade
    const playhead = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.56, 0.24), sapphireMat);
    playhead.position.set(-0.4, -0.54, 0.24);
    consoleGroup.add(playhead);

    let scrubStep = 0;

    return {
      root,
      triggerAction: () => {
        actionPulse = 1;
        scrubStep = (scrubStep + 1) % 3;
      },
      step: (t, dt) => {
        const active = actionPulse > 0.001;
        actionPulse = Math.max(0, actionPulse - dt * 1.15);
        const stepOffsets = [-0.55, 0.12, 0.72];
        const targetX =
          stepOffsets[scrubStep] +
          Math.sin(t * 0.75) * 0.22 +
          Math.sin(actionPulse * Math.PI * 2) * 0.26;
        const clampedX = Math.max(-1.05, Math.min(1.05, targetX));
        playhead.position.x += (clampedX - playhead.position.x) * 0.2;
        const dialAngle = playhead.position.x * 2.5;
        wheelDimple.position.set(0.92 + Math.cos(dialAngle) * 0.2, 0.18 + Math.sin(dialAngle) * 0.2, 0.2);
        return active;
      },
    };
  }

  // studio-mic: Precision lathe-turned broadcast condenser + perforated grille + suspension ring
  const micBodyProfile = [
    new THREE.Vector2(0, -0.78),
    new THREE.Vector2(0.26, -0.78),
    new THREE.Vector2(0.32, -0.62),
    new THREE.Vector2(0.38, -0.1),
    new THREE.Vector2(0.4, 0.22),
    new THREE.Vector2(0.4, 0.32),
  ];
  const micBody = new THREE.Mesh(new THREE.LatheGeometry(micBodyProfile, 48), brushedAluMat);
  micBody.position.y = -0.05;
  root.add(micBody);

  const trimBand = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.026, 16, 48), sapphireMat);
  trimBand.rotation.x = Math.PI / 2;
  trimBand.position.y = 0.27;
  root.add(trimBand);

  const grilleTex = createMicGrilleTexture();
  const grilleMat = new THREE.MeshStandardMaterial({
    map: grilleTex ?? undefined,
    color: 0x334155,
    metalness: 0.72,
    roughness: 0.32,
    envMapIntensity: 1.25,
  });
  const capsuleHead = new THREE.Mesh(new THREE.CapsuleGeometry(0.39, 0.32, 16, 36), grilleMat);
  capsuleHead.position.y = 0.48;
  root.add(capsuleHead);

  // Suspension shock mount yoke + stand
  const shockRing = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.042, 18, 48), gunmetalMat);
  shockRing.rotation.x = Math.PI / 2;
  shockRing.position.y = -0.18;
  root.add(shockRing);

  const fork = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.045, 14, 48, Math.PI * 1.12),
    gunmetalMat
  );
  fork.rotation.z = -Math.PI * 0.06;
  fork.position.y = -0.18;
  root.add(fork);

  const baseDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.09, 44), brushedAluMat);
  baseDisk.position.y = -1.16;
  root.add(baseDisk);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.56, 24), gunmetalMat);
  pillar.position.y = -0.94;
  root.add(pillar);

  const haloOuter = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.024, 16, 64), seaGlassMat);
  haloOuter.rotation.x = Math.PI / 2.25;
  haloOuter.position.y = 0.42;
  root.add(haloOuter);

  let micBoost = false;

  return {
    root,
    triggerAction: () => {
      actionPulse = 1;
      micBoost = !micBoost;
    },
    step: (t, dt) => {
      const active = actionPulse > 0.001;
      actionPulse = Math.max(0, actionPulse - dt * 1.3);
      const wave = Math.sin(actionPulse * Math.PI);
      const s = 1 + (micBoost ? 0.12 : 0) + Math.sin(t * 2.0) * 0.03 + wave * 0.22;
      haloOuter.scale.setScalar(s);
      haloOuter.rotation.z = t * 0.35 + (micBoost ? 0.45 : 0);
      return active;
    },
  };
}

function createWebGLRendererWithFallback(): THREE.WebGLRenderer | null {
  try {
    return new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    try {
      return new THREE.WebGLRenderer({
        alpha: true,
        antialias: false,
        powerPreference: "default",
      });
    } catch {
      return null;
    }
  }
}

export default function CreatorObject3D({
  variant,
  className = "",
  height = 300,
  showHint = true,
  surface = "light",
  ariaLabel,
}: CreatorObject3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<(() => void) | null>(null);
  const [webglReady, setWebglReady] = useState(true);
  const [pulseCount, setPulseCount] = useState(0);
  const [fallbackDrag, setFallbackDrag] = useState({ rx: 8, ry: -14, active: false });

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const renderer = createWebGLRendererWithFallback();
    if (!renderer) {
      queueMicrotask(() => setWebglReady(false));
      return;
    }
    queueMicrotask(() => setWebglReady(true));

    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(host.clientWidth || rect.width || 340));
    const h = Math.max(
      1,
      Math.round(host.clientHeight || rect.height || (typeof height === "number" ? height : 300))
    );

    const scene = new THREE.Scene();
    const env = getSharedStudioEnv();
    if (env) {
      scene.environment = env;
    }

    const camera = new THREE.PerspectiveCamera(38, w / Math.max(1, h), 0.1, 100);
    camera.position.set(0, 0.18, 4.75);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, surface === "dark" ? 0.65 : 0.85);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
    keyLight.position.set(4, 6, 5.5);
    scene.add(keyLight);

    const cobaltRim = new THREE.DirectionalLight(0x3b82f6, 1.6);
    cobaltRim.position.set(-4.5, 2.5, 3);
    scene.add(cobaltRim);

    const seaRim = new THREE.DirectionalLight(0x2dd4bf, 1.15);
    seaRim.position.set(3.5, -3.5, 2.5);
    scene.add(seaRim);

    const { root, triggerAction, step } = buildVariantScene(variant, surface);
    scene.add(root);

    let disposed = false;
    let isDragging = false;
    let movedDuringDrag = false;
    let hovered = false;
    let lastX = 0;
    let lastY = 0;
    let userYaw = -0.32;
    let userPitch = 0.15;
    let hoverX = 0;
    let hoverY = 0;
    let velYaw = 0;
    let velPitch = 0;
    let needsBurstFrames = 24;
    let inView = true;

    const motionMq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reducedMotion = Boolean(motionMq?.matches);

    let rafId = 0;
    let lastDrawTime = 0;
    const clock = new THREE.Clock();

    const renderFrame = (t: number, dt: number): boolean => {
      if (!isDragging) {
        velYaw *= 0.9;
        velPitch *= 0.9;
        userYaw += velYaw;
        userPitch = Math.max(-0.85, Math.min(0.85, userPitch + velPitch));
      }
      const idleFloat = reducedMotion ? 0 : Math.sin(t * 0.9) * 0.035;
      const idleSway = reducedMotion ? 0 : Math.sin(t * 0.45) * 0.07;
      root.rotation.y += ((userYaw + idleSway + hoverX) - root.rotation.y) * 0.24;
      root.rotation.x += ((userPitch + hoverY) - root.rotation.x) * 0.24;
      root.position.y = idleFloat;

      const animBusy = step(t, dt, Math.abs(velYaw) + Math.abs(velPitch));
      renderer.render(scene, camera);
      return animBusy || isDragging || Math.abs(velYaw) > 0.0008 || Math.abs(velPitch) > 0.0008;
    };

    const animate = (now: number) => {
      rafId = 0;
      if (disposed || document.visibilityState === "hidden") return;

      const interacting = isDragging || hovered || needsBurstFrames > 0;
      if (!inView && !interacting) return;
      if (reducedMotion && !interacting) return;

      const minInterval = interacting ? 0 : 42;
      if (minInterval > 0 && now - lastDrawTime < minInterval) {
        rafId = requestAnimationFrame(animate);
        return;
      }
      lastDrawTime = now;

      const dt = Math.min(0.05, clock.getDelta() || 0.016);
      const busy = renderFrame(clock.elapsedTime, dt);
      if (!busy && needsBurstFrames > 0) {
        needsBurstFrames--;
      }

      if (!disposed && ((!reducedMotion && inView) || busy || isDragging || needsBurstFrames > 0)) {
        rafId = requestAnimationFrame(animate);
      }
    };

    const scheduleRender = (burstFrames = 36) => {
      if (disposed) return;
      needsBurstFrames = Math.max(needsBurstFrames, burstFrames);
      if (!rafId) {
        clock.getDelta();
        rafId = requestAnimationFrame(animate);
      }
    };

    triggerRef.current = () => {
      inView = true;
      triggerAction();
      velYaw += 0.025;
      scheduleRender(75);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      inView = true;
      isDragging = true;
      movedDuringDrag = false;
      lastX = e.clientX;
      lastY = e.clientY;
      host.setPointerCapture?.(e.pointerId);
      scheduleRender(70);
    };

    const onPointerEnter = () => {
      inView = true;
      hovered = true;
      scheduleRender(36);
    };

    const onPointerLeave = () => {
      hovered = false;
      hoverX = 0;
      hoverY = 0;
      scheduleRender(28);
    };

    const onPointerMove = (e: PointerEvent) => {
      inView = true;
      const box = host.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        hoverX = ((e.clientX - box.left) / box.width - 0.5) * 0.42;
        hoverY = ((e.clientY - box.top) / box.height - 0.5) * 0.28;
      }
      if (!isDragging) {
        if (hovered) scheduleRender(14);
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) movedDuringDrag = true;
      lastX = e.clientX;
      lastY = e.clientY;
      velYaw = dx * 0.014;
      velPitch = dy * 0.011;
      userYaw += velYaw;
      userPitch = Math.max(-0.85, Math.min(0.85, userPitch + velPitch));
      scheduleRender(60);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (isDragging && !movedDuringDrag) {
        triggerAction();
        setPulseCount((c) => c + 1);
      }
      isDragging = false;
      scheduleRender(75);
      try {
        host.releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore if already released
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      setWebglReady(false);
    };

    const onContextRestored = () => {
      setWebglReady(true);
      scheduleRender(30);
    };

    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      scheduleRender(reducedMotion ? 8 : 30);
    };

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointerenter", onPointerEnter);
    host.addEventListener("pointerleave", onPointerLeave);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);
    motionMq?.addEventListener?.("change", onMotionChange);

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                inView = entry.isIntersecting;
                if (inView) scheduleRender(12);
              }
            },
            { threshold: 0.02 }
          )
        : null;
    io?.observe(host);

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            for (const entry of entries) {
              const nw = Math.max(1, Math.round(entry.contentRect.width));
              const nh = Math.max(1, Math.round(entry.contentRect.height));
              camera.aspect = nw / nh;
              camera.updateProjectionMatrix();
              renderer.setSize(nw, nh);
              scheduleRender(8);
            }
          })
        : null;
    resizeObserver?.observe(host);

    // Draw initial crisp frame immediately & start interactive rAF burst
    renderFrame(0.5, 0.016);
    scheduleRender(reducedMotion ? 6 : 30);

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      io?.disconnect();
      resizeObserver?.disconnect();
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointerenter", onPointerEnter);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      motionMq?.removeEventListener?.("change", onMotionChange);
      disposeObjectTree(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
      triggerRef.current = null;
    };
  }, [variant, height, surface]);

  const hint = INTERACTION_HINTS[variant];

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel || `${hint.title} interactive 3D object`}
        style={{ touchAction: "none" }}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {!webglReady && (
        <div
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ry = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 34;
            const rx = -((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 24;
            setFallbackDrag((prev) => ({ ...prev, rx, ry }));
          }}
          onPointerLeave={() => setFallbackDrag((prev) => ({ ...prev, rx: 8, ry: -14 }))}
          onClick={() => {
            setFallbackDrag((prev) => ({ ...prev, active: !prev.active }));
            setPulseCount((c) => c + 1);
          }}
          className="absolute inset-0 flex items-center justify-center rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-100/70 via-white/80 to-blue-50/70 cursor-pointer"
        >
          <div
            className="transition-transform duration-300 ease-out"
            style={{
              transform: `perspective(700px) rotateX(${fallbackDrag.rx}deg) rotateY(${fallbackDrag.ry}deg) scale(${fallbackDrag.active ? 1.07 : 1})`,
            }}
          >
            <div className="w-36 h-24 rounded-2xl border border-blue-300/80 bg-gradient-to-br from-[#13223E] via-[#1D4FB1] to-[#0f172a] shadow-xl flex flex-col items-center justify-center gap-1.5 px-3 text-center">
              <div className="w-9 h-9 rounded-full border-2 border-sky-300/80 bg-sky-400/20 flex items-center justify-center">
                <div className={`rounded-full bg-sky-300 transition-all duration-300 ${fallbackDrag.active ? "w-2.5 h-2.5" : "w-4.5 h-4.5"}`} />
              </div>
              <p className="text-[11px] font-bold text-white truncate max-w-full">{hint.title}</p>
            </div>
          </div>
        </div>
      )}

      {showHint && (
        <button
          type="button"
          onClick={() => {
            if (webglReady) {
              triggerRef.current?.();
            } else {
              setFallbackDrag((prev) => ({ ...prev, active: !prev.active }));
            }
            setPulseCount((c) => c + 1);
          }}
          title={hint.action}
          className={`absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono backdrop-blur-md transition-all shadow-xs cursor-pointer ${
            surface === "dark"
              ? "border border-white/15 bg-slate-900/55 text-blue-100 hover:bg-slate-900/80"
              : "border border-white/90 bg-white/85 text-slate-700 hover:bg-white hover:text-blue-700"
          }`}
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-blue-500 transition-transform"
            style={{ transform: pulseCount > 0 ? "scale(1.25)" : "scale(1)" }}
          />
          <span className="whitespace-nowrap">{hint.action}</span>
        </button>
      )}
    </div>
  );
}
