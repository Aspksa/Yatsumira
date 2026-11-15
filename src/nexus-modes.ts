import type { NexusLayout, NexusNode } from "./nexus";

export type NexusMode = "rings" | "circle" | "hex" | "force";
export type NexusPoint = {x:number;y:number};
export type NexusGroup = {id:string;label:string;sector:number;count:number;x:number;y:number;radius:number};
export type NexusPlacement = {positions:Map<string,NexusPoint>;groups:NexusGroup[]};
const TAU=Math.PI*2;
const modes:readonly NexusMode[]=["rings","circle","hex","force"];
export function isNexusMode(value:string):value is NexusMode{return modes.some(mode=>mode===value);}
function hash(str:string):number{let a=2166136261;for(let i=0;i<str.length;i++){a^=str.charCodeAt(i);a=Math.imul(a,16777619);}return(a>>>0)/4294967296;}
function anchor(sector:number,index:number,count:number,mode:NexusMode):NexusPoint {
  if(mode==="hex"){
    const a=(-90+sector*45)*Math.PI/180;
    const radius=132+index*72;
    return {x:Math.cos(a)*radius,y:Math.sin(a)*radius};
  }
  if(mode==="circle"){
    const a=(-90+sector*45)*Math.PI/180 + (index-(count-1)/2)*.11;
    const radius=155+index*64;
    return {x:Math.cos(a)*radius,y:Math.sin(a)*radius};
  }
  const a=(-90+sector*45)*Math.PI/180;
  return {x:Math.cos(a)*218,y:Math.sin(a)*218};
}
function nodeGroup(node:NexusNode):string {
  if(node.actual) return node.group?.trim() || "Записи";
  // Demo clusters imitate independent source projects in the supplied reference.
  return ["Группа A","Группа B","Группа C","Группа D"][Math.floor(hash(node.id)*4)];
}
export function placeNexus(layout:NexusLayout,mode:NexusMode,links:readonly {a:NexusNode;b:NexusNode;strength:number}[]=[]):NexusPlacement {
  const positions=new Map<string,NexusPoint>();
  const groups:NexusGroup[]=[];
  if(mode==="rings"){
    // Decorative markers keep the original reference composition.
    for(const node of layout.nodes)positions.set(node.id,{x:node.x,y:node.y});
    // Actual knowledge forms additional clustered blocks rather than scattered dots.
    const bySector=Array.from({length:8},()=>new Map<string,NexusNode[]>());
    for(const node of layout.nodes){
      if(!node.actual)continue;
      const label=nodeGroup(node);
      const existing=bySector[node.sector].get(label)??[];
      existing.push(node);
      bySector[node.sector].set(label,existing);
    }
    for(let sector=0;sector<8;sector++){
      const entries=[...bySector[sector]].sort((a,b)=>a[0].localeCompare(b[0],"ru"));
      const section=layout.sectors[sector];
      const span=section.end-section.start;
      const maxRadius=layout.rings[layout.rings.length-1]-34;
      for(let groupIndex=0;groupIndex<entries.length;groupIndex++){
        const [name,nodes]=entries[groupIndex];
        const layers=Math.max(1,Math.ceil(entries.length/5));
        const layer=Math.floor(groupIndex/5);
        const row=groupIndex%5;
        const columnCount=Math.min(5,entries.length-layer*5);
        const column=Math.min(row,columnCount-1);
        const angle=section.start+span*(column+.5)/columnCount;
        const radius=Math.min(maxRadius,175+layer*54);
        const ox=Math.cos(angle)*radius,oy=Math.sin(angle)*radius;
        const cols=Math.max(1,Math.ceil(Math.sqrt(nodes.length)));
        const gap=9.5;
        nodes.forEach((node,i)=>{
          const tx=(i%cols-(cols-1)/2)*gap;
          const ty=(Math.floor(i/cols)-(Math.ceil(nodes.length/cols)-1)/2)*gap;
          // Block aligns with its radial sector.
          positions.set(node.id,{
            x:ox+Math.cos(angle)*ty-Math.sin(angle)*tx,
            y:oy+Math.sin(angle)*ty+Math.cos(angle)*tx
          });
        });
        groups.push({id:sector+"|"+name,label:name,sector,count:nodes.length,
          x:ox,y:oy,radius:Math.max(14,cols*gap*.7)});
      }
    }
    return {positions,groups};
  }
  const buckets=new Map<string,NexusNode[]>();
  for(const node of layout.nodes){
    const name=nodeGroup(node);
    const key=node.sector+"|"+name;
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key)!.push(node);
  }
  const perSector=Array.from({length:8},()=>[] as [string,NexusNode[]][]);
  const initialCenters=new Map<string,NexusPoint>();
  for(const entry of buckets){perSector[entry[1][0].sector].push(entry);}
  for(let sector=0;sector<8;sector++){
    const entries=perSector[sector].sort((a,b)=>a[0].localeCompare(b[0],"ru"));
    for(let index=0;index<entries.length;index++){
      const [key,nodes]=entries[index];
      const origin=anchor(sector,index,entries.length,mode);
      const name=key.substring(key.indexOf("|")+1);
      const real=nodes.some(node=>node.actual);
      const cellRadius=Math.max(25,Math.min(56,15+Math.sqrt(nodes.length)*3));
      const center={...origin};
      let initialX=center.x,initialY=center.y;
      if(mode==="force"){
        // Seeded, stable starting positions; force relaxation follows below.
        const jitter=(hash(key)-.5)*60;
        center.x+=Math.cos(sector*Math.PI/4)*jitter;
        center.y+=Math.sin(sector*Math.PI/4)*jitter;
        initialX=center.x;initialY=center.y;
      }
      groups.push({id:key,label:name,sector,count:nodes.length,x:center.x,y:center.y,radius:cellRadius});
      initialCenters.set(key,{x:initialX,y:initialY});
      const cols=Math.ceil(Math.sqrt(nodes.length));
      const spacing=Math.min(9,Math.max(3,cellRadius*1.55/Math.max(cols,1)));
      nodes.forEach((node,j)=>{
        const x=j%cols-(cols-1)/2,y=Math.floor(j/cols)-(Math.ceil(nodes.length/cols)-1)/2;
        if(mode==="hex"){
          const hx=(x+(Math.floor(j/cols)%2)*.5)*spacing;
          const hy=y*spacing*.866;
          positions.set(node.id,{x:center.x+hx,y:center.y+hy});
        }else{
          positions.set(node.id,{x:center.x+x*spacing,y:center.y+y*spacing});
        }
      });
      // Demo points remain distinguishable by their stored actual flag.
    }
  }
  if(mode==="force"){
    // Bounded group-level force layout: connected groups attract, unrelated groups repel.
    const active=groups.slice(0,120);
    const byNode=new Map<string,NexusGroup>();
    for(const node of layout.nodes){
      const key=node.sector+"|"+nodeGroup(node);
      const group=active.find(g=>g.id===key);
      if(group)byNode.set(node.id,group);
    }
    for(let iteration=0;iteration<35;iteration++){
      const delta=new Map(active.map(g=>[g.id,{x:0,y:0}]));
      for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
        const a=active[i],b=active[j];
        const dx=a.x-b.x,dy=a.y-b.y,d2=Math.max(200,dx*dx+dy*dy);
        const force=Math.min(9,18000/d2);
        const distance=Math.sqrt(d2);
        delta.get(a.id)!.x+=dx/distance*force;delta.get(a.id)!.y+=dy/distance*force;
        delta.get(b.id)!.x-=dx/distance*force;delta.get(b.id)!.y-=dy/distance*force;
      }
      for(const edge of links.slice(-800)){
        const a=byNode.get(edge.a.id),b=byNode.get(edge.b.id);
        if(!a||!b||a===b)continue;
        const dx=b.x-a.x,dy=b.y-a.y;
        delta.get(a.id)!.x+=dx*.0018;delta.get(a.id)!.y+=dy*.0018;
        delta.get(b.id)!.x-=dx*.0018;delta.get(b.id)!.y-=dy*.0018;
      }
      for(const g of active){
        const v=delta.get(g.id)!;
        g.x+=Math.max(-12,Math.min(12,v.x));g.y+=Math.max(-12,Math.min(12,v.y));
      }
    }
    // Preserve each node's internal offset after moving the cluster center.
    for(const group of active){
      const prefix=group.id+"";
      const nodes=buckets.get(prefix)??[];
      const original=initialCenters.get(prefix) ?? {x:group.x,y:group.y};
      const dx=group.x-original.x,dy=group.y-original.y;
      for(const node of nodes){
        const p=positions.get(node.id);
        if(p){p.x+=dx;p.y+=dy;}
      }
    }
  }
  return {positions,groups};
}
