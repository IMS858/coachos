"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import type {ResultsSaveReceipt} from "@/lib/coaching/session-close";
type ResultsController={save:()=>Promise<ResultsSaveReceipt>};
type SessionWorkspaceState={hasUnsavedResults:boolean;hasUnsavedNotes:boolean;isClosing:boolean;setUnsavedResults:(value:boolean)=>void;setUnsavedNotes:(value:boolean)=>void;registerResults:(controller:ResultsController)=>()=>void;saveEditedResults:()=>Promise<ResultsSaveReceipt>;beginClose:()=>boolean;endClose:()=>void;asOf:string};
const unavailable=async():Promise<ResultsSaveReceipt>=>({ok:false,saved:0,failed:0,error:"Exercise workspace is unavailable or still loading. Completion was not attempted."});
const SessionContext=createContext<SessionWorkspaceState>({hasUnsavedResults:false,hasUnsavedNotes:false,isClosing:false,setUnsavedResults:(_value:boolean)=>{},setUnsavedNotes:(_value:boolean)=>{},registerResults:(_controller:ResultsController)=>(()=>{}),saveEditedResults:unavailable,beginClose:()=>false,endClose:()=>{},asOf:""});
export const useSessionWorkspace=()=>useContext(SessionContext);
export function SessionWorkspace({children,asOf}:{children:ReactNode;asOf:string}){
 const [hasUnsavedResults,setUnsavedResults]=useState(false),[hasUnsavedNotes,setUnsavedNotes]=useState(false),[isClosing,setClosing]=useState(false);
 const controller=useRef<ResultsController|null>(null),closing=useRef(false);
 const registerResults=useCallback((value:ResultsController)=>{controller.current=value;return ()=>{if(controller.current===value)controller.current=null;};},[]);
 const saveEditedResults=useCallback(()=>controller.current?.save()??unavailable(),[]);
 const beginClose=useCallback(()=>{if(closing.current)return false;closing.current=true;setClosing(true);return true;},[]);
 const endClose=useCallback(()=>{closing.current=false;setClosing(false);},[]);
 useEffect(()=>{
  if(!hasUnsavedResults&&!hasUnsavedNotes&&!isClosing)return;
  const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  const navigate=(event:MouseEvent)=>{
   const anchor=(event.target as Element|null)?.closest("a");if(!anchor||!anchor.href||anchor.target==="_blank"||anchor.hasAttribute("download"))return;
   const target=new URL(anchor.href);if(target.origin===location.origin&&target.pathname===location.pathname&&target.search===location.search)return;
   if(isClosing){event.preventDefault();event.stopPropagation();return;}
   if(!window.confirm("Session notes or exercise results are not saved yet. Leave and discard those edits?")){event.preventDefault();event.stopPropagation();}
  };
  window.addEventListener("beforeunload",unload);document.addEventListener("click",navigate,true);
  return ()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
 },[hasUnsavedResults,hasUnsavedNotes,isClosing]);
 return <SessionContext.Provider value={{hasUnsavedResults,hasUnsavedNotes,isClosing,setUnsavedResults,setUnsavedNotes,registerResults,saveEditedResults,beginClose,endClose,asOf}}>{children}</SessionContext.Provider>;
}
/** Even an empty program must finish loading before it can report no edited results. */
export function SessionResultGate({available}:{available:boolean}){
 const {registerResults}=useSessionWorkspace();
 useEffect(()=>registerResults({save:available?async()=>({ok:true,saved:0,failed:0}):unavailable}),[available,registerResults]);
 return null;
}
