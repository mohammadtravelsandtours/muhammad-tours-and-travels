import Image from 'next/image';

// Contact and office details reproduced from the company's visiting card —
// kept as a single source of truth here rather than retyped per page.
export function SiteFooter() {
  return (
    <footer className="border-t border-sand bg-dusk-900 text-ground/80 mt-auto">
      <div className="max-w-5xl mx-auto px-6 py-12 grid gap-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <Image src="/logo-mark.png" alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-display text-ground leading-none">
              <span className="block text-base">Muhammad Tours</span>
              <span className="block text-[10px] font-sans tracking-wide text-ground/60">AND TRAVELS</span>
            </span>
          </div>
          <p className="text-sm">Your journey, our priority.</p>
          <p className="text-xs mt-3 text-ground/60">Director: MD Mahadi Hasan</p>
        </div>

        <div className="text-sm space-y-3">
          <h3 className="text-xs uppercase tracking-wide text-ground/50 font-medium">Our offices</h3>
          <div>
            <p className="text-ground/90">Head Office</p>
            <p className="text-ground/60">Canyon Tower, 7th Floor, Plot 24 & 26, Sonargaon Janapath Road, Sector 12, Uttara Model Town, Dhaka 1230</p>
          </div>
          <div>
            <p className="text-ground/90">Branch Office</p>
            <p className="text-ground/60">Khatiar Bazar, Mirzapur, Tangail</p>
          </div>
        </div>

        <div className="text-sm space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-ground/50 font-medium mb-3">Get in touch</h3>
          <p>
            <a href="tel:+8801713420363" className="hover:text-ground">+880 1713-420363</a>
            <span className="text-ground/50"> (Bangladesh)</span>
          </p>
          <p>
            <a href="tel:+6593447481" className="hover:text-ground">+65 9344 7481</a>
            <span className="text-ground/50"> (Singapore)</span>
          </p>
          <p>
            <a href="mailto:mohammadtravelsandtours@gmail.com" className="hover:text-ground">mohammadtravelsandtours@gmail.com</a>
          </p>
          <p>
            <a href="https://muhammadtravels.com" target="_blank" rel="noreferrer" className="hover:text-ground">
              muhammadtravels.com
            </a>
          </p>
        </div>
      </div>

      <div className="border-t border-ground/10">
        <div className="max-w-5xl mx-auto px-6 py-4 text-xs text-ground/50 flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>© {new Date().getFullYear()} Muhammad Tours and Travels. All rights reserved.</span>
          <span>Flight fares shown are demo/mock data while live supplier integrations are connected.</span>
        </div>
      </div>
    </footer>
  );
}
