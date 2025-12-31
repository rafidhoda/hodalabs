"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="text-xl font-bold text-black dark:text-zinc-50"
          >
            Hoda Labs
          </Link>
          <div className="flex gap-4">
            <Link
              href="/"
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "text-black dark:text-zinc-50"
                  : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              Home
            </Link>
            <Link
              href="/feed"
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                pathname === "/feed"
                  ? "text-black dark:text-zinc-50"
                  : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              Feed
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}


