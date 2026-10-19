import Image from "next/image";
import logo from "@/assets/aloha-logo.png";
import palm from "@/assets/aloha-palm.png";

// The clinic's logo (src/assets/aloha-logo.png, trimmed from the original
// artwork) and the palm tree on its own for small spaces. Imported rather than
// linked so the paths work under the GitHub Pages base path.

export function Logo({ className = "h-16 w-auto", alt = "Aloha Footcare" }: { className?: string; alt?: string }) {
  return <Image src={logo} alt={alt} className={className} priority />;
}

export function PalmMark({ className = "h-10 w-auto" }: { className?: string }) {
  return <Image src={palm} alt="" aria-hidden="true" className={className} />;
}
