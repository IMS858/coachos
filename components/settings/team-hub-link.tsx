"use client";
import {useState} from "react";
import {Copy,Check,ExternalLink} from "lucide-react";
import Link from "next/link";

export function TeamHubLink(){
 const [copied,setCopied]=useState(false);
 async function copy(){const url=window.location.origin+"/team";await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1800);}
 return <div className="flex flex-wrap gap-2"><Link href="/team" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider px-4 text-sm font-semibold text-cream"><ExternalLink className="h-4 w-4"/>Preview Team Hub</Link><button type="button" onClick={copy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky px-4 text-sm font-semibold text-white">{copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}{copied?"Copied":"Copy trainer link"}</button></div>;
}
