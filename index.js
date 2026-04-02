import Fastify from "fastify";

const app = Fastify();

app.get("/", async () => {
  return {
    ok: true,
    message: "YouTube API Server Running"
  };
});

app.get("/video/:id", async (req, reply) => {
  try {
    const { id } = req.params;

    const response = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": "2.20260330.00.00",
          ...(process.env.YOUTUBE_COOKIE
            ? {
                Cookie: process.env.YOUTUBE_COOKIE
              }
            : {})
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20260330.00.00",
              hl: "ja",
              gl: "JP"
            }
          },
          videoId: id
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return reply.code(response.status).send({
        ok: false,
        status: response.status,
        error: data
      });
    }

    return {
      ok: true,
      status: response.status,

      video: {
        id,
        title: data.videoDetails?.title ?? null,
        description: data.videoDetails?.shortDescription ?? null,
        author: data.videoDetails?.author ?? null,
        channelId: data.videoDetails?.channelId ?? null,
        lengthSeconds: Number(data.videoDetails?.lengthSeconds ?? 0),
        viewCount: Number(data.videoDetails?.viewCount ?? 0),
        isLive: data.videoDetails?.isLiveContent ?? false,
        thumbnails: data.videoDetails?.thumbnail?.thumbnails ?? []
      },

      playability: data.playabilityStatus ?? null,

      streamingData: {
        hlsManifestUrl: data.streamingData?.hlsManifestUrl ?? null,
        dashManifestUrl: data.streamingData?.dashManifestUrl ?? null,

        formats:
          data.streamingData?.formats?.map((f) => ({
            itag: f.itag,
            mimeType: f.mimeType,
            bitrate: f.bitrate,
            width: f.width,
            height: f.height,
            fps: f.fps,
            quality: f.qualityLabel,
            audioQuality: f.audioQuality,
            approxDurationMs: f.approxDurationMs,
            url: f.url ?? null,
            cipher: f.signatureCipher ?? f.cipher ?? null
          })) ?? [],

        adaptiveFormats:
          data.streamingData?.adaptiveFormats?.map((f) => ({
            itag: f.itag,
            mimeType: f.mimeType,
            bitrate: f.bitrate,
            width: f.width,
            height: f.height,
            fps: f.fps,
            quality: f.qualityLabel,
            audioQuality: f.audioQuality,
            approxDurationMs: f.approxDurationMs,
            url: f.url ?? null,
            cipher: f.signatureCipher ?? f.cipher ?? null
          })) ?? []
      },

      raw: data
    };
  } catch (err) {
    return reply.code(500).send({
      ok: false,
      error: String(err)
    });
  }
});

app.listen({
  port: Number(process.env.PORT) || 10000,
  host: "0.0.0.0"
});
