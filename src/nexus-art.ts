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
    ctx.globalAlpha = i===12 ? .30 : i >= 10 ? .16 : .07;
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
    // Fine hierarchy filaments from each fan block toward the outer orbit.
    // Deliberately restrained: the sample uses hairline connections, not a bright spiderweb.
    for(let cluster=0;cluster<4;cluster++){
      const angle=sector.start+spread*(cluster+.5)/4;
      const source=230+(cluster%3)*8;
      const stop=rMax-20;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle)*source,Math.sin(angle)*source);
      ctx.quadraticCurveTo(Math.cos(angle+.018)*300,Math.sin(angle+.018)*300,
        Math.cos(angle)*stop,Math.sin(angle)*stop);
      ctx.strokeStyle=sector.color;ctx.globalAlpha=.09;
      ctx.lineWidth=.65;ctx.stroke();
      if(quality>.65){
        const endX=Math.cos(angle)*stop,endY=Math.sin(angle)*stop;
        if(visible(endX,endY)){
          ctx.beginPath();ctx.arc(endX,endY,1.25,0,PI2);
          ctx.fillStyle=sector.color;ctx.globalAlpha=.43;ctx.fill();
        }
      }
    }
    ctx.globalAlpha=1;
    // Short guide arcs at the inner cluster edge.
    ctx.beginPath();
    ctx.arc(0,0,272,sector.start+Math.min(.05,spread*.1),sector.end-Math.min(.05,spread*.1));
    ctx.strokeStyle=sector.color;
    ctx.globalAlpha=.18;
    ctx.lineWidth=.65;ctx.stroke();
    ctx.globalAlpha=1;
  }

  // Subtle inner signal filaments occupy the otherwise empty 0.15–0.36 radial band.
  // They are decorative and never presented as actual knowledge relationships.
  if(quality>.55){
    ctx.save();ctx.lineWidth=.55;ctx.setLineDash([1.4,5]);
    for(let i=0;i<32;i++){
      const angle=(i+.3)*PI2/32;
      const from=83+(i%4)*3;
      const to=135+(i%3)*7;
      const x1=Math.cos(angle)*from,y1=Math.sin(angle)*from;
      const x2=Math.cos(angle)*to,y2=Math.sin(angle)*to;
      if(!visible(x2,y2,20))continue;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
      ctx.strokeStyle=i%5===0?"#8bdaca":"#618e97";
      ctx.globalAlpha=i%5===0?.18:.095;ctx.stroke();
      if(i%7===0){
        ctx.setLineDash([]);ctx.fillStyle="#7ddacc";ctx.globalAlpha=.28;
        ctx.fillRect(x2-1,y2-1,2,2);ctx.setLineDash([1.4,5]);
      }
    }
    ctx.restore();
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
  // Reference proportions: delicate empty halo and a compact 27-unit nucleus.
  for(const [radius,alpha] of [[48,.22],[64,.18],[83,.105]] as const){
    ctx.beginPath();ctx.arc(0,0,radius,0,TAU);
    ctx.strokeStyle="#4d8f93";ctx.lineWidth=.8;ctx.globalAlpha=alpha;ctx.stroke();
  }
  ctx.globalAlpha=1;
  const halo=ctx.createRadialGradient(0,0,0,0,0,31);
  halo.addColorStop(0,"#0c272a");halo.addColorStop(.68,"#061517");halo.addColorStop(1,"#02090b");
  ctx.beginPath();ctx.arc(0,0,27,0,TAU);
  ctx.fillStyle=halo;ctx.fill();ctx.strokeStyle="#55d8ca";ctx.lineWidth=1.3;ctx.globalAlpha=.87;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,21,0,TAU);
  ctx.strokeStyle="#85bcb7";ctx.globalAlpha=.28;ctx.lineWidth=.8;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0,10.5,-Math.PI/2+time*.14,Math.PI*1.1+time*.14);
  ctx.strokeStyle="#bbf8ed";ctx.globalAlpha=.9;ctx.lineWidth=1.3;
  if(active){ctx.shadowColor="#68e9d8";ctx.shadowBlur=7;}
  ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;
  ctx.fillStyle="#c1efe6";ctx.font="9px "+FONT;
  ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("八",0,0);
  ctx.fillStyle="#81c9c0";ctx.font="8px "+FONT;ctx.fillText("YATSUMIRA",0,43);
  ctx.fillStyle="#557d80";ctx.font="6.5px "+FONT;ctx.fillText("NEXUS / CORE",0,57);
  ctx.restore();
}

/** Small distinct vector glyphs for orbital node rings (no image fonts or downloads). */
export function drawNexusGlyph(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,variant:number,color:string):void {
  ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=.8;
  const n=((variant%8)+8)%8;
  if(n===0){ctx.beginPath();ctx.moveTo(-r*.38,0);ctx.lineTo(r*.38,0);ctx.moveTo(0,-r*.38);ctx.lineTo(0,r*.38);ctx.stroke();}
  else if(n===1){ctx.strokeRect(-r*.33,-r*.27,r*.66,r*.54);ctx.beginPath();ctx.moveTo(-r*.22,-r*.10);ctx.lineTo(r*.20,-r*.10);ctx.stroke();}
  else if(n===2){ctx.beginPath();ctx.moveTo(0,-r*.4);ctx.lineTo(r*.38,r*.30);ctx.lineTo(-r*.38,r*.30);ctx.closePath();ctx.stroke();}
  else if(n===3){ctx.beginPath();ctx.arc(0,0,r*.33,0,PI2);ctx.stroke();ctx.fillRect(-.8,-.8,1.6,1.6);}
  else if(n===4){ctx.beginPath();ctx.moveTo(-r*.36,-r*.2);ctx.lineTo(0,r*.36);ctx.lineTo(r*.36,-r*.2);ctx.stroke();}
  else if(n===5){ctx.beginPath();ctx.moveTo(-r*.34,-r*.33);ctx.lineTo(r*.34,r*.33);ctx.moveTo(r*.34,-r*.33);ctx.lineTo(-r*.34,r*.33);ctx.stroke();}
  else if(n===6){ctx.beginPath();ctx.arc(-r*.17,-r*.07,r*.16,0,PI2);ctx.arc(r*.17,r*.07,r*.16,0,PI2);ctx.stroke();}
  else {ctx.beginPath();ctx.moveTo(-r*.28,0);ctx.lineTo(0,-r*.38);ctx.lineTo(r*.28,0);ctx.lineTo(0,r*.38);ctx.closePath();ctx.stroke();}
  ctx.restore();
}
export function drawNexusGroupShapes(ctx:CanvasRenderingContext2D,mode:"rings"|"circle"|"hex"|"force",groups:readonly {x:number;y:number;radius:number;sector:number;label:string;count:number}[],colors:readonly string[],zoom:number):void {
  if(mode==="rings"){
    if(zoom<.82)return;
    ctx.save();
    ctx.textAlign="center";ctx.textBaseline="middle";
    const labelBoxes: {left:number;right:number;top:number;bottom:number}[]=[];
    for(const group of groups){
      const demo=(group as {id?:string}).id?.startsWith("demo-") ?? false;
      if(demo&&zoom<.97)continue;
      const color=colors[group.sector]||"#69b9b2";
      ctx.strokeStyle=color;ctx.globalAlpha=.25;ctx.lineWidth=.8;
      if(!demo){ctx.beginPath();ctx.arc(group.x,group.y,Math.max(10,group.radius),0,PI2);ctx.stroke();}
      ctx.fillStyle=color;ctx.globalAlpha=demo?.48:.88;ctx.font=(demo?"7px ":"8px ")+"Consolas, monospace";
      const label=group.label.slice(0,25);
      const textY=group.y-group.radius-(demo?3:10);
      const halfWidth=Math.min(57.5,ctx.measureText(label).width/2);
      const box={left:group.x-halfWidth-4,right:group.x+halfWidth+4,top:textY-7,bottom:textY+7};
      const collides=labelBoxes.some(previous=>box.left<previous.right&&box.right>previous.left&&box.top<previous.bottom&&box.bottom>previous.top);
      if(!collides || !demo){
        ctx.fillText(label,group.x,textY,115);
        labelBoxes.push(box);
      }
      if(!demo&&zoom>1.85){ctx.font="7px Consolas, monospace";ctx.globalAlpha=.6;ctx.fillText(group.count+" записей",group.x,group.y+group.radius+8,90);}
    }
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.lineWidth=.8;ctx.textAlign="center";ctx.textBaseline="middle";
  for(const group of groups){
    const color=colors[group.sector]||"#69b9b2";
    ctx.beginPath();
    const radius=mode==="hex"?Math.max(38,group.radius):Math.max(31,group.radius);
    if(mode==="hex"){
      for(let k=0;k<6;k++){const angle=Math.PI/3*k-Math.PI/6;const x=group.x+Math.cos(angle)*radius,y=group.y+Math.sin(angle)*radius;k===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
      ctx.closePath();
    }else ctx.arc(group.x,group.y,radius,0,PI2);
    ctx.strokeStyle=color;ctx.globalAlpha=.28;ctx.stroke();
    ctx.fillStyle=color;ctx.globalAlpha=.05;ctx.fill();
    if(zoom>1.12){
      ctx.fillStyle=color;ctx.globalAlpha=.74;ctx.font="8px Consolas, monospace";
      ctx.fillText(group.label.slice(0,23),group.x,group.y-radius-13,Math.max(75,radius*2));
    }
  }
  ctx.restore();
}
