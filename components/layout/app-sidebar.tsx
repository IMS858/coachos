"use client";
import {useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {usePathname,useSearchParams,useRouter} from 'next/navigation';
import {LayoutDashboard,ListChecks,DollarSign,CreditCard,Users,Target,Search,ClipboardList,CalendarDays,Dumbbell,Activity,MessageCircle,BarChart3,Settings,Mail,LogOut,BookOpen,GraduationCap,type LucideIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {createClient} from '@/lib/supabase/client';
import {activeWorkspace,navigationGroup,WORKSPACE_GROUPS} from '@/lib/navigation/workspaces';
import type {UserRole} from '@/lib/types/database';
interface NavItem{href:string;label:string;icon:LucideIcon}
const NAV_BY_ROLE:Record<UserRole,NavItem[]>={
 owner: [
  {href:'/dashboard',label:'Today',icon:LayoutDashboard},
  {href:'/schedule',label:'Schedule',icon:CalendarDays},
  {href:'/clients',label:'Clients',icon:Users},
  {href:'/messages',label:'Communications',icon:MessageCircle},
  {href:'/action-center',label:'Action Center',icon:ListChecks},
  {href:'/programs',label:'Programs',icon:ClipboardList},
  {href:'/fuel',label:'Fuel & Performance',icon:Activity},
  {href:'/library',label:'Exercise Library',icon:Dumbbell},
  {href:'/classes/manage',label:'Classes',icon:GraduationCap},
  {href:'/leads',label:'New Business',icon:Target},
  {href:'/leads/research',label:'Research Desk',icon:Search},
  {href:'/contacts',label:'Contacts',icon:Users},
  {href:'/growth',label:'Growth Center',icon:Target},
  {href:'/financials',label:'Financials',icon:DollarSign},
  {href:'/checkout',label:'Checkout',icon:CreditCard},
  {href:'/reports',label:'Reports',icon:BarChart3},
  {href:'/staff',label:'People & Coaching',icon:Users},
  {href:'/team',label:'Team Hub',icon:BookOpen},
  {href:'/operating-system',label:'IMS Operating System',icon:Activity},
  {href:'/dashboard?view=owner',label:'Business Overview',icon:BarChart3},
  {href:'/settings',label:'Owner Settings',icon:Settings},
  {href:'/settings/services',label:'Services',icon:Settings},
  {href:'/settings/email',label:'Logins',icon:Mail},
  {href:'/settings/migration',label:'Migration Center',icon:ClipboardList},
 ],
 trainer: [
  {href:'/dashboard',label:'Today',icon:LayoutDashboard},
  {href:'/schedule',label:'Schedule',icon:CalendarDays},
  {href:'/clients',label:'Clients',icon:Users},
  {href:'/messages',label:'Communications',icon:MessageCircle},
  {href:'/action-center',label:'Action Center',icon:ListChecks},
  {href:'/assessments',label:'Assessments',icon:ClipboardList},
  {href:'/programs',label:'Programs',icon:Dumbbell},
  {href:'/fuel',label:'Fuel & Performance',icon:Activity},
  {href:'/library',label:'Exercise Library',icon:Dumbbell},
  {href:'/classes/manage',label:'Classes',icon:GraduationCap},
  {href:'/team',label:'Team Hub',icon:BookOpen},
 ],
 client: [
  {href:'/dashboard',label:'Today',icon:Activity},
  {href:'/plan',label:'My Plan',icon:Dumbbell},
  {href:'/fuel',label:'Fuel',icon:Activity},
  {href:'/progress',label:'Progress',icon:BarChart3},
  {href:'/messages',label:'Messages',icon:MessageCircle},
  {href:'/account',label:'Account',icon:Settings},
 ],
};
interface AppSidebarProps{role:UserRole;fullName:string;email:string}
export function AppSidebar({role,fullName,email}:AppSidebarProps){
 const router=useRouter(),pathname=usePathname(),searchParams=useSearchParams(),[search,setSearch]=useState('');
 const nav=NAV_BY_ROLE[role],active=activeWorkspace(nav.map(n=>n.href),pathname,searchParams.get('view')==='owner'),query=search.trim().toLowerCase(),filtered=nav.filter(n=>(n.label+' '+navigationGroup(n.href,role==='client')).toLowerCase().includes(query));
 async function signOut(){await createClient().auth.signOut();router.replace('/login');router.refresh();}
 function links(items:NavItem[]){return <ul className="space-y-0.5">{items.map(item=>{const Icon=item.icon,isActive=item.href===active;return <li key={item.href}><Link href={item.href} aria-current={isActive?'page':undefined} className={cn('group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',isActive?'bg-white/10 text-white shadow-sm ring-1 ring-white/10':'text-cream-dim hover:bg-white/5 hover:text-white')}><Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0',isActive?'text-sky-light':'text-cream-faint group-hover:text-cream-dim')}/>{item.label}</Link></li>;})}</ul>;}
 return <aside className="band sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-divider shadow-xl lg:flex"><div className="flex h-20 shrink-0 items-center border-b border-divider px-5"><Link href="/dashboard" className="flex items-center gap-2.5"><Image src="/ims-logo.png" alt="Innovative Movement Solutions" width={150} height={48} unoptimized className="h-9 w-auto max-w-[150px] shrink-0 brightness-0 invert"/><div className="flex flex-col leading-tight"><span className="text-sm font-semibold tracking-tight text-cream">Coach OS</span><span className="text-[10px] uppercase tracking-widest text-cream-faint">{role}</span></div></Link></div>
 {role!=='client'&&<div className="shrink-0 px-3 pt-3"><label className="sr-only" htmlFor="workspace-filter">Find a workspace</label><input id="workspace-filter" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a workspace…" className="min-h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky"/></div>}
 <nav aria-label="Primary navigation" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4">{role==='client'?links(nav):WORKSPACE_GROUPS.map(group=>{const items=filtered.filter(n=>navigationGroup(n.href)===group);if(!items.length)return null;const expanded=Boolean(query)||['Daily work','Coaching','Growth'].includes(group)||items.some(i=>i.href===active);return <details key={group+pathname+searchParams.toString()} open={expanded}><summary className="min-h-10 cursor-pointer rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-white/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky">{group}</summary>{links(items)}</details>;})}{role!=='client'&&!filtered.length&&<p className="px-3 py-2 text-sm text-white/70">No workspace matches. Clear the search to see navigation.</p>}</nav>
 <div className="shrink-0 border-t border-divider p-3"><div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"><div className="truncate text-sm font-medium text-cream">{fullName}</div><div className="truncate text-xs text-cream-faint">{email}</div><Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={signOut}><LogOut className="h-4 w-4"/>Sign out</Button></div></div></aside>;
}
