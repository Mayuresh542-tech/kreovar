import Image from "next/image";
/** Serve the approved logo directly; do not reuse the faulty optimized-image response. */
export default function BrandMark({size=32}:{size?:number}){
 return <Image src="/branding/kreovar-mark-v2.png" unoptimized width={size} height={size} alt="" aria-hidden="true" className="shrink-0 object-contain"/>;
}
