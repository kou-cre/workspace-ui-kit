import { auth } from "@/auth";

// スクリーンショット用デモモードでは認証ガードを完全にバイパスする。
// （DEMO_MODE はビルド時に固定されるため、本番ビルドでは通常の auth ガードが採用される）
const demoMode = process.env.DEMO_MODE === "true";

export default demoMode
  ? () => undefined
  : auth((req) => {
      if (!req.auth) {
        const loginUrl = new URL("/login", req.nextUrl.origin);
        return Response.redirect(loginUrl);
      }
    });

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};
