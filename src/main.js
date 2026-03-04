import * as THREE from "three";
import GUI from "lil-gui";

// Scene
const scene = new THREE.Scene();

// Camera — orthographic for full-screen quad
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Full-screen quad geometry
const geometry = new THREE.PlaneGeometry(2, 2);

// Webcam texture
const video = document.createElement("video");
video.autoplay = true;
video.playsInline = true;
video.muted = true;

const texture = new THREE.VideoTexture(video);
texture.minFilter = THREE.LinearFilter;

navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
  video.srcObject = stream;
  video.play();
  video.addEventListener("loadedmetadata", () => {
    material.uniforms.uVideoAspect.value = video.videoWidth / video.videoHeight;
  });
});

const material = new THREE.ShaderMaterial({
  uniforms: {
    uTexture: { value: texture },
    uResolution: {
      value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    uTime: { value: 0 },
    uVideoAspect: { value: 1.0 },
    uPixelSize: { value: 4.0 },
    uBrightness: { value: 0.0 },
    uContrast: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uTexture;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uVideoAspect;
    uniform float uPixelSize;
    uniform float uBrightness;
    uniform float uContrast;
    varying vec2 vUv;

    // 8x8 Bayer matrix, normalized to [0, 1)
    float bayer8(vec2 pos) {
      int x = int(mod(pos.x, 8.0));
      int y = int(mod(pos.y, 8.0));

      int matrix[64];
      matrix[0]  =  0; matrix[1]  = 32; matrix[2]  =  8; matrix[3]  = 40; matrix[4]  =  2; matrix[5]  = 34; matrix[6]  = 10; matrix[7]  = 42;
      matrix[8]  = 48; matrix[9]  = 16; matrix[10] = 56; matrix[11] = 24; matrix[12] = 50; matrix[13] = 18; matrix[14] = 58; matrix[15] = 26;
      matrix[16] = 12; matrix[17] = 44; matrix[18] =  4; matrix[19] = 36; matrix[20] = 14; matrix[21] = 46; matrix[22] =  6; matrix[23] = 38;
      matrix[24] = 60; matrix[25] = 28; matrix[26] = 52; matrix[27] = 20; matrix[28] = 62; matrix[29] = 30; matrix[30] = 54; matrix[31] = 22;
      matrix[32] =  3; matrix[33] = 35; matrix[34] = 11; matrix[35] = 43; matrix[36] =  1; matrix[37] = 33; matrix[38] =  9; matrix[39] = 41;
      matrix[40] = 51; matrix[41] = 19; matrix[42] = 59; matrix[43] = 27; matrix[44] = 49; matrix[45] = 17; matrix[46] = 57; matrix[47] = 25;
      matrix[48] = 15; matrix[49] = 47; matrix[50] =  7; matrix[51] = 39; matrix[52] = 13; matrix[53] = 45; matrix[54] =  5; matrix[55] = 37;
      matrix[56] = 63; matrix[57] = 31; matrix[58] = 55; matrix[59] = 23; matrix[60] = 61; matrix[61] = 29; matrix[62] = 53; matrix[63] = 21;

      return float(matrix[y * 8 + x]) / 64.0;
    }

    void main() {
      float canvasAspect = uResolution.x / uResolution.y;
      float r = canvasAspect / uVideoAspect;

      // Snap to macro-pixel grid in UV space (DPR-safe)
      vec2 macroCoord = floor(vUv * uResolution / uPixelSize);
      vec2 snappedUv = (macroCoord + 0.5) * uPixelSize / uResolution;

      // Cover: crop video to fill canvas without stretching
      if (r > 1.0) {
        snappedUv.y = (snappedUv.y - 0.5) / r + 0.5;
      } else {
        snappedUv.x = (snappedUv.x - 0.5) * r + 0.5;
      }

      vec4 color = texture2D(uTexture, snappedUv);

      float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      luma = (luma - 0.5) * uContrast + 0.5 + uBrightness;

      vec2 pixelPos = macroCoord;

      float threshold = bayer8(pixelPos);
      float dithered = step(threshold, luma);

      gl_FragColor = vec4(vec3(dithered), 1.0);
    }
  `,
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// Resize handler
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  material.uniforms.uResolution.value.set(
    window.innerWidth,
    window.innerHeight,
  );
});

// GUI
const params = {
  pixelSize: 2,
  brightness: 0,
  contrast: 1,
};

const gui = new GUI();
gui
  .add(params, "pixelSize", 1, 16, 1)
  .name("pixel size")
  .onChange((v) => {
    material.uniforms.uPixelSize.value = v;
  });
gui
  .add(params, "brightness", -0.5, 0.5, 0.01)
  .name("brightness")
  .onChange((v) => {
    material.uniforms.uBrightness.value = v;
  });
gui
  .add(params, "contrast", 0, 3, 0.01)
  .name("contrast")
  .onChange((v) => {
    material.uniforms.uContrast.value = v;
  });

// Render loop
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  material.uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
}

animate();
