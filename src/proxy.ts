import { NextResponse, type NextRequest } from "next/server";
import { isPrivatePath } from "@/lib/apps";
import { readSession, SESSION_COOKIE } from "@/lib/session";

// Barra os apps privados antes de renderizar. As páginas conferem de novo.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isPrivatePath(pathname)) return NextResponse.next();

  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/entrar";
  url.search = `?de=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon).*)"],
};
