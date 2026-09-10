import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, which a phone-camera photo almost always exceeds -
      // uploads (see lib/supabase.ts's uploadProductImage, which compresses
      // server-side after this) would silently fail before ever reaching
      // that code. This route is behind the admin login, so a generous
      // limit here doesn't open up a meaningful DDoS surface.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
