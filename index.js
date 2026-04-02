import Fastify from "fastify";

const app = Fastify({
  logger: true
});

const YT_API_KEY = process.env.YT_API_KEY || "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";
const YT_COOKIE = process.env.YOUTUBE_COOKIE || "";

app.get("/", async () => {
  return {
    ok: true,
    message: "YouTube API Server Running",
    endpoints: [
      "/video/:id"
    ]
  };
});

app.get("/video/:id", async (req, reply) => {
  try {
    const { id } = req.params;

    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${YT_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "com.google.android.youtube/20.10.38",
          "X-YouTube-Client-Name": "3",
          "X-YouTube-Client-Version": "20.10.38",
          ...(YT_COOKIE
            ? {
                Cookie: YT_COOKIE
              }
            : {})
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "20.10.38",
              androidSdkVersion: 34,
              hl: "ja",
              gl: "JP"
            }
          },
          playbackContext: {
            contentPlaybackContext: {
              html5Preference: "HTML5_PREF_WANTS"
            }
          },
          contentCheckOk: true,
          racyCheckOk: true,
          videoId: id
        })
      }
    );

    const data = await response.json();

    return {
      ok: response.ok,
      status: response.status,

      playability: {
        status: data.playabilityStatus?.status ?? null,
        reason: data.playabilityStatus?.reason ?? null
      },

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

      streams: {
        hls: data.streamingData?.hlsManifestUrl ?? null,
        dash: data.streamingData?.dashManifestUrl ?? null,

        muxed:
          data.streamingData?.formats?.map((f) => ({
            itag: f.itag,
            mimeType: f.mimeType,
            quality: f.qualityLabel ?? null,
            bitrate: f.bitrate ?? null,
            width: f.width ?? null,
            height: f.height ?? null,
            fps: f.fps ?? null,
            url: f.url ?? null,
            cipher: f.signatureCipher ?? f.cipher ?? null
          })) ?? [],

        adaptive:
          data.streamingData?.adaptiveFormats?.map((f) => ({
            itag: f.itag,
            mimeType: f.mimeType,
            quality: f.qualityLabel ?? null,
            bitrate: f.bitrate ?? null,
            audioQuality: f.audioQuality ?? null,
            width: f.width ?? null,
            height: f.height ?? null,
            fps: f.fps ?? null,
            url: f.url ?? null,
            cipher: f.signatureCipher ?? f.cipher ?? null
          })) ?? []
      },

      raw: data
    };
  } catch (err) {
    req.log.error(err);

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
