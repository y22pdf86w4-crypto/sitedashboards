// assets/js/login.js
import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";

/**
 * ================== THREE.js - FUNDO ANIMADO ==================
 */
let w = window.innerWidth;
let h = window.innerHeight;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
camera.position.z = 11;
camera.position.y = -5;
camera.position.x = -7;
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(w, h);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0xffffff, 1); // fundo branco

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enableZoom = false;
controls.minPolarAngle = Math.PI / 3;
controls.maxPolarAngle = Math.PI / 2.2;

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform float uCircleSpacing;
  uniform float uLineWidth;
  uniform float uSpeed;
  uniform float uFadeEdge;
  uniform vec3 uCameraPosition;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vec2 center = vec2(0.5, 0.5);
    vec2 uv = vUv;
    float dist = distance(uv, center);

    float animatedDist = dist - uTime * uSpeed;
    float circle = mod(animatedDist, uCircleSpacing);
    float distFromEdge = min(circle, uCircleSpacing - circle);

    float aaWidth = length(vec2(dFdx(animatedDist), dFdy(animatedDist))) * 2.0;
    float lineAlpha = 1.0 - smoothstep(uLineWidth - aaWidth, uLineWidth + aaWidth, distFromEdge);

    vec3 baseColor = mix(vec3(1.0), vec3(0.0), lineAlpha);

    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(uCameraPosition - vPosition);

    vec3 lightDir = normalize(vec3(5.0, 10.0, 5.0));
    float NdotL = max(dot(normal, lightDir), 0.0);

    vec3 diffuse = baseColor * (0.5 + 0.5 * NdotL);

    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
    vec3 specular = vec3(1.0) * spec * 0.8;

    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.0);
    vec3 fresnelColor = vec3(1.0) * fresnel * 0.3;

    vec3 finalColor = diffuse + specular + fresnelColor;

    float edgeFade = smoothstep(0.5 - uFadeEdge, 0.5, dist);
    float alpha = 1.0 - edgeFade;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const floorGeometry = new THREE.CircleGeometry(20, 200);
const floorMaterial = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms: {
    uTime: { value: 0.0 },
    uCircleSpacing: { value: 0.06 },
    uLineWidth: { value: 0.02 },
    uSpeed: { value: 0.003 },
    uFadeEdge: { value: 0.2 },
    uCameraPosition: { value: new THREE.Vector3() },
  },
  side: THREE.DoubleSide,
  transparent: true,
});

const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1;
floor.receiveShadow = true;
scene.add(floor);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

let time = 0;

function animate() {
  requestAnimationFrame(animate);

  time += 0.016;
  floorMaterial.uniforms.uTime.value = time;

  const cameraWorldPos = new THREE.Vector3();
  camera.getWorldPosition(cameraWorldPos);
  floorMaterial.uniforms.uCameraPosition.value.copy(cameraWorldPos);

  renderer.render(scene, camera);
  controls.update();
}

animate();

window.addEventListener("resize", () => {
  w = window.innerWidth;
  h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

/**
 * ================== LÓGICA DE LOGIN VISYA ==================
 */

// Elementos do formulário
const form = document.getElementById("visyaLoginForm");
const userInput = document.getElementById("loginUser");
const passInput = document.getElementById("loginPass");
const button = document.getElementById("loginButton");
const loaderOverlay = document.getElementById("loaderOverlay");

// Helper para controlar o overlay de loading
function setLoading(isLoading) {
  if (loaderOverlay) {
    loaderOverlay.style.display = isLoading ? "flex" : "none";
  }
  if (button) {
    button.disabled = isLoading;
  }
}

// Evita erro se o form não for encontrado por algum motivo
if (form && userInput && passInput) {
  // Envio do formulário
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = (userInput.value || "").trim();
    const senha = (passInput.value || "").trim();

    if (!email || !senha) {
      alert("Preencha usuário e senha.");
      return;
    }

    setLoading(true);

    try {
      // loginSistema vem do seu global.js e chama /auth/login no backend
      const user = await loginSistema(email, senha);

      if (!user) {
        // loginSistema retornou null -> credenciais inválidas ou erro na API
        alert("Usuário ou senha inválidos.");
        return;
      }

      // Opcional: checar se o usuário tem pelo menos uma empresa vinculada
      let atual = null;
      if (typeof getUsuarioAtual === "function") {
        atual = getUsuarioAtual();
      }

      if (!atual || !Array.isArray(atual.empresas) || atual.empresas.length === 0) {
        alert("Seu usuário não possui nenhuma empresa vinculada. Contate o administrador.");
        return;
      }

      // Sucesso: token + dados já estão no storage pelo loginSistema
      // Redireciona para o app com sidebar fixo
      window.location.href = "./assets/html/app.html";
    } catch (e) {
      console.error("Erro no login VISYA:", e);
      alert("Erro ao tentar autenticar. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  });
}