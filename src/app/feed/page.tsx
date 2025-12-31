"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

interface FeedItem {
  id: string;
  source: string;
  title: string;
  content: string | null;
  url: string | null;
  image_url: string | null;
  author: string | null;
  author_email: string | null;
  author_avatar: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Supabase environment variables are missing");
      setLoading(false);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Fetch initial feed items
    const fetchFeedItems = async () => {
      const { data, error } = await supabase
        .from("feed_items")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching feed items:", error);
      } else {
        setItems(data || []);
      }
      setLoading(false);
    };

    fetchFeedItems();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("feed_items_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "feed_items",
        },
        (payload) => {
          setItems((prev) => [payload.new as FeedItem, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <div className="text-zinc-600 dark:text-zinc-400">Loading feed...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-black">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-8 text-4xl font-bold tracking-tight text-black dark:text-zinc-50">
          Feed
        </h1>

        {items.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
            <p className="text-zinc-600 dark:text-zinc-400">
              No items yet. Set up your Zapier webhooks to start seeing data here!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-start gap-4">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  )}
                  {!item.image_url && item.author_avatar && (
                    <img
                      src={item.author_avatar}
                      alt={item.author || "Author"}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  )}
                  {!item.image_url && !item.author_avatar && (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                      <span className="text-lg font-semibold text-gray-600 dark:text-gray-300">
                        {item.source.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {item.source}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        •
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {formatDate(item.created_at)}
                      </span>
                    </div>

                    <h2 className="mb-2 text-lg font-semibold text-black dark:text-zinc-50">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                    </h2>

                    {item.content && (
                      <p className="mb-3 text-zinc-700 dark:text-zinc-300">
                        {item.content}
                      </p>
                    )}

                    {item.author && (
                      <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <span>by {item.author}</span>
                        {item.author_email && (
                          <span className="text-zinc-400 dark:text-zinc-500">
                            ({item.author_email})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


