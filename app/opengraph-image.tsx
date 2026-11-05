import {ImageResponse} from "next/og";
import {readBundledAsset} from "@/app/lib/server/bundledAssets";
export const alt="Kreovar — AI content creation and video editing studio";
export const size={width:1200,height:630};
export const contentType="image/png";
export default async function Image(){
 const logo="data:image/png;base64,"+(await readBundledAsset("branding/kreovar-symbol.png")).toString("base64");
 return new ImageResponse(<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"68px",background:"#f8fafc",color:"#0f172a",fontFamily:"sans-serif"}}>
  <div style={{display:"flex",alignItems:"center",gap:20}}><img alt="" src={logo} width={74} height={74} style={{objectFit:"contain"}}/><div style={{fontSize:42,fontWeight:700}}>Kreovar</div></div>
  <div style={{display:"flex",flexDirection:"column",gap:18}}><div style={{display:"flex",fontSize:72,fontWeight:800,letterSpacing:-3}}>Create anything.</div><div style={{display:"flex",fontSize:72,fontWeight:800,letterSpacing:-3,color:"#2458ed"}}>Edit everything.</div><div style={{fontSize:27,color:"#475569",marginTop:10}}>Captions. Voiceovers. Video editing. All in one studio.</div></div>
  <div style={{display:"flex",fontSize:24,color:"#475569"}}>kreovar.online</div>
 </div>,size);
}
