"use client";
import { useCallback, useMemo, useState, type ReactNode } from "react";
type Kind = "ok"|"err"|"info";
type Item = { id:number; kind:Kind; message:string };
export function useToast() {
  const [items,setItems]=useState<Item[]>([]);
  const toast=useCallback((kind:Kind,message:string)=>{
    const id=Date.now()+Math.floor(Math.random()*1000);
    setItems(p=>[...p,{id,kind,message}]);
    window.setTimeout(()=>setItems(p=>p.filter(x=>x.id!==id)),3200);
  },[]);
  const node:ReactNode=useMemo(()=> <div className="fixed right-4 top-4 z-[100] space-y-2 max-w-sm">{items.map(x=><div key={x.id} className={`rounded-xl border px-4 py-3 shadow-lg bg-white text-sm ${x.kind==="err"?"border-red-200 text-red-700":x.kind==="ok"?"border-green-200 text-green-700":"border-orange-200 text-orange-700"}`}>{x.message}</div>)}</div>,[items]);
  return {toast,node};
}
