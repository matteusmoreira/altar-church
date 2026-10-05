// Supabase scheduler bridge. Durable state and leases live in PostgreSQL.
export {}
declare const Deno: { env:{get(name:string):string|undefined}; serve(handler:(request:Request)=>Promise<Response>):void }
Deno.serve(async(request:Request)=>{
 const secret=Deno.env.get("AUTOMATION_WORKER_SECRET"),provided=request.headers.get("x-automation-worker-secret")
 if(!secret||provided!==secret)return new Response("Unauthorized",{status:401})
 const url=Deno.env.get("AUTOMATION_DISPATCH_URL")
 if(!url||!url.startsWith("https://"))return new Response("Worker not configured",{status:503})
 try{
  const result=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-automation-worker-secret":secret},body:"{}",signal:AbortSignal.timeout(55000)})
  return new Response(await result.text(),{status:result.status,headers:{"Content-Type":"application/json"}})
 }catch{return new Response("Dispatch unavailable",{status:503})}
})
