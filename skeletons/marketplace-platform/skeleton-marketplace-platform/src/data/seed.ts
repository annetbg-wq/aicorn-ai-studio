import type { Listing, Message, Order } from './types';
export const listings: Listing[] = [
 { id:'lst-1', title:'Studio portrait session', seller:'Nora Studio', category:'Creative', price:120, rating:4.9, saved:false, imageTone:'rose' },
 { id:'lst-2', title:'Founder pitch review', seller:'Venture Lab', category:'Consulting', price:240, rating:4.8, saved:true, imageTone:'blue' },
 { id:'lst-3', title:'Weekend cabin rental', seller:'PineHost', category:'Travel', price:185, rating:4.7, saved:false, imageTone:'green' },
 { id:'lst-4', title:'AI workflow setup', seller:'OpsCraft', category:'Automation', price:320, rating:5.0, saved:false, imageTone:'violet' }
];
export const orders: Order[] = [{ id:'ord-1', listingId:'lst-2', status:'Confirmed', total:240 }];
export const messages: Message[] = [
 { id:'msg-1', from:'Venture Lab', text:'I can review the deck this afternoon.', mine:false },
 { id:'msg-2', from:'You', text:'Great, I uploaded the latest version.', mine:true }
];
