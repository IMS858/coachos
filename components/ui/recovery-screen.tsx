"use client";
/** Critical inline styling remains readable if the root layout or stylesheet failed. */
export function RecoveryScreen({ digest }: { digest?: string }) {
  const reference = typeof digest === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(digest) ? digest : null;
  const action = { minHeight:44, display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"12px 18px", borderRadius:12, border:"1px solid #b9c6d0", background:"#ffffff", color:"#155d88", fontWeight:600, fontSize:16, textDecoration:"none", cursor:"pointer" } as const;
  return <main style={{minHeight:"100dvh",boxSizing:"border-box",background:"#f4f6f8",color:"#15202b",colorScheme:"light",fontFamily:"system-ui, sans-serif",padding:"max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))",display:"grid",placeItems:"center"}}>
    <section role="alert" aria-labelledby="recovery-title" style={{maxWidth:580,width:"100%",padding:24,boxSizing:"border-box",border:"1px solid #ccd6df",borderRadius:20,background:"#ffffff"}}>
      <p style={{fontSize:13,fontWeight:700,letterSpacing:".12em",color:"#155d88"}}>IMS COACH OS</p>
      <h1 id="recovery-title" style={{fontSize:30,lineHeight:1.15,margin:"18px 0"}}>This page could not finish loading</h1>
      <p style={{fontSize:16,lineHeight:1.65}}>Refresh this page or return to Today. Missing evidence has not been treated as a successful load.</p>
      <p style={{fontSize:14,lineHeight:1.6,color:"#455465"}}>Were you saving something? Check its current record before repeating the action. This screen does not confirm whether that save completed.</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:24}}>
        <button type="button" style={action} onClick={()=>window.location.reload()}>Reload page</button>
        <a href="/dashboard" style={action}>Return to Today</a>
        <a href="/login" style={action}>Sign in again</a>
      </div>
      {reference&&<p style={{fontSize:12,marginTop:20,color:"#455465",overflowWrap:"anywhere"}}>Support reference: {reference}</p>}
    </section>
  </main>;
}
