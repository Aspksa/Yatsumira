import { drawNexusCore, drawNexusScaffold, drawNexusGlyph, drawNexusGroupShapes } from "./nexus-art";
import { placeNexus, type NexusMode, type NexusPlacement, type NexusPoint } from "./nexus-modes";
export type NexusKind = "document" | "fact" | "agent";
export type NexusNode = {
  id: string; title: string; kind: NexusKind; sector: number;
  ring: number; importance: number; x: number; y: number; radius: number;
  actual?: boolean; content?: string; source?: string; verified?: boolean;
  group?: string; createdAt?: string;
};
export type NexusSector = { title: string; count: number; start: number; end: number; color: string };
export type NexusLayout = { nodes: NexusNode[]; sectors: NexusSector[]; rings: number[] };
export type NexusStats = { fps: number; drawn: number; total: number; detail: string; knowledge: number; links: number };
export type KnowledgeRecord = { id:string; title:string; content:string; sector:number; kind:"fact"|"document"|"agent"; importance:number; source:string; verified:boolean; group?:string; createdAt?:string };
export type KnowledgeLink = { source:string; target:string; kind:string; strength:number };

const TWO_PI = Math.PI * 2;
const RINGS = [148, 170, 192, 214, 236, 258, 342, 362];
const CATALOG = [
  { title: "Память", color: "#56ded0", count: 108 },
  { title: "Знания", color: "#8fcbe8", count: 168 },
  { title: "Агенты", color: "#b5a2f0", count: 76 },
  { title: "Анализ", color: "#d9ac79", count: 124 },
  { title: "Проекты", color: "#75d1a7", count: 86 },
  { title: "Связи", color: "#81b1cc", count: 142 },
  { title: "Архив", color: "#c7b2a7", count: 112 },
  { title: "Система", color: "#a391df", count: 80 }
] as const;

function hash(seed: number): number {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function kindFor(sector: number, index: number): NexusKind {
  if (sector === 2 && index % 3 === 0) return "agent";
  return index % 4 === 0 ? "document" : "fact";
}
const padding = 0.032;
export function buildNexusLayout(counts: readonly number[] = CATALOG.map(item => item.count)): NexusLayout {
  const safeCounts = CATALOG.map((_, i) => Math.max(0, Math.min(1600, Math.floor(counts[i] ?? 0))));
  const total = safeCounts.reduce((a, b) => a + b, 0);
  const safeTotal = total || 1;
  const available = TWO_PI - CATALOG.length * padding;
  let cursor = -Math.PI / 2;
  const sectors: NexusSector[] = CATALOG.map((item, i) => {
    // Minimum 0.10 radians keeps empty sectors discoverable.
    const span = available * (safeCounts[i] / safeTotal);
    const start = cursor + padding / 2;
    cursor += span + padding;
    return { title: item.title, color: item.color, count: safeCounts[i], start, end: cursor - padding / 2 };
  });
  // Add outer rings only when newly learned records exceed available orbital capacity.
  const rings=[...RINGS];
  while(sectors.some(sector=>sector.count>rings.reduce((total,r)=>total+Math.max(0,Math.floor(r*(sector.end-sector.start)/11.5)),0)) && rings.length<96) {
    rings.push(rings[rings.length-1]+38);
  }
  const nodes: NexusNode[] = [];
  for (let sectorIndex = 0; sectorIndex < sectors.length; sectorIndex++) {
    const sector = sectors[sectorIndex];
    const span = sector.end - sector.start;
    const bins: { count: number; radius: number }[] = rings.map((radius) => ({
      count: 0, radius
    }));
    // Guarantee at least 11.5 world units between nodes, including outer icon diameter.
    const capacities = rings.map(r => Math.max(0, Math.floor(r * span / 11.5)));
    let remaining = sector.count;
    let next = 0;
    while (remaining > 0) {
      let found = false;
      for (let attempt = 0; attempt < rings.length; attempt++) {
        const ringIndex = (next + attempt) % rings.length;
        if (bins[ringIndex].count < capacities[ringIndex]) {
          bins[ringIndex].count++;
          remaining--;
          next = (ringIndex + 1) % rings.length;
          found = true;
          break;
        }
      }
      if (!found) break; // Avoid collisions rather than overfilling a ring.
    }
    let serial = 0;
    for (let ringIndex = 0; ringIndex < bins.length; ringIndex++) {
      const bin = bins[ringIndex];
      for (let j = 0; j < bin.count; j++) {
        const fraction = (j + .5) / bin.count;
        const angle = sector.start + span * fraction;
        const importance = 1 + (hash(sectorIndex * 997 + serial * 79) > .90 ? 2 :
          hash(sectorIndex * 113 + serial * 53) > .65 ? 1 : 0);
        const radius = importance === 3 ? 4.5 : importance === 2 ? 3.3 : 2.2;
        const kind = kindFor(sectorIndex, serial);
        const id = "n-" + sectorIndex + "-" + serial;
        nodes.push({
          id, kind, sector: sectorIndex, ring: ringIndex, importance,
          title: sector.title + " · " + (kind === "document" ? "документ" : kind === "agent" ? "агент" : "факт") + " " + (serial + 1),
          radius, x: Math.cos(angle) * bin.radius, y: Math.sin(angle) * bin.radius
        });
        serial++;
      }
    }
  }
  return { nodes, sectors, rings };
}

export class NexusView {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private layout = buildNexusLayout();
  private mode: NexusMode = "rings";
  private placement: NexusPlacement = placeNexus(this.layout,"rings");
  private transitioning = false;
  private transitionStart = 0;
  private previousPositions = new Map<string,NexusPoint>();
  private readonly transitionLength = 360;
  private realNodes: NexusNode[] = [];
  private links: {a:NexusNode;b:NexusNode;strength:number}[] = [];
  private readonly onSelect: (node: NexusNode) => void;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private baseScale = 1;
  private zoom = 1;
  private targetZoom = 1;
  private panX = 0;
  private panY = 0;
  private targetPanX = 0;
  private targetPanY = 0;
  private hovered: NexusNode | null = null;
  private pressed: { x:number; y:number; panX:number; panY:number; moved:boolean; id:number } | null = null;
  private lastFrame = 0;
  private fps = 60;
  private quality = 1;
  private nextQualityCheck = 0;
  private animationTime = 0;
  private active = true;
  private readonly reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private selectedId: string | null = null;
  speed = 1;
  stats: NexusStats = { fps: 60, drawn: 0, total: 0, detail:"normal", knowledge:0, links:0 };

  constructor(canvas: HTMLCanvasElement, onSelect: (node: NexusNode) => void) {
    const context = canvas.getContext("2d", { alpha:false });
    if (!context) throw new Error("Canvas 2D unavailable");
    this.canvas = canvas; this.context = context; this.onSelect = onSelect;
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role","button");
    this.canvas.setAttribute("aria-label","Интерактивная карта NEXUS: колесо — масштаб, перетаскивание — перемещение, Enter — карточка узла");
    this.canvas.addEventListener("wheel",event => this.wheel(event), { passive:false });
    this.canvas.addEventListener("pointerdown", event => this.down(event));
    this.canvas.addEventListener("pointermove", event => this.move(event));
    this.canvas.addEventListener("pointerup", event => this.up(event));
    this.canvas.addEventListener("pointercancel", () => this.cancelDrag());
    this.canvas.addEventListener("lostpointercapture", () => this.cancelDrag());
    this.canvas.addEventListener("pointerleave", () => { this.hovered = null; this.canvas.style.cursor="grab"; });
    this.canvas.addEventListener("keydown",event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const node = this.hovered || this.realNodes[0] || this.layout.nodes.find(item => item.importance === 3) || this.layout.nodes[0];
        if (node) this.select(node);
      } else if (event.key === "+" || event.key === "=") {
        this.targetZoom = Math.min(5, this.targetZoom * 1.2);
      } else if (event.key === "-") {
        this.targetZoom = Math.max(.55, this.targetZoom / 1.2);
      }
    });
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(canvas);
    window.addEventListener("resize", () => this.resize(),{passive:true});
    document.addEventListener("visibilitychange", () => {
      this.active = !document.hidden;
      this.lastFrame = 0;
      if (this.active) requestAnimationFrame(t=>this.frame(t));
    });
    this.resize();
    requestAnimationFrame(t=>this.frame(t));
  }
  get nodes(): readonly NexusNode[] { return this.layout.nodes; }
  get currentMode(): NexusMode { return this.mode; }
  setMode(mode:NexusMode):void {
    if(mode===this.mode)return;
    this.previousPositions=new Map(this.layout.nodes.map(node=>[node.id,this.position(node)]));
    this.mode=mode;
    this.placement=placeNexus(this.layout,mode,this.links);
    this.transitionStart=performance.now();
    this.transitioning=!this.reducedMotion;
    this.canvas.dataset.mode=mode;
    this.resize();
  }
  private position(node:NexusNode):NexusPoint {
    const target=this.placement.positions.get(node.id)??{x:node.x,y:node.y};
    if(!this.transitioning)return target;
    const progress=Math.min(1,(performance.now()-this.transitionStart)/this.transitionLength);
    if(progress>=1){this.transitioning=false;return target;}
    const previous=this.previousPositions.get(node.id)??{x:node.x,y:node.y};
    const ease=1-Math.pow(1-progress,3);
    return {x:previous.x+(target.x-previous.x)*ease,y:previous.y+(target.y-previous.y)*ease};
  }
  selectById(id:string):void { const node=this.layout.nodes.find(item=>item.id===id);if(node)this.select(node); }
  connectedTo(node:NexusNode):{node:NexusNode;strength:number}[] {
    return this.links.flatMap(link=>link.a.id===node.id?[{node:link.b,strength:link.strength}]:
      link.b.id===node.id?[{node:link.a,strength:link.strength}]:[]);
  }

  get scale(): number { return this.zoom; }
  get targetScale(): number { return this.targetZoom; }
  resetView(): void {
    this.targetZoom=1; this.targetPanX=0;this.targetPanY=0;
  }
  setCounts(counts: readonly number[]): void {
    this.layout = buildNexusLayout(counts);
    this.selectedId = null;
  }

  setKnowledge(records: readonly KnowledgeRecord[], links: readonly KnowledgeLink[]): void {
    const clean=records.filter(record=>Number.isInteger(record.sector)&&record.sector>=0&&record.sector<8);
    const base=[108,168,76,124,86,142,112,80];
    const counts=base.map((count,sector)=>count+clean.filter(row=>row.sector===sector).length);
    const layout=buildNexusLayout(counts);
    const mapping=new Map<string,NexusNode>();
    for(let sector=0;sector<8;sector++){
      const positions=layout.nodes.filter(node=>node.sector===sector);
      const incoming=clean.filter(record=>record.sector===sector);
      positions.sort((a,b)=>b.ring-a.ring||a.id.localeCompare(b.id));
      for(let i=0;i<Math.min(incoming.length,positions.length);i++){
        const location=positions[i],record=incoming[i];
        location.id=record.id;location.title=record.title;location.kind=record.kind;
        location.importance=Math.min(3,Math.max(1,record.importance));
        location.radius=location.importance===3?5:location.importance===2?3.6:3;
        location.content=record.content;location.actual=true;
        location.group=record.group || record.title.split(" ").slice(0,2).join(" ") || "Записи";
        location.createdAt=record.createdAt;
        location.verified=record.verified;location.source=record.source;
        mapping.set(record.id,location);
      }
    }
    this.layout=layout;this.realNodes=[...mapping.values()];
    this.links=links.slice(-4000).flatMap(link=>{
      const a=mapping.get(link.source),b=mapping.get(link.target);
      return a&&b?[{a,b,strength:link.strength}]:[];
    });
    this.placement=placeNexus(this.layout,this.mode,this.links);
    this.transitioning=false;this.resize();
    if(this.selectedId&&!mapping.has(this.selectedId))this.selectedId=null;
  }
  private resize():void {
    const bounds=this.canvas.getBoundingClientRect();
    this.width=Math.max(1,bounds.width); this.height=Math.max(1,bounds.height);
    this.baseScale=Math.max(.025,Math.min(this.width,this.height)*.46/Math.max(360,this.layout.rings[this.layout.rings.length-1]));
    this.dpr=Math.min(devicePixelRatio || 1,2);
    this.canvas.width=Math.max(1,Math.round(this.width*this.dpr));
    this.canvas.height=Math.max(1,Math.round(this.height*this.dpr));
  }
  private get centerY():number { return this.height*.55; }
  private toWorld(x:number,y:number):{x:number;y:number} {
    const s=this.baseScale*this.zoom;
    return {x:(x-this.width/2-this.panX)/s,y:(y-this.centerY-this.panY)/s};
  }
  private toScreen(x:number,y:number):{x:number;y:number} {
    const s=this.baseScale*this.zoom;
    return {x:this.width/2+this.panX+x*s,y:this.centerY+this.panY+y*s};
  }
  private wheel(event:WheelEvent):void {
    event.preventDefault();
    const rect=this.canvas.getBoundingClientRect();
    const x=event.clientX-rect.left, y=event.clientY-rect.top;
    const old=this.targetZoom;
    this.targetZoom=Math.max(.55,Math.min(5,old*Math.exp(-event.deltaY*.0011)));
    const ratio=this.targetZoom/old;
    this.targetPanX=x-this.width/2-(x-this.width/2-this.targetPanX)*ratio;
    this.targetPanY=y-this.centerY-(y-this.centerY-this.targetPanY)*ratio;
  }
  private down(event:PointerEvent):void {
    if(event.button!==0)return;
    const rect=this.canvas.getBoundingClientRect();
    this.pressed={x:event.clientX-rect.left,y:event.clientY-rect.top,
      panX:this.targetPanX,panY:this.targetPanY,moved:false,id:event.pointerId};
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor="grabbing";
  }
  private move(event:PointerEvent):void {
    const rect=this.canvas.getBoundingClientRect();
    const x=event.clientX-rect.left,y=event.clientY-rect.top;
    if(this.pressed && this.pressed.id===event.pointerId) {
      const dx=x-this.pressed.x,dy=y-this.pressed.y;
      if(Math.hypot(dx,dy)>5)this.pressed.moved=true;
      if(this.pressed.moved){
        this.targetPanX=this.pressed.panX+dx;
        this.targetPanY=this.pressed.panY+dy;
        this.canvas.style.cursor="grabbing";
        return;
      }
    }
    this.hovered=this.hitTest(x,y);
    this.canvas.style.cursor=this.hovered?"pointer":"grab";
  }
  private up(event:PointerEvent):void {
    if(!this.pressed || this.pressed.id!==event.pointerId)return;
    const rect=this.canvas.getBoundingClientRect();
    const click=!this.pressed.moved;
    this.pressed=null;
    if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.style.cursor="grab";
    if(click) {
      const node=this.hitTest(event.clientX-rect.left,event.clientY-rect.top);
      if(node)this.select(node);
    }
  }
  private cancelDrag():void {
    this.pressed=null;
    this.canvas.style.cursor="grab";
  }
  private select(node:NexusNode):void {this.selectedId=node.id;this.onSelect(node);}
  private hitTest(x:number,y:number):NexusNode|null {
    const target=this.toWorld(x,y);
    const tolerance=7/(this.baseScale*this.zoom);
    let closest:NexusNode|null=null,dist=Infinity;
    for(const node of this.layout.nodes){
      const p=this.position(node);
      const dx=p.x-target.x,dy=p.y-target.y;
      const d=dx*dx+dy*dy;
      const radius=Math.max(node.radius+3,tolerance);
      if(d<=radius*radius && d<dist){closest=node;dist=d;}
    }
    return closest;
  }
  private circle(x:number,y:number,r:number,color:string,opacity=1):void {
    const context=this.context;
    context.beginPath(); context.arc(x,y,r,0,TWO_PI);
    context.strokeStyle=color;context.globalAlpha=opacity;context.lineWidth=.75;context.stroke();
    context.globalAlpha=1;
  }
  private frame(time:number):void {
    if(!this.active)return;
    const delta=this.lastFrame ? Math.min(100,time-this.lastFrame):16.667;
    this.lastFrame=time;
    this.fps=this.fps*.92+(1000/Math.max(delta,8))*.08;
    if(time>this.nextQualityCheck){
      this.quality=this.fps<34?.35:this.fps<48?.65:1;
      this.nextQualityCheck=time+1000;
    }
    if(!this.reducedMotion)this.animationTime+=delta*.001*this.speed;
    const smoothing=this.reducedMotion?1:.2;
    this.zoom+=(this.targetZoom-this.zoom)*smoothing;
    this.panX+=(this.targetPanX-this.panX)*smoothing;
    this.panY+=(this.targetPanY-this.panY)*smoothing;
    const ctx=this.context;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.fillStyle="#000";ctx.fillRect(0,0,this.width,this.height);
    const center=this.toScreen(0,0);
    const scale=this.baseScale*this.zoom;
    const maxR=(this.layout.rings[this.layout.rings.length-1]+5)*scale;
    if(center.x+maxR>0 && center.x-maxR<this.width &&
       center.y+maxR>0 && center.y-maxR<this.height){
      const gradient=ctx.createRadialGradient(center.x,center.y,0,center.x,center.y,Math.max(1,maxR*1.05));
      gradient.addColorStop(0,"#071b1c");gradient.addColorStop(.55,"#030b0d");gradient.addColorStop(1,"#000");
      ctx.fillStyle=gradient;
      ctx.fillRect(Math.max(0,center.x-maxR*1.05),Math.max(0,center.y-maxR*1.05),
        maxR*2.1,maxR*2.1);
    }
    ctx.save();
    ctx.translate(center.x,center.y);
    ctx.scale(scale,scale);
    const viewLeft=(-center.x)/scale,viewTop=(-center.y)/scale;
    const viewRight=(this.width-center.x)/scale,viewBottom=(this.height-center.y)/scale;
    if(this.mode==="rings"){
      drawNexusScaffold(ctx,this.layout,this.animationTime,this.quality,scale,{
        left:viewLeft,top:viewTop,right:viewRight,bottom:viewBottom
      });
    }
    const colors=this.layout.sectors.map(sector=>sector.color);
    drawNexusGroupShapes(ctx,this.mode,this.placement.groups,colors,this.zoom);
    // Real knowledge links: emphasize edges connecting the selected node.
    if(this.quality>.35){
      const maxEdges=this.quality>.9?900:200;
      let count=0;
      for(const link of this.links){
        if(count++>=maxEdges)break;
        const a=this.position(link.a),b=this.position(link.b);
        if(Math.max(a.x,b.x)<viewLeft||Math.min(a.x,b.x)>viewRight||
          Math.max(a.y,b.y)<viewTop||Math.min(a.y,b.y)>viewBottom)continue;
        const selected=!!this.selectedId&&(link.a.id===this.selectedId||link.b.id===this.selectedId);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.strokeStyle=selected?"#c3fff0":"#4bd4c4";
        ctx.globalAlpha=selected?.93:Math.min(.25,.06+link.strength*.028);
        ctx.lineWidth=selected?2:.7;
        if(selected&&this.quality>.7){ctx.shadowColor="#6af5da";ctx.shadowBlur=8;}
        ctx.stroke();ctx.shadowBlur=0;
      }
      ctx.globalAlpha=1;
    }
    // Structural association with the topic group (not a semantic fact link).
    if(this.selectedId){
      const chosen=this.layout.nodes.find(item=>item.id===this.selectedId);
      if(chosen?.actual){
        const group=this.placement.groups.find(item=>item.id===chosen.sector+"|"+(chosen.group||"Записи"));
        if(group){
          const p=this.position(chosen);
          ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(group.x,group.y);
          ctx.strokeStyle="#b7d6d0";ctx.globalAlpha=.36;
          ctx.setLineDash([2,4]);ctx.lineWidth=.8;ctx.stroke();ctx.setLineDash([]);
          ctx.beginPath();ctx.arc(group.x,group.y,4,0,TWO_PI);
          ctx.strokeStyle="#7ae7d0";ctx.globalAlpha=.8;ctx.stroke();
          ctx.globalAlpha=1;
        }
      }
    }
    let drawn=0;
    const lod = this.zoom<.70?3:this.zoom<.96?2:1;
    const detail = this.quality<.5?"low":this.quality<.9?"medium":"high";
    for(const node of this.layout.nodes){
      // View-frustum culling before any paths, gradients or style changes.
      const location=this.position(node);
      const nx=location.x,ny=location.y;
      if(nx+7<viewLeft || nx-7>viewRight || ny+7<viewTop || ny-7>viewBottom)continue;
      if(!node.actual && lod===3 && node.importance===1)continue;
      if(!node.actual && lod===2 && node.importance===1 && node.ring%2===0)continue;
      if(!node.actual && this.quality<.5 && node.importance===1 && node.ring%2===0)continue;
      const color=this.layout.sectors[node.sector].color;
      const selected=node.id===this.selectedId;
      const hovered=node.id===this.hovered?.id;
      const pulse=this.reducedMotion||this.quality<.9?0:Math.sin(this.animationTime*1.5+node.ring+node.sector)*.15;
      const outer=this.mode==="rings"&&node.ring>=6;
      const r=(outer?Math.max(5.2,node.radius+1.6):node.actual?Math.max(2.7,node.radius):this.mode==="rings"?Math.min(1.9,node.radius):Math.min(2.1,node.radius))+(selected?2:hovered?1.3:0);
      ctx.globalAlpha=node.actual?1:Math.max(outer?.56:.34,outer?.65+pulse*.3:.43+pulse);
      ctx.strokeStyle=color;ctx.fillStyle=color;
      if((selected||hovered||node.actual) && this.quality>.65){
        ctx.shadowBlur=selected?14:7;ctx.shadowColor=color;
      }
      if(this.mode==="rings"&&!outer&&!node.actual&&this.quality>=.65&&this.zoom<2.3){
        // Decorative microcells increase apparent density without creating false knowledge nodes.
        // Coordinates are deterministic and radial, preserving the photographic reference's fan texture.
        const angle=Math.atan2(ny,nx);
        const radialX=Math.cos(angle),radialY=Math.sin(angle);
        const tangentX=-radialY,tangentY=radialX;
        ctx.globalAlpha=.35;
        for(let cell=0;cell<6;cell++){
          const along=(cell%3-1)*4.0;
          const across=(Math.floor(cell/3)*2-1)*3.1;
          const px=nx+radialX*along+tangentX*across;
          const py=ny+radialY*along+tangentY*across;
          ctx.fillRect(px-.68,py-.68,1.36,1.36);
        }
        ctx.globalAlpha=node.actual?1:Math.max(.34,.43+pulse);
      }
      if(outer){
        // Open-circle icons around the perimeter, as in the reference atlas.
        ctx.beginPath();ctx.arc(nx,ny,r,0,TWO_PI);
        ctx.lineWidth=1.25;ctx.stroke();
        ctx.globalAlpha*=.55;
        ctx.beginPath();ctx.arc(nx,ny,r*.74,0,TWO_PI);
        ctx.lineWidth=.75;ctx.stroke();
        ctx.globalAlpha=node.actual?1:Math.max(.56,.65+pulse*.3);
        ctx.shadowBlur=0;
        ctx.beginPath();ctx.arc(nx,ny,Math.max(1,r*.35),0,TWO_PI);
        if(this.quality>.4&&this.zoom>.72)drawNexusGlyph(ctx,nx,ny,r,node.kind==="agent"?2:node.kind==="document"?1:node.sector,color);
        if(node.actual || selected){
          ctx.beginPath();ctx.arc(nx,ny,r+2.2,0,TWO_PI);
          ctx.globalAlpha=.56;ctx.lineWidth=.8;ctx.stroke();
        }
      }else{
        // Compact rectilinear points form dense radial data blocks.
        ctx.fillRect(nx-r*.48,ny-r*.48,r*.96,r*.96);
        if(node.actual || selected || (node.importance===3 && this.zoom>1.1)){
          ctx.shadowBlur=0;
          ctx.beginPath();ctx.arc(nx,ny,r+1.5,0,TWO_PI);
          ctx.lineWidth=.65;ctx.globalAlpha=.63;ctx.stroke();
        }
      }
      ctx.shadowBlur=0;ctx.globalAlpha=1;
      if(this.zoom>2.15&&(node.actual||selected||hovered||(this.zoom>3.3&&node.importance===3))){
        ctx.font="8px Consolas, monospace";ctx.textAlign="center";ctx.textBaseline="middle";
        ctx.fillStyle=color;ctx.globalAlpha=node.actual?.93:.55;
        ctx.fillText(node.title.slice(0,28),nx,ny-r-9,120);
        ctx.globalAlpha=1;
      }
      if(selected&&node.actual&&this.zoom>3.2&&node.content){
        ctx.font="7px Consolas, monospace";ctx.textAlign="center";
        ctx.fillStyle="#a1c6c0";ctx.globalAlpha=.77;
        ctx.fillText(node.content.slice(0,55),nx,ny+r+14,145);
        ctx.globalAlpha=1;
      }
      drawn++;
    }
    // Precise concentric core occupies the quiet center of the map.
    if(this.mode==="rings"&&viewLeft<78&&viewRight>-78&&viewTop<78&&viewBottom>-78){
      drawNexusCore(ctx,this.animationTime,this.quality>.65);
    }
    ctx.restore();
    this.stats={fps:Math.round(this.fps),drawn,total:this.layout.nodes.length,detail,knowledge:this.realNodes.length,links:this.links.length};
    this.canvas.dataset.rendered=String(drawn);
    this.canvas.dataset.total=String(this.layout.nodes.length);
    this.canvas.dataset.quality=detail;
    this.canvas.dataset.mode=this.mode;
    this.canvas.dataset.groupCount=String(this.placement.groups.length);
    this.canvas.dataset.zoom=this.zoom.toFixed(3);
    this.canvas.dataset.panX=this.panX.toFixed(1);
    this.canvas.dataset.knowledge=String(this.realNodes.length);
    this.canvas.dataset.links=String(this.links.length);
    requestAnimationFrame(t=>this.frame(t));
  }
}
