import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Grain",
    short_name: "Grain",
    description: "Local finance tracker PWA",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    share_target: {
      action: "/transactions/new",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: {
        title: "shareTitle",
        text: "shareText",
        url: "shareUrl",
      },
    },
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
