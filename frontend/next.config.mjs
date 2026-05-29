function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}

const frontendUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.FRONTEND_URL || "http://localhost:3000";
const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "http://localhost:4000";
const frontendHostname = getHostname(frontendUrl);
const backendHostname = getHostname(backendUrl);

/** @type {import('next').NextConfig} */
const nextConfig = {
   allowedDevOrigins: [frontendHostname],
   images: {
      unoptimized: true,
     remotePatterns: [
       {
         protocol: 'http',
         hostname: backendHostname,
         port: '',
         pathname: '/**',
       },
       {
         protocol: 'https',
         hostname: 'images.unsplash.com',
         port: '',
         pathname: '/**',
       },
       {
         protocol: 'https',
         hostname: 'api.dicebear.com',
         port: '',
         pathname: '/**',
       },
     ],
   },
 };
 
 export default nextConfig;
 