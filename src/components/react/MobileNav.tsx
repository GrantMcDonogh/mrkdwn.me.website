import { useState } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)] lg:hidden"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            className="absolute right-0 top-0 h-full w-72 p-6 flex flex-col gap-6"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div className="flex justify-end">
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-secondary)]"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex flex-col gap-4">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="text-base font-medium px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                  style={{ color: "var(--text-primary)" }}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <a
              href="https://app.mrkdwn.me"
              className="mt-4 inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </>
  );
}
