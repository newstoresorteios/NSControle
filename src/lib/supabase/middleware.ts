import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { USER_EMAIL_HEADER, USER_ID_HEADER } from "@/lib/request-user";

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(USER_ID_HEADER);
  requestHeaders.delete(USER_EMAIL_HEADER);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id && user.email) {
    try {
      requestHeaders.set(USER_ID_HEADER, user.id);
      requestHeaders.set(USER_EMAIL_HEADER, user.email.toLowerCase());
      const forwarded = NextResponse.next({ request: { headers: requestHeaders } });
      for (const cookie of supabaseResponse.headers.getSetCookie()) {
        forwarded.headers.append("set-cookie", cookie);
      }
      supabaseResponse = forwarded;
    } catch {
      // Cabeçalho inválido: a página valida a sessão de novo.
    }
  }

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/api/tray/sync");

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
