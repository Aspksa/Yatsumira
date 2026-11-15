import type { NexusLayout } from "./nexus";

const PI2 = Math.PI * 2;
const FONT = 'Consolas, "Segoe UI", monospace';

export function drawNexusScaffold(
  ctx: CanvasRenderingContext2D,
  layout: NexusLayout,
  time: number,
  quality: number,
  scale: number,
  bounds: {left:number;top:number;right:number;bottom:number}
): void {
  const rMax = layout.rings[layout.rings.length - 1];
  const visible = (x:number,y:number,margin=10) =>
    x >= bounds.left-margin && x <= bounds.right+margin &&
    y >= bounds.top-margin && y <= bounds.bottom+margin;

  // Almost-black circular atlas: several finely separated orbital guides.
  ctx.lineWidth = .7;
  for (const [i,r] of [69,82,102,128,146,170,192,214,236,258,307,330,rMax+12,rMax+22].entries()) {
    if (r*scale < 4) continue;
    ctx.beginPath();
    ctx.arc(0,0,r,0,PI2);
    ctx.strokeStyle = i === 12 ? "#486c72" : "#42616a";
    ctx.globalAlpha = i===12 ? .26 : i >= 10 ? .12 : .075;
    ctx.stroke();
  }
  ctx.globalAlpha=1;

  for (let i=0;i<layout.sectors.length;i++) {
    const sector = layout.sectors[i];
    const mid=(sector.start+sector.end)/2;
    const spread=sector.end-sector.start;
    const from=104;
    const to=rMax+12;
    const boundaries=[sector.start-.012, sector.end+.012];
    ctx.strokeStyle=sector.color;
    for (const angle of boundaries) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle)*from,Math.sin(angle)*from);
      ctx.lineTo(Math.cos(angle)*to,Math.sin(angle)*to);
      ctx.globalAlpha=.075;
      ctx.lineWidth=.7;ctx.stroke();
    }
    // Fine-spoked connectors indicate hierarchy; actual semantic links are drawn separately.
    const laneCount=5;
    for(let lane=0;lane<laneCount;lane++){
      const angle=mid+(lane-(laneCount-1)/2)*Math.min(.034,spread*.12);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle)*264,Math.sin(angle)*264);
      ctx.lineTo(Math.cos(angle)*327,Math.sin(angle)*327);
      ctx.globalAlpha=.10;
      ctx.stroke();
    }
    ctx.globalAlpha=1;

    // Labels live in the open band between inner radial clusters and the outer icons.
    const lx=Math.cos(mid)*290,ly=Math.sin(mid)*290;
    if(visible(lx,ly,75)) {
      ctx.fillStyle=sector.color;
      ctx.globalAlpha=.78;
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.font="10px "+FONT;
      ctx.fillText(sector.title.toUpperCase(),lx,ly,Math.min(95,Math.max(44,spread*230)));
      ctx.globalAlpha=.5;
      ctx.font="7px "+FONT;
      const subX=Math.cos(mid)*307,subY=Math.sin(mid)*307;
      ctx.fillText(String(sector.count).padStart(3,"0")+" / NODES",subX,subY,85);
    }
    // Short guide arcs at the inner cluster edge.
    ctx.beginPath();
    ctx.arc(0,0,272,sector.start+Math.min(.05,spread*.1),sector.end-Math.min(.05,spread*.1));
    ctx.strokeStyle=sector.color;
    ctx.globalAlpha=.18;
    ctx.lineWidth=.65;ctx.stroke();
    ctx.globalAlpha=1;
  }

  // Atmospheric fine dust and tiny endpoint sparks; restrained at low FPS.
  if(quality>.65) {
    for (let i=0;i<58;i++) {
      const angle=i*2.399963229728653;
      const radius=88+(i*67)%244;
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;
      if(!visible(x,y))continue;
      const twinkle=.13+.15*(1+Math.sin(time*.62+i*.8))*.5;
      ctx.fillStyle="#a2e4dd";ctx.globalAlpha=twinkle;
      ctx.fillRect(x,y,.95,.95);
    }
    ctx.globalAlpha=1;
  }
}

export function drawNexusCore(ctx: CanvasRenderingContext2D, time:number, active:boolean):void {
  const TAU=Math.PI*2;
  ctx.save();
  ctx.lineWidth=.8;
  for(const [r,opacity] of [[42,.33],[58,.22],[73,.12]] as const) {
    ctx.beginPath();ctx.arc(0,0,r,0,TAU);
    ctx.strokeStyle="#6db4b2";ctx.globalAlpha=opacity;ctx.stroke();
  }
  ctx.globalAlpha=1;
  const halo=ctx.createRadialGradient(0,0,5,0,0,40);
  halo.addColorStop(0,"#113131");halo.addColorStop(.5,"#071819");halo.addColorStop(1,"#010708");
  ctx.beginPath();ctx.arc(0,0,34,0,TAU);
  ctx.fillStyle=halo;ctx.fill();
  ctx.lineWidth=1.5;ctx.strokeStyle="#69dccd";ctx.globalAlpha=.85;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,26,0,TAU);
  ctx.strokeStyle="#5f8f8c";ctx.globalAlpha=.38;ctx.lineWidth=.8;ctx.stroke();
  ctx.globalAlpha=1;
  ctx.beginPath();ctx.arc(0,0,12,-Math.PI/2+time*.19,Math.PI*1.2+time*.19);
  ctx.strokeStyle="#b8faf0";ctx.lineWidth=1.3;
  if(active){ctx.shadowColor="#68e9d8";ctx.shadowBlur=9;}
  ctx.stroke();ctx.shadowBlur=0;
  ctx.fillStyle="#c4ebe3";ctx.font='9px '+FONT;
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("八",0,0);
  ctx.font="8px "+FONT;ctx.fillStyle="#8fcbc5";ctx.fillText("YATSUMIRA",0,49);
  ctx.font="6.5px "+FONT;ctx.fillStyle="#5d8587";ctx.fillText("NEXUS / CORE",0,63);
  ctx.restore();
}
