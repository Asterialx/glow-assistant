import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export function ModelViewer({ source, ext }: { source: string; ext: "stl" | "obj" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !source.trim()) return;
    let disposed = false;
    let frame = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let mesh: THREE.Object3D | null = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf7f5f2);
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(el.clientHeight, 1), 0.1, 5000);
    camera.position.set(2, 2, 3);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(3, 5, 2);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xfff5eb, 0.7));

    const fit = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = 2 / maxDim;
      obj.scale.setScalar(scale);
      camera.position.set(2.2, 1.8, 2.8);
      camera.lookAt(0, 0, 0);
    };

    const mat = new THREE.MeshStandardMaterial({
      color: 0xc96442,
      metalness: 0.12,
      roughness: 0.45,
    });

    try {
      if (ext === "stl") {
        // Binary STL from base64, or ASCII text
        let buffer: ArrayBuffer;
        if (source.startsWith("data:") || /^[A-Za-z0-9+/=\s]+$/.test(source.slice(0, 200)) && source.length > 200 && !source.includes("solid")) {
          const b64 = source.includes(",") ? source.split(",")[1]! : source;
          const bin = atob(b64.replace(/\s/g, ""));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          buffer = bytes.buffer;
        } else {
          buffer = new TextEncoder().encode(source).buffer;
        }
        const geo = new STLLoader().parse(buffer);
        geo.computeVertexNormals();
        mesh = new THREE.Mesh(geo, mat);
        fit(mesh);
        scene.add(mesh);
      } else {
        const obj = new OBJLoader().parse(source);
        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = mat;
          }
        });
        mesh = obj;
        fit(obj);
        scene.add(obj);
      }
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to parse 3D model");
      const fallback = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh = fallback;
      scene.add(fallback);
    }

    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      if (mesh) {
        mesh.rotation.y += 0.008;
        mesh.rotation.x += 0.002;
      }
      renderer?.render(scene, camera);
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      renderer?.dispose();
      mat.dispose();
      el.innerHTML = "";
    };
  }, [source, ext]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />
      {err && (
        <div className="absolute bottom-2 left-2 right-2 rounded bg-black/70 px-2 py-1 text-[11px] text-white">
          {err}
        </div>
      )}
    </div>
  );
}

