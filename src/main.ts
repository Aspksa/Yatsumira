import "./style.css";

const canvas = document.querySelector<HTMLCanvasElement>("#app");
if (!canvas) throw new Error("Canvas element not found");

function resize(): void {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas!.width = Math.round(window.innerWidth * pixelRatio);
  canvas!.height = Math.round(window.innerHeight * pixelRatio);
}

window.addEventListener("resize", resize);
resize();
