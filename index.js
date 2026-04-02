import Fastify from "fastify";

const app = Fastify();

app.get("/video/:id", async (req) => {
  const id = req.params.id;

  const response = await fetch(
    "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/19.26.35"
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "19.26.35"
          }
        },
        videoId: id
      })
    }
  );

  const data = await response.json();

  return {
    title: data.videoDetails?.title,
    author: data.videoDetails?.author,
    thumbnails: data.videoDetails?.thumbnail?.thumbnails
  };
});

app.listen({
  port: process.env.PORT || 10000,
  host: "0.0.0.0"
});
