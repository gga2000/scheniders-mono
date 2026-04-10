"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, isLoading: authLoading } = useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      router.push("/");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        router.push("/");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-3xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-[var(--card-border)] p-8 space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-[#1E1E1E] text-white flex items-center justify-center shadow-lg">
            <Shield className="w-7 h-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#1E1E1E]">Scheniders Admin</h1>
            <p className="text-sm text-[#6B6B6B] mt-1">
              Sign in to the admin console
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium text-[#1E1E1E]">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="admin@scheniders.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="flex h-11 w-full rounded-xl border border-[#E7E5E4] bg-white px-4 py-2 text-sm text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#1E1E1E]/20 focus:border-[#1E1E1E] hover:border-[#D6D3D1] transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium text-[#1E1E1E]">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="flex h-11 w-full rounded-xl border border-[#E7E5E4] bg-white px-4 py-2 text-sm text-[#1E1E1E] placeholder:text-[#9A9A9A] focus:outline-none focus:ring-2 focus:ring-[#1E1E1E]/20 focus:border-[#1E1E1E] hover:border-[#D6D3D1] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-[#1E1E1E] text-white font-semibold text-sm hover:bg-[#2D2D2D] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
