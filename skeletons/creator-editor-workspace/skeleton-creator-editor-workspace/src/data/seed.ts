import type { Draft, MediaAsset, Publication } from './types';
export const drafts: Draft[] = [
 { id:'dr-1', title:'AI founder memo', status:'Draft', words:1280, updated:'Today', body:'Opening argument, proof, and clear next action.' },
 { id:'dr-2', title:'Launch story draft', status:'Review', words:860, updated:'Yesterday', body:'A concise narrative for the landing page.' },
 { id:'dr-3', title:'Weekly product note', status:'Published', words:1420, updated:'Mon', body:'Metrics, learnings, and release plan.' }
];
export const mediaAssets: MediaAsset[] = [
 { id:'md-1', title:'Hero gradient still', type:'image', used:true },
 { id:'md-2', title:'Founder audio intro', type:'audio', used:false },
 { id:'md-3', title:'Product demo clip', type:'video', used:true }
];
export const publications: Publication[] = [
 { id:'pub-1', title:'How we build faster', views:12400, engagement:68 },
 { id:'pub-2', title:'The prototype stack', views:8400, engagement:74 }
];
