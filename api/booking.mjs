import {createHmac} from 'node:crypto';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 const origin=req.headers.origin,allowed=(process.env.BOOKING_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!origin||!allowed.includes(origin))return res.status(403).json({error:'ORIGIN_DENIED'});
 const key=process.env.WEBSITE_BOOKING_GATEWAY_KEY,base=process.env.SOL_BOOKING_ORIGIN;
 if(!key||key.length<32||!base||!process.env.TURNSTILE_SITE_KEY)return res.status(503).json({error:'BOOKING_UNAVAILABLE'});
 const url=new URL('/api/website-booking',base);
 if(url.protocol!=='https:'&&!(process.env.NODE_ENV==='test'&&url.hostname==='127.0.0.1'))return res.status(503).json({error:'BOOKING_UNAVAILABLE'});
 let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'INVALID_REQUEST'});}
 const text=JSON.stringify(body);if(!text||Buffer.byteLength(text)>12000)return res.status(413).json({error:'INVALID_REQUEST'});
 // Vercel overwrites x-vercel-forwarded-for. Never trust a browser-supplied generic X-Forwarded-For.
 const address=req.headers['x-vercel-forwarded-for'];if(typeof address!=='string'||!address||address.includes(','))return res.status(503).json({error:'BOOKING_UNAVAILABLE'});
 const ip=createHmac('sha256',key).update(address).digest('hex'),stamp=String(Date.now()),signature=createHmac('sha256',key).update(stamp+'\n'+ip+'\n'+text).digest('hex');
 try{
  const result=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-booking-time':stamp,'x-booking-ip':ip,'x-booking-signature':signature},body:text,signal:AbortSignal.timeout(25000)});
  const data=await result.json();if(result.headers.get('retry-after'))res.setHeader('Retry-After',result.headers.get('retry-after'));
  if(result.ok&&body.action==='catalog')data.turnstileSiteKey=process.env.TURNSTILE_SITE_KEY;
  return res.status(result.status).json(data);
 }catch{return res.status(503).json({error:'BOOKING_UNAVAILABLE'});}
}
