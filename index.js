import Fastify from "fastify";

const app = Fastify();

app.get("/video/:id", async (req, reply) => {
  const { id } = req.params;

  const response = await fetch(
    "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/19.26.35",
        "X-YouTube-Client-Name": "3",
        "X-YouTube-Client-Version": "19.26.35"
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "19.26.35",
            hl: "ja",
            gl: "JP"
          }
        },
        videoId: id
      })
    }
  );

  const data = await response.json();

  return {
    ok: true,
    status: response.status,
    title: data.videoDetails?.title,
    author: data.videoDetails?.author,
    lengthSeconds: data.videoDetails?.lengthSeconds,
    thumbnails: data.videoDetails?.thumbnail?.thumbnails,
    playability: data.playabilityStatus,
    raw: data
  };
});

app.listen({
  port: process.env.PORT || 10000,
  host: "0.0.0.0"
});
