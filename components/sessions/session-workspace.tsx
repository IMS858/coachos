"use client";
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
const SessionContext=createContext({hasUnsavedResults:false,setUnsavedResults:(_value:boolean)=>{}});
export const useSessionWorkspace=()=>useContext(SessionContext);
export function SessionWorkspace({children}:{children:ReactNode}){
 const [hasUnsavedResults,setDirty]=useState(false);
 const setUnsavedResults=useCallback((value:boolean)=>setDirty(value),[]);
 useEffect(()=>{
  if(!hasUnsavedResults)return;
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  const navigate=(event:MouseEvent)=>{const anchor=(event.target as Element|null)?.closest("a");if(!anchor||!anchor.href||anchor.target==="_blank")return;const target=new URL(anchor.href);if(target.pathname===location.pathname&&target.search===location.search)return;if(!window.confirm("Exercise results are not saved yet. Leave and discard those edits?")){event.preventDefault();event.stopPropagation();}};
  window.addEventListener("beforeunload",unload);document.addEventListener("click",navigate,true);
  return ()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
 },[hasUnsavedResults]);
 return <SessionContext.Provider value={{hasUnsavedResults,setUnsavedResults}}>{children}</SessionContext.Provider>;
}
