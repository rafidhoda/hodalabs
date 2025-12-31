import { UserAuth } from "@/components/UserAuth";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-8 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-black dark:text-zinc-50">
          Hoda Labs Company
        </h1>
        <UserAuth />
      </main>
    </div>
  );
}
